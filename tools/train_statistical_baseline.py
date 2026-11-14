"""Train a compact synthetic-only comparator with independent PRNG splits.

Run from project root: python -m tools.train_statistical_baseline
The model uses the same fictional generative family as the CNN, so comparison
is exploratory rather than external or clinically independent validation.
"""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
from physiograph.baseline_monitor import summarize_window, DEFAULT_BASELINE
from tools.train_cnn_autoencoder import generate

TRAIN_SEED=271828
SCENARIOS=['MULTISIGNAL_SHIFT','OXYGEN_RESPIRATION','SUSTAINED_TEMPERATURE',
           'AUTONOMIC_PATTERN','SHORT_TRANSIENT','SUBTLE_DRIFT','LOW_MAGNITUDE_TRANSIENT']

def summarize_batch(x):
    return np.stack([summarize_window(v) for v in x])

def main(output: str | Path=DEFAULT_BASELINE):
    train=summarize_batch(generate(np.random.default_rng(TRAIN_SEED),1800))
    valid=summarize_batch(generate(np.random.default_rng(TRAIN_SEED+1),400))
    normal=summarize_batch(generate(np.random.default_rng(TRAIN_SEED+2),400))
    rng=np.random.default_rng(TRAIN_SEED+3)
    injected={s:summarize_batch(generate(rng,100,[s]*100)) for s in SCENARIOS}
    mean=train.mean(axis=0)
    cov=np.cov(train,rowvar=False)
    diagonal=np.diag(np.diag(cov))
    shrunk=0.70*cov+0.30*diagonal+np.eye(cov.shape[0])*0.01
    precision=np.linalg.inv(shrunk)
    def score(x):
        delta=x-mean[None,:]
        return np.einsum('bi,ij,bj->b',delta,precision,delta)/len(mean)
    threshold=float(np.quantile(score(valid),0.95))
    output=Path(output)
    output.parent.mkdir(exist_ok=True,parents=True)
    np.savez_compressed(output,mean=mean,precision=precision,threshold=threshold,
                        features=np.array(['heart_rate_bpm','spo2_percent','respiratory_rate_bpm','core_temp_c','hrv_rmssd_ms']),
                        version=np.array('v1.2-synthetic-20261114'))
    results={'model':'shrinkage-covariance novelty baseline','seed':TRAIN_SEED,
             'calibration_threshold':threshold,'train_normal_episodes':len(train),
             'validation_normal_episodes':len(valid),'held_out_normal_episodes':len(normal),
             'held_out_normal_false_flag_rate':float((score(normal)>threshold).mean()),
             'held_out_injected_flag_rate':{s:float((score(x)>threshold).mean()) for s,x in injected.items()},
             'note':'Generated synthetic profiles only; generator-family sharing limits generalization and makes this comparison exploratory. No clinical accuracy is inferred.'}
    (output.parent/'statistical_baseline_evaluation.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(json.dumps(results,indent=2))
    return results

if __name__=='__main__': main()
