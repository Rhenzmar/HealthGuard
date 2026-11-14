from datetime import datetime, timezone, timedelta
import math
import pytest
from fastapi.testclient import TestClient

from physiograph.live_telemetry import LiveStore, TelemetryError, ConflictError, validate_sample
from physiograph.live_api import build_app
from tools.replay_live_demo import generate_packets

T0 = datetime(2026,11,14,12,0,tzinfo=timezone.utc)

def pkt(seq=0,subject='SIM_01', values=None,when=None):
    return {'subject_id':subject,'sequence':seq,'timestamp':(when or T0+timedelta(seconds=seq)).isoformat(),
            'source':'SIMULATED_LIVE','values':values if values is not None else {'heart_rate_bpm':70,'spo2_percent':98}}


def test_valid_packet_converts_to_utc():
    p=pkt()
    p['timestamp']='2026-11-14T20:00:00+08:00'
    a=validate_sample(p)
    assert a.timestamp==T0 and a.as_dict()['timestamp'].endswith('Z')
    assert a.as_dict()['analysis_status']=='NOT_EVALUATED'

@pytest.mark.parametrize('change,match',[
    ({'source':'NASA_OSD_575'},'Only SIMULATED_LIVE'),
    ({'subject_id':'Jane Doe'},'pseudonymous'),
    ({'sequence':-1},'nonnegative'),
    ({'sequence':True},'nonnegative'),
    ({'timestamp':'2026-11-14T12:00:00'},'timezone'),
    ({'timestamp':'not-a-time'},'timestamp'),
    ({'values':{}},'1-5'),
    ({'values':{'heart_rate_bpm':float('nan')}},'finite'),
    ({'values':{'heart_rate_bpm':True}},'finite'),
    ({'values':{'heart_rate_bpm':500}},'technical'),
    ({'values':{'heart_rate':70}},'Unknown metric'),
])
def test_strict_rejection(change,match):
    p=pkt();p.update(change)
    with pytest.raises(TelemetryError,match=match):validate_sample(p)


def test_extra_field_cannot_sneak_in():
    p=pkt();p['diagnosis']='healthy'
    with pytest.raises(TelemetryError,match='exactly'): validate_sample(p)


def test_retention_bounds_and_latest():
    store=LiveStore(max_per_subject=3)
    for i in range(5):store.ingest(pkt(i))
    history=store.history('SIM_01',limit=3)
    assert [x['sequence'] for x in history]==[2,3,4]
    assert store.latest('SIM_01')['sequence']==4
    assert store.snapshot()['subject_count']==1


def test_sequence_and_timestamp_are_monotonic():
    store=LiveStore()
    store.ingest(pkt(1))
    with pytest.raises(ConflictError,match='Sequence'): store.ingest(pkt(1))
    with pytest.raises(ConflictError,match='Timestamp'):store.ingest(pkt(2,when=T0))
    assert len(store.history('SIM_01'))==1


def test_isolation_between_subjects_and_bounded_count():
    store=LiveStore(max_subjects=2)
    store.ingest(pkt(0,'A'));store.ingest(pkt(0,'B'))
    assert store.subjects()==['A','B']
    with pytest.raises(ConflictError,match='Maximum'):store.ingest(pkt(0,'C'))
    assert store.latest('B')['subject_id']=='B'
    store.reset();assert store.subjects()==[]


def test_api_roundtrip_and_provenance():
    with TestClient(build_app()) as client:
        r=client.get('/api/live/health'); assert r.status_code==200
        assert r.json()['mode']=='SIMULATION_ONLY'
        metrics=client.get('/api/live/metrics').json()['metrics']
        assert metrics['spo2_percent']['unit']=='%'
        with client.websocket_connect('/api/live/ws') as ws:
            first=ws.receive_json(); assert first['type']=='snapshot'
            response=client.post('/api/live/ingest',json=pkt())
            assert response.status_code==201
            received=ws.receive_json()
            assert received['type']=='telemetry'
            assert received['packet']['source']=='SIMULATED_LIVE'
            assert received['packet']['analysis_status']=='NOT_EVALUATED'
        history=client.get('/api/live/history/SIM_01').json()
        assert len(history['samples'])==1
        assert client.get('/api/live/snapshot').json()['subject_count']==1
        assert client.post('/api/live/ingest',json=pkt()).status_code==409
        assert client.post('/api/live/ingest',json={**pkt(2),'source':'NASA'}).status_code==422


def test_bad_history_identifier():
    with TestClient(build_app()) as client:
        assert client.get('/api/live/history/a%20b').status_code==422
        assert client.get('/api/live/history/SIM_01?limit=99999').status_code==422


def test_generator_reproducible_and_fully_labeled():
    seq=list(generate_packets(start=T0,count=50,hz=10.0))
    assert len(seq)==50 and seq[0]['source']=='SIMULATED_LIVE'
    assert all(seq[i]['sequence']<seq[i+1]['sequence'] for i in range(49))
    assert all(validate_sample(s) for s in seq)
    assert max(x['values']['heart_rate_bpm'] for x in seq)>min(x['values']['heart_rate_bpm'] for x in seq)+20


def test_no_crosslink_to_nasa_apdra(monkeypatch):
    import physiograph.apdra as original
    from physiograph import live_telemetry
    assert not hasattr(live_telemetry,'characterize')
    assert not hasattr(live_telemetry,'analyze')
