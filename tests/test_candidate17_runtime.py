"""17-channel candidate reports never overwrite the frozen five-channel model."""
from datetime import datetime,timezone

from fastapi.testclient import TestClient

from physiograph.live_api import build_app
from tools.replay_live_demo import generate_packets


def test_candidate_has_independent_status_and_no_history_crossover(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_AUTO_DEMO','0')
    with TestClient(build_app()) as client:
        info=client.get('/api/live/health').json()
        assert 'candidate_17ch' in info
        assert 'deep_learning' in info
        assert client.get('/api/live/candidate17/C001').status_code==404
        assert client.get('/api/live/candidate17/SIM_CREW_01').status_code==404
        packet=next(generate_packets(
            subject='SIM_CREW_01',
            start=datetime(2026,11,14,tzinfo=timezone.utc),
            count=1
        ))
        sent=client.post('/api/live/ingest',json=packet)
        assert sent.status_code==201
        payload=sent.json()
        candidate=payload['candidate_17ch']
        assert candidate['subject_id']=='SIM_CREW_01'
        assert candidate['sequence']==packet['sequence']
        assert candidate['NASA_laboratory_data_used'] is False
        assert candidate['model_role']=='PARALLEL_CANDIDATE_NOT_CLINICAL_TRIAGE'
        assert candidate['status'] in ('BASELINE_CALIBRATING','MODEL_UNAVAILABLE')
        assert payload['multisystem']['candidate_17ch']==candidate
        assert client.get('/api/live/candidate17/SIM_CREW_01').json()==candidate
        assert client.get('/api/live/candidate17/SIM_CREW_02').status_code==404


def test_candidate_cpu_export_matches_schema_and_scores_if_bundled():
    from physiograph.candidate_17ch_numpy import (
        DEFAULT_EXPORT,Numpy17Candidate,load_candidate_monitor
    )
    monitor=load_candidate_monitor()
    if not DEFAULT_EXPORT.is_file():
        assert monitor.model is None
        assert monitor.model_status()['status']=='MODEL_UNAVAILABLE'
        return
    model=Numpy17Candidate()
    assert model.info()['status']=='LOADED'
    assert len(model.feature_order)==17
    import numpy as np
    reference=np.array([70,98,14,36.8,62,114,75,33.8,37,
                        650,20.9,101.2,22.2,43,.42,0,94],dtype=np.float32)
    window=np.repeat(reference[None,:],60,axis=0)
    result=model.score(window,reference)
    assert result['overall']>=0
    assert len(result['per_channel'])==17
    assert np.isfinite(result['overall'])
