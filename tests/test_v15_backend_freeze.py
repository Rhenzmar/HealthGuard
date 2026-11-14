"""Integration tests for the read-only hosted demo. No medical claims."""
from __future__ import annotations

import time
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from physiograph.live_api import build_app
from tools.replay_live_demo import generate_packets


def test_readiness_and_missing_suit_data(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_INFERENCE_BACKEND', 'numpy')
    monkeypatch.delenv('PHYSIOGRAPH_AUTO_DEMO', raising=False)
    app = build_app()
    with TestClient(app) as c:
        j=c.get('/api/system/readiness').json()
        assert j['release']=='v1.5'
        assert j['models_loaded'] is True
        assert j['external_deployed_model_validation']=='NOT_PERFORMED'
        assert j['clinical_validation'] is False
        status=c.get('/api/mission/status').json()
        for k in ('spacesuit_oxygen_reserves','suit_pressure','radiation_dose'):
            assert status[k]['value'] is None
            assert status[k]['status']=='NOT_CONNECTED'
        assert status['earth_communication_delay']['status']=='NOT_IMPLEMENTED'
        assert c.get('/api/live/voice/SIM_A').status_code==404


def test_public_ingest_fails_closed_but_server_demo_runs(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_INFERENCE_BACKEND','numpy')
    monkeypatch.setenv('PHYSIOGRAPH_PUBLIC_MODE','1')
    monkeypatch.delenv('PHYSIOGRAPH_INGEST_API_KEY',raising=False)
    monkeypatch.setenv('PHYSIOGRAPH_AUTO_DEMO','1')
    monkeypatch.setenv('PHYSIOGRAPH_AUTO_DEMO_SPEED','20')
    packet=next(generate_packets(subject='TRY_WRITE',start=datetime(2026,11,14,tzinfo=timezone.utc)))
    with TestClient(build_app()) as c:
        assert c.post('/api/live/ingest',json=packet).status_code==503
        end=time.monotonic()+4
        while time.monotonic()<end:
            state=c.get('/api/live/snapshot').json()
            if state['subject_count']:
                break
            time.sleep(.05)
        end=time.monotonic()+4
        while time.monotonic()<end and state['subject_count']<4:
            time.sleep(.05)
            state=c.get('/api/live/snapshot').json()
        assert state['subject_count']==4, 'All four internal demo streams must start without browser writes'
        assert set(state['subjects'])=={'SIM_CREW_01','SIM_CREW_02','SIM_CREW_03','SIM_CREW_04'}
        first_values=[state['subjects'][sid]['latest']['values']['heart_rate_bpm'] for sid in sorted(state['subjects'])]
        assert len(set(first_values))==4, 'Crew profiles must not produce cloned vital signs'
        assert state['subjects']['SIM_CREW_01']['latest']['source']=='SIMULATED_LIVE'
        assert c.get('/api/live/health').json()['public_ingest']=='DISABLED'
        assert c.get('/api/live/voice/SIM_CREW_01').json()['generation']=='DETERMINISTIC_TEMPLATE_NOT_LLM'
        with c.websocket_connect('/api/live/ws') as ws:
            data=ws.receive_json()
            assert data['type']=='snapshot'
            assert data['data']['subject_count']==4


def test_public_key_is_not_exposed_and_controls_ingest(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_INFERENCE_BACKEND','numpy')
    monkeypatch.setenv('PHYSIOGRAPH_PUBLIC_MODE','1')
    monkeypatch.setenv('PHYSIOGRAPH_INGEST_API_KEY','secret-testing-only-do-not-deploy')
    monkeypatch.delenv('PHYSIOGRAPH_AUTO_DEMO',raising=False)
    packet=next(generate_packets(subject='SIM_A',start=datetime(2026,11,14,tzinfo=timezone.utc)))
    with TestClient(build_app()) as c:
        assert c.post('/api/live/ingest',json=packet).status_code==403
        assert c.post('/api/live/ingest',json=packet,headers={'X-PhysioGraph-Ingest-Key':'bad'}).status_code==403
        h={'X-PhysioGraph-Ingest-Key':'secret-testing-only-do-not-deploy'}
        r=c.post('/api/live/ingest',json=packet,headers=h)
        assert r.status_code==201
        assert r.json()['packet']['source']=='SIMULATED_LIVE'
        for endpoint in ['/api/live/health','/api/system/readiness','/api/live/snapshot']:
            assert 'secret-testing-only-do-not-deploy' not in c.get(endpoint).text


def test_context_voice_is_bound_to_observed_sequence(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_INFERENCE_BACKEND','numpy')
    monkeypatch.delenv('PHYSIOGRAPH_PUBLIC_MODE',raising=False)
    monkeypatch.delenv('PHYSIOGRAPH_AUTO_DEMO',raising=False)
    with TestClient(build_app()) as c:
        packets=list(generate_packets(subject='VOICE_01',count=8,
            start=datetime(2026,11,14,tzinfo=timezone.utc),mode='normal'))
        for p in packets:
            result=c.post('/api/live/ingest',json=p)
            assert result.status_code==201
        last=c.get('/api/live/voice/VOICE_01').json()
        assert last['sequence']==7
        assert last['status']==c.get('/api/live/context-review/VOICE_01').json()['status']
        assert last['clinical_validation'] is False
        assert isinstance(last['text'],str) and last['text']


def test_cors_exact_origin_and_no_wildcard(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_INFERENCE_BACKEND','numpy')
    monkeypatch.setenv('PHYSIOGRAPH_CORS_ORIGINS','http://localhost:5173')
    with TestClient(build_app()) as c:
        ok=c.get('/api/live/health',headers={'Origin':'http://localhost:5173'})
        no=c.get('/api/live/health',headers={'Origin':'https://evil.example'})
        assert ok.headers.get('access-control-allow-origin')=='http://localhost:5173'
        assert 'access-control-allow-origin' not in no.headers
    monkeypatch.setenv('PHYSIOGRAPH_CORS_ORIGINS','*')
    with pytest.raises(ValueError,match='Wildcard'):
        build_app()


def test_bad_demo_speed_cannot_start(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_AUTO_DEMO_SPEED','100000')
    with pytest.raises(ValueError,match='between'):
        build_app()

def test_four_demo_crew_have_independent_model_results(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_INFERENCE_BACKEND','numpy')
    monkeypatch.setenv('PHYSIOGRAPH_PUBLIC_MODE','1')
    monkeypatch.delenv('PHYSIOGRAPH_INGEST_API_KEY',raising=False)
    monkeypatch.setenv('PHYSIOGRAPH_AUTO_DEMO','1')
    monkeypatch.setenv('PHYSIOGRAPH_AUTO_DEMO_SPEED','20')
    with TestClient(build_app()) as c:
        end=time.monotonic()+4
        while time.monotonic()<end:
            snap=c.get('/api/live/snapshot').json()
            if snap['subject_count']==4:
                break
            time.sleep(.05)
        assert snap['subject_count']==4
        ids=sorted(snap['subjects'])
        for sid in ids:
            packet=snap['subjects'][sid]['latest']
            assert packet['subject_id']==sid
            assert packet['source']=='SIMULATED_LIVE'
            hist=c.get(f'/api/live/history/{sid}').json()['samples']
            assert hist and all(x['subject_id']==sid for x in hist)
            review=c.get(f'/api/live/context-review/{sid}').json()
            assert review['subject_id']==sid
            assert review['sequence']==packet['sequence']
            assert c.get(f'/api/live/voice/{sid}').json()['subject_id']==sid
            assert c.get(f'/api/live/dl/{sid}').json()['subject_id']==sid
            assert c.get(f'/api/live/comparison/{sid}').json()['subject_id']==sid
        assert c.get('/api/live/health').json()['demo_crew_subjects']==ids
        assert c.post('/api/live/ingest',json={k:v for k,v in snap['subjects'][ids[0]]['latest'].items() if k in {'subject_id','sequence','timestamp','source','values','context'}}).status_code==503

