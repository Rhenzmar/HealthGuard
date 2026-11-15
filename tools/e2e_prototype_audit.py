"""Repeatable HealthGuard end-to-end API audit on real pretrained models.

Evaluates every fictional crew × all seven backend scenarios at predefined
checkpoints via the actual FastAPI HTTP contract. No scripted label is reported
as model accuracy, and no historical NASA lab is used as synthetic input.
The script is intentionally deterministic except for measured wall times.

Usage:
    python -m tools.e2e_prototype_audit --mode inprocess
    python -m tools.e2e_prototype_audit --mode http --api-base https://...
"""
from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import time
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parent.parent
OUTPUT=ROOT/'research/prototype_end_to_end'
CREW=('SIM_CREW_01','SIM_CREW_02','SIM_CREW_03','SIM_CREW_04')
SCENARIOS=('oxygenation','exertion','thermal','sensor','co2','cabin_leak','radiation')
CHECKPOINTS=(0,14,22,35,50,64)
EXPECTED_SCRIPTED={0:'OPTIMAL',14:'CHECK',22:'WARNING',35:'CRITICAL',64:'OPTIMAL'}
MODEL_STATES={'MODEL_FLAG','NO_MODEL_FLAG'}
REVIEW_STATES={'OPTIMAL','CHECK','WARNING','CRITICAL'}


def _http_client(base):
    base=base.rstrip('/')
    def get(path):
        req=Request(base+path,headers={'Accept':'application/json','User-Agent':'HealthGuard-Reproducible-E2E-Audit'})
        with urlopen(req,timeout=90) as response:
            if response.status!=200:raise RuntimeError('Unexpected status '+str(response.status))
            return json.load(response)
    return get


def _inprocess_client():
    from fastapi.testclient import TestClient
    from physiograph.live_api import build_app
    client=TestClient(build_app())
    client.__enter__()
    def get(path):
        resp=client.get(path)
        resp.raise_for_status()
        return resp.json()
    return get,client


def audit(get,kind:str,*,strict:bool=True)->dict:
    failures=[]
    rows=[]
    latencies=[]
    def verify(condition,where,reason):
        if not condition:
            failures.append({'where':where,'reason':reason})
        return condition

    health=get('/api/live/health')
    catalog=get('/api/simulation/scenarios')
    verify(health.get('candidate_17ch',{}).get('status')=='LOADED','health','17ch candidate checkpoint unavailable')
    verify(health.get('deep_learning',{}).get('status')=='LOADED','health','original CNN unavailable')
    verify(health.get('comparison',{}).get('status')=='LOADED','health','statistical comparator unavailable')
    verify(set(x['id'] for x in catalog.get('scenarios',[]))==set(SCENARIOS),'catalog','missing scenario ids')
    verify(set(catalog.get('crew_ids',[]))==set(CREW),'catalog','missing crew identities')
    before=get('/api/live/snapshot')
    # The external running demo legitimately streams packets while requests
    # execute. Only inprocess with auto-demo disabled admits exact snapshot
    # equality as an isolation proof.
    first_model_version=None
    for sid in CREW:
        for scenario in SCENARIOS:
            series=[]
            for tick in CHECKPOINTS:
                path=f'/api/simulation/scenarios/{sid}/{scenario}?'+urlencode({'second':tick,'include_history':'true'})
                started=time.perf_counter()
                try:
                    frame=get(path)
                except Exception as exc:
                    failures.append({'where':f'{sid}/{scenario}/{tick}','reason':'API error: '+type(exc).__name__+': '+str(exc)[:200]})
                    continue
                elapsed_ms=(time.perf_counter()-started)*1000
                latencies.append(elapsed_ms)
                where=f'{sid}/{scenario}/{tick}'
                verify(frame.get('subject_id')==sid and frame.get('scenario_id')==scenario
                    and frame.get('sequence')==tick and frame.get('elapsed_seconds')==tick,where,'crew/scenario/sequence mismatch')
                verify(frame.get('source')=='SERVER_SCRIPTED_TRAINING_SCENARIO'
                    and frame.get('clinical_validation') is False,where,'scripted training provenance lost')
                v=frame.get('values',{})
                eng=frame.get('engineering_values',{})
                verify(len(v)==5 and len(eng)==12 and not(set(v)&set(eng)),where,'missing or overlapping 5+12 channels')
                verify(all(isinstance(k,(float,int)) and math.isfinite(k)
                           for k in list(v.values())+list(eng.values())),where,'missing or non-finite training measurements')
                if tick in EXPECTED_SCRIPTED:
                    verify(frame.get('severity')==EXPECTED_SCRIPTED[tick],where,'scripted progression differs from predefined training state')
                if tick==0 or tick==64:
                    verify(frame.get('alert') is False and frame.get('alarm',{}).get('status')=='CLEARED',
                           where,'baseline/recovery scripted alarm must be cleared')
                if tick==35:
                    verify(frame.get('alert') is True and frame.get('alarm',{}).get('status')=='ACTIVE',
                           where,'peak scripted alarm must be active')
                verify(frame.get('alarm',{}).get('active')==frame.get('alert'),where,'alarm state and scripted trigger disagree')
                verify(len(frame.get('history',[]))==tick+1 and
                       frame.get('history',[])[-1].get('values')==v,where,'historical timeline inconsistent with present values')
                evidence=frame.get('model_evidence',{})
                ai=evidence.get('candidate_17ch',{})
                old=evidence.get('five_channel_cnn',{})
                stat=evidence.get('statistical_comparator',{})
                review=evidence.get('unified',{})
                verify(evidence.get('model_evaluated_on_same_scenario_values') is True,where,'17ch CNN not actually run')
                verify(ai.get('status') in MODEL_STATES
                       and old.get('status') in MODEL_STATES
                       and stat.get('status') in MODEL_STATES,where,'one or more model weights unavailable')
                verify(review.get('status') in REVIEW_STATES and
                       review.get('classification_domain')=='FICTIONAL_MISSION_TRAINING_ONLY'
                       and review.get('clinical_validation') is False,where,'unified PhysioAlert classification invalid')
                verify(review.get('subject_id')==sid and review.get('sequence')==tick,where,'review participant contamination')
                verify(ai.get('NASA_laboratory_data_used') is False,where,'false NASA model validation claim')
                verify(ai.get('trained_model_evaluated') is True,where,'CNN result is not actual pretrained inference')
                if ai.get('status') in MODEL_STATES:
                    score=ai.get('reconstruction_error')
                    threshold=ai.get('threshold')
                    verify(isinstance(score,(float,int)) and math.isfinite(score)
                           and isinstance(threshold,(float,int)) and threshold>0,where,'bad CNN reconstruction score')
                    if isinstance(score,(float,int)) and isinstance(threshold,(float,int)):
                        verify((score>threshold)==(ai.get('status')=='MODEL_FLAG'),where,'CNN flag contradicts frozen threshold')
                verify(len(ai.get('largest_reconstruction_errors',[]))==5,where,'per-channel CNN explanation absent')
                if first_model_version is None:first_model_version=ai.get('model_version')
                verify(ai.get('model_version')==first_model_version,where,'model version changed during audit')
                verify(review.get('automatic_treatment_or_diagnosis') is False,where,'nonclinical guardrail lost')
                verify(isinstance(frame.get('alarm',{}).get('voice_ready_script'),str)
                       and len(frame.get('alarm',{}).get('voice_ready_script'))>20,where,'missing recovery/alarm voice script')
                series.append({'second':tick,'scripted_status':frame.get('severity'),
                    'scripted_alert':frame.get('alert'),
                    'alarm_status':frame.get('alarm',{}).get('status'),
                    'cnn_17ch_flag':ai.get('status')=='MODEL_FLAG',
                    'cnn_17ch_reconstruction_error':ai.get('reconstruction_error'),
                    'cnn_17ch_threshold':ai.get('threshold'),
                    'cnn_5ch_flag':old.get('status')=='MODEL_FLAG',
                    'statistical_flag':stat.get('status')=='MODEL_FLAG',
                    'physioalert_status':review.get('status'),
                    'physioalert_basis':review.get('basis'),
                    'model_explanation_present':len(ai.get('largest_reconstruction_errors',[]))==5,
                    'alarm_voice_present':bool(frame.get('alarm',{}).get('voice_ready_script')),
                    'api_processing_ms':round(elapsed_ms,2)})
            rows.append({'crew_id':sid,'scenario_id':scenario,'checkpoints':series,
                'checks_returned':len(series),
                'peak_scripted_alert':next((v['scripted_alert'] for v in series if v['second']==35),None),
                'recovered_scripted_alert':next((v['scripted_alert'] for v in series if v['second']==64),None),
                'peak_cnn_17ch_flag':next((v['cnn_17ch_flag'] for v in series if v['second']==35),None),
                'peak_unified_attention':next((v['physioalert_status'] for v in series if v['second']==35),None),
                'cnn_17ch_flag_at_recovery':next((v['cnn_17ch_flag'] for v in series if v['second']==64),None)})
    after=get('/api/live/snapshot')
    if kind=='inprocess':
        verify(before==after,'crew_isolation','scenario playback changed live crew state')
    latencies=sorted(latencies)
    median_latency=round(statistics.median(latencies),2) if latencies else None
    p95_latency=round(latencies[min(len(latencies)-1,int(.95*(len(latencies)-1)))],2) if latencies else None
    count=sum(x['checks_returned'] for x in rows)
    peaks=[x for x in rows if x['peak_cnn_17ch_flag'] is not None]
    report={
        'audit_name':'HealthGuard complete pretrained-model scenario and crew integration audit',
        'execution_context':kind,
        'data_domain':'FULLY_SYNTHETIC_SCENARIO_INPUTS',
        'performed_on_real_nasa_data':False,
        'clinical_validation':False,
        'model_version':first_model_version,
        'number_of_scenarios':len(SCENARIOS),
        'number_of_fictional_crew':len(CREW),
        'scenario_crew_combinations':len(rows),
        'tested_checkpoints_seconds':list(CHECKPOINTS),
        'api_responses_evaluated':count,
        'expected_api_responses':len(SCENARIOS)*len(CREW)*len(CHECKPOINTS),
        'scripted_alarm_at_peak':sum(x['peak_scripted_alert'] is True for x in rows),
        'scripted_alarm_cleared_at_completion':sum(x['recovered_scripted_alert'] is False for x in rows),
        'cnn_17ch_peak_novelty_flags':sum(x['peak_cnn_17ch_flag'] is True for x in rows),
        'cnn_17ch_retained_flag_at_scripted_completion':sum(x['cnn_17ch_flag_at_recovery'] is True for x in rows),
        'unified_attention_at_peak':dict(Counter(x['peak_unified_attention'] or 'MISSING' for x in rows)),
        'model_checkpoint_loaded':health.get('candidate_17ch',{}).get('status')=='LOADED',
        'five_channel_checkpoint_loaded':health.get('deep_learning',{}).get('status')=='LOADED',
        'statistical_detector_loaded':health.get('comparison',{}).get('status')=='LOADED',
        'live_store_unchanged_by_replay':before==after if kind=='inprocess' else None,
        'median_api_processing_ms':median_latency,
        'p95_api_processing_ms':p95_latency,
        'errors':failures,
        'all_contract_checks_passed':not failures,
        'per_combination':rows,
        'limitations':[
            'This is engineering verification of fictional scenario inputs, not clinical anomaly-detection sensitivity.',
            'The 17-channel model flags are frozen-model novelty output, not predefined scenario status or medical severity.',
            'The scripted alarm is designed to clear when the trigger subsides; the rolling CNN can retain earlier anomalous measurements.',
            'The four crew profiles are synthetic, correlated within scenario, and not independent patients.',
            'API processing time measured on execution environment, not a guaranteed production response-time SLA.',
            'Speaker hardware and audible playback are assessed separately with browser instrumentation rather than this API audit.',
        ],
    }
    if strict and failures:
        raise RuntimeError(f'{len(failures)} end-to-end assertions failed: '+repr(failures[:8]))
    return report


def write_report(data:dict,out:Path=OUTPUT)->None:
    out.mkdir(parents=True,exist_ok=True)
    (out/'api_e2e_results.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    text=[
        '# HealthGuard 28-case end-to-end prototype integration audit',
        '',
        '**Data domain:** fictional 17-channel scenario streams; pretrained CNN inference, separate scripted alert and PhysioAlert attention.',
        '**Interpretation:** engineering functionality. Not NASA/clinical accuracy, diagnostic sensitivity or medical risk.',
        '',
        f"- **Matrix:** {data['scenario_crew_combinations']} = {data['number_of_scenarios']} scenarios × {data['number_of_fictional_crew']} fictional astronauts.",
        f"- **HTTP API checks:** {data['api_responses_evaluated']}/{data['expected_api_responses']} at {data['tested_checkpoints_seconds']} fictional seconds.",
        f"- **Scripted alerts at peak:** {data['scripted_alarm_at_peak']}/{data['scenario_crew_combinations']}.",
        f"- **Scripted alerts cleared after recovery:** {data['scripted_alarm_cleared_at_completion']}/{data['scenario_crew_combinations']}.",
        f"- **Pretrained 17-channel CNN flags at peak:** {data['cnn_17ch_peak_novelty_flags']}/{data['scenario_crew_combinations']}. This is not clinical sensitivity.",
        f"- **CNN flags persisting in the final rolling window:** {data['cnn_17ch_retained_flag_at_scripted_completion']}/{data['scenario_crew_combinations']}.",
        f"- **Unified PhysioAlert attention at peak:** {data['unified_attention_at_peak']}.",
        f"- **Model weights loaded:** 17ch={data['model_checkpoint_loaded']}, 5ch={data['five_channel_checkpoint_loaded']}, covariance={data['statistical_detector_loaded']}.",
        f"- **API processing latency:** median {data['median_api_processing_ms']} ms; sampled p95 {data['p95_api_processing_ms']} ms ({data['execution_context']}).",
        f"- **Contract failures:** {len(data['errors'])}.",
        '',
        '| Crew | Scenario | Peak scripted alert | Final scripted recovery | Peak 17ch CNN novelty flag | Peak unified training level | CNN flag at completion |',
        '|---|---|---|---|---|---|---|',
    ]
    for row in data['per_combination']:
        text.append('| '+ ' | '.join([
            row['crew_id'],row['scenario_id'],
            str(row['peak_scripted_alert']),str(row['recovered_scripted_alert']),
            str(row['peak_cnn_17ch_flag']),str(row['peak_unified_attention']),
            str(row['cnn_17ch_flag_at_recovery'])
        ])+' |')
    text+=['','## Limitations']+[f'- {l}' for l in data['limitations']]
    (out/'API_RESULTS.md').write_text('\n'.join(text)+'\n',encoding='utf-8')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--mode',choices=['inprocess','http'],default='inprocess')
    parser.add_argument('--api-base',default='https://physiograph-api-lurx.onrender.com')
    parser.add_argument('--out',type=Path,default=OUTPUT)
    args=parser.parse_args()
    if args.mode=='inprocess':
        os.environ['PHYSIOGRAPH_AUTO_DEMO']='0'
        os.environ['PHYSIOGRAPH_INFERENCE_BACKEND']='numpy'
        getter,ctx=_inprocess_client()
        try:out=audit(getter,args.mode)
        finally:ctx.__exit__(None,None,None)
    else:
        out=audit(_http_client(args.api_base),args.mode)
    write_report(out,args.out)
    print(json.dumps({k:v for k,v in out.items() if k not in ('per_combination','limitations')},indent=2),flush=True)


if __name__=='__main__':
    main()
