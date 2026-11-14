"""Synthetic subsystem simulation must not be confused with NASA measurements."""
from fastapi.testclient import TestClient
from physiograph.live_api import build_app
from physiograph.engineering_sim import engineering_snapshot, SIGNALS

def test_engineering_snapshots_reproducible_and_isolated():
    a=engineering_snapshot("SIM_CREW_01",60)
    assert a==engineering_snapshot("SIM_CREW_01",60)
    b=engineering_snapshot("SIM_CREW_02",60)
    assert a["values"]["systolic_bp_mmhg"]!=b["values"]["systolic_bp_mmhg"]
    assert len(a["values"])==12
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
        assert len(catalog["channels"])==12
        assert catalog["data_kind"]=="SYNTHETIC_NOT_MEASURED"
        assert c.get("/api/simulation/engineering/SIM_CREW_01").status_code==404
        assert c.get("/api/simulation/engineering/C001").status_code==404
        assert c.post("/api/simulation/engineering/SIM_CREW_01",json={}).status_code==405
