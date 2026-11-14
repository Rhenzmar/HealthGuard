"""Seven real backend scenario analyses using the frozen 5- and 17-input models.

Training labels remain synthetic. No scenario playback is inserted into the
four independent live telemetry streams.
"""
from fastapi.testclient import TestClient
import numpy as np
import pytest

from physiograph.scenario_engine import (
    SCENARIOS, SCENARIO_LENGTH, CREW_BASELINES, scenario_frame,
    scenario_history, simulated_values, evaluate_scenario_frame
)
from physiograph.candidate_17ch_numpy import Numpy17Candidate
from physiograph.live_api import build_app


@pytest.mark.parametrize("sid",list(CREW_BASELINES))
@pytest.mark.parametrize("scenario_id",list(SCENARIOS))
def test_seven_scenarios_four_crew_have_17_channels_and_recover(sid,scenario_id):
    initial=scenario_frame(sid,scenario_id,0)
    peak=scenario_frame(sid,scenario_id,35)
    recovered=scenario_frame(sid,scenario_id,64)
    assert initial["severity"]=="OPTIMAL"
    assert recovered["severity"]=="OPTIMAL"
    assert initial["alert"] is False
    assert recovered["alert"] is False
    assert peak["severity"] in ("WARNING","CRITICAL")
    assert len(initial["values"])==5
    assert len(initial["engineering_values"])==12
    assert len(set(initial["values"]) & set(initial["engineering_values"]))==0
    assert set(peak["values"])==set(initial["values"])
    assert set(peak["engineering_values"])==set(initial["engineering_values"])
    assert peak["source"]=="SERVER_SCRIPTED_TRAINING_SCENARIO"
    assert peak["subject_id"]==sid
    assert peak["clinical_validation"] is False
    assert peak["disturbance"]>0.99
    assert recovered["disturbance"]==0
    assert any(abs(peak["values"][k]-initial["values"][k])>.2
               for k in initial["values"]) or any(
                   abs(peak["engineering_values"][k]-
                       initial["engineering_values"][k])>100
                   for k in initial["engineering_values"])


def test_scenario_timeline_is_deterministic_and_inclusive():
    samples=scenario_history("SIM_CREW_01","oxygenation",64)
    assert len(samples["samples"])==SCENARIO_LENGTH+1
    assert samples["samples"][35]==scenario_frame("SIM_CREW_01","oxygenation",35)
    assert scenario_history("SIM_CREW_01","oxygenation",64,limit=5)["samples"][0]["sequence"]==60
    assert simulated_values("SIM_CREW_01","co2",30)==simulated_values("SIM_CREW_01","co2",30)
    with pytest.raises(ValueError):
        scenario_frame("C001","oxygenation",0)
    with pytest.raises(ValueError):
        scenario_frame("SIM_CREW_01","unknown",0)
    with pytest.raises(ValueError):
        scenario_frame("SIM_CREW_01","co2",-1)


def test_actual_17_channel_neural_inference_and_explanations():
    model=Numpy17Candidate()
    for scenario in SCENARIOS:
        result=evaluate_scenario_frame("SIM_CREW_01",scenario,35,candidate_model=model)
        evidence=result["model_evidence"]
        ai=evidence["candidate_17ch"]
        assert evidence["model_evaluated_on_same_scenario_values"] is True
        assert evidence["prelude_generated_on_server"] is True
        assert evidence["window_points"]==60
        assert evidence["reference_points"]==45
        assert ai["model_version"]==model.metadata["version"]
        assert ai["status"] in {"MODEL_FLAG","NO_MODEL_FLAG"}
        assert np.isfinite(ai["reconstruction_error"])
        assert len(ai["largest_reconstruction_errors"])==5
        assert "physiological_error" in ai and "engineering_error" in ai
        assert evidence["unified"]["classification_domain"]=="FICTIONAL_MISSION_TRAINING_ONLY"
        assert evidence["unified"]["clinical_validation"] is False
        assert result["alarm"]["active"]==result["alert"]


@pytest.mark.parametrize("scenario",list(SCENARIOS))
def test_alarm_clears_but_model_novelty_is_independent(scenario):
    model=Numpy17Candidate()
    peak=evaluate_scenario_frame("SIM_CREW_02",scenario,35,candidate_model=model)
    end=evaluate_scenario_frame("SIM_CREW_02",scenario,64,candidate_model=model)
    assert peak["alarm"]["status"]=="ACTIVE"
    assert peak["alarm"]["active"] is True
    assert end["alarm"]["status"]=="CLEARED"
    assert end["alarm"]["active"] is False
    assert end["severity"]=="OPTIMAL"
    assert end["model_evidence"]["candidate_17ch"]["status"] in (
        "MODEL_FLAG","NO_MODEL_FLAG")
    assert end["model_evidence"]["unified"]["status"] in (
        "OPTIMAL","CHECK","WARNING","CRITICAL")
    assert end["alarm"]["model_novelty_may_persist_after_recovery"] is True


def test_backend_endpoints_are_read_only_and_subject_isolated(monkeypatch):
    monkeypatch.setenv("PHYSIOGRAPH_AUTO_DEMO","0")
    monkeypatch.setenv("PHYSIOGRAPH_INFERENCE_BACKEND","numpy")
    with TestClient(build_app()) as client:
        catalog=client.get("/api/simulation/scenarios").json()
        assert len(catalog["scenarios"])==7
        assert catalog["prelude_points"]==105
        before=client.get("/api/live/snapshot").json()
        assert before["subject_count"]==0
        for sid in ("SIM_CREW_01","SIM_CREW_04"):
            for scenario in SCENARIOS:
                response=client.get(f"/api/simulation/scenarios/{sid}/{scenario}",
                                    params={"second":35,"include_history":True})
                assert response.status_code==200
                data=response.json()
                assert data["subject_id"]==sid
                assert data["scenario_id"]==scenario
                assert len(data["history"])==36
                assert data["history"][-1]["values"]==data["values"]
                assert data["model_evidence"]["model_evaluated_on_same_scenario_values"]
                assert data["model_evidence"]["candidate_17ch"]["status"] in (
                    "MODEL_FLAG","NO_MODEL_FLAG")
                assert data["alarm"]["active"]==data["alert"]
        after=client.get("/api/live/snapshot").json()
        assert after==before
        assert client.get("/api/live/physioalert-unified/SIM_CREW_01").status_code==404
        assert client.get("/api/simulation/scenarios/C001/oxygenation").status_code==422
        assert client.get("/api/simulation/scenarios/SIM_CREW_01/fake").status_code==422
        assert client.get("/api/simulation/scenarios/SIM_CREW_01/oxygenation?second=65").status_code==422
        hist=client.get("/api/simulation/scenarios/history/SIM_CREW_01/thermal",
                        params={"second":64,"limit":3}).json()
        assert len(hist["samples"])==3
        assert hist["samples"][-1]["sequence"]==64
