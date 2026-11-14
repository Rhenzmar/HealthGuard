"""Provenance and subject isolation for multi-system anomaly screening."""
from datetime import datetime, timezone
from fastapi.testclient import TestClient
import pytest

from physiograph.biomarker_detection import (
    LEVELS, evaluate_engineering, combined_live_review, scripted_environment_review
)
from physiograph.engineering_sim import engineering_snapshot
from physiograph.live_api import build_app
from tools.replay_live_demo import generate_packets


def test_all_engineering_biomarkers_pass_through_anomaly_rules():
    result = evaluate_engineering('SIM_CREW_02', 20)
    assert result['channels_evaluated'] == 12
    assert len(result['channels']) == 12
    assert result['source'] == 'FICTIONAL_ENGINEERING_SIMULATOR'
    assert result['clinical_validation'] is False
    assert result['status'] in LEVELS
    for key, info in result['channels'].items():
        assert info['screening_method'] == 'DETERMINISTIC_ABSOLUTE_DELTA_RULE'
        assert info['source'] == 'FICTIONAL_ENGINEERING_SIMULATOR'
        assert info['clinical_validation'] is False
        assert info['unit']


def test_synthetic_anomalies_are_detected_with_per_biomarker_evidence():
    vals = engineering_snapshot('SIM_CREW_01', 35)['values'].copy()
    vals['cabin_co2_ppm'] = 6000
    vals['systolic_bp_mmhg'] = 165
    result = evaluate_engineering('SIM_CREW_01', 35, vals)
    assert result['status'] == 'CRITICAL'
    assert result['channels']['cabin_co2_ppm']['status'] == 'CRITICAL'
    assert result['channels']['systolic_bp_mmhg']['status'] == 'CRITICAL'
    assert 'cabin_co2_ppm' in result['flagged_channels']


def test_synthetic_scenario_progression_and_recovery():
    for scenario,signal in (('co2','cabin_co2_ppm'),
                            ('cabin_leak','cabin_pressure_kpa'),
                            ('radiation','radiation_rate_usv_h')):
        initial=scripted_environment_review('SIM_CREW_03',scenario,0)
        peak=scripted_environment_review('SIM_CREW_03',scenario,35)
        end=scripted_environment_review('SIM_CREW_03',scenario,64)
        assert initial['engineering_review']['channels'][signal]['status']=='OPTIMAL'
        assert peak['engineering_review']['channels'][signal]['status']=='CRITICAL'
        assert end['engineering_review']['channels'][signal]['status']=='OPTIMAL'
        assert peak['model_applied_to_scenario'] is False
        assert peak['engineering_review']['subject_id']=='SIM_CREW_03'


def test_incomplete_or_mixed_source_data_cannot_be_scored():
    with pytest.raises(ValueError):
        evaluate_engineering('C001',0)
    with pytest.raises(ValueError):
        evaluate_engineering('SIM_CREW_01',0,{'cabin_co2_ppm':1800})
    with pytest.raises(ValueError):
        scripted_environment_review('C001','co2',20)
    with pytest.raises(ValueError):
        scripted_environment_review('SIM_CREW_01','radiation',65)


def test_live_multisystem_exposes_17_channels_but_keeps_cnn_5_channel(monkeypatch):
    monkeypatch.delenv('PHYSIOGRAPH_AUTO_DEMO',raising=False)
    with TestClient(build_app()) as c:
        assert c.get('/api/live/multisystem/SIM_CREW_01').status_code==404
        assert c.get('/api/live/multisystem/C001').status_code==404
        sample=next(generate_packets(subject='SIM_CREW_01',
            start=datetime(2026,11,14,tzinfo=timezone.utc),count=1))
        posted=c.post('/api/live/ingest',json=sample)
        assert posted.status_code==201
        payload=posted.json()['multisystem']
        assert payload['live_channels_evaluated']==17
        assert payload['physiological']['channels_evaluated']==5
        assert payload['engineering']['channels_evaluated']==12
        assert payload['historical_nasa_biomarkers_in_live_inference'] is False
        assert payload['physiological']['cnn_status']=='BASELINE_CALIBRATING'
        assert payload['subject_id']=='SIM_CREW_01'
        assert c.get('/api/live/multisystem/SIM_CREW_01').json()==payload
        r=c.get('/api/simulation/scenario-review/SIM_CREW_01/co2?second=35')
        assert r.status_code==200
        assert r.json()['engineering_review']['channels']['cabin_co2_ppm']['status']=='CRITICAL'
        assert c.get('/api/simulation/scenario-review/SIM_CREW_01/unknown?second=35').status_code==422
        assert c.get('/api/simulation/scenario-review/C001/co2?second=35').status_code==422


def test_cannot_mix_subject_sequences_or_source_evidence():
    eng=evaluate_engineering('SIM_CREW_02',1)
    physiological={'subject_id':'SIM_CREW_01','sequence':1,'source':'SIMULATED_LIVE'}
    model={'subject_id':'SIM_CREW_01','sequence':1,'status':'MODEL_FLAG'}
    with pytest.raises(ValueError,match='Cross-subject'):
        combined_live_review('SIM_CREW_01',physiological,model,model,model,eng)


def test_historical_cbc_cmp_and_proteins_are_screened_separately():
    with TestClient(build_app()) as c:
        for assay,count in (('CMP',19),('NULISA',203),('CBC',20)):
            res=c.get('/api/research/biomarker-screening/C001',
                      params={'assay':assay})
            assert res.status_code==200
            report=res.json()
            assert report['total_biomarkers']==count
            assert report['subject_id']=='C001'
            assert report['assay']==assay
            assert report['clinical_validation'] is False
            assert len(report['biomarkers'])==count
            assert all('baseline_n' in x and 'screening_status' in x for x in report['biomarkers'])
            assert all(x['source_reference_interval_used_for_flag'] is False for x in report['biomarkers'])
            assert all(x['screening_method'] in {
                'ABSOLUTE_1_LOG2_NPQ_DIFFERENCE','ABSOLUTE_30_PERCENT_CHANGE'
            } for x in report['biomarkers'])
            if assay=='CBC':
                assert report['source_kind']=='UNVERIFIED_THIRD_PARTY_CBC_MIRROR'
        assert c.get('/api/research/biomarker-screening/SIM_CREW_01').status_code==422
        assert c.get('/api/research/biomarker-screening/C001?assay=ECG').status_code==422
