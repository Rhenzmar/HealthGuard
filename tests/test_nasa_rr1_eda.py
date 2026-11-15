"""External real NASA RR-1 source table evaluation, without synthetic 17ch inference."""
import json
import shutil

import pytest

from tools.evaluate_nasa_rr1_eda import DATA, evaluate, save_report, SOURCES


def test_real_nasa_rr1_source_cadence_and_three_eng_channels(tmp_path):
    result=save_report(output=tmp_path)
    assert result["dataset"]=="NASA EDA Rodent Research-1 (RR-1)"
    assert result["telemetry"]["n_records"]==12087
    assert result["telemetry"]["first_24h_records"]==288
    assert result["telemetry"]["later_records"]==11799
    assert result["telemetry"]["interval_minutes_counts"]["5"]==12071
    assert result["telemetry"]["irregular_intervals_not_5min"]==15
    assert result["telemetry"]["largest_observed_gap_minutes"]==33
    assert all(x==0 for x in result["telemetry"]["missing_per_column"].values())
    assert result["telemetry"]["source_summary_crosschecked"]["CO2_ppm_ISS"]
    assert result["radiation"]["n_daily_records"]==39
    assert result["radiation"]["final_accumulated_mgy"]==7.96
    assert result["no_assumed_1hz_sampling"] is True
    assert result["physiological_channels_present"]==0
    assert result["model_17ch_scored_on_this_dataset"] is False
    assert result["clinical_validation"] is False
    for channel in ("cabin_co2_ppm","cabin_temp_c","cabin_humidity_percent"):
        item=result["environmental_heuristic_screen"]["results"][channel]
        assert item["status"]=="EVALUATED_UNLABELED_REAL_NASA_ISS_TELEMETRY"
        assert item["subsequent_real_samples"]==11799
        assert sum(item["retrospective_deviation_tier_counts"].values())==11799
    assert result["environmental_heuristic_screen"]["independently_labeled_events"] is False
    assert (tmp_path/"evaluation.json").is_file()
    assert (tmp_path/"REPORT.md").is_file()
    assert json.loads((tmp_path/"evaluation.json").read_text())==result


def test_original_rr1_source_summary_crosscheck_rejects_tampering(tmp_path):
    directory=tmp_path/"rr1"
    directory.mkdir()
    for file in SOURCES.values():
        shutil.copy2(DATA/file,directory/file)
    path=directory/SOURCES["summary"]
    contents=path.read_text()
    path.write_text(contents.replace("3197.27","3198.27"))
    with pytest.raises(ValueError,match="source summary mismatch"):
        evaluate(directory)


def test_missing_rr1_original_csv_cannot_be_silently_substituted(tmp_path):
    with pytest.raises(FileNotFoundError):
        evaluate(tmp_path)
