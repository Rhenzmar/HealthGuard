"""Deep learning tests verify software behavior, not medical validity."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from physiograph.deep_learning import (CNNAnomalyModel, LiveCNNMonitor, build_network,
    normalize_window, load_monitor, FEATURES, WINDOW_POINTS, REFERENCE_POINTS)
from physiograph.live_api import build_app
from physiograph.live_telemetry import validate_sample
from tools.replay_live_demo import generate_packets
from tools.train_cnn_autoencoder import sim_episode

T0=datetime(2026,11,14,12,0,tzinfo=timezone.utc)


def test_pretrained_checkpoint_really_runs_neural_forward_pass():
    model=CNNAnomalyModel()
    assert model.metadata['training_domain']=='SYNTHETIC_NORMAL_ONLY'
    assert model.info()['architecture']=='1D_CNN_AUTOENCODER'
    assert sum(x.numel() for x in model.network.parameters()) > 100
    assert not any(p.requires_grad is False for p in model.network.parameters()) # trainable architecture
    base=np.array([68,98,14,36.8,60],dtype=np.float32)
    series=np.repeat(base[None,:],WINDOW_POINTS,axis=0)
    score=model.score(series,base)
    assert np.isfinite(score) and score>=0
    assert model.info()['output_interpretation']=='reconstruction novelty, not disease or health risk'


def test_normalize_uses_fixed_external_baseline_not_window_mean():
    reference=np.array([70,98,14,36.8,60],dtype=np.float32)
    window=np.repeat(reference[None,:],WINDOW_POINTS,axis=0)
    window[:,0]+=12
    normalized=normalize_window(window,reference)
    assert normalized.shape==(5,60)
    assert normalized[0].mean()==pytest.approx(1.0)
    assert normalized[1].mean()==pytest.approx(0)


def test_bad_input_rejected_no_imputation():
    ref=np.zeros(5)
    with pytest.raises(ValueError):normalize_window(np.zeros((59,5)),ref)
    bad=np.zeros((60,5));bad[0,0]=np.nan
    with pytest.raises(ValueError):normalize_window(bad,ref)


def test_synthetic_generation_is_reproducible_and_separate_from_nasa():
    a=sim_episode(np.random.default_rng(1729))
    b=sim_episode(np.random.default_rng(1729))
    assert np.array_equal(a,b)
    assert a.shape==(5,60)
    shifted=sim_episode(np.random.default_rng(1729),'MULTISIGNAL_SHIFT')
    assert not np.array_equal(a,shifted)


def test_live_sequence_calibrates_then_flags_replay():
    monitor=load_monitor()
    assert monitor.model_status()['status']=='LOADED'
    reports=[]
    for packet in generate_packets(start=T0,count=180):
        reports.append(monitor.process(validate_sample(packet)))
    assert reports[0]['status']=='BASELINE_CALIBRATING'
    assert reports[44]['progress']==REFERENCE_POINTS
    assert reports[45]['status']=='WINDOW_COLLECTING'
    assert reports[103]['status']=='WINDOW_COLLECTING'
    assert reports[104]['status']=='MODEL_FLAG'
    assert reports[104]['reconstruction_error']>reports[104]['calibration_threshold']
    assert not reports[104]['clinical_validation']
    assert reports[104]['source']=='SIMULATED_LIVE'
    assert 'diagnosis' not in reports[104]


def test_rejects_source_confusion():
    monitor=load_monitor()
    p=validate_sample(next(generate_packets(start=T0,count=1)))
    from dataclasses import replace
    with pytest.raises(ValueError,match='only simulated'):
        monitor.process(replace(p,source='NASA_OSD575'))


def test_missing_metrics_prevents_inference_and_window_resets():
    monitor=load_monitor()
    packets=list(generate_packets(start=T0,count=140))
    for p in packets[:105]:monitor.process(validate_sample(p))
    partial={**packets[105], 'values':{'heart_rate_bpm':70}}
    a=monitor.process(validate_sample(partial))
    assert a['status']=='INCOMPLETE_METRICS'
    a=monitor.process(validate_sample(packets[106]))
    assert a['status']=='WINDOW_COLLECTING' and a['progress']==1
    # One-second temporal discontinuity resets current window without fake interpolation.
    p={**packets[108], 'sequence':107, 'timestamp':packets[108]['timestamp']}
    a=monitor.process(validate_sample(p))
    assert a['status']=='IRREGULAR_CADENCE'
    assert a['clinical_validation'] is False


def test_missing_model_returns_explicit_no_inference(tmp_path):
    monitor=load_monitor(tmp_path/'missing.pt')
    assert monitor.model_status()['status']=='MODEL_UNAVAILABLE'
    p=validate_sample(next(generate_packets(start=T0,count=1)))
    assert monitor.process(p)['status']=='MODEL_UNAVAILABLE'


def test_api_broadcasts_real_dl_results_to_websocket():
    with TestClient(build_app()) as client:
        assert client.get('/api/live/dl/model').json()['status']=='LOADED'
        assert client.get('/api/live/dl/UNKNOWN').status_code==404
        with client.websocket_connect('/api/live/ws') as ws:
            assert ws.receive_json()['type']=='snapshot'
            for i,p in enumerate(generate_packets(start=T0,count=105)):
                result=client.post('/api/live/ingest',json=p)
                assert result.status_code==201
                event=ws.receive_json()
                assert event['type']=='telemetry'
                assert event['deep_learning']['status']==result.json()['deep_learning']['status']
            assert event['deep_learning']['status']=='MODEL_FLAG'
            assert client.get('/api/live/dl/SIM_CREW_01').json()['status']=='MODEL_FLAG'
            assert result.json()['packet']['analysis_status']=='NOT_EVALUATED' # no APDRA claim


def test_api_can_stay_live_without_pytorch_model(tmp_path):
    with TestClient(build_app(checkpoint_path=tmp_path/'missing.pt')) as client:
        assert client.get('/api/live/dl/model').json()['status']=='MODEL_UNAVAILABLE'
        r=client.post('/api/live/ingest',json=next(generate_packets(start=T0,count=1)))
        assert r.status_code==201
        assert r.json()['deep_learning']['status']=='MODEL_UNAVAILABLE'
        assert client.get('/api/live/snapshot').json()['subject_count']==1


def test_legacy_apdra_is_not_retrained_or_imported_into_cnn():
    from physiograph import deep_learning
    assert 'apdra' not in deep_learning.__dict__
    assert 'OSD575' not in deep_learning.__dict__


def test_separate_normal_and_excursion_replays():
    normal=list(generate_packets(start=T0,count=180,mode='normal'))
    excursion=list(generate_packets(start=T0,count=180,mode='excursion'))
    assert all(a['source']=='SIMULATED_LIVE' for a in normal+excursion)
    assert len(normal)==len(excursion)
    assert max(p['values']['heart_rate_bpm'] for p in normal)<80
    assert max(p['values']['heart_rate_bpm'] for p in excursion)>90
    assert normal[0]['values']==excursion[0]['values']


def test_model_history_bounded_and_queryable():
    with TestClient(build_app()) as client:
        for p in generate_packets(start=T0,count=110):
            assert client.post('/api/live/ingest',json=p).status_code==201
        h=client.get('/api/live/dl/history/SIM_CREW_01?limit=5')
        assert h.status_code==200
        history=h.json()['results']
        assert len(history)==5
        assert history[-1]['sequence']==109
        assert history[-1]['status']=='MODEL_FLAG'
        assert client.get('/api/live/dl/history/SIM_CREW_01?limit=301').status_code==422


def test_live_viewer_is_served_locally():
    with TestClient(build_app()) as client:
        r=client.get('/live')
        assert r.status_code==200
        assert 'Live Neural Monitor' in r.text
        assert 'SIMULATION ONLY' in r.text
        assert 'CNN reconstruction error' in r.text
