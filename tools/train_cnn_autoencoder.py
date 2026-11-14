"""Reproducible SYNTHETIC-ONLY 1D CNN autoencoder training and evaluation.

Run from project root: python -m tools.train_cnn_autoencoder
Training includes normal data ONLY. Validation/test use disjoint simulated
subjects and PRNG streams; five artificial changes are withheld until testing.
Results NEVER estimate real astronaut disease or emergency detection accuracy.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import json
import random

import numpy as np
import torch
from scipy.stats import rankdata

from physiograph.deep_learning import (build_network, FEATURES, FEATURE_SCALES,
    normalize_window, REFERENCE_POINTS, WINDOW_POINTS, DEFAULT_CHECKPOINT)

VERSION="v1.1-synthetic-20261114"
SEED=1729
TOTAL=REFERENCE_POINTS+WINDOW_POINTS
CHANNELS=len(FEATURES)


def sim_episode(rng: np.random.Generator, anomaly: str|None=None):
    """A fictional time series; no NASA/clinical data enter these values."""
    baseline=np.array([rng.uniform(55,88),rng.uniform(96.3,98.8),
                       rng.uniform(11,19),rng.uniform(36.4,37.1),
                       rng.uniform(35,85)],dtype=np.float32)
    t=np.arange(TOTAL,dtype=np.float32)
    measurements=np.repeat(baseline[None,:],TOTAL,axis=0)
    # Autocorrelated sensor-style noise and low-frequency shared variation.
    amplitude=np.array([1.7,0.12,0.32,0.035,1.45])
    noise=np.zeros((TOTAL,CHANNELS),dtype=np.float32)
    for k in range(1,TOTAL):
        noise[k]=0.83*noise[k-1]+0.55*rng.normal(size=CHANNELS)*amplitude
    joint=np.sin(t/22+rng.uniform(0,2*np.pi))
    loadings=np.array([1.6,-0.055,0.36,0.012,-1.0])
    # Include heterogeneous benign cycles, rather than one narrowly defined
    # motion-free pattern. The later replay robustness check motivated this
    # generator change; it is a development check, NOT untouched validation.
    periods=rng.uniform(22,68,size=CHANNELS)
    phases=rng.uniform(0,2*np.pi,size=CHANNELS)
    oscillation_amplitude=rng.uniform(0.15,1,size=CHANNELS)*np.array([2.5,0.18,0.65,0.09,3.0])
    oscillation=np.sin(2*np.pi*t[:,None]/periods[None,:]+phases[None,:])*oscillation_amplitude[None,:]
    # Gradual small normal fluctuations, not fabricated ECG waveforms.
    measurements += noise + joint[:,None]*loadings[None,:] + oscillation
    slope=rng.normal(0,0.36,size=CHANNELS)*np.array([1.5,0.09,0.30,0.04,1.4])
    measurements += (t/(TOTAL-1))[:,None]*slope[None,:]
    if anomaly:
        # Only after the independent reference period. Distinct numerical
        # perturbations are demonstration labels, not defined medical events.
        s=np.arange(WINDOW_POINTS,dtype=np.float32)
        tail=measurements[REFERENCE_POINTS:]
        if anomaly=="MULTISIGNAL_SHIFT":
            step=1/(1+np.exp(-np.clip((s-15)/3,-15,15)))
            tail += step[:,None]*np.array([31.,-3.2,8.5,0.,-20.])[None,:]
        elif anomaly=="OXYGEN_RESPIRATION":
            step=1/(1+np.exp(-np.clip((s-20)/4,-15,15)))
            tail += step[:,None]*np.array([6.,-4.1,7.5,0.,-3.])[None,:]
        elif anomaly=="SUSTAINED_TEMPERATURE":
            step=np.clip((s-10)/15,0,1)
            tail += step[:,None]*np.array([2.,0.,0.,1.2,-1.])[None,:]
        elif anomaly=="AUTONOMIC_PATTERN":
            step=np.clip((s-7)/30,0,1)
            tail += step[:,None]*np.array([17.,-0.5,3.,0.,-33.])[None,:]
        elif anomaly=="SUBTLE_DRIFT":
            step=np.clip((s-8)/50,0,1)
            tail += step[:,None]*np.array([5.,-0.5,1.1,0.08,-5.])[None,:]
        elif anomaly=="LOW_MAGNITUDE_TRANSIENT":
            step=np.logical_and(s>=26,s<31).astype(np.float32)
            tail += step[:,None]*np.array([8.,-0.55,2.,0.05,-7.])[None,:]
        elif anomaly=="SHORT_TRANSIENT":
            step=np.logical_and(s>=26,s<31).astype(np.float32)
            tail += step[:,None]*np.array([37.,-2.8,9.5,0.,-15.])[None,:]
        else:
            raise ValueError(f"Unknown artificial scenario {anomaly}")
    # Baseline comes from the first 45 simulated (non-perturbed) points.
    reference=np.median(measurements[:REFERENCE_POINTS],axis=0)
    return normalize_window(measurements[REFERENCE_POINTS:],reference)


def generate(rng: np.random.Generator, n: int, scenarios: list[str|None]|None=None):
    return np.stack([sim_episode(rng, scenarios[i] if scenarios else None)
                     for i in range(n)]).astype(np.float32)


def batch_errors(model, x, batch_size=256):
    model.eval()
    out=[]
    with torch.inference_mode():
        for start in range(0,len(x),batch_size):
            a=torch.from_numpy(x[start:start+batch_size])
            e=(model(a)-a).square().mean(dim=(1,2))
            out.append(e.cpu().numpy())
    return np.concatenate(out)


def main(output: Path=DEFAULT_CHECKPOINT, epochs:int=24):
    torch.set_num_threads(2)
    torch.manual_seed(SEED)
    random.seed(SEED)
    np.random.seed(SEED)
    rng_train=np.random.default_rng(SEED+1000)
    rng_val=np.random.default_rng(SEED+2000)
    rng_test=np.random.default_rng(SEED+3000)
    train=generate(rng_train,2400)
    validation=generate(rng_val,480)
    normal_test=generate(rng_test,480)
    scenarios=["MULTISIGNAL_SHIFT","OXYGEN_RESPIRATION","SUSTAINED_TEMPERATURE",
               "AUTONOMIC_PATTERN","SHORT_TRANSIENT",
               "SUBTLE_DRIFT","LOW_MAGNITUDE_TRANSIENT"]
    abnormal={name:generate(rng_test,160,[name]*160) for name in scenarios}
    model=build_network()
    optimizer=torch.optim.Adam(model.parameters(),lr=0.0025,weight_decay=1e-5)
    best_loss=float('inf');best_state=None;best_epoch=0;patience=0; history=[]
    for epoch in range(epochs):
        model.train()
        indices=torch.randperm(len(train))
        losses=[]
        for batch in indices.split(128):
            a=torch.from_numpy(train[batch.numpy()])
            # Denoising reconstruction: train corrupted input to reconstruct clean input.
            noisy=a + torch.randn_like(a)*0.045
            prediction=model(noisy)
            loss=torch.mean((prediction-a)**2)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            losses.append(float(loss.item()))
        validation_error=batch_errors(model,validation)
        val_loss=float(np.mean(validation_error))
        history.append({"epoch":epoch+1,"training_loss":float(np.mean(losses)),"validation_loss":val_loss})
        if val_loss < best_loss-1e-5:
            best_loss=val_loss;best_epoch=epoch+1;best_state=deepcopy(model.state_dict());patience=0
        else:
            patience+=1
            if patience>=6: break
    model.load_state_dict(best_state)
    validation_scores=batch_errors(model,validation)
    threshold=float(np.quantile(validation_scores,0.95))
    test_scores=batch_errors(model,normal_test)
    evaluated={name:batch_errors(model,values) for name,values in abnormal.items()}
    positive_scores=np.concatenate(list(evaluated.values()))
    # ROC AUC on synthetic detector labels. Rank statistic equals Mann-Whitney U.
    ranks=rankdata(np.concatenate([test_scores,positive_scores]))
    n0=len(test_scores);n1=len(positive_scores)
    auc=float((ranks[n0:].sum()-n1*(n1+1)/2)/(n0*n1))
    metadata={
        "version":VERSION,"seed":SEED,"features":list(FEATURES),
        "scales":[float(x) for x in FEATURE_SCALES],
        "window_points":WINDOW_POINTS,"reference_points":REFERENCE_POINTS,
        "calibration_threshold":threshold,"validation_percentile":95,
        "training_domain":"SYNTHETIC_NORMAL_ONLY",
        "validation_domain":"HELD_OUT_SYNTHETIC_PROFILES",
        "training_episodes":len(train),"validation_normal_episodes":len(validation),
        "held_out_test_normal_episodes":len(normal_test),
        "held_out_test_injected_episodes":len(positive_scores),
        "best_epoch":best_epoch,"clinical_validation":False,
    }
    results={"metadata":metadata,
             "evaluation_scope":"Only numerical scenarios generated by this script; no real-world accuracy claim",
             "validation_normal_false_flag_rate":float((validation_scores>threshold).mean()),
             "held_out_normal_false_flag_rate":float((test_scores>threshold).mean()),
             "held_out_injected_scenario_detection_rate":{k:float((v>threshold).mean()) for k,v in evaluated.items()},
             "note":"Synthetic generator similarities and deliberately large perturbations can inflate AUC. Subtle scenarios are reported separately.",
             "synthetic_test_auc":auc,
             "normal_test_error_median":float(np.median(test_scores)),
             "injected_test_error_median":float(np.median(positive_scores)),
             "training_history":history,
             "no_real_telemetry_used":True,
             "nonclinical_experimental_use":True}
    output=Path(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    torch.save({"model_state":best_state,"metadata":metadata},output)
    report=output.parent/"synthetic_evaluation.json"
    report.write_text(json.dumps(results,indent=2),encoding="utf-8")
    print(json.dumps({k:v for k,v in results.items() if k!="training_history"},indent=2))
    print(f"Saved {output} and {report}")
    return results

if __name__=="__main__":
    main()
