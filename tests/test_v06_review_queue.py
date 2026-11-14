import pandas as pd
import pytest
from physiograph.stability import characterize
from physiograph.review_queue import build_review_queue


def construct(baseline, after, **kwargs):
    d=[]
    for i,v in enumerate(baseline):
        d.append(dict(subject_id='C1',biomarker='TEST',unit='mg/dL',source='test',system='test',
                      timepoint=f'L-{(len(baseline)-i)*7}',phase='preflight',value=v,**kwargs))
    for i,v in enumerate(after):
        d.append(dict(subject_id='C1',biomarker='TEST',unit='mg/dL',source='test',system='test',
                      timepoint=f'R+{i*30+1}',phase='postflight',value=v,**kwargs))
    return characterize(pd.DataFrame(d))


def test_queue_uses_latest_only():
    q=build_review_queue(construct([100,101,102],[120,108]))
    assert len(q)==1 and q.iloc[0].timepoint=='R+31'


def test_lab_range_is_not_diagnosis():
    q=build_review_queue(construct([100,101,102],[80],ref_low=95,ref_high=115))
    assert q.iloc[0].review_category=='Verify laboratory reference context'
    assert 'health' not in q.iloc[0].reason.lower()


def test_baseline_sensitive_review():
    q=build_review_queue(construct([10,11,20],[16]))
    assert q.iloc[0].review_category=='Verify reference measurements'


def test_consistent_screen_review():
    q=build_review_queue(construct([10,11,12],[20]))
    assert q.iloc[0].review_category=='Review consistent observation'


def test_missing_baseline_review():
    q=build_review_queue(construct([100],[120]))
    assert q.iloc[0].review_category=='Check baseline/data quality'


def test_baseline_only_empty():
    df=construct([100,101,102],[])
    q=build_review_queue(df)
    assert q.empty


def test_queue_rejects_missing_columns():
    with pytest.raises(ValueError):build_review_queue(pd.DataFrame({'subject_id':['A']}))
