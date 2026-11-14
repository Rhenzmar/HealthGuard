"""PhysioAlert v0.9: transparent, non-diagnostic monitoring observations.

This module creates review prompts, NOT medical diagnoses, clinical risk levels,
health scores, or emergency triage. It never interprets absence of a prompt as
proof of health. The underlying APDRA engine (stability.py) is unchanged.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

import pandas as pd

from physiograph.stability import characterize

ALERT_SCHEMA = (
    "alert_id", "subject_id", "biomarker", "unit", "source", "timepoint",
    "value", "phase", "system", "baseline_n", "baseline_median",
    "screening_stability", "source_interval_status", "trajectory_evidence",
    "review_category", "evidence_codes", "reason", "verification_actions",
    "interpretation_limit", "is_flagged",
)

# Not ranked by medical danger. The order is for displaying data-integrity
# questions first, then observational context.
REVIEW_CATEGORIES = (
    "Check measurement context",
    "Review source laboratory interval",
    "Review baseline reliability",
    "Review repeated deviation",
    "Review observed deviation",
    "No current verification prompt",
)


def stable_alert_id(row: pd.Series | dict[str, Any]) -> str:
    """Stable across reruns, independent of UI sorting or display thresholds.

    A changed measurement value creates a new alert. Pseudonyms are preserved;
    never put identifying medical history in a browser-side URL or log.
    """
    item = dict(row)
    fields = ("subject_id", "biomarker", "unit", "source", "timepoint", "value")
    value = float(item["value"])
    if not math.isfinite(value):
        raise ValueError("Cannot identify a non-finite measurement")
    payload = [str(item[k]) if k != "value" else format(value, ".15g") for k in fields]
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()[:24]
    return "obs_" + digest


def _latest_followup(evidence: pd.DataFrame) -> pd.DataFrame:
    nonbaseline = evidence[~evidence["phase"].isin(["preflight", "baseline"])].copy()
    if nonbaseline.empty:
        return nonbaseline
    return (nonbaseline.sort_values(["time_numeric", "timepoint"], na_position="first")
            .groupby(["subject_id", "biomarker", "unit", "source"], sort=True, dropna=False)
            .tail(1).copy())


def build_physioalerts(
    measurements: pd.DataFrame,
    *,
    threshold_percent: float = 30.0,
    threshold_npq: float = 1.0,
    already_characterized: bool = False,
    include_unflagged: bool = True,
) -> pd.DataFrame:
    """Build one explainable alert/review observation per latest marker/assay.

    Only the baseline-omission comparison and optional source laboratory
    interval are used. Source intervals are not necessarily suitable for a
    given astronaut and must be checked by the authorized medical team.
    No disease classification, numerical urgency, or inferred medical protocol.
    """
    evidence = (measurements.copy() if already_characterized else characterize(
        measurements, threshold_percent=threshold_percent, threshold_npq=threshold_npq))
    required = {
        "subject_id", "biomarker", "unit", "source", "timepoint", "value", "phase",
        "system", "time_numeric", "baseline_n", "baseline_median",
        "screening_stability", "source_interval_status", "trajectory_evidence",
    }
    if missing := required - set(evidence):
        raise ValueError(f"APDRA evidence is missing columns: {sorted(missing)}")
    latest = _latest_followup(evidence)
    if latest.empty:
        return pd.DataFrame(columns=list(ALERT_SCHEMA))
    rows = []
    for _, o in latest.iterrows():
        codes: list[str] = []
        reasons: list[str] = []
        actions: list[str] = []
        n = int(o["baseline_n"])
        stability = str(o["screening_stability"])
        interval = str(o["source_interval_status"])
        trajectory = str(o["trajectory_evidence"])
        unit = str(o["unit"])

        if n < 2 or stability.startswith(("Insufficient baseline", "Percent screening undefined")):
            codes.append("INSUFFICIENT_REFERENCE")
            reasons.append("Personal baseline is missing, sparse, or unsuitable for this comparison")
            actions.append("Verify sample dates, units and historical reference measurements")
        if n in (2, 3):
            codes.append("SPARSE_BASELINE_CONTEXT")
            reasons.append(f"Only {n} preflight/reference measurements are available")
        if interval in ("Below source interval", "Above source interval"):
            codes.append("OUTSIDE_SOURCE_INTERVAL")
            reasons.append("Measurement is outside an interval supplied with this assay")
            actions.append("Check whether that source laboratory interval applies to this person and assay")
        if stability == "Baseline-sensitive screen":
            codes.append("BASELINE_SENSITIVE")
            reasons.append("Exploratory screen changes when one baseline sample is omitted")
            actions.append("Inspect individual preflight measurements and verify the new result")
        elif stability.startswith("Consistent screening deviation"):
            codes.append("CONSISTENT_EXPLORATORY_SCREEN")
            reasons.append("Exploratory screen holds across the tested leave-one-out baselines")
            actions.append("Review the observed trend and relevant measurement context")
        if trajectory == "Farther from reference for every LOO baseline":
            codes.append("MOVING_AWAY_FROM_REFERENCE")
            reasons.append("Available later measurements are farther from the personal reference")
            actions.append("Review the sampling timeline; this is not a clinical recovery assessment")

        # Sparse baseline is context, but not a stand-alone alert when
        # there is no abnormality or data-quality problem.
        actionable = [x for x in codes if x != "SPARSE_BASELINE_CONTEXT"]
        if "INSUFFICIENT_REFERENCE" in actionable:
            category = "Check measurement context"
        elif "OUTSIDE_SOURCE_INTERVAL" in actionable:
            category = "Review source laboratory interval"
        elif "BASELINE_SENSITIVE" in actionable:
            category = "Review baseline reliability"
        elif "MOVING_AWAY_FROM_REFERENCE" in actionable:
            category = "Review repeated deviation"
        elif "CONSISTENT_EXPLORATORY_SCREEN" in actionable:
            category = "Review observed deviation"
        else:
            category = "No current verification prompt"
        if not actionable:
            reasons.append("No exploratory verification criterion was triggered; health status is undetermined")
        if not actions:
            actions = ["Continue recording measurements under authorized monitoring procedures"]
        if "OUTSIDE_SOURCE_INTERVAL" in codes or "CONSISTENT_EXPLORATORY_SCREEN" in codes:
            actions.append("Refer to authorized crew medical guidance if this is a real clinical concern")
        row = {key: o[key] for key in (
            "subject_id", "biomarker", "unit", "source", "timepoint", "value",
            "phase", "system", "baseline_n", "baseline_median", "screening_stability",
            "source_interval_status", "trajectory_evidence",
        )}
        row.update({
            "alert_id": stable_alert_id(o),
            "review_category": category,
            "evidence_codes": " | ".join(codes),
            "reason": "; ".join(reasons),
            "verification_actions": "; ".join(dict.fromkeys(actions)),
            "interpretation_limit": (
                "Exploratory monitoring observation only. Not a disease diagnosis, "
                "clinical urgency level, or authorization to change treatment. "
                "An unflagged result does not establish health or normality."
            ),
            "is_flagged": bool(actionable),
        })
        rows.append(row)
    out = pd.DataFrame(rows, columns=ALERT_SCHEMA)
    if not include_unflagged:
        out = out[out["is_flagged"]].copy()
    return out.sort_values(["is_flagged", "subject_id", "biomarker"],
                           ascending=[False, True, True]).reset_index(drop=True)
