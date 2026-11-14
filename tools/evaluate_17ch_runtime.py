"""Check trained 17-channel candidate on the actual HealthGuard demo generator.

The independent replay generator is still synthetic. This check is not a
clinical or NASA dataset validation. A candidate with excessive flags on
normal demo telemetry must not become PhysioAlert's primary detector.
"""
from __future__ import annotations
from datetime import datetime,timezone
from pathlib import Path
import json

from physiograph.candidate_17ch_numpy import (
    Numpy17Candidate,Live17CandidateMonitor,DEFAULT_EXPORT
)
from physiograph.live_telemetry import validate_sample
from tools.replay_live_demo import generate_packets

OUTPUT=DEFAULT_EXPORT.parent/'runtime_compatibility_report.json'

def evaluate(output:Path=OUTPUT)->dict:
    model=Numpy17Candidate()
    profiles={}
    for sid in ('SIM_CREW_01','SIM_CREW_02','SIM_CREW_03','SIM_CREW_04'):
        cases={}
        for mode in ('normal','excursion'):
            mon=Live17CandidateMonitor(model)
            assessed=[]
            for packet in generate_packets(
                subject=sid,count=180,mode=mode,
                start=datetime(2026,11,14,tzinfo=timezone.utc)):
                result=mon.process(validate_sample(packet))
                if result['status'] in ('MODEL_FLAG','NO_MODEL_FLAG'):
                    assessed.append(result)
                elif result['status'] in ('MODEL_ERROR','MODEL_INPUT_REJECTED','IRREGULAR_CADENCE'):
                    raise ValueError(f'Candidate {mode} replay failed: {result}')
            if not assessed:
                raise ValueError(f'No evaluated rolling windows for {sid} / {mode}')
            from collections import Counter
            top_error_counts=Counter(
                r['channel']
                for entry in assessed for r in entry['largest_reconstruction_errors'][:3]
            )
            cases[mode]={
                'mean_physiological_reconstruction_error':sum(x['physiological_error'] for x in assessed)/len(assessed),
                'mean_engineering_reconstruction_error':sum(x['engineering_error'] for x in assessed)/len(assessed),
                'common_top_residual_channels':dict(top_error_counts.most_common(6)),
                'evaluated_windows':len(assessed),
                'flags':sum(x['status']=='MODEL_FLAG' for x in assessed),
                'flag_fraction':sum(x['status']=='MODEL_FLAG' for x in assessed)/len(assessed),
                'first_evaluated_sequence':assessed[0]['sequence'],
                'max_reconstruction_error':max(x['reconstruction_error'] for x in assessed),
            }
        profiles[sid]=cases
    total_normal=sum(p['normal']['evaluated_windows'] for p in profiles.values())
    normal_flags=sum(p['normal']['flags'] for p in profiles.values())
    report={
        'candidate_version':model.metadata['version'],
        'source':'SEPARATE_FICTIONAL_DEMO_REPLAY_NOT_NASA_OR_PATIENT_DATA',
        'profiles':profiles,
        'normal_replay_flag_fraction':normal_flags/total_normal,
        'normal_replay_evaluated_windows':total_normal,
        'promotion_ready':normal_flags/total_normal<=.10,
        'promotion_note':'Tentative engineering screening gate only; not clinical validation. Original replay was consulted during model development, so do not call this an untouched external benchmark.',
        'scientific_limitations':'Demo replay is generated with different numerical assumptions from candidate training, but remains simulated, not independent real measurements.',
        'clinical_validation':False,
    }
    output=Path(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2),flush=True)
    return report

if __name__=='__main__':
    evaluate()
