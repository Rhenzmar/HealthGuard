import pandas as pd
import pytest
from physiograph.overview import classify_status, measurement_overview


def test_status_mapping_and_denominator():
    e=pd.DataFrame([
        ("C001", "preflight", "Preflight/reference sample"),
        ("C001", "postflight", "Baseline-sensitive screen"),
        ("C001", "postflight", "Consistent screening deviation (higher)"),
        ("C002", "postflight", "No consistent screening deviation"),
    ], columns=["subject_id","phase","screening_stability"])
    out=measurement_overview(e)
    assert int(out.groupby("subject_id").denominator.first().sum())==3
    assert int(out.loc[out["class"]=="Baseline-sensitive screen","count"].iloc[0])==1
    assert out.groupby("subject_id").percent.sum().to_dict()==pytest.approx({"C001":100.,"C002":100.})


def test_no_nonbaseline_observations():
    e=pd.DataFrame([("C001","preflight","Preflight/reference sample")],
                   columns=["subject_id","phase","screening_stability"])
    assert measurement_overview(e).empty


def test_missing_required_column_fails():
    with pytest.raises(ValueError):
        measurement_overview(pd.DataFrame({"phase":["postflight"]}))


def test_unassessable_kept_separate():
    assert classify_status("Insufficient baseline for stability check")=="Cannot evaluate"
