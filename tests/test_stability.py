"""Transparent, known-answer checks for APDRA leave-one-baseline-out sensitivity."""
import numpy as np
import pandas as pd
import pytest
from physiograph.stability import characterize, summary


def frame(baseline, postflight, *, unit="mg/dL", name="MARKER", ref=None):
    rows = []
    for i, v in enumerate(baseline):
        rows.append(dict(subject_id="T001", timepoint=f"L-{(len(baseline)-i)*7}",
                         biomarker=name, value=v, unit=unit, system="test",
                         phase="preflight", source="synthetic_test"))
    for i, v in enumerate(postflight):
        rows.append(dict(subject_id="T001", timepoint=f"R+{i*30+1}",
                         biomarker=name, value=v, unit=unit, system="test",
                         phase="postflight", source="synthetic_test"))
    if ref:
        for row in rows:
            row.update(ref_low=ref[0],ref_high=ref[1])
    return pd.DataFrame(rows)


def after(df):
    return characterize(df).query("phase=='postflight'").sort_values("time_numeric")


def test_large_change_survives_all_reference_omissions():
    out=after(frame([10,11,12],[20]))
    row=out.iloc[0]
    assert row.screening_stability == "Consistent screening deviation (higher)"
    assert row.screening_stability_fraction == 1
    assert row.loo_reference_min == pytest.approx(10.5)
    assert row.loo_reference_max == pytest.approx(11.5)
    assert row.measurement_review == "Review observed deviation"


def test_single_baseline_outlier_makes_decision_sensitive():
    out=after(frame([10,11,20],[16]))
    row=out.iloc[0]
    assert row.screening_stability == "Baseline-sensitive screen"
    assert row.screening_stability_fraction == pytest.approx(1/3)
    assert row.measurement_review == "Verify baseline and repeat reading"


def test_real_deviation_and_movement_towards_reference_are_distinct():
    out=after(frame([10,11,12],[20,12]))
    assert out.iloc[0].trajectory_evidence == "First available postflight sample"
    assert out.iloc[1].trajectory_evidence == "Closer to reference for every LOO baseline"
    assert out.iloc[1].distance_return_fraction > 0


def test_postflight_further_from_reference():
    out=after(frame([10,11,12],[20,30]))
    assert out.iloc[1].trajectory_evidence == "Farther from reference for every LOO baseline"
    assert out.iloc[1].distance_return_fraction < 0


def test_only_one_reference_is_unassessable():
    out=after(frame([10],[20]))
    assert out.iloc[0].screening_stability == "Insufficient baseline for stability check"
    assert np.isnan(out.iloc[0].screening_stability_fraction)


def test_log2_npq_correct_without_raw_percentage():
    out=after(frame([10,10.5,11],[12],unit="NPQ (log2)"))
    assert out.iloc[0].npq_signal_fold_vs_median == pytest.approx(2**1.5)
    assert out.iloc[0].screening_stability == "Consistent screening deviation (higher)"


def test_cannot_percent_screen_zero_reference():
    out=after(frame([0,0,0],[10]))
    assert out.iloc[0].screening_stability == "Percent screening undefined at zero reference"
    assert "Check baseline" in out.iloc[0].measurement_review


def test_source_interval_context_separate():
    out=after(frame([100,101,102],[85],ref=(90,130)))
    assert out.iloc[0].source_interval_status == "Below source interval"
    assert out.iloc[0].measurement_review == "Review source laboratory interval and measurement"


def test_counts_are_measured_records_not_diagnoses():
    out=characterize(frame([10,11,12],[20]))
    assert summary(out)["consistent_deviations"]==1
    assert summary(out)["reviewed_nonbaseline_measurements"]==1
