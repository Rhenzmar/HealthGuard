"""Reproducible v1.5 backend audit; no clinical predictive validation.

Run: PHYSIOGRAPH_INFERENCE_BACKEND=numpy python -m tools.final_backend_audit_v15
Writes research/backend_v15_final_audit/results.json. The file is used as an
engineering/software freeze artifact, NOT evidence of clinical performance.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import time
from collections import Counter

from fastapi.testclient import TestClient
from physiograph.live_api import build_app
from tools.replay_live_demo import generate_packets

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'research'/'backend_v15_final_audit'
MANIFEST=OUT/'v14_frozen_hashes.json'


def file_hash(path:Path)->str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    os.environ['PHYSIOGRAPH_INFERENCE_BACKEND']='numpy'
    os.environ['PHYSIOGRAPH_PUBLIC_MODE']='1'
    os.environ.pop('PHYSIOGRAPH_INGEST_API_KEY',None)
    os.environ['PHYSIOGRAPH_AUTO_DEMO']='0'
    frozen=json.loads(MANIFEST.read_text(encoding='utf-8'))
    comparable={key:{'v14_sha256':sha,'v15_sha256':file_hash(ROOT/key),
                     'unchanged':file_hash(ROOT/key)==sha}
                for key,sha in frozen['sha256'].items()}
    assert all(x['unchanged'] for x in comparable.values()), 'Frozen files changed; abort release'

    with TestClient(build_app()) as c:
        ready=c.get('/api/system/readiness').json()
        overview=c.get('/api/research/overview').json()
        mission=c.get('/api/mission/status').json()
        assert ready['models_loaded'] and ready['clinical_validation'] is False
        assert overview['observations']==5990 and overview['astronauts']==4
        assert overview['continuous_real_time'] is False
        assert mission['radiation_dose']['value'] is None
        assert c.post('/api/live/ingest',json=next(generate_packets())).status_code==503

    # Smoke each scenario in *local* mode. Models are never retrained.
    os.environ['PHYSIOGRAPH_PUBLIC_MODE']='0'
    scenarios={}
    for mode in ('normal','activity','artifact','excursion'):
        with TestClient(build_app()) as c:
            counts=Counter();quality=Counter(); raw=Counter();cnn=Counter();stat=Counter()
            timings=[]
            for p in generate_packets(mode=mode,count=180):
                start=time.perf_counter()
                response=c.post('/api/live/ingest',json=p)
                timings.append((time.perf_counter()-start)*1000)
                assert response.status_code==201,(mode,response.status_code,response.text[:200])
                r=response.json()
                assert r['packet']['source']=='SIMULATED_LIVE'
                counts[r['context_review']['status']]+=1
                quality[r['context_review']['quality']['status']]+=1
                raw[r['live_review']['status']]+=1
                cnn[r['deep_learning']['status']]+=1
                stat[r['comparison']['status']]+=1
            import numpy as np
            assert sum(counts.values())==180
            assert cnn['MODEL_FLAG']+cnn['NO_MODEL_FLAG']==76
            scenarios[mode]={
                'packets':180, 'cnn':dict(cnn),'statistical':dict(stat),
                'raw_review':dict(raw),'quality':dict(quality),
                'context_review':dict(counts),
                'http_request_latency_median_ms_local_testclient':round(float(np.median(timings)),3),
                'http_request_latency_p95_ms_local_testclient':round(float(np.quantile(timings,.95)),3),
            }
    result={
        'release':'PHYSIOGRAPH_v1.5',
        'status':'SOFTWARE_AUDIT_PASSED_NOT_CLINICALLY_VALIDATED',
        'tested_on':'LOCAL_CONTAINER_TESTCLIENT_NO_NETWORK_DEPLOYMENT',
        'frozen_v14_files':comparable,
        'frozen_files_unchanged':all(x['unchanged'] for x in comparable.values()),
        'models_loaded_lightweight_inference':True,
        'nasa_historical_observations':overview['observations'],
        'nasa_subjects':overview['astronauts'],
        'scenarios':scenarios,
        'external_bidmc_evaluation':{
            'status':'NOT_COMPLETED',
            'reason':'Official PhysioNet numeric-file network download unavailable from this execution environment',
            'download_and_evaluate_script':'RUN_EXTERNAL_VALIDATION_WINDOWS.bat',
            'deployed_5channel_model_externally_validated':False,
            'separate_research_3channel_experiment_is_clinical_validation':False,
        },
        'deployment_limits':{
            'free_host_actual_deployment':'NOT_PERFORMED',
            'backend_is_not_crew_medical_device':True,
            'public_anonymous_ingest_default':'DISABLED',
            'auto_demo_data':'FICTIONAL',
            'all_read_only_routes_expose_only_pseudonymous_historical_or_simulated_data':True,
        },
        'notes':[
            'FastAPI TestClient latency is not deployed latency and is not a hard realtime guarantee.',
            'No sensor integration, personalized medical thresholds, disease labels, or validated safety actions.',
            'CNN and comparator may disagree; observed synthetic flags do not establish sensitivity or specificity.',
            'APDRA is separate and frozen; its historical screening is not applied to live telemetry.',
        ],
    }
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('scenarios','frozen_v14_files')},indent=2))
    print('Synthetic scenario statuses:',json.dumps({k:v['context_review'] for k,v in scenarios.items()},indent=2))
    return result


if __name__=='__main__':run()
