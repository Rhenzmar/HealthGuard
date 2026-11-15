"""Deterministic seven-scenario, 17-channel backend training playback.

Only fictional crew IDs are valid. These frames are never inserted into the
live crew store, real NASA research data, or production model monitors. The
first 45 simulated pre-event points establish a frozen subject-specific
reference, followed by 60 synthetic pre-event points for model warmup.

All 17-channel and legacy model evaluations use the *actual pretrained model
weights* on the scripted readings, not a fabricated model response. Scenario
severity and active training alarm remain independently labelled scripted
rules. A rolling model score may stay elevated after scenario recovery.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache
from math import sin
from typing import Any

import numpy as np

from .engineering_sim import CREW_IDS, SIGNALS, FROZEN_17CH_ENGINEERING_KEYS, engineering_snapshot
from .live_telemetry import METRICS, SOURCE
from .deep_learning import normalize_window
from .biomarker_detection import evaluate_engineering
from .physioalert_unified import compose_review

SCENARIO_LENGTH = 64
STAGES = (
    {"at": 0, "title": "Baseline"},
    {"at": 9, "title": "Developing"},
    {"at": 25, "title": "Peak disturbance"},
    {"at": 44, "title": "Recovery"},
    {"at": 64, "title": "Complete"},
)
SCENARIOS = {
    "oxygenation": {
        "name": "Oxygenation decline", "subtitle": "Illustrative breathing and oxygenation event",
        "trigger": "SpO₂ below 94% (scripted training trigger)",
        "reason": "A simulated oxygenation decrease, not a diagnosed condition.",
        "guidance": "Verify readings with approved instrumentation, reduce exertion, notify the medical officer and Mission Control, and follow the authorized mission checklist.",
        "affected": ("heart_rate_bpm","spo2_percent","respiratory_rate_bpm","hrv_rmssd_ms"),
    },
    "exertion": {
        "name": "Exertion and high heart rate", "subtitle": "Illustrative high-workload response",
        "trigger": "Heart rate above 115 bpm (scripted training trigger)",
        "reason": "A simulated activity response, not a cardiovascular diagnosis.",
        "guidance": "Reduce exertion, verify the readings and declared activity, and follow the crew's approved medical and exercise procedures.",
        "affected": ("heart_rate_bpm","spo2_percent","respiratory_rate_bpm","core_temp_c","hrv_rmssd_ms"),
    },
    "thermal": {
        "name": "Thermal instability", "subtitle": "Illustrative rise in core temperature",
        "trigger": "Core temperature above 38°C (scripted training trigger)",
        "reason": "A simulated thermal pattern, not an actual measured fever.",
        "guidance": "Reduce workload, verify temperature and thermal-control measurements, notify the crew, and follow approved thermal-event procedures.",
        "affected": ("heart_rate_bpm","respiratory_rate_bpm","core_temp_c","hrv_rmssd_ms"),
    },
    "sensor": {
        "name": "Sensor signal anomaly", "subtitle": "Inconsistent simulated pulse oximeter signal",
        "trigger": "Inconsistent SpO₂ signal (scripted training trigger)",
        "reason": "An intentionally inconsistent simulated SpO₂ signal, not confirmation of an artifact or illness.",
        "guidance": "Check sensor contact and fit, repeat with approved equipment, and do not treat a single suspect measurement as a confirmed physiological emergency.",
        "affected": ("spo2_percent",),
    },
    "co2": {
        "name": "Cabin CO₂ scrubber failure", "subtitle": "Fictional spacecraft atmosphere disturbance",
        "trigger": "Cabin CO₂ above 4,000 ppm (illustrative trigger only)",
        "reason": "Simulated cabin carbon-dioxide buildup and respiratory response.",
        "guidance": "Notify the crew and Mission Control, verify atmosphere instrumentation, and follow the approved environmental-control checklist.",
        "affected": ("heart_rate_bpm","respiratory_rate_bpm"),
    },
    "cabin_leak": {
        "name": "Cabin pressure leak", "subtitle": "Fictional spacecraft depressurization event",
        "trigger": "Cabin pressure below 85 kPa (illustrative trigger only)",
        "reason": "Simulated cabin pressure loss and associated physiological changes.",
        "guidance": "Alert the crew and Mission Control, verify cabin pressure with approved equipment, and follow the authorized pressure-leak checklist.",
        "affected": ("heart_rate_bpm","respiratory_rate_bpm","spo2_percent"),
    },
    "radiation": {
        "name": "Solar radiation event", "subtitle": "Fictional radiation-rate surge",
        "trigger": "Illustrative radiation-rate departure (not a safety dose limit)",
        "reason": "A simulated radiation-rate surge, not a real dosimeter measurement.",
        "guidance": "Notify Mission Control, confirm dosimeter readings, and follow approved radiation shelter procedures. No diagnosis or exposure prediction is implied.",
        "affected": (),
    },
    "suit_leak": {
        "name": "Suit pressure loss", "subtitle": "Fictional pressure-control failure during EVA",
        "trigger": "Suit pressure falls below 3.4 psi (illustrative training trigger)",
        "reason": "Scripted decrease in suit pressure with a simulated breathing response. This is not a suit instrument reading.",
        "guidance": "Stop the EVA task, verify the pressure indication, notify Mission Control and follow the mission-approved pressure-loss procedure.",
        "affected": ("spo2_percent","respiratory_rate_bpm"),
    },
    "suit_power": {
        "name": "Suit battery failure", "subtitle": "Fictional rapid power loss during EVA",
        "trigger": "Suit battery reserve falls below 50% (illustrative training trigger)",
        "reason": "Scripted suit battery depletion. No real battery controller or electrical system is connected.",
        "guidance": "Stop the EVA task, verify the power readout, notify Mission Control and follow the mission-approved electrical-power procedure.",
        "affected": (),
    },
}
CREW_BASELINES = {
    "SIM_CREW_01": (70, 98.3, 14.0, 36.75, 62),
    "SIM_CREW_02": (65, 98.6, 12.8, 36.63, 71),
    "SIM_CREW_03": (76, 97.9, 15.5, 36.85, 55),
    "SIM_CREW_04": (72, 98.45, 13.5, 36.70, 65),
}
PHYS_KEYS = tuple(METRICS)


def _round(x: float, places: int = 1) -> float:
    return round(float(x), places)


def _validate(sid: str, scenario_id: str, second: int) -> None:
    if sid not in CREW_IDS:
        raise ValueError("Unknown fictional crew subject")
    if scenario_id not in SCENARIOS:
        raise ValueError("Unknown training scenario")
    if type(second) is not int or not 0 <= second <= SCENARIO_LENGTH:
        raise ValueError("Training seconds must be an integer from 0 to 64")


def _envelope(t: int) -> float:
    return max(0., min(1., (t-8)/18)) * (1-max(0.,min(1.,(t-44)/18)))


def _engineer(sid: str, scenario_id: str, t: int, intensity: float) -> dict[str,float]:
    # Scenario time is relative; never read or overwrite actual demo subject
    # sequence or timestamp. Negative pre-event points use baseline values.
    vals = engineering_snapshot(sid, max(t,0))["values"].copy()
    if scenario_id == "co2":
        vals["cabin_co2_ppm"] = _round(vals["cabin_co2_ppm"]+5400*intensity)
    elif scenario_id == "cabin_leak":
        vals["cabin_pressure_kpa"] = _round(vals["cabin_pressure_kpa"]-27*intensity,2)
    elif scenario_id == "suit_leak":
        vals["suit_pressure_psi"] = _round(max(0, vals["suit_pressure_psi"]-2.0*intensity),2)
    elif scenario_id == "suit_power":
        vals["suit_battery_percent"] = _round(max(0, vals["suit_battery_percent"]-70*intensity),2)
    elif scenario_id == "radiation":
        vals["radiation_rate_usv_h"] = _round(vals["radiation_rate_usv_h"]+2200*intensity,2)
        # The accumulated dose is strictly an illustrative integration of
        # the generated rate, not a physical dose prediction.
        addition = sum(2200 * _envelope(i) for i in range(0,max(t,0)+1)) / 3600
        vals["cumulative_dose_usv"] = _round(vals["cumulative_dose_usv"]+addition,4)
    return vals


@lru_cache(maxsize=8192)
def simulated_values(sid: str, scenario_id: str, t: int) -> tuple[tuple[float,...],tuple[float,...]]:
    """Source-separated deterministic 5 + 12 values for any prelude/event tick."""
    if sid not in CREW_IDS or scenario_id not in SCENARIOS or not -104 <= t <= 64:
        raise ValueError("Unsupported fictional scenario tick")
    hr,spo2,rr,temp,hrv = CREW_BASELINES[sid]
    intensity = _envelope(t)
    wobble = sin(t/4 + hr/10)*.55
    v = {
        "heart_rate_bpm": _round(hr+wobble),
        "spo2_percent": _round(spo2+.07*sin(t/7)),
        "respiratory_rate_bpm": _round(rr+.15*sin(t/5)),
        "core_temp_c": _round(temp+.025*sin(t/9),2),
        "hrv_rmssd_ms": _round(hrv+.5*sin(t/6)),
    }
    if scenario_id == "oxygenation":
        v["heart_rate_bpm"] = _round(v["heart_rate_bpm"]+29*intensity)
        v["spo2_percent"] = _round(v["spo2_percent"]-10*intensity)
        v["respiratory_rate_bpm"] = _round(v["respiratory_rate_bpm"]+10*intensity)
        v["hrv_rmssd_ms"] = _round(v["hrv_rmssd_ms"]-17*intensity)
    elif scenario_id == "exertion":
        v["heart_rate_bpm"] = _round(v["heart_rate_bpm"]+73*intensity)
        v["spo2_percent"] = _round(v["spo2_percent"]-1.25*intensity)
        v["respiratory_rate_bpm"] = _round(v["respiratory_rate_bpm"]+17*intensity)
        v["core_temp_c"] = _round(v["core_temp_c"]+.45*intensity,2)
        v["hrv_rmssd_ms"] = _round(v["hrv_rmssd_ms"]-28*intensity)
    elif scenario_id == "thermal":
        v["heart_rate_bpm"] = _round(v["heart_rate_bpm"]+29*intensity)
        v["respiratory_rate_bpm"] = _round(v["respiratory_rate_bpm"]+8*intensity)
        v["core_temp_c"] = _round(v["core_temp_c"]+2.1*intensity,2)
        v["hrv_rmssd_ms"] = _round(v["hrv_rmssd_ms"]-16*intensity)
    elif scenario_id == "sensor":
        v["spo2_percent"] = _round(v["spo2_percent"]-16*intensity)
        v["heart_rate_bpm"] = _round(v["heart_rate_bpm"]+.7*intensity)
    elif scenario_id == "co2":
        v["heart_rate_bpm"] = _round(v["heart_rate_bpm"]+17*intensity)
        v["respiratory_rate_bpm"] = _round(v["respiratory_rate_bpm"]+12*intensity)
    elif scenario_id == "cabin_leak":
        v["heart_rate_bpm"] = _round(v["heart_rate_bpm"]+24*intensity)
        v["respiratory_rate_bpm"] = _round(v["respiratory_rate_bpm"]+13*intensity)
        v["spo2_percent"] = _round(v["spo2_percent"]-7.2*intensity)
    elif scenario_id == "suit_leak":
        v["spo2_percent"] = _round(v["spo2_percent"]-5.0*intensity)
        v["respiratory_rate_bpm"] = _round(v["respiratory_rate_bpm"]+6*intensity)
    eng = _engineer(sid,scenario_id,t,intensity)
    if set(v)!=set(METRICS) or set(eng)!=set(SIGNALS):
        raise ValueError("Scenario simulated channel schema mismatch")
    if any(not lo <= v[key] <= hi for key,(lo,hi,_) in METRICS.items()):
        raise ValueError("Scenario physiological values violate input integrity bounds")
    # New HUD-only suit values are not inputs to the frozen 17-channel model.
    return tuple(v[k] for k in PHYS_KEYS),tuple(eng[k] for k in FROZEN_17CH_ENGINEERING_KEYS)


def _flags(scenario_id:str, v:dict, e:dict, intensity:float) -> tuple[dict,dict]:
    flags={
        "heart_rate_bpm":scenario_id=="exertion" and v["heart_rate_bpm"]>115,
        "spo2_percent":(scenario_id in ("oxygenation","cabin_leak") and v["spo2_percent"]<94)
                       or (scenario_id=="sensor" and intensity>.55),
        "respiratory_rate_bpm":(scenario_id=="co2" and v["respiratory_rate_bpm"]>21)
            or (scenario_id=="cabin_leak" and v["respiratory_rate_bpm"]>22)
            or (scenario_id=="oxygenation" and v["respiratory_rate_bpm"]>20)
            or (scenario_id=="exertion" and v["respiratory_rate_bpm"]>26),
        "core_temp_c":scenario_id=="thermal" and v["core_temp_c"]>38,
        "hrv_rmssd_ms":False,
    }
    eng_flags={
        "cabin_co2_ppm":scenario_id=="co2" and e["cabin_co2_ppm"]>4000,
        "cabin_pressure_kpa":scenario_id=="cabin_leak" and e["cabin_pressure_kpa"]<85,
        "radiation_rate_usv_h":scenario_id=="radiation" and intensity>.55,
        "suit_pressure_psi":scenario_id=="suit_leak" and e["suit_pressure_psi"]<3.4,
        "suit_battery_percent":scenario_id=="suit_power" and e["suit_battery_percent"]<50,
    }
    return flags,eng_flags


def scenario_frame(sid: str, scenario_id: str, second: int) -> dict[str,Any]:
    _validate(sid,scenario_id,second)
    a,b=simulated_values(sid,scenario_id,second)
    v=dict(zip(PHYS_KEYS,a))
    eng=_engineer(sid,scenario_id,second,_envelope(second))
    intensity=_envelope(second)
    flags,engineering_flags=_flags(scenario_id,v,eng,intensity)
    active=any(flags.values()) or any(engineering_flags.values())
    level=("OPTIMAL" if intensity<.12 else
           "CHECK" if intensity<.42 else
           "WARNING" if intensity<.78 or not active else "CRITICAL")
    stage=("Complete" if second>=64 else "Recovery" if second>=44 else
           "Peak disturbance" if second>=25 else
           "Developing" if second>=9 else "Baseline")
    affected=SCENARIOS[scenario_id]["affected"]
    return {
        "subject_id":sid,"scenario_id":scenario_id,
        "sequence":second,"elapsed_seconds":second,
        "timestamp":None,
        "source":"SERVER_SCRIPTED_TRAINING_SCENARIO",
        "source_kind":"SYNTHETIC_NOT_MEASURED",
        "values":v,"engineering_values":eng,
        "flags":flags,"engineering_flags":engineering_flags,
        "alert":active,"severity":level,"stage":stage,
        "disturbance":round(intensity,6),
        "metric_levels":{k:level if k in affected else "OPTIMAL" for k in v},
        "reason":(SCENARIOS[scenario_id]["reason"] if active else
                  "Developing or recovering scripted measurements; no current scenario trigger." if intensity else
                  "Illustrative baseline or recovered phase; not a clinical clearance."),
        "guidance":SCENARIOS[scenario_id]["guidance"],
        "trigger":SCENARIOS[scenario_id]["trigger"],
        "clinical_validation":False,
    }


def scenario_catalog() -> dict[str,Any]:
    return {
        "source":"SERVER_SCRIPTED_TRAINING_SCENARIO",
        "scenario_length_seconds":SCENARIO_LENGTH,
        "prelude_points":105,"cadence_hz":1,
        "crew_ids":list(CREW_IDS),
        "scenarios":[{"id":key,**{k:v for k,v in rec.items() if k!="affected"},
                      "affected":list(rec["affected"])} for key,rec in SCENARIOS.items()],
        "stages":list(STAGES),
        "training_only":True,"clinical_validation":False,
        "explanation":"The scenario is generated on the server and evaluated with frozen pretrained model weights. Scenario severity is scripted and distinct from CNN novelty.",
    }


def scenario_history(sid:str, scenario_id:str, second:int, limit:int=65)->dict[str,Any]:
    _validate(sid,scenario_id,second)
    if type(limit) is not int or not 1<=limit<=65:
        raise ValueError("History limit must be 1 to 65")
    start=max(0,second-limit+1)
    return {
        "subject_id":sid,"scenario_id":scenario_id,
        "source":"SERVER_SCRIPTED_TRAINING_SCENARIO",
        "samples":[scenario_frame(sid,scenario_id,i) for i in range(start,second+1)],
        "clinical_validation":False,
    }


def _model_status(sid:str,t:int,model:Any,window:np.ndarray,reference:np.ndarray,
                  *,statistical:bool=False)->dict:
    item={"subject_id":sid,"sequence":t,"source":SOURCE,"clinical_validation":False}
    if model is None:
        return {**item,"status":"MODEL_UNAVAILABLE"}
    if statistical:
        value=model.score(normalize_window(window,reference))
        key="novelty_score"
    else:
        value=model.score(window,reference)
        key="reconstruction_error"
    threshold=float(model.threshold)
    return {**item,"status":"MODEL_FLAG" if value>threshold else "NO_MODEL_FLAG",
            "flag":bool(value>threshold),key:round(float(value),7),
            "calibration_threshold":round(threshold,7),
            "screening_domain":"SYNTHETIC_NOVELTY_NOT_CLINICAL_DIAGNOSIS"}


def evaluate_scenario_frame(sid:str,scenario_id:str,second:int,
                            candidate_model:Any=None,cnn_model:Any=None,
                            statistical_model:Any=None)->dict[str,Any]:
    """Actual trained models score the synthetic scenario, without modifying
    crew streams or their independent baselines/histories.
    """
    frame=scenario_frame(sid,scenario_id,second)
    # -104 .. -60 = 45 pre-event simulated baseline samples;
    # second-59 .. second = independent 60-sample forward evaluation window.
    historical=[simulated_values(sid,scenario_id,t) for t in range(-104,-59)]
    window=[simulated_values(sid,scenario_id,t) for t in range(second-59,second+1)]
    reference=np.median(np.asarray([list(a)+list(b) for a,b in historical],
                                      dtype=np.float32),axis=0)
    matrix=np.asarray([list(a)+list(b) for a,b in window],dtype=np.float32)
    if matrix.shape!=(60,17) or reference.shape!=(17,) or not np.isfinite(matrix).all():
        raise ValueError("Invalid generated model window")
    old_cnn=_model_status(sid,second,cnn_model,matrix[:,:5],reference[:5])
    baseline=_model_status(sid,second,statistical_model,matrix[:,:5],reference[:5],
                           statistical=True)
    candidate={
        "subject_id":sid,"sequence":second,
        "source":"FULLY_SYNTHETIC_17_CHANNELS",
        "NASA_laboratory_data_used":False,
        "clinical_validation":False,
        "model_role":"SEPARATE_TRAINING_SCENARIO_INFERENCE",
    }
    if candidate_model is None:
        candidate.update(status="MODEL_UNAVAILABLE")
    else:
        scores=candidate_model.score(matrix,reference)
        flag=scores["overall"]>candidate_model.threshold
        candidate.update(
            status="MODEL_FLAG" if flag else "NO_MODEL_FLAG",flag=bool(flag),
            model_version=candidate_model.metadata["version"],
            reconstruction_error=round(scores["overall"],7),
            physiological_error=round(scores["physiological"],7),
            engineering_error=round(scores["engineering"],7),
            threshold=round(candidate_model.threshold,7),
            largest_reconstruction_errors=[
                {"channel":key,"error":round(scores["per_channel"][key],7)}
                for key in sorted(scores["per_channel"],
                                  key=scores["per_channel"].get,reverse=True)[:5]
            ],
            trained_model_evaluated=True,
        )
    # Comparison to the crew's simulator sequence-zero profile: never use
    # historical NASA lab values as engineering limits.
    engineering=evaluate_engineering(sid,second,frame["engineering_values"])
    quality_bad=scenario_id=="sensor" and frame["disturbance"]>.55
    quality="VERIFY_MEASUREMENT" if quality_bad else "NO_QUALITY_ISSUE_DETECTED"
    both=old_cnn["status"]=="MODEL_FLAG" and baseline["status"]=="MODEL_FLAG"
    context={
        "subject_id":sid,"sequence":second,"source":SOURCE,
        "status":"OBSERVE_UNUSUAL_PATTERN" if both else
                 "VERIFY_MEASUREMENT_QUALITY" if quality_bad else "NO_PATTERN_FLAG",
        "activity_state":"ACTIVE" if scenario_id=="exertion" else "REST",
        "quality":{"status":quality,"issues":["SUSPECT_SCRIPTED_SENSOR_SIGNAL"] if quality_bad else []},
        "context_source":"SCRIPTED_SCENARIO_DECLARATION_NOT_FULL_TEMPORAL_CONTEXT_MONITOR",
    }
    packet={"subject_id":sid,"sequence":second,"source":SOURCE,"values":frame["values"]}
    combined=compose_review(sid,second,packet,old_cnn,baseline,context,
                            candidate,engineering)
    # Deliberately make no claim that a Critical scripted training tier was
    # inferred by the CNN. The model may still flag old events after recovery.
    frame["model_evidence"]={
        "candidate_17ch":candidate,
        "five_channel_cnn":old_cnn,
        "statistical_comparator":baseline,
        "engineering_screen":engineering,
        "context":context,
        "unified":combined,
        "window_points":60,"reference_points":45,
        "prelude_generated_on_server":True,
        "model_evaluated_on_same_scenario_values":candidate_model is not None,
        "current_frame_inference":True,
    }
    frame["alarm"]={
        "active":bool(frame["alert"]),
        "status":"ACTIVE" if frame["alert"] else "CLEARED",
        "source":"SCRIPTED_CURRENT_VALUE_TRIGGER",
        "cleared":not frame["alert"],
        "model_novelty_may_persist_after_recovery":True,
        "voice_ready_script":("HealthGuard training. "+frame["guidance"]
                              if frame["alert"] else
                              "Training scenario measurements are below the active scripted trigger."),
        "autonomous_treatment":False,
        "clinical_validation":False,
    }
    return frame
