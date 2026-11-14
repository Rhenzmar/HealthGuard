"""Out-of-generator synthetic stress audit of unchanged v1.2 trained models.

This is a robustness audit (not external biomedical validation). Its independent
simulator is NOT the generator that trained the CNN/covariance comparison model.
Thresholds remain frozen. Descriptive flag fractions are not false diagnoses.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
import numpy as np

from physiograph.deep_learning import CNNAnomalyModel, FEATURE_SCALES, WINDOW_POINTS, REFERENCE_POINTS, normalize_window
from physiograph.baseline_monitor import StatisticalBaselineModel
from tools.train_cnn_autoencoder import batch_errors

ROOT=Path(__file__).resolve().parent.parent
OUTPUT=ROOT/'research'/'live_model_v13_audit'
SEED=246810


def independent_episode(rng:np.random.Generator, condition:str='quiet') -> np.ndarray:
    """Alternative process with uneven drift, bursts and mixed oscillation scales."""
    centers=np.array([rng.uniform(59,85),rng.uniform(96.5,99.1),rng.uniform(11,19),
                      rng.uniform(36.4,37.0),rng.uniform(40,79)],dtype=np.float32)
    n=REFERENCE_POINTS+WINDOW_POINTS
    data=np.repeat(centers[None,:],n,axis=0).astype(np.float32)
    noise_stds=np.array([1.4,.13,.30,.035,2.6],dtype=np.float32)
    noise=rng.normal(0,1,(n,5)).astype(np.float32)
    # Different spectral characteristics from AR(0.83) training generator.
    for j in range(5):
        kernel=np.ones(7+2*j,dtype=float)/(7+2*j)
        data[:,j]+=np.convolve(noise[:,j],kernel,mode='same')*noise_stds[j]*2.0
    t=np.arange(n,dtype=np.float32)
    data[:,0]+=1.3*np.sin(2*np.pi*t/rng.uniform(34,89))
    data[:,2]+=.38*np.cos(2*np.pi*t/rng.uniform(40,97))
    data[:,4]+=2.2*np.sin(2*np.pi*t/rng.uniform(25,93))
    if condition=='activity_like':
        # A plausible challenge to anomaly detector, NOT guaranteed medically normal.
        curve=np.maximum(0,np.sin(np.pi*np.clip((t-REFERENCE_POINTS)/WINDOW_POINTS,0,1)))
        data+=curve[:,None]*np.array([18,-.3,4.0,.14,-10],dtype=np.float32)
    elif condition=='sensor_artifact':
        # Short multi-signal sensor-style impulse in assessment period.
        data[REFERENCE_POINTS+28:REFERENCE_POINTS+31]+=np.array([15,-1.4,5.,.15,-12],dtype=np.float32)
    elif condition=='subtle_ramp':
        tail=np.clip((t-REFERENCE_POINTS)/WINDOW_POINTS,0,1)
        data+=tail[:,None]*np.array([5.,-.5,1.1,.08,-5],dtype=np.float32)
    elif condition=='large_shift':
        curve=np.clip((t-REFERENCE_POINTS-9)/28,0,1)
        data+=curve[:,None]*np.array([32,-3.5,9.,.8,-23],dtype=np.float32)
    elif condition!='quiet':
        raise ValueError(condition)
    ref=np.median(data[:REFERENCE_POINTS],axis=0)
    return normalize_window(data[REFERENCE_POINTS:],ref)


def run(out:Path=OUTPUT,n_per_condition:int=160) -> dict:
    from torch import set_num_threads
    set_num_threads(2)
    rng=np.random.default_rng(SEED)
    cnn=CNNAnomalyModel();comparison=StatisticalBaselineModel()
    labels=['quiet','activity_like','sensor_artifact','subtle_ramp','large_shift']
    scores={}
    for cond in labels:
        arr=np.stack([independent_episode(rng,cond) for _ in range(n_per_condition)])
        c=batch_errors(cnn.network,arr)
        s=np.array([comparison.score(v) for v in arr],dtype=float)
        a=c>cnn.threshold; b=s>comparison.threshold
        scores[cond]={
            'windows':n_per_condition,
            'cnn_flag_fraction':float(a.mean()),
            'covariance_flag_fraction':float(b.mean()),
            'both_flag_fraction':float((a&b).mean()),
            'models_disagree_fraction':float((a!=b).mean()),
            'cnn_score_median':float(np.median(c)),
            'covariance_score_median':float(np.median(s)),
        }
    result={
        'evaluation':'out-of-generator NUMERICAL stress test only',
        'seed':SEED,'model_checkpoints_modified':False,
        'cnn_frozen_threshold':cnn.threshold,
        'covariance_frozen_threshold':comparison.threshold,
        'cases':scores,
        'limitations':[
            'Simulator is independent code but produces synthetic 5-channel values, not real sensor recordings.',
            'quiet and activity_like are only simulator categories; neither establishes a disease-negative ground truth.',
            'Flag fractions cannot be interpreted as clinical false-positive, diagnosis, or astronaut-performance rates.',
            'Anomaly detector disagreements should be surfaced, not overwritten by an invented risk level.',
        ],
    }
    out.mkdir(parents=True,exist_ok=True)
    (out/'stress_results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))
    return result


if __name__=='__main__':run()
