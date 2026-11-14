"""Context gating is a conservative software review workflow, NOT clinical safety validation."""
from dataclasses import replace
from datetime import datetime,timedelta,timezone
import pytest
from fastapi.testclient import TestClient
from physiograph.live_telemetry import validate_sample,TelemetryError,SOURCE
from physiograph.context_monitor import LiveQualityMonitor,ContextReviewMonitor,CHECK_INTERVAL_S
from physiograph.live_api import build_app
from tools.replay_live_demo import generate_packets

T0=datetime(2026,11,14,12,0,tzinfo=timezone.utc)


def sample(i,context='REST',values=None,sid='SIM_A',step=1):
    x={'subject_id':sid,'sequence':i,
       'timestamp':(T0+timedelta(seconds=step*i)).isoformat(),
       'values':values or {'heart_rate_bpm':70+i*.01,'spo2_percent':98.,
                          'respiratory_rate_bpm':14.,'core_temp_c':36.8,'hrv_rmssd_ms':60.},
       'source':SOURCE}
    if context is not None:
        x['context']={'activity_state':context,'basis':'SIMULATOR_DECLARED'}
    return validate_sample(x)


def result(s,flag=True,status=None):
    return {'source':SOURCE,'subject_id':s.subject_id,'sequence':s.sequence,
            'status':status or ('MODEL_FLAG' if flag else 'NO_MODEL_FLAG')}


def evaluate(m,q,s,a=True,b=True):
    c=result(s,a); st=result(s,b)
    return m.process(s,c,st,result(s,True),q.process(s))


def test_activity_context_is_explicit_not_inferred():
    s=sample(0,None)
    assert s.context is None
    assert s.as_dict()['context'] is None
    m=ContextReviewMonitor();q=LiveQualityMonitor()
    assert evaluate(m,q,s)['activity_state']=='UNKNOWN'
    assert evaluate(m,q,sample(1,'ACTIVE'))['activity_state']=='ACTIVE'
    assert evaluate(m,q,sample(2,'REST'))['activity_basis']=='SIMULATOR_DECLARED'


@pytest.mark.parametrize('ctx',[
    {}, {'activity_state':'REST'}, {'activity_state':'SLEEP','basis':'SIMULATOR_DECLARED'},
    {'activity_state':'ACTIVE','basis':'NASA_MEASURED'}, {'activity_state':3,'basis':'SIMULATOR_DECLARED'},
])
def test_bad_activity_context_rejected(ctx):
    p=sample(0).as_dict()
    p.pop('analysis_status')
    p['context']=ctx
    with pytest.raises(TelemetryError,match='context|activity_state'):
        validate_sample(p)


def test_extra_clinical_claim_rejected():
    p=sample(0).as_dict();p.pop('analysis_status');p['diagnosis']='safe'
    with pytest.raises(TelemetryError):validate_sample(p)


def test_good_data_does_not_claim_verified_sensor():
    q=LiveQualityMonitor().process(sample(0))
    assert q['status']=='NO_QUALITY_ISSUE_DETECTED'
    assert q['quality_assured'] is False
    assert 'does not certify' in q['note']


def test_cadence_gap_and_missing_channels_get_quality_status():
    q=LiveQualityMonitor()
    q.process(sample(0))
    assert 'IRREGULAR_CADENCE' in q.process(sample(1,step=3))['issues']
    assert 'MISSING_CHANNELS' in q.process(sample(2,step=3,values={'heart_rate_bpm':75}))['issues']


def test_all_channel_freeze_is_suspected_not_certified():
    q=LiveQualityMonitor()
    v=sample(0).values
    reports=[q.process(sample(i,values=v)) for i in range(10)]
    assert 'ALL_CHANNELS_UNCHANGED' in reports[-1]['issues']
    assert reports[-1]['quality_assured'] is False
    assert q.process(sample(10,values={**v,'heart_rate_bpm':72}))['status']=='NO_QUALITY_ISSUE_DETECTED'


def test_single_impulse_rebound_is_flagged_until_window_rolls_past():
    q=LiveQualityMonitor()
    base=sample(0).values
    assert q.process(sample(0,values=base))['status']=='NO_QUALITY_ISSUE_DETECTED'
    changed={**base,'heart_rate_bpm':base['heart_rate_bpm']+50}
    assert 'ABRUPT_CHANGE_REQUIRES_VERIFICATION' in q.process(sample(1,values=changed))['issues']
    r=q.process(sample(2,values=base))
    assert 'SPIKE_REBOUND_PATTERN' in r['issues']
    assert 'RECENT_SPIKE_MAY_REMAIN_IN_WINDOW' in r['issues']
    for i in range(3,62):q.process(sample(i,values={**base,'heart_rate_bpm':70+i*.01}))
    assert q.process(sample(62,values={**base,'heart_rate_bpm':70.62}))['status']=='NO_QUALITY_ISSUE_DETECTED'


def test_two_spaced_checks_required_and_overlap_disclosed():
    m=ContextReviewMonitor();q=LiveQualityMonitor()
    output=[]
    for i in range(17):output.append(evaluate(m,q,sample(i),True,True))
    assert output[0]['status']=='OBSERVE_UNUSUAL_PATTERN'
    assert output[14]['status']=='OBSERVE_UNUSUAL_PATTERN'
    assert output[15]['status']=='PERSISTENT_PATTERN_REVIEW'
    assert output[15]['spaced_positive_checks']==2
    assert output[15]['review_windows_overlap'] is True
    assert output[15]['clinical_validation'] is False
    assert output[15]['apdra_applied'] is False


def test_context_changes_reset_confirmation():
    m=ContextReviewMonitor();q=LiveQualityMonitor()
    for i in range(16):
        latest=evaluate(m,q,sample(i,'REST'))
    assert latest['status']=='PERSISTENT_PATTERN_REVIEW'
    switched=evaluate(m,q,sample(16,'ACTIVE'))
    assert switched['status']=='ACTIVITY_CONTEXT_REVIEW'
    assert switched['spaced_positive_checks']==1
    assert switched['observed_persistent_pattern'] is False
    no_context=evaluate(m,q,sample(17,None))
    assert no_context['status']=='ACTIVITY_CONTEXT_UNKNOWN'


def test_model_disagreement_not_promoted_to_risk():
    m=ContextReviewMonitor();q=LiveQualityMonitor()
    for i in range(20):
        v=evaluate(m,q,sample(i),a=True,b=False)
    assert v['status']=='DETECTORS_DISAGREE'
    assert v['spaced_positive_checks']==0
    assert 'medical diagnoses' in v['disclaimer']


def test_quality_issue_takes_precedence_over_flags():
    m=ContextReviewMonitor();q=LiveQualityMonitor()
    evaluate(m,q,sample(0))
    raw=sample(1)
    raw=replace(raw,values={**raw.values,'heart_rate_bpm':155})
    assert evaluate(m,q,raw)['status']=='VERIFY_MEASUREMENT_QUALITY'
    assert evaluate(m,q,sample(2))['status']=='VERIFY_MEASUREMENT_QUALITY'


def test_return_to_unflagged_is_not_medical_recovery():
    m=ContextReviewMonitor();q=LiveQualityMonitor()
    for i in range(16):last=evaluate(m,q,sample(i))
    assert last['status']=='PERSISTENT_PATTERN_REVIEW'
    first=evaluate(m,q,sample(16),False,False)
    assert first['status']=='OBSERVE_RETURN_TREND'
    final=None
    for i in range(17,32): final=evaluate(m,q,sample(i),False,False)
    assert final['status']=='RETURN_TO_UNFLAGGED_PATTERN'
    assert final['observed_persistent_pattern'] is False
    assert 'not medically verified recovery' in final['reason']


def test_no_cross_subject_state_contamination():
    m=ContextReviewMonitor();q=LiveQualityMonitor()
    for i in range(16):evaluate(m,q,sample(i,sid='A'))
    assert evaluate(m,q,sample(0,sid='B'))['status']=='OBSERVE_UNUSUAL_PATTERN'
    assert m.latest('A')['status']=='PERSISTENT_PATTERN_REVIEW'
    assert len(m.history('A',limit=3))==3
    with pytest.raises(ValueError):m.history('A',0)
    with pytest.raises(ValueError,match='increasing'):
        evaluate(m,q,sample(0,sid='B'))


def test_cross_subject_evidence_rejected():
    s=sample(0);m=ContextReviewMonitor();q=LiveQualityMonitor().process(s)
    with pytest.raises(ValueError,match='mismatched'):
        m.process(s,result(s),{**result(s),'subject_id':'OTHER'},result(s),q)
    with pytest.raises(ValueError,match='source'):
        m.process(s,result(s),{**result(s),'source':'NASA'},result(s),q)


def test_api_end_to_end_delivers_v14_context_without_changing_raw_models():
    with TestClient(build_app()) as client:
        assert client.get('/api/live/health').json()['context_monitor']=='ENABLED'
        assert client.get('/api/live/context/config').json()['clinical_validation'] is False
        with client.websocket_connect('/api/live/ws') as ws:
            assert ws.receive_json()['type']=='snapshot'
            for p in generate_packets(start=T0,count=110,mode='activity'):
                result=client.post('/api/live/ingest',json=p)
                assert result.status_code==201
                evt=ws.receive_json()
                assert evt['context_review']==result.json()['context_review']
            j=result.json()
            assert j['live_review']['contextual_decision']==j['context_review']['status']
            assert j['context_review']['status'] in {'ACTIVITY_CONTEXT_REVIEW','DETECTORS_DISAGREE','NO_PATTERN_FLAG','OBSERVE_UNUSUAL_PATTERN','ACTIVITY_CONTEXT_UNKNOWN','POST_ACTIVITY_OBSERVATION'}
            assert j['context_review']['raw_model_flags_preserved'] is True
            assert client.get('/api/live/context-review/SIM_CREW_01').json()==j['context_review']
            assert len(client.get('/api/live/context-history/SIM_CREW_01?limit=5').json()['results'])==5
            assert client.get('/api/live/context-review/UNKNOWN').status_code==404


def test_public_api_fail_closed_without_key(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_PUBLIC_MODE','1')
    monkeypatch.delenv('PHYSIOGRAPH_INGEST_API_KEY',raising=False)
    with TestClient(build_app()) as client:
        assert client.get('/api/live/health').json()['public_ingest']=='DISABLED'
        assert client.post('/api/live/ingest',json=next(generate_packets(start=T0,count=1))).status_code==503


def test_public_api_rejects_missing_or_wrong_key(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_PUBLIC_MODE','1')
    monkeypatch.setenv('PHYSIOGRAPH_INGEST_API_KEY','demo-only-long-random-secret')
    with TestClient(build_app()) as client:
        p=next(generate_packets(start=T0,count=1))
        assert client.post('/api/live/ingest',json=p).status_code==403
        assert client.post('/api/live/ingest',json=p,headers={'X-PhysioGraph-Ingest-Key':'wrong'}).status_code==403
        assert client.post('/api/live/ingest',json=p,headers={'X-PhysioGraph-Ingest-Key':'demo-only-long-random-secret'}).status_code==201


def test_activity_has_observation_period_after_transition_to_rest():
    m=ContextReviewMonitor();q=LiveQualityMonitor()
    for i in range(20):
        latest=evaluate(m,q,sample(i,'ACTIVE'))
    assert latest['status']=='ACTIVITY_CONTEXT_REVIEW'
    for i in range(20,75):
        latest=evaluate(m,q,sample(i,'REST'))
    assert latest['status']=='POST_ACTIVITY_OBSERVATION'
    assert latest['observed_persistent_pattern'] is False
    for i in range(75,96):
        latest=evaluate(m,q,sample(i,'REST'))
    assert latest['status']=='PERSISTENT_PATTERN_REVIEW'
    assert latest['review_windows_overlap'] is True
