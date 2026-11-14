"""Unified, nonclinical PhysioAlert training review and source isolation."""
from datetime import datetime, timezone
from fastapi.testclient import TestClient
import pytest

from physiograph.physioalert_unified import compose_review, UnifiedReviewMonitor
from physiograph.biomarker_detection import evaluate_engineering
from tools.replay_live_demo import generate_packets
from physiograph.live_api import build_app


def evidence(subject="SIM_CREW_01",sequence=120,*,model="NO_MODEL_FLAG",
             legacy_a="NO_MODEL_FLAG",legacy_b="NO_MODEL_FLAG",quality="NO_QUALITY_ISSUE_DETECTED",
             engineering_values=None,context_status="NO_PATTERN_FLAG"):
    packet={"subject_id":subject,"sequence":sequence,"source":"SIMULATED_LIVE",
            "values":{"heart_rate_bpm":70,"spo2_percent":98,"respiratory_rate_bpm":14,
                      "core_temp_c":36.8,"hrv_rmssd_ms":62}}
    cnn={"subject_id":subject,"sequence":sequence,"source":"SIMULATED_LIVE","status":legacy_a}
    comparison={"subject_id":subject,"sequence":sequence,"source":"SIMULATED_LIVE","status":legacy_b}
    context={"subject_id":subject,"sequence":sequence,"source":"SIMULATED_LIVE",
             "status":context_status,"activity_state":"REST",
             "quality":{"status":quality,"issues":[] if quality=="NO_QUALITY_ISSUE_DETECTED" else ["ABRUPT_CHANGE_REQUIRES_VERIFICATION"]}}
    candidate={"subject_id":subject,"sequence":sequence,
               "source":"FULLY_SYNTHETIC_17_CHANNELS","status":model,
               "NASA_laboratory_data_used":False,
               "largest_reconstruction_errors":[{"channel":"cabin_co2_ppm","error":0.05}]}
    eng=evaluate_engineering(subject,sequence,engineering_values)
    return (packet,cnn,comparison,context,candidate,eng)


def test_optimal_and_warmup():
    a=evidence()
    result=compose_review("SIM_CREW_01",120,*a)
    assert result["status"]=="OPTIMAL"
    assert not result["audible_alert_suggested"]
    assert result["historical_nasa_biomarkers_in_inference"] is False
    assert result["clinical_validation"] is False
    warmup=list(a)
    warmup[4]={**warmup[4],"status":"BASELINE_CALIBRATING"}
    pending=compose_review("SIM_CREW_01",120,*warmup)
    assert pending["status"]=="CHECK"
    assert pending["models_ready"] is False


def test_model_consensus_is_warning_not_critical():
    args=evidence(model="MODEL_FLAG",legacy_a="MODEL_FLAG",legacy_b="MODEL_FLAG",
                  context_status="PERSISTENT_PATTERN_REVIEW")
    review=compose_review("SIM_CREW_01",120,*args)
    assert review["status"]=="WARNING"
    assert review["basis"]=="EXPERIMENTAL_MODEL_AGREEMENT_OR_DATA_QUALITY"
    assert review["audible_alert_suggested"]
    assert "diagnosis" in review["disclaimer"]


def test_environmental_critical_is_fictional_threshold_only():
    vals=evaluate_engineering("SIM_CREW_01",120)["channels"]
    engineering={key: value["value"] for key,value in vals.items()}
    engineering["cabin_co2_ppm"]=7200
    args=evidence(engineering_values=engineering)
    review=compose_review("SIM_CREW_01",120,*args)
    assert review["status"]=="CRITICAL"
    assert review["engineering_attention_level"]=="CRITICAL"
    assert review["model_attention_level"]=="OPTIMAL"
    assert review["basis"]=="SIMULATED_ENGINEERING_THRESHOLD"
    assert "cabin_co2_ppm" in review["explanation"]["engineering"]["flagged_channels"]
    assert "Training" in review["voice_ready_script"] or "training" in review["voice_ready_script"]


def test_measurement_quality_requires_check_even_when_models_unflagged():
    args=evidence(quality="VERIFY_MEASUREMENT")
    review=compose_review("SIM_CREW_01",120,*args)
    assert review["status"]=="CHECK"
    assert review["measurement_verification_required"] is True


def test_cross_crew_and_source_mixing_is_rejected():
    args=list(evidence())
    args[4]={**args[4],"subject_id":"SIM_CREW_02"}
    with pytest.raises(ValueError,match="candidate17"):
        compose_review("SIM_CREW_01",120,*args)
    args=list(evidence())
    args[4]={**args[4],"NASA_laboratory_data_used":True}
    with pytest.raises(ValueError,match="laboratory"):
        compose_review("SIM_CREW_01",120,*args)


def test_history_rejects_duplicated_sequences():
    store=UnifiedReviewMonitor()
    args=evidence(sequence=120)
    first=store.process("SIM_CREW_01",120,*args)
    assert first["status"]=="OPTIMAL"
    assert store.history("SIM_CREW_01")==[first]
    assert store.history("SIM_CREW_02")==[]
    with pytest.raises(ValueError,match="Non-increasing"):
        store.process("SIM_CREW_01",120,*args)


def test_unified_api_stream_and_voice_separate_from_original_context(monkeypatch):
    monkeypatch.setenv("PHYSIOGRAPH_AUTO_DEMO","0")
    with TestClient(build_app()) as c:
        assert c.get("/api/live/physioalert-unified/SIM_CREW_01").status_code==404
        assert c.get("/api/live/physioalert-unified/C001").status_code==404
        packet=next(generate_packets(subject="SIM_CREW_01",count=1,
            start=datetime(2026,11,14,tzinfo=timezone.utc),mode="normal"))
        response=c.post("/api/live/ingest",json=packet)
        assert response.status_code==201
        body=response.json()
        unified=body["physioalert_unified"]
        assert unified["subject_id"]=="SIM_CREW_01"
        assert unified["sequence"]==0
        assert unified["status"]=="CHECK"
        assert unified["models_ready"] is False
        assert unified["clinical_validation"] is False
        assert c.get("/api/live/physioalert-unified/SIM_CREW_01").json()==unified
        assert c.get("/api/live/physioalert-unified/history/SIM_CREW_01").json()["results"]==[unified]
        assert body["multisystem"]["physioalert_unified"]==unified
        assert body["context_review"]["subject_id"]=="SIM_CREW_01"
        assert "voice_ready_script" in unified
