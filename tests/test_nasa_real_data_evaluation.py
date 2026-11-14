"""NASA-only retrospective evaluation regression, with frozen rule checks."""
import json
from pathlib import Path

import pytest

from tools.evaluate_nasa_real_biomarkers import (
    ASSAYS, load_verified, evaluate, screening, write_outputs
)


def test_screening_frozen_known_answers():
    assert screening([100,105,110],155,"mg/dL")["median_flag"] is True
    assert screening([100,105,110],155,"mg/dL")["loo_consistent_flag"] is True
    # Median-only deviation can depend on one observed baseline value.
    x=screening([100,100,160],132,"mg/dL")
    assert x["median_flag"] is True
    assert x["loo_consistent_flag"] is False
    assert x["median_unstable"] is True
    assert screening([100],150,"mg/dL")["status"]=="INSUFFICIENT_BASELINE"
    assert screening([0,0,0],1,"mg/dL")["status"]=="UNDEFINED_REFERENCE"
    assert screening([8,9,10],11.2,"NPQ (relative log2-scale assay units)")["loo_consistent_flag"] is True


def test_real_nasa_original_five_assay_evaluation_and_qc(tmp_path):
    rows,manifest=load_verified()
    assert len(rows)==8813
    assert manifest["total_numeric_observations"]==8783
    report,details=evaluate(rows,manifest)
    assert set(report["assays"])==set(ASSAYS)
    assert report["biological_independent_participants"]==4
    assert report["original_numeric_source_rows"]==8783
    assert report["original_missing_source_rows"]==30
    assert report["excluded_unverified_phenotype_or_qc_rows"]<=20
    assert report["method"]["synthetic_records_used"] is False
    assert report["real_nasa_validation_of_continuous_17ch_cnn"] is False
    assert report["sensitivity_specificity_roc_auc_estimable"] is False
    assert report["method"]["thresholds_fit_on_nasa_data"] is False
    assert report["method"]["test_measurement_in_its_own_reference"] is False
    assert report["assays"]["CBC"]["excluded_review_flagged_rows"]==19
    assert manifest["assays"][0]["review_flagged_rows"]==20  # One additional original QC row is missing
    assert report["assays"]["CMP"]["numeric_source_rows"]==509
    assert report["assays"]["ALAMAR_NPQ"]["numeric_source_rows"]==5481
    assert all(x["data_source"].startswith("VERIFIED_ORIGINAL_NASA_OSDR")
               for x in details)
    assert all(x["clinical_ground_truth"] is None for x in details)
    # The established two-assay frozen audit is reproduced as a regression
    # test for source integrity and the correct NPQ/percent units.
    assert report["assays"]["CMP"]["postflight_screening"]["median_only_flags"]==25
    assert report["assays"]["CMP"]["postflight_screening"]["median_flags_not_loo_consistent"]==7
    assert report["assays"]["ALAMAR_NPQ"]["postflight_screening"]["median_only_flags"]==170
    assert report["assays"]["ALAMAR_NPQ"]["postflight_screening"]["median_flags_not_loo_consistent"]==61
    result=write_outputs(out=tmp_path)
    saved=json.loads((tmp_path/"evaluation.json").read_text())
    assert result==saved
    assert (tmp_path/"observation_level_evidence.csv").is_file()
    assert len((tmp_path/"observation_level_evidence.csv").read_text().splitlines())==len(details)+1


def test_real_nasa_source_tampering_rejected(tmp_path):
    import shutil
    from tools.evaluate_nasa_real_biomarkers import VERIFIED
    root=tmp_path/"data"
    shutil.copytree(VERIFIED,root)
    path=root/"cbc.csv"
    path.write_bytes(path.read_bytes()+b"\n")
    with pytest.raises(ValueError,match="SHA256 mismatch"):
        load_verified(root)
