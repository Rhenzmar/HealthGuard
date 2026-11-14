import copy
import json
import pandas as pd
import pytest

from physiograph.physioalert import build_physioalerts, stable_alert_id
from physiograph.monitoring import monitor
from physiograph.workflow import (
    UNREVIEWED, add_event, current_status, allowed_states, join_review_state,
    import_review_json, export_review_json, validate_events,
)


def records(baseline=(10, 11, 12), later=(16,), *, ref_low=None, ref_high=None,
            unit="mg/dL", subject="SIM001", source="SIMULATED"):
    rows = []
    for i, v in enumerate(baseline):
        rows.append(dict(subject_id=subject, biomarker="TEST", timepoint=f"2026-09-{i+1:02}",
                         phase="baseline", value=v, unit=unit, system="Test", source=source))
    for i, v in enumerate(later):
        row = dict(subject_id=subject, biomarker="TEST", timepoint=f"2026-10-{i+1:02}",
                   phase="monitoring", value=v, unit=unit, system="Test", source=source)
        if ref_low is not None: row["ref_low"] = ref_low
        if ref_high is not None: row["ref_high"] = ref_high
        rows.append(row)
    return pd.DataFrame(rows)


def test_conservative_flag():
    result=monitor(records(later=(20,)))
    alert=result.alerts.iloc[0]
    assert alert.review_category=="Review observed deviation"
    assert "CONSISTENT_EXPLORATORY_SCREEN" in alert.evidence_codes
    assert alert.review_status==UNREVIEWED
    assert "diagnosis" in alert.interpretation_limit


def test_baseline_sensitive():
    result=monitor(records(baseline=(10, 11, 20), later=(16,)))
    assert result.alerts.iloc[0].review_category == "Review baseline reliability"
    assert "BASELINE_SENSITIVE" in result.alerts.iloc[0].evidence_codes


def test_missing_reference():
    result=monitor(records(baseline=(10,), later=(16,)))
    assert result.alerts.iloc[0].review_category=="Check measurement context"
    assert "INSUFFICIENT_REFERENCE" in result.alerts.iloc[0].evidence_codes


def test_outside_lab_interval_does_not_diagnose():
    result=monitor(records(later=(20,),ref_low=9,ref_high=13))
    alert=result.alerts.iloc[0]
    assert alert.review_category=="Review source laboratory interval"
    assert "OUTSIDE_SOURCE_INTERVAL" in alert.evidence_codes
    assert "applies" in alert.verification_actions
    assert "disease" in alert.interpretation_limit


def test_absence_of_flag_is_not_normal_label():
    alert=monitor(records(later=(11.2,))).alerts.iloc[0]
    assert alert.is_flagged == False
    assert alert.review_category=="No current verification prompt"
    assert "health status is undetermined" in alert.reason


def test_single_latest_only_and_stable_id():
    sample=records(later=(18,19))
    r1=monitor(sample)
    r2=monitor(sample.sample(frac=1,random_state=7))
    assert len(r1.alerts)==1
    assert r1.alerts.iloc[0].timepoint=='2026-10-02'
    assert r1.alerts.iloc[0].alert_id==r2.alerts.iloc[0].alert_id
    changed=sample.copy()
    changed.loc[changed.timepoint=='2026-10-02','value']=20
    assert monitor(changed).alerts.iloc[0].alert_id!=r1.alerts.iloc[0].alert_id


def test_npq_logscale_not_percent():
    a=monitor(records(baseline=(1,1.1,1.2),later=(2.4,),unit="NPQ (log2)"))
    assert "CONSISTENT_EXPLORATORY_SCREEN" in a.alerts.iloc[0].evidence_codes
    assert a.apdra.iloc[-1].percent_change != a.apdra.iloc[-1].percent_change  # NaN


def test_multi_subject_separation():
    sample=pd.concat([records(subject='A'),records(subject='B')],ignore_index=True)
    result=monitor(sample)
    assert len(result.alerts)==2
    assert result.alerts.alert_id.is_unique


def test_no_followup_empty_schema():
    sample=records(later=())
    result=monitor(sample)
    assert result.alerts.empty and 'alert_id' in result.alerts


def test_invalid_or_duplicate_measurements_blocked():
    sample=records()
    with pytest.raises(ValueError,match='Duplicate'):
        monitor(pd.concat([sample,sample.iloc[-1:]]))
    x=sample.copy();x.loc[x.index[-1],'unit']='other'
    with pytest.raises(ValueError,match='Multiple units'):
        monitor(x)


def test_transitions_and_audit_export_import():
    alert=monitor(records()).alerts.iloc[0].alert_id
    events=add_event([],alert,'Recheck requested',actor_code='CREW-DEMO',timestamp='2026-11-14T12:00:00+00:00')
    assert current_status(alert,events)=='Recheck requested'
    events=add_event(events,alert,'Measurement verified',timestamp='2026-11-14T12:05:00+00:00')
    assert current_status(alert,events)=='Measurement verified'
    exported=export_review_json(events)
    assert import_review_json(exported)==events
    joined=join_review_state(monitor(records()).alerts,events)
    assert joined.iloc[0].review_event_count==2
    assert joined.iloc[0].review_status=='Measurement verified'


def test_no_direct_admin_close_without_review():
    aid=monitor(records()).alerts.iloc[0].alert_id
    assert 'Review closed (administrative)' not in allowed_states(UNREVIEWED)
    with pytest.raises(ValueError,match='Unsupported'):
        add_event([],aid,'Review closed (administrative)')


def test_invalid_event_chain_rejected():
    aid=monitor(records()).alerts.iloc[0].alert_id
    events=add_event([],aid,'Recheck requested')
    bad=copy.deepcopy(events)
    bad[0]['from_status']='Measurement verified'
    with pytest.raises(ValueError,match='transition order'):
        validate_events(bad)
    duplicate=events+events
    with pytest.raises(ValueError,match='Duplicate event'):
        validate_events(duplicate)


def test_modified_json_rejected():
    aid=monitor(records()).alerts.iloc[0].alert_id
    events=add_event([],aid,'Recheck requested')
    payload=json.loads(export_review_json(events))
    payload['schema_version']=999
    with pytest.raises(ValueError,match='Unsupported'):
        import_review_json(json.dumps(payload))


def test_independent_review_status_per_alert():
    sample=pd.concat([records(subject='A'),records(subject='B')],ignore_index=True)
    alerts=monitor(sample).alerts
    event=add_event([],alerts.iloc[0].alert_id,'Recheck requested')
    updated=join_review_state(alerts,event)
    assert list(updated.review_status).count('Recheck requested')==1
    assert list(updated.review_status).count(UNREVIEWED)==1


def test_reject_invalid_calendar_date():
    x=records()
    x.loc[x.index[-1], 'timepoint']='2026-02-30'
    with pytest.raises(ValueError,match='Invalid date'):
        monitor(x)


def test_reject_mixed_calendar_and_relative_times():
    x=records()
    x.loc[x.index[-1],'timepoint']='R+1'
    with pytest.raises(ValueError,match='Mixed calendar'):
        monitor(x)


def test_reject_future_baseline_leakage():
    x=records()
    x.loc[0,'timepoint']='2026-12-01'
    with pytest.raises(ValueError,match='Baseline date'):
        monitor(x)


def test_reject_malformed_source_interval():
    x=records(ref_low=15,ref_high=10)
    with pytest.raises(ValueError,match='lower bound'):
        monitor(x)
    x=records(ref_low=10,ref_high=15)
    x['ref_low']=x['ref_low'].astype(object)
    x.loc[x.index[-1],'ref_low']='unknown'
    with pytest.raises(ValueError,match='Invalid source reference'):
        monitor(x)


def test_sources_do_not_pool_biomarker_baselines():
    x=records(baseline=(10,11,12),later=(20,),source='A')
    y=records(baseline=(20,21,22),later=(23,),source='B')
    result=monitor(pd.concat([x,y],ignore_index=True))
    centers=dict(zip(result.alerts.source,result.alerts.baseline_median))
    assert centers['A']==11 and centers['B']==21


def test_monitoring_trajectory_uses_serial_dates():
    result=monitor(records(baseline=(10,11,12),later=(13,20)))
    assert result.alerts.iloc[0].trajectory_evidence=='Farther from reference for every LOO baseline'
    assert 'MOVING_AWAY_FROM_REFERENCE' in result.alerts.iloc[0].evidence_codes
    nearer=monitor(records(baseline=(10,11,12),later=(20,12)))
    assert nearer.alerts.iloc[0].trajectory_evidence=='Closer to reference for every LOO baseline'
