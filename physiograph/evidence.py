"""Evidence interpretation helpers for the nonclinical APDRA Research Explorer.

Produces measurement-review descriptions, not diagnoses, confidence intervals,
clinical severity scores, or treatment instructions.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def latest_nonbaseline(evidence: pd.DataFrame) -> pd.Series | None:
    """Choose the last actual monitoring/postflight observation by numerical time."""
    if evidence.empty:
        return None
    present = evidence[~evidence.phase.isin(["preflight", "baseline"])]
    if present.empty:
        return None
    return present.sort_values(["time_numeric", "timepoint"], na_position="last").iloc[-1]


def report(evidence: pd.DataFrame) -> dict:
    """Return transparent fields for one subject and biomarker, no opaque scores."""
    if evidence.empty:
        raise ValueError("No evidence supplied")
    latest = latest_nonbaseline(evidence)
    baseline_n = int(evidence.baseline_n.iloc[0])
    center = float(evidence.baseline_median.iloc[0])
    valid_center = np.isfinite(center)
    if latest is None:
        return {
            "summary": "Only baseline measurements available. Add a later reading to evaluate change.",
            "direction": "No later measurement",
            "baseline_n": baseline_n,
            "baseline_center": center if valid_center else None,
            "baseline_sensitivity": "Not applicable",
            "trend": "Not assessable",
            "source_interval": "Not assessable",
            "measurement_review": "No subsequent measurement",
            "latest_timepoint": None,
            "latest_value": None,
            "delta": None,
            "relative_change": None,
            "npq_fold": None,
            "loo_span": None,
        }
    delta = float(latest.delta) if pd.notna(latest.delta) else np.nan
    if not valid_center:
        magnitude = "No personal baseline is available."
        direction = "Cannot establish direction"
    elif latest.unit == "NPQ (log2)":
        ratio = float(latest.npq_signal_fold_vs_median)
        magnitude = f"{delta:+.2f} log2 NPQ units (approximately {ratio:.2f}× relative signal)"
        direction = "Higher" if delta > 0 else "Lower" if delta < 0 else "Unchanged"
    elif abs(center) < 1e-12:
        magnitude = f"{delta:+.3g} {latest.unit}; percent change is undefined at a zero baseline"
        direction = "Higher" if delta > 0 else "Lower" if delta < 0 else "Unchanged"
    else:
        relative = 100 * delta / abs(center)
        magnitude = f"{relative:+.1f}% from the individual's observed preflight median"
        direction = "Higher" if delta > 0 else "Lower" if delta < 0 else "Unchanged"
    lo, hi = latest.loo_reference_min, latest.loo_reference_max
    span = (float(lo), float(hi)) if pd.notna(lo) and pd.notna(hi) else None
    return {
        "summary": f"At {latest.timepoint}, the observed change is {magnitude}. This is descriptive, not evidence of clinical harm.",
        "direction": direction,
        "baseline_n": baseline_n,
        "baseline_center": center if valid_center else None,
        "baseline_sensitivity": str(latest.screening_stability),
        "trend": str(latest.trajectory_evidence),
        "source_interval": str(latest.source_interval_status),
        "measurement_review": str(latest.measurement_review),
        "latest_timepoint": str(latest.timepoint),
        "latest_value": float(latest.value),
        "delta": float(delta) if np.isfinite(delta) else None,
        "relative_change": (float(100*delta/abs(center)) if valid_center and
                            abs(center) > 1e-12 and latest.unit != "NPQ (log2)" else None),
        "npq_fold": (float(latest.npq_signal_fold_vs_median) if latest.unit == "NPQ (log2)" and valid_center else None),
        "loo_span": span,
    }
