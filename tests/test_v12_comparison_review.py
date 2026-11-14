"""Live comparator and deterministic review are software checks, not medical tests."""
from dataclasses import replace
from datetime import datetime, timezone, timedelta
import numpy as np
import pytest
from fastapi.testclient import TestClient

from physiograph.baseline_monitor import (StatisticalBaselineModel, load_baseline,
    summarize_window)
from physiograph.live_review import build_live_review
from physiograph.live_telemetry import validate_sample
from physiograph.live_api import build_app
from tools.replay_live_demo import generate_packets

T0=datetime(2026,11,14,12,0,tzinfo=timezone.utc)


def test_portable_baseline_artifact_and_training_scope():
    model=StatisticalBaselineModel()
    assert model.info()['status']=='LOADED'
    assert model.info()['clinical_validation'] is False
    assert model.info()['training_domain']=='SYNTHETIC_NORMAL_ONLY'
    x=np.zeros((5,60))
    assert len(summarize_window(x))==20
    assert np.isfinite(model.score(x))


def test_bad_comparison_input_rejected():
    with pytest.raises(ValueError): summarize_window(np.zeros((5,59)))
    bad=np.zeros((5,60));bad[0,10]=np.inf
    with pytest.raises(ValueError):summarize_window(bad)


def test_missing_baseline_model_graceful(tmp_path):
    m=load_baseline(tmp_path/'missing.npz')
    assert m.model_status()['status']=='MODEL_UNAVAILABLE'
    p=validate_sample(next(generate_packets(start=T0,count=1)))
    assert m.process(p)['status']=='MODEL_UNAVAILABLE'


def test_reference_and_window_warmup_for_comparator():
    m=load_baseline()
    outcomes=[m.process(validate_sample(p)) for p in generate_packets(start=T0,count=105)]
    assert outcomes[0]['status']=='BASELINE_CALIBRATING'
    assert outcomes[44]['progress']==45
    assert outcomes[45]['status']=='WINDOW_COLLECTING'
    assert outcomes[103]['progress']==59
    assert outcomes[104]['status'] in {'MODEL_FLAG','NO_MODEL_FLAG'}
    assert outcomes[104]['source']=='SIMULATED_LIVE'
    assert not outcomes[104]['clinical_validation']


def test_baseline_reset_on_gap_and_missing_channels():
    m=load_baseline()
    data=list(generate_packets(start=T0,count=110))
    for p in data[:105]:m.process(validate_sample(p))
    bad={**data[105],'values':{'heart_rate_bpm':70}}
    assert m.process(validate_sample(bad))['status']=='INCOMPLETE_METRICS'
    assert m.process(validate_sample(data[106]))['progress']==1
    gap={**data[109],'sequence':107}
    assert m.process(validate_sample(gap))['status']=='IRREGULAR_CADENCE'


def test_source_confusion_rejected():
    m=load_baseline()
    p=validate_sample(next(generate_packets(start=T0,count=1)))
    with pytest.raises(ValueError,match='Only simulated'):m.process(replace(p,source='OSD575'))


def test_review_rejects_cross_subject_and_cross_packet_evidence():
    p=validate_sample(next(generate_packets(start=T0,count=1)))
    x={'status':'NO_MODEL_FLAG','subject_id':p.subject_id,'sequence':p.sequence,'source':'SIMULATED_LIVE'}
    with pytest.raises(ValueError,match='another telemetry packet'):
        build_live_review(p,{**x,'sequence':5},x)
    with pytest.raises(ValueError,match='simulated'):
        build_live_review(p,x,{**x,'source':'NASA_OSDR'})


@pytest.mark.parametrize('a,b,expected',[
    ('MODEL_FLAG','MODEL_FLAG','BOTH_MODELS_FLAG'),
    ('MODEL_FLAG','NO_MODEL_FLAG','MODELS_DISAGREE'),
    ('NO_MODEL_FLAG','MODEL_FLAG','MODELS_DISAGREE'),
    ('NO_MODEL_FLAG','NO_MODEL_FLAG','NO_MODEL_FLAG'),
    ('BASELINE_CALIBRATING','MODEL_FLAG','EVIDENCE_INCOMPLETE'),
    ('MODEL_UNAVAILABLE','NO_MODEL_FLAG','EVIDENCE_INCOMPLETE'),
    ('INCOMPLETE_METRICS','NO_MODEL_FLAG','CHECK_DATA_QUALITY'),
    ('IRREGULAR_CADENCE','NO_MODEL_FLAG','CHECK_DATA_QUALITY'),
])
def test_review_outcome_matrix(a,b,expected):
    p=validate_sample(next(generate_packets(start=T0,count=1)))
    base={'subject_id':p.subject_id,'sequence':p.sequence,'source':'SIMULATED_LIVE'}
    result=build_live_review(p,{**base,'status':a},{**base,'status':b})
    assert result['status']==expected
    assert result['apdra_applied'] is False
    assert result['clinical_validation'] is False
    assert 'diagnosis' in result['interpretation_limit']
    assert len(result['verification_actions']) >= 2


def test_api_end_to_end_and_websocket_contains_review_and_comparator():
    with TestClient(build_app()) as client:
        assert client.get('/api/live/comparison/model').json()['status']=='LOADED'
        assert client.get('/api/live/review/UNKNOWN').status_code==404
        assert client.get('/api/live/comparison/UNKNOWN').status_code==404
        with client.websocket_connect('/api/live/ws') as ws:
            assert ws.receive_json()['type']=='snapshot'
            for p in generate_packets(start=T0,count=105):
                response=client.post('/api/live/ingest',json=p)
                assert response.status_code==201
                evt=ws.receive_json()
                assert evt['type']=='telemetry'
                assert evt['comparison']==response.json()['comparison']
                assert evt['live_review']==response.json()['live_review']
            data=response.json()
            assert data['deep_learning']['status']=='MODEL_FLAG'
            assert data['comparison']['status'] in ('MODEL_FLAG','NO_MODEL_FLAG')
            assert data['live_review']['status'] in ('BOTH_MODELS_FLAG','MODELS_DISAGREE')
            assert client.get('/api/live/review/SIM_CREW_01').json()==data['live_review']
            assert client.get('/api/live/comparison/SIM_CREW_01').json()==data['comparison']
            assert data['packet']['analysis_status']=='NOT_EVALUATED'
            assert 'diagnosis' not in data['live_review']


def test_api_prevents_stale_review_after_duplicate_packet():
    with TestClient(build_app()) as client:
        p=next(generate_packets(start=T0,count=1))
        assert client.post('/api/live/ingest',json=p).status_code==201
        prior=client.get('/api/live/review/SIM_CREW_01').json()
        assert client.post('/api/live/ingest',json=p).status_code==409
        assert client.get('/api/live/review/SIM_CREW_01').json()==prior


def test_api_handles_missing_cnn_and_baseline_artifacts(tmp_path):
    with TestClient(build_app(checkpoint_path=tmp_path/'none.pt',baseline_path=tmp_path/'none.npz')) as client:
        r=client.post('/api/live/ingest',json=next(generate_packets(start=T0,count=1)))
        assert r.status_code==201
        assert r.json()['deep_learning']['status']=='MODEL_UNAVAILABLE'
        assert r.json()['comparison']['status']=='MODEL_UNAVAILABLE'
        assert r.json()['live_review']['status']=='EVIDENCE_INCOMPLETE'


def test_live_viewer_contains_review_panel():
    with TestClient(build_app()) as client:
        r=client.get('/live')
        assert r.status_code==200
        assert 'PhysioAlert Live Review' in r.text
        assert 'baselinethreshold' in r.text
