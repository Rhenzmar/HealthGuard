"""Source-aware, nonclinical multi-subsystem anomaly *screening*.

The five-parameter CNN is retained unchanged. This module connects the
independent synthetic engineering channels to transparent screening rules and
lets clients retrieve model evidence and engineering results side-by-side.

These bounds are DEMONSTRATION HEURISTICS, not NASA operational limits,
medical thresholds, trained model predictions, or disease classifications.
Historical NASA lab records are deliberately excluded from live monitoring.
"""
from __future__ import annotations

from math import isfinite
from typing import Any

from .engineering_sim import CREW_IDS, ENGINEERING_SOURCE, SIGNALS, engineering_snapshot
from .live_telemetry import METRICS, SOURCE as PHYS_SOURCE

LEVELS = ("OPTIMAL", "CHECK", "WARNING", "CRITICAL")
# Each tuple describes abs(value - nominal baseline) tiers for a
# deterministic *simulation*. Radiation and accumulated dose use independently
# scripted tolerances; these are NOT permissible exposure limits.
DELTA_LIMITS: dict[str, tuple[float, float, float]] = {
    "systolic_bp_mmhg": (12, 24, 36),
    "diastolic_bp_mmhg": (8, 16, 24),
    "peripheral_temp_c": (0.7, 1.3, 2.0),
    "etco2_mmhg": (5, 10, 16),
    "cabin_co2_ppm": (550, 1800, 3500),
    "cabin_o2_percent": (0.4, 1.2, 2.5),
    "cabin_pressure_kpa": (3, 10, 20),
    "cabin_temp_c": (3, 7, 11),
    "cabin_humidity_percent": (12, 23, 35),
    "radiation_rate_usv_h": (5, 50, 500),
    "cumulative_dose_usv": (50, 500, 5000),
    "suit_o2_remaining_percent": (14, 35, 60),
}


def _level(delta: float, thresholds: tuple[float, float, float]) -> str:
    if delta >= thresholds[2]:
        return "CRITICAL"
    if delta >= thresholds[1]:
        return "WARNING"
    if delta >= thresholds[0]:
        return "CHECK"
    return "OPTIMAL"


def evaluate_engineering(subject_id: str, sequence: int,
                         values: dict[str, float] | None = None) -> dict[str, Any]:
    """Evaluate 12 synthetic metrics against their per-crew nominal profile.

    Caller-provided values are allowed ONLY for a server-generated scripted
    scenario, not arbitrary user uploads. No missing-value imputation.
    """
    nominal = engineering_snapshot(subject_id, 0)
    current = engineering_snapshot(subject_id, sequence)
    observed = current["values"] if values is None else values
    if not isinstance(observed, dict) or set(observed) != set(SIGNALS):
        raise ValueError("Complete 12-channel engineering scenario required")
    results = {}
    for key, meta in SIGNALS.items():
        value = observed[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
            raise ValueError(f"Invalid synthetic engineering signal {key}")
        baseline = nominal["values"][key]
        delta = float(value) - baseline
        tier = _level(abs(delta), DELTA_LIMITS[key])
        results[key] = {
            "value": float(value), "unit": meta["unit"], "system": meta["system"],
            "baseline": baseline, "baseline_basis": "FIXED_FICTIONAL_SIMULATOR_PROFILE",
            "absolute_delta": round(abs(delta), 4), "status": tier,
            "screening_method": "DETERMINISTIC_ABSOLUTE_DELTA_RULE",
            "thresholds": dict(zip(LEVELS[1:], DELTA_LIMITS[key])),
            "source": ENGINEERING_SOURCE, "measurement_origin": meta["origin"],
            "clinical_validation": False,
        }
    peak = max((results[k]["status"] for k in results), key=LEVELS.index)
    return {
        "subject_id": subject_id, "sequence": sequence,
        "source": ENGINEERING_SOURCE,
        "screening_basis": "SIMULATOR_DEVIATION_ONLY_NOT_MEDICAL_THRESHOLDS",
        "status": peak,
        "channels_evaluated": len(results),
        "channels": results,
        "flagged_channels": [key for key, item in results.items() if item["status"] != "OPTIMAL"],
        "clinical_validation": False, "validated_operational_limits": False,
        "disclaimer": "This detects changes in fictional engineering numbers only, not medical risk or spacecraft safety.",
    }


def combined_live_review(subject_id: str, packet: dict, cnn: dict,
                         comparator: dict, context: dict, engineering: dict) -> dict:
    """Report every live channel's detector evidence without claiming one AI
    learned all channel types. Structured, provenance-preserving integration.
    """
    sequence = packet["sequence"]
    if packet["subject_id"] != subject_id or packet.get("source") != PHYS_SOURCE:
        raise ValueError("Wrong live physiological source or subject")
    for item in (cnn, comparator, context, engineering):
        if item.get("subject_id") != subject_id or item.get("sequence") != sequence:
            raise ValueError("Cross-subject or out-of-sequence evidence rejected")
    if engineering.get("source") != ENGINEERING_SOURCE:
        raise ValueError("Only fictional engineering evidence supported")
    physiological = {
        "source": PHYS_SOURCE, "channels_evaluated": len(METRICS),
        "channels": list(METRICS), "cnn_status": cnn.get("status"),
        "statistical_status": comparator.get("status"),
        "context_status": context.get("status"),
        "screening_method": "EXISTING_FIVE_CHANNEL_CNN_AND_STATISTICAL_NOVELTY",
        "clinical_validation": False,
        "interpretation": "Model flags indicate multichannel numerical novelty; not diagnoses or channel-specific disease predictions.",
    }
    return {
        "subject_id": subject_id, "sequence": sequence,
        "mode": "MULTISYSTEM_EXPERIMENTAL_SCREENING",
        "live_channels_evaluated": len(METRICS) + engineering["channels_evaluated"],
        "physiological": physiological,
        "engineering": engineering,
        "training_status": engineering["status"],
        "training_status_basis": "ENGINEERING_SIMULATION_ONLY",
        "historical_nasa_biomarkers_in_live_inference": False,
        "clinical_validation": False,
        "disclaimer": "No unified medical emergency score. Physiological models, synthetic engineering deviations, and separate historical NASA research are distinct evidence sources.",
    }


SCENARIO_IDS = frozenset({"co2", "cabin_leak", "radiation"})
SCENARIO_LENGTH = 64


def scripted_environment_review(subject_id: str, scenario: str, second: int) -> dict:
    """Use the very same engineering screening for an evolving training event.

    This endpoint does not pretend the frozen CNN analyzed local scenario
    values. Only scripted engineering observations are evaluated.
    """
    if subject_id not in CREW_IDS:
        raise ValueError("Unknown fictional crew subject")
    if scenario not in SCENARIO_IDS:
        raise ValueError("Unsupported engineering scenario")
    if type(second) is not int or not 0 <= second <= SCENARIO_LENGTH:
        raise ValueError("Scenario second must be between 0 and 64")
    from math import sin
    # Mirror the scripted scenario's onset/peak/recovery envelope.
    disturbance = min(1.0, max(0.0, (second - 8) / 18)) * (
        1 - min(1.0, max(0.0, (second - 44) / 18))
    )
    vals = engineering_snapshot(subject_id, second)["values"].copy()
    if scenario == "co2":
        vals["cabin_co2_ppm"] = round(vals["cabin_co2_ppm"] + 5400 * disturbance, 1)
    elif scenario == "cabin_leak":
        vals["cabin_pressure_kpa"] = round(vals["cabin_pressure_kpa"] - 27 * disturbance, 2)
    elif scenario == "radiation":
        vals["radiation_rate_usv_h"] = round(vals["radiation_rate_usv_h"] + 2200 * disturbance, 2)
    evidence = evaluate_engineering(subject_id, second, vals)
    return {
        "scenario": scenario, "elapsed_seconds": second, "disturbance": round(disturbance, 4),
        "origin": "SERVER_SCRIPTED_TRAINING_SCENARIO",
        "model_applied_to_scenario": False,
        "engineering_review": evidence,
        "warning": "Scripted training thresholds only; not actual NASA readings, clinical limits, or operational procedures.",
    }

def screen_historical_biomarkers(records: list[dict], *, subject_id: str,
                                 assay: str) -> dict:
    """Screen within-assay observed postflight changes, with no disease labels.

    All five lab assays use original NASA OSDR S3 transformed files with verified
    SHA-256 provenance. OSD-569 C003 L-92 CBC observations need QC review.
    Screens are analytic illustrations using pre-declared magnitude thresholds,
    NOT probabilities, clinical reference change values or risk grades.
    """
    from statistics import median
    if subject_id not in {'C001','C002','C003','C004'}:
        raise ValueError("Historical participant identifier required")
    if assay not in {'CBC','CMP','NULISA','ALAMAR_NPQ','EVE_IMMUNE','EVE_CARDIOVASCULAR'}:
        raise ValueError("Unsupported historical assay")
    groups: dict[tuple[str,str], list[dict]]={}
    for rec in records:
        if rec.get('subject_id')!=subject_id or rec.get('assay')!=assay:
            continue
        key=(rec['biomarker'],rec['unit'])
        groups.setdefault(key,[]).append(rec)
    output=[]
    for (name,unit),group in sorted(groups.items()):
        baseline=[float(rec['value']) for rec in group
                  if rec.get('phase')=='preflight' and rec.get('qc_status')!='SOURCE_OUTLIER_REQUIRES_REVIEW' and
                  isinstance(rec.get('value'),(float,int)) and
                  isfinite(float(rec['value']))]
        post=[rec for rec in group if rec.get('phase')=='postflight' and rec.get('qc_status')!='SOURCE_OUTLIER_REQUIRES_REVIEW' and
              isinstance(rec.get('value'),(float,int)) and
              isfinite(float(rec['value']))]
        post=sorted(post,key=lambda rec:int(str(rec['timepoint'])[2:]) if
                    str(rec.get('timepoint','')).startswith('R+') else 10**9)
        latest=post[-1] if post else None
        center=median(baseline) if baseline else None
        signal='NPQ' in unit.upper()
        delta=(float(latest['value'])-center) if latest is not None and center is not None else None
        percent=(100*delta/abs(center)) if delta is not None and center != 0 and not signal else None
        flagged=(abs(delta)>=1.0 if signal else abs(percent)>=30.0) if (
            delta is not None and (signal or percent is not None)) else None
        status=('NO_POSTFLIGHT_OBSERVATION' if latest is None else
                'NO_PERSONAL_BASELINE' if center is None else
                'NO_COMPARABLE_BASELINE' if flagged is None else
                'SCREENING_DEVIATION' if flagged else 'NO_SCREENING_DEVIATION')
        output.append({
            'biomarker':name,'unit':unit,'observations':len(group),
            'baseline_n':len(baseline),'baseline_median':center,
            'quality_excluded_observations':sum(x.get('qc_status')=='SOURCE_OUTLIER_REQUIRES_REVIEW' for x in group),
            'latest_postflight_value':latest['value'] if latest else None,
            'latest_postflight_timepoint':latest['timepoint'] if latest else None,
            'latest_sample_id':latest.get('sample_id') if latest else None,
            'delta':round(delta,6) if delta is not None else None,
            'percent_change':round(percent,3) if percent is not None else None,
            'screening_status':status,'screening_method':(
                'ABSOLUTE_1_LOG2_NPQ_DIFFERENCE' if signal else
                'ABSOLUTE_30_PERCENT_CHANGE'),
            'source':latest.get('source') if latest else group[0].get('source'),
            'source_reference_interval_used_for_flag':False,
            'clinical_validation':False,
        })
    return {
        'subject_id':subject_id,'assay':assay,
        'source_kind':'NASA_OSDR_VERIFIED_HISTORICAL_LABS',
        'scope':'HISTORICAL_SPARSE_BIOMARKER_SCREENING_NOT_LIVE',
        'total_biomarkers':len(output),
        'screening_deviations':sum(x['screening_status']=='SCREENING_DEVIATION' for x in output),
        'biomarkers':output,'clinical_validation':False,
        'warning':('Exploratory historical change screening only; not medical risk, '
                   'a validated reference-change calculation, or clinical status. '
                   'CBC observations requiring QC are excluded from screening baselines and retained in source tables.')
    }
