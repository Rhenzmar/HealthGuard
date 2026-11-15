"""Checks for the experimental simulated-live APDRA adaptation.

These are software tests, not clinical validation. The original laboratory
APDRA v0.7 is not changed or trained on the simulated measurements.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from physiograph.live_apdra import (
    LiveAPDRAMonitor, evaluate_window, REFERENCE_POINTS, WINDOW_POINTS
)
from physiograph.live_telemetry import LiveSample, SOURCE, METRICS
from physiograph.physioalert_unified import compose_review
from physiograph.biomarker_detection import evaluate_engineering
from physiograph.live_api import build_app


BASE = {
    "heart_rate_bpm": 70.0,
    "spo2_percent": 98.0,
    "respiratory_rate_bpm": 14.0,
    "core_temp_c": 36.8,
    "hrv_rmssd_ms": 62.0,
}


def sample(subject, sequence, *, values=None, activity="REST"):
    return LiveSample(
        subject_id=subject,
        sequence=sequence,
        timestamp=datetime(2026, 11, 15, tzinfo=timezone.utc) + timedelta(seconds=sequence),
        values=dict(BASE if values is None else values),
        source=SOURCE,
        context={"activity_state": activity, "basis": "SIMULATOR_DECLARED"},
    )


def quality(item, status="NO_QUALITY_ISSUE_DETECTED"):
    return {
        "subject_id": item.subject_id, "sequence": item.sequence, "source": SOURCE,
        "status": status, "issues": [],
    }


def test_baseline_stability_detects_change_but_not_diagnosis():
    reference = [dict(BASE) for _ in range(REFERENCE_POINTS)]
    changed = [{**BASE, "heart_rate_bpm": 100.0} for _ in range(WINDOW_POINTS)]
    result = evaluate_window(reference, changed)
    assert result["status"] == "STABLE_DEVIATION"
    assert result["stable_channels"] == ["heart_rate_bpm"]
    assert len(result["channels"]) == len(METRICS)
    assert all(item["leave_one_block_flags"] == [True, True, True]
               for item in result["channels"] if item["key"] == "heart_rate_bpm")


def test_leave_one_block_out_exposes_sensitive_reference():
    reference = ([{**BASE, "heart_rate_bpm": 70.0} for _ in range(15)] +
                 [{**BASE, "heart_rate_bpm": 70.0} for _ in range(15)] +
                 [{**BASE, "heart_rate_bpm": 110.0} for _ in range(15)])
    result = evaluate_window(reference, [{**BASE, "heart_rate_bpm": 95.0} for _ in range(15)])
    assert result["status"] == "BASELINE_SENSITIVE"
    assert "heart_rate_bpm" in result["baseline_sensitive_channels"]


def test_crew_isolation_context_and_cadence():
    monitor = LiveAPDRAMonitor()
    for seq in range(45):
        row = sample("SIM_CREW_01", seq)
        result = monitor.process(row, quality(row))
    assert result["status"] == "BASELINE_CALIBRATING"
    assert result["reference_points"] == 45
    assert monitor.latest("SIM_CREW_02") is None
    shifted = {**BASE, "heart_rate_bpm": 106.0}
    for seq in range(45, 75):
        row = sample("SIM_CREW_01", seq, values=shifted)
        result = monitor.process(row, quality(row))
    assert result["status"] == "STABLE_DEVIATION"
    assert result["persistence_confirmed"] is True
    assert result["spaced_confirmations"] >= 2
    row = sample("SIM_CREW_01", 75, activity="ACTIVE")
    result = monitor.process(row, quality(row))
    assert result["status"] == "ACTIVITY_CONTEXT"
    assert result["window_points"] == 0
    other = sample("SIM_CREW_02", 0)
    assert monitor.process(other, quality(other))["reference_points"] == 1
    with pytest.raises(ValueError, match="increasing"):
        monitor.process(other, quality(other))
    with pytest.raises(ValueError, match="match"):
        monitor.process(sample("SIM_CREW_03", 0), quality(other))


def test_physioalert_uses_live_apdra_for_check_not_warning():
    subject, sequence = "SIM_CREW_01", 120
    packet = {"subject_id": subject, "sequence": sequence, "source": SOURCE,
              "values": dict(BASE)}
    model = {"subject_id": subject, "sequence": sequence, "source": SOURCE,
             "status": "NO_MODEL_FLAG"}
    context = {**model, "status": "NO_PATTERN_FLAG",
               "activity_state": "REST",
               "quality": {"status": "NO_QUALITY_ISSUE_DETECTED", "issues": []}}
    candidate = {"subject_id": subject, "sequence": sequence,
                 "status": "NO_MODEL_FLAG", "source": "FULLY_SYNTHETIC_17_CHANNELS",
                 "NASA_laboratory_data_used": False}
    engineering = evaluate_engineering(subject, sequence)
    apdra = {"subject_id": subject, "sequence": sequence, "source": SOURCE,
             "algorithm": "APDRA_LIVE_BASELINE_STABILITY_EXPERIMENTAL",
             "nasa_laboratory_data_used": False,
             "status": "STABLE_DEVIATION", "persistence_confirmed": True,
             "stable_channels": ["heart_rate_bpm"]}
    result = compose_review(subject, sequence, packet, model, model, context,
                            candidate, engineering, apdra)
    assert result["status"] == "CHECK"
    assert result["model_attention_level"] == "CHECK"
    assert result["explanation"]["apdra_live"]["contributed_check"] is True
    assert result["historical_nasa_biomarkers_in_inference"] is False
    assert result["clinical_validation"] is False
    wrong = {**apdra, "subject_id": "SIM_CREW_02"}
    with pytest.raises(ValueError, match="live_apdra"):
        compose_review(subject, sequence, packet, model, model, context,
                       candidate, engineering, wrong)


def test_live_apdra_api_exposes_simulated_source_only(monkeypatch):
    monkeypatch.delenv("PHYSIOGRAPH_AUTO_DEMO", raising=False)
    monkeypatch.delenv("PHYSIOGRAPH_PUBLIC_MODE", raising=False)
    with TestClient(build_app()) as client:
        assert client.get("/api/live/apdra/SIM_CREW_01").status_code == 404
        for i in range(2):
            row = sample("SIM_CREW_01", i)
            payload = row.as_dict()
            payload.pop("analysis_status", None)
            response = client.post("/api/live/ingest", json=payload)
            assert response.status_code == 201
            result = response.json()
            assert result["apdra_live"]["subject_id"] == "SIM_CREW_01"
            assert result["apdra_live"]["sequence"] == i
            assert result["apdra_live"]["nasa_laboratory_data_used"] is False
        current = client.get("/api/live/apdra/SIM_CREW_01").json()
        assert current["sequence"] == 1
        assert current["source"] == SOURCE
        assert client.get("/api/live/apdra/history/SIM_CREW_01").json()["results"][-1] == current
        assert client.get("/api/live/apdra/SIM_CREW_02").status_code == 404
