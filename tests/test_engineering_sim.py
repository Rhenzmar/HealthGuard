"""Synthetic subsystem simulation must not be confused with NASA measurements."""
from fastapi.testclient import TestClient
from physiograph.live_api import build_app
from physiograph.engineering_sim import engineering_snapshot, SIGNALS

def test_engineering_snapshots_reproducible_and_isolated():
    a=engineering_snapshot("SIM_CREW_01",60)
    assert a==engineering_snapshot("SIM_CREW_01",60)
    b=engineering_snapshot("SIM_CREW_02",60)
    assert a["values"]["systolic_bp_mmhg"]!=b["values"]["systolic_bp_mmhg"]
    assert len(a["values"])==14
    assert set(a["values"])==set(SIGNALS)
    assert a["measurement_origin"]=="SYNTHETIC_NOT_MEASURED"
    assert a["classification"]=="NOT_EVALUATED"

def test_no_made_up_engineering_for_unknown_subject():
    import pytest
    with pytest.raises(ValueError):
        engineering_snapshot("C001",0)
    with pytest.raises(ValueError):
        engineering_snapshot("SIM_CREW_01",-1)

def test_engineering_catalog_readonly_and_empty_without_simulator(monkeypatch):
    monkeypatch.setenv("PHYSIOGRAPH_AUTO_DEMO","0")
    with TestClient(build_app()) as c:
        catalog=c.get("/api/simulation/engineering/channels").json()
        assert len(catalog["channels"])==14
        assert catalog["data_kind"]=="SYNTHETIC_NOT_MEASURED"
        assert c.get("/api/simulation/engineering/SIM_CREW_01").status_code==404
        assert c.get("/api/simulation/engineering/C001").status_code==404
        assert c.post("/api/simulation/engineering/SIM_CREW_01",json={}).status_code==405


def test_suit_pressure_and_battery_are_fictional_and_crew_specific():
    from physiograph.engineering_sim import FROZEN_17CH_ENGINEERING_KEYS
    first = engineering_snapshot("SIM_CREW_01",0)
    later = engineering_snapshot("SIM_CREW_01",60)
    other = engineering_snapshot("SIM_CREW_04",60)
    assert 4.2 <= first["values"]["suit_pressure_psi"] <= 4.4
    assert later["values"]["suit_battery_percent"] < first["values"]["suit_battery_percent"]
    assert later["values"]["suit_battery_percent"] != other["values"]["suit_battery_percent"]
    assert first["channels"]["suit_pressure_psi"]["unit"] == "psi"
    assert first["channels"]["suit_battery_percent"]["unit"] == "%"
    assert "NOT_PRESSURE_SENSOR" in first["channels"]["suit_pressure_psi"]["origin"]
    assert len(FROZEN_17CH_ENGINEERING_KEYS) == 12
    assert "suit_pressure_psi" not in FROZEN_17CH_ENGINEERING_KEYS
    assert "suit_battery_percent" not in FROZEN_17CH_ENGINEERING_KEYS


def test_normal_simulator_never_creates_false_critical_alert_after_long_uptime():
    """A rest-mode demo is not an indefinitely draining EVA."""
    from physiograph.biomarker_detection import evaluate_engineering
    from physiograph.engineering_sim import CREW_IDS
    for crew in CREW_IDS:
        for sequence in (0, 60, 600, 3600, 36000, 86400, 604800):
            snapshot = engineering_snapshot(crew, sequence)
            result = evaluate_engineering(crew, sequence)
            assert result["status"] == "OPTIMAL", (crew, sequence, result["flagged_channels"])
            assert snapshot["values"]["suit_o2_remaining_percent"] > 90
            assert snapshot["values"]["suit_battery_percent"] > 70
            assert snapshot["values"]["cumulative_dose_usv"] < 1


def test_scripted_suit_oxygen_failure_still_triggers_a_critical_alert():
    """A scripted extreme departure must remain detectable even with the nominal hold."""
    from physiograph.biomarker_detection import evaluate_engineering
    sid = "SIM_CREW_01"
    sequence = 86400
    values = engineering_snapshot(sid, sequence)["values"].copy()
    values["suit_o2_remaining_percent"] = 20.0
    alert = evaluate_engineering(sid, sequence, values)
    assert alert["status"] == "CRITICAL"
    assert "suit_o2_remaining_percent" in alert["flagged_channels"]
