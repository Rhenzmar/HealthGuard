"""Known-answer tests for APDRA evidence report and truthful time-axis plots."""
import numpy as np
import pandas as pd
import pytest

from physiograph.apdra import analyze
from physiograph.stability import characterize
from physiograph.evidence import latest_nonbaseline, report
from physiograph.plots import biomarker_line
from tools.benchmark_apdra_v04 import decision_strengths, evaluate, run


def example(unit="g/dL", baseline=(5.0,5.0,4.9), posts=(5.1,4.6)):
    rows=[]
    for t,v in zip(["L-92","L-44","L-3"],baseline):
        rows.append(dict(subject_id="C001",timepoint=t,biomarker="ALBUMIN",
                         value=v,unit=unit,system="CMP",phase="preflight",source="test"))
    for t,v in zip(["R+82","R+194"],posts):
        rows.append(dict(subject_id="C001",timepoint=t,biomarker="ALBUMIN",
                         value=v,unit=unit,system="CMP",phase="postflight",source="test"))
    return pd.DataFrame(rows)


def test_latest_evidence_report_is_nonclinical_and_correct():
    evidence=characterize(example())
    out=report(evidence)
    assert out["baseline_n"]==3
    assert out["latest_timepoint"]=="R+194"
    assert out["baseline_center"]==pytest.approx(5.0)
    assert out["relative_change"]==pytest.approx(-8.0)
    assert "descriptive" in out["summary"]
    assert out["direction"]=="Lower"
    assert out["loo_span"] is not None


def test_report_without_followup_does_not_claim_change():
    data=characterize(example().query("phase=='preflight'"))
    out=report(data)
    assert out["latest_timepoint"] is None
    assert out["trend"]=="Not assessable"
    assert latest_nonbaseline(data) is None


def test_logscaled_npq_report_never_uses_raw_percent():
    inp=example(unit="NPQ (log2)",baseline=(10.0,10.5,10.0),posts=(11.5,12.0))
    out=report(characterize(inp))
    assert out["relative_change"] is None
    assert out["npq_fold"]==pytest.approx(4)
    assert "log2 NPQ" in out["summary"]


def test_actual_mission_day_axis_not_categorical():
    sample=analyze(example())
    fig=biomarker_line(sample, baseline=5.0)
    assert list(fig.data[0].x)==[-92.0,-44.0,-3.0,85.0,197.0]
    assert list(fig.layout.xaxis.ticktext)==["L-92","L-44","L-3","R+82","R+194"]
    assert "day" in fig.layout.xaxis.title.text.lower()


def test_cross_crew_plot_separate_series():
    a=example()
    b=a.copy()
    b["subject_id"]="C002"
    df=analyze(pd.concat([a,b],ignore_index=True))
    fig=biomarker_line(df,color="subject_id")
    assert len(fig.data)==2


def test_synthetic_consistent_score_behaves_as_expected():
    pre=np.array([[10.,11.,12.],[10.,11.,12.]])
    y=np.array([20.,11.])
    s=decision_strengths(pre,y)
    assert s["apdra_loo_consistent"][0]>30
    assert s["apdra_loo_consistent"][1]<30
    assert s["median_only"][0]>30


def test_independent_benchmark_is_reproducible():
    one,agg=run(n_per_split=200,seeds=(1729,))
    two,agg2=run(n_per_split=200,seeds=(1729,))
    pd.testing.assert_frame_equal(one,two)
    pd.testing.assert_frame_equal(agg,agg2)
    assert set(one.method)=={"median_only","apdra_loo_consistent"}
    assert set(one.threshold_policy)=={"fixed_30pct","calibrated_5pct_null"}


def test_evaluate_known_confusion_counts():
    scores=np.array([10.,90.,80.,20.])
    labels=np.array([False,False,True,True])
    out=evaluate(labels,scores,threshold=50)
    assert out["hits"]==1
    assert out["false_screens"]==1
    assert out["true_shift_detection_rate"]==pytest.approx(.5)
