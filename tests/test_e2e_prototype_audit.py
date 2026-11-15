"""Regression tests for the complete trained-model four-crew scenario audit."""
from tools.e2e_prototype_audit import audit,SCENARIOS,CREW,CHECKPOINTS
from fastapi.testclient import TestClient
from physiograph.live_api import build_app


def test_28_real_model_scenarios_completely_evaluated(monkeypatch):
    monkeypatch.setenv("PHYSIOGRAPH_AUTO_DEMO","0")
    monkeypatch.setenv("PHYSIOGRAPH_INFERENCE_BACKEND","numpy")
    with TestClient(build_app()) as client:
        def get(path):
            response=client.get(path)
            response.raise_for_status()
            return response.json()
        result=audit(get,"inprocess")
        assert result["all_contract_checks_passed"]
        assert result["errors"]==[]
        assert result["api_responses_evaluated"]==len(SCENARIOS)*len(CREW)*len(CHECKPOINTS)
        assert result["scenario_crew_combinations"]==28
        assert result["scripted_alarm_at_peak"]==28
        assert result["scripted_alarm_cleared_at_completion"]==28
        assert result["live_store_unchanged_by_replay"] is True
        assert result["model_checkpoint_loaded"]
        assert all(len(item["checkpoints"])==6 for item in result["per_combination"])
        assert all(item["peak_unified_attention"] in ("OPTIMAL","CHECK","WARNING","CRITICAL")
                   for item in result["per_combination"])


def test_audit_rejects_missing_scenario_provenance(monkeypatch):
    monkeypatch.setenv("PHYSIOGRAPH_AUTO_DEMO","0")
    with TestClient(build_app()) as client:
        def get(path):
            response=client.get(path)
            response.raise_for_status()
            data=response.json()
            if path.startswith("/api/simulation/scenarios/SIM_CREW_01/oxygenation?second=0"):
                data["source"]="WRONG_SOURCE"
            return data
        result=audit(get,"inprocess",strict=False)
        assert not result["all_contract_checks_passed"]
        assert any("scripted training provenance lost" in x["reason"] for x in result["errors"])
