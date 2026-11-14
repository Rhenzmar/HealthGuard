import numpy as np
import pandas as pd
import pytest
from physiograph.apdra import analyze, normalize_measurements, parse_timepoint
from physiograph.io import parse_inspiration4_sample, from_nasa_wide


def base():
    return pd.DataFrame([
        ("C001","L-92","CRP",10.0,"mg/L","Immune","preflight","test"),
        ("C001","L-44","CRP",11.0,"mg/L","Immune","preflight","test"),
        ("C001","L-3","CRP",12.0,"mg/L","Immune","preflight","test"),
        ("C001","R+1","CRP",16.0,"mg/L","Immune","postflight","test"),
        ("C001","R+45","CRP",13.0,"mg/L","Immune","postflight","test"),
    ], columns=["subject_id","timepoint","biomarker","value","unit","system","phase","source"])


def test_timepoint_parsing():
    assert parse_timepoint("L-92") == -92
    assert parse_timepoint("R+45",mission_days=3) == 48
    assert parse_timepoint("BAD") != parse_timepoint("BAD")


def test_preflight_reference_and_deviation():
    result=analyze(base())
    row=result[result.timepoint == "R+1"].iloc[0]
    assert row.baseline_n == 3
    assert row.baseline_median == pytest.approx(11)
    assert row.delta == pytest.approx(5)
    assert row.percent_change == pytest.approx(100*5/11)
    assert row.robust_z == pytest.approx(5/1.4826)
    assert row.screening_status == "No screening deviation"  # 5/1.4826 is below the 3.5 screening rule
    assert row.baseline_proximity == pytest.approx(0)


def test_more_recent_postflight_closer_to_baseline():
    result=analyze(base())
    row=result[result.timepoint == "R+45"].iloc[0]
    assert row.baseline_proximity == pytest.approx(0.6)


def test_no_baseline_never_call_it_normal():
    df=base().query("phase == 'postflight'")
    out=analyze(df)
    assert out.baseline_n.eq(0).all()
    assert out.screening_status.eq("No personal baseline").all()


def test_mixed_units_rejected():
    df=base()
    df.loc[df.timepoint == "R+1","unit"]="ng/mL"
    with pytest.raises(ValueError,match="Multiple units"):
        analyze(df)


def test_duplicate_timepoint_rejected():
    df=pd.concat([base(),base().iloc[[0]]],ignore_index=True)
    with pytest.raises(ValueError,match="Duplicate"):
        normalize_measurements(df)


def test_crew_sample_identifiers():
    assert parse_inspiration4_sample("C002_serum_R+194") == ("C002","R+194")
    with pytest.raises(ValueError):
        parse_inspiration4_sample("unknown")


def test_wide_parser_requires_units_and_nonempty_columns():
    df=pd.DataFrame({"Sample Name":["C001_serum_L-3","C001_serum_R+1"],"Biomarker A":[4.5,8.0]})
    with pytest.raises(ValueError,match="unit"):
        from_nasa_wide(df,"Sample Name",["Biomarker A"],"","Metabolic")
    out=from_nasa_wide(df,"Sample Name",["Biomarker A"],"AU","Metabolic")
    assert out.shape[0] == 2
    assert out.subject_id.tolist() == ["C001","C001"]
    assert out.timepoint.tolist() == ["L-3","R+1"]


def test_npq_deviations_are_log2_not_percent():
    """Immune NPQ differences must not use percent change of a log-scaled value."""
    import pandas as pd
    from physiograph.apdra import analyze
    recs=[]
    for t,val,phase in [("L-92",10,"preflight"),("L-44",10.5,"preflight"),
                        ("L-3",10,"preflight"),("R+1",11.5,"postflight")]:
        recs.append({"subject_id":"C001","timepoint":t,"biomarker":"IL6",
            "value":val,"unit":"NPQ (log2)","phase":phase,
            "system":"Immune","source":"test"})
    x=analyze(pd.DataFrame(recs))
    post=x[x.timepoint=="R+1"].iloc[0]
    assert pd.isna(post.percent_change)
    assert abs(post.fold_change_vs_personal_baseline - 2**1.5)<1e-6
    assert post.delta==1.5


def test_source_lab_interval_kept_separate_from_screening():
    import pandas as pd
    from physiograph.apdra import analyze
    recs = []
    for point,val in [("L-92",70),("L-44",72),("L-3",74),("R+1",45)]:
        recs.append(dict(subject_id="C001", timepoint=point, biomarker="GLUCOSE",
                         value=val,unit="mg/dL",phase="preflight" if point.startswith("L") else "postflight",
                         system="CMP",source="test",ref_low=65,ref_high=99))
    result=analyze(pd.DataFrame(recs))
    post=result[result.timepoint=="R+1"].iloc[0]
    assert post.source_range_status=="Below source reference interval"
    assert post.source_reference_low==65
