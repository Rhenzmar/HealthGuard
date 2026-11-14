"""Reproducible v1.4 workflow audit on self-generated simulated telemetry.

No clinical accuracy, validation, or false-positive claims are derived here.
The CNN and covariance model weights and thresholds are frozen from v1.3.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os

from physiograph.live_telemetry import validate_sample
from physiograph.context_monitor import LiveQualityMonitor, ContextReviewMonitor
from physiograph.deep_learning import load_monitor
from physiograph.baseline_monitor import load_baseline
from physiograph.live_review import build_live_review
from tools.replay_live_demo import generate_packets

BASE=Path(__file__).resolve().parent.parent
RESULTS=BASE/'research'/'context_v14_audit'
SEED='DETERMINISTIC_REPLAY_NO_RANDOMNESS'


def hashfile(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(out=RESULTS, sample_count=180):
    if sample_count<130:raise ValueError('At least 130 packets required for v1.4 review demonstrations')
    # Ensure CPU-only deployment inference is being exercised, not torch.
    selected=os.environ.get('PHYSIOGRAPH_INFERENCE_BACKEND','auto')
    os.environ['PHYSIOGRAPH_INFERENCE_BACKEND']='numpy'
    model_paths=[
        'physiograph/apdra.py', 'physiograph/stability.py',
        'physiograph/physioalert.py',
        'data/nasa/osd575_cmp_long.csv',
        'data/nasa/osd575_alamar_npq_long.csv',
        'models/deep_learning/cnn_autoencoder.pt',
        'models/deep_learning/cnn_autoencoder_numpy.npz',
        'models/deep_learning/statistical_baseline.npz',
    ]
    scenarios={}
    try:
        for mode in ('normal','activity','artifact','excursion'):
            deep,stat=load_monitor(),load_baseline()
            quality=LiveQualityMonitor();context=ContextReviewMonitor()
            if deep.model_status()['status']!='LOADED' or stat.model_status()['status']!='LOADED':
                raise RuntimeError('Missing frozen trained model')
            counts={'cnn':Counter(),'covariance':Counter(),'quality':Counter(),
                    'raw_review':Counter(),'context_review':Counter()}
            items=[]
            for p in generate_packets(mode=mode,count=sample_count,subject='AUDIT_'+mode.upper(),
                                      start=datetime(2026,11,14,12,0,tzinfo=timezone.utc)):
                s=validate_sample(p)
                a=deep.process(s);b=stat.process(s);q=quality.process(s)
                raw=build_live_review(s,a,b)
                c=context.process(s,a,b,raw,q)
                for key,v in [('cnn',a['status']),('covariance',b['status']),('quality',q['status']),
                              ('raw_review',raw['status']),('context_review',c['status'])]:
                    counts[key][v]+=1
                if c['status'] in ('PERSISTENT_PATTERN_REVIEW','VERIFY_MEASUREMENT_QUALITY','ACTIVITY_CONTEXT_REVIEW','ACTIVITY_CONTEXT_UNKNOWN','DETECTORS_DISAGREE'):
                    items.append({'sequence':s.sequence,'status':c['status'],'raw':raw['status'],
                                  'activity':c['activity_state'],'quality':q['issues']})
            scenarios[mode]={k:dict(v) for k,v in counts.items()}
            scenarios[mode]['example_review_events']=items[:6]
            scenarios[mode]['simulation_packets']=sample_count
    finally:
        if selected=='auto':os.environ.pop('PHYSIOGRAPH_INFERENCE_BACKEND',None)
        else:os.environ['PHYSIOGRAPH_INFERENCE_BACKEND']=selected
    results={
        'version':'v1.4',
        'evaluation_type':'INTERNAL_SYNTHETIC_BEHAVIORAL_AUDIT_NOT_MEDICAL_VALIDATION',
        'replay_seed_or_method':SEED,'simulated_scenarios':scenarios,
        'trained_models_refit':False,'thresholds_recalibrated':False,
        'freeze_manifest':{p:hashfile(BASE/p) for p in model_paths},
        'limitations':[
            'Scenarios are artificially generated; no independently adjudicated physiological events are present.',
            'Activity context is scenario-declared, not measured by an activity sensor.',
            'Two models may agree for reasons unrelated to disease; no medical severity is generated.',
            'Spaced observations still share highly overlapping 60-second windows.',
            'Quality concerns are heuristic and do not prove a sensor artifact.',
            'External BIDMC three-channel experiment remains separate from the deployed five-channel model.',
        ],
    }
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    (out/'behavioral_audit.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(json.dumps({k:{s:v for s,v in x.items() if s!='example_review_events'}
                      for k,x in scenarios.items()},indent=2))
    return results


if __name__=='__main__':run()
