"""APDRA v0.1: explainable per-person biomarker deviation and recovery descriptions.

This is an exploratory visualization algorithm, NOT a clinical risk model.
It does not diagnose disease or recommend treatments. Screening thresholds
are analyst-configured heuristics, not medically validated cutoffs.
"""
from __future__ import annotations

import re
import numpy as np
import pandas as pd

COLS = ("subject_id", "timepoint", "biomarker", "value", "unit", "system", "phase", "source")


def parse_timepoint(label: str, mission_days: int = 3) -> float:
    """Convert L-92 / R+45 to mission-relative days; date strings handled separately.

    L±days are relative to launch. R+days are relative to return.
    The latter are shifted by mission_days. This is for plotting only.
    """
    t = str(label).strip().upper().replace(" ", "")
    m = re.fullmatch(r"([LR])([+-])(\d+)", t)
    if m:
        v = int(m.group(3)) * (1 if m.group(2) == "+" else -1)
        return float(v + (mission_days if m.group(1) == "R" else 0))
    try:
        return float(pd.Timestamp(label).toordinal())
    except (ValueError, TypeError, OverflowError):
        return np.nan


def infer_phase(label: str) -> str:
    s = str(label).upper().strip()
    if re.fullmatch(r"L-\d+", s):
        return "preflight"
    if re.fullmatch(r"R\+\d+", s):
        return "postflight"
    return "unspecified"


def normalize_measurements(df: pd.DataFrame) -> pd.DataFrame:
    """Accept explicitly mapped measurements, preserving units and source provenance."""
    essential = {"subject_id", "timepoint", "biomarker", "value", "unit"}
    missing = essential - set(df.columns)
    if missing:
        raise ValueError("Missing required columns: " + ", ".join(sorted(missing)))
    data = df.copy()
    if "system" not in data:
        data["system"] = "Not assigned"
    if "source" not in data:
        data["source"] = "user_upload"
    if "phase" not in data:
        data["phase"] = data["timepoint"].map(infer_phase)
    else:
        data["phase"] = data["phase"].fillna("").astype(str).str.lower().str.strip()
        blank = data["phase"].isin(["", "nan", "none"])
        data.loc[blank, "phase"] = data.loc[blank, "timepoint"].map(infer_phase)
    for col in ("subject_id", "timepoint", "biomarker", "unit", "system", "source"):
        data[col] = data[col].astype(str).str.strip()
    if (data[list(essential - {"value"})] == "").any().any():
        raise ValueError("Subject, timepoint, biomarker and unit must be provided")
    data["value"] = pd.to_numeric(data["value"], errors="coerce")
    if not np.isfinite(data["value"].to_numpy(dtype=float)).all():
        raise ValueError("Every measurement must have a finite numeric value")
    if not data["phase"].isin({"preflight", "postflight", "baseline", "monitoring", "unspecified"}).all():
        raise ValueError("Phase must be preflight, postflight, baseline, monitoring, or unspecified")
    # Never silently pool different units of the same biological analyte.
    unit_groups = data.groupby(["subject_id", "biomarker"])["unit"].nunique()
    if (unit_groups > 1).any():
        bad = unit_groups[unit_groups > 1].index[0]
        raise ValueError(f"Multiple units for {bad}. Convert explicitly before analysis")
    data["time_numeric"] = data.timepoint.map(parse_timepoint)
    # Preserve replicates, but block accidental duplicate records at identical points.
    duplicates = ["subject_id", "timepoint", "biomarker", "unit", "source"]
    if data.duplicated(duplicates).any():
        raise ValueError("Duplicate source/subject/biomarker/timepoint measurement detected")
    return data.reset_index(drop=True)


def analyze(df: pd.DataFrame, screening_percent: float = 30.0,
            z_screening: float = 3.5) -> pd.DataFrame:
    """Analyze deviations relative to explicitly labeled baseline/preflight values.

    The screening_percent is a transparent visualization threshold, not a
    reference interval or a medical alert. Sparse data never imply confidence.
    """
    if not (0 < screening_percent < 1000):
        raise ValueError("screening_percent must be positive")
    if z_screening <= 0:
        raise ValueError("z_screening must be positive")
    data = normalize_measurements(df)
    rows = []
    for (sid, marker, unit), group in data.groupby(["subject_id", "biomarker", "unit"], sort=True):
        baseline = group[group.phase.isin(["preflight", "baseline"])]["value"].to_numpy(float)
        baseline_count = len(baseline)
        center = float(np.median(baseline)) if baseline_count else np.nan
        mad = float(np.median(np.abs(baseline-center))) if baseline_count >= 3 else np.nan
        robust_scale = 1.4826 * mad if np.isfinite(mad) and mad > 0 else np.nan
        ordered = group.sort_values(["time_numeric", "timepoint"], na_position="last")
        # An R+ timepoint is a postflight observation; choose the earliest by time.
        post = ordered[ordered.phase == "postflight"]
        first_post = float(post.iloc[0].value) if len(post) else np.nan
        reference_distance = abs(first_post - center) if np.isfinite(center) and np.isfinite(first_post) else np.nan
        for obs in ordered.itertuples(index=False):
            deviation = float(obs.value - center) if baseline_count else np.nan
            is_npq = unit == "NPQ (log2)"
            # NPQ is log2 signal. A percent change of the log2 number is meaningless.
            pct = (100*deviation/abs(center) if baseline_count and center != 0
                   and not is_npq else np.nan)
            fold_change = (float(2**deviation) if is_npq and np.isfinite(deviation)
                           else np.nan)
            rz = deviation/robust_scale if np.isfinite(robust_scale) else np.nan
            if obs.phase in ("preflight", "baseline"):
                status = "Baseline observation"
            elif not baseline_count:
                status = "No personal baseline"
            elif baseline_count < 3 or not np.isfinite(robust_scale):
                # An absolute NPQ difference of one unit is a two-fold change
                # in the log2 relative signal, NOT an absolute protein concentration.
                screen = ((np.isfinite(deviation) and abs(deviation) >= 1.0)
                          if is_npq else (np.isfinite(pct) and abs(pct) >= screening_percent))
                status = "Screening deviation" if screen else "Insufficient baseline variability"
            elif abs(rz) >= z_screening:
                status = "Screening deviation"
            else:
                status = "No screening deviation"
            # A descriptive measure of proximity to preflight center, not recovery proof.
            proximity = np.nan
            if (obs.phase == "postflight" and np.isfinite(reference_distance)
                    and reference_distance > 0):
                proximity = 1 - abs(float(obs.value)-center)/reference_distance
            # Some source assays provide measured reference intervals. Keep this
            # distinct from personalized trend screening and clinical decisions.
            try:
                low = float(getattr(obs, "ref_low", np.nan))
            except (ValueError, TypeError):
                low = np.nan
            try:
                high = float(getattr(obs, "ref_high", np.nan))
            except (ValueError, TypeError):
                high = np.nan
            if np.isfinite(low) and float(obs.value) < low:
                range_status = "Below source reference interval"
            elif np.isfinite(high) and float(obs.value) > high:
                range_status = "Above source reference interval"
            elif np.isfinite(low) or np.isfinite(high):
                range_status = "Within available source interval"
            else:
                range_status = "No validated source interval supplied"
            rows.append({
                **{name: getattr(obs, name) for name in COLS},
                "time_numeric": obs.time_numeric,
                "baseline_n": baseline_count, "baseline_median": center,
                "baseline_mad": mad,
                "delta": deviation, "percent_change": pct,
                "fold_change_vs_personal_baseline": fold_change,
                "robust_z": rz,
                "baseline_proximity": proximity,
                "source_range_status": range_status,
                "source_reference_low": low,
                "source_reference_high": high,
                "screening_status": status,
                "screening_limit_percent": screening_percent,
            })
    return pd.DataFrame(rows)


def summarize(df: pd.DataFrame) -> dict:
    """Counts describe measurement records, not diagnosed conditions."""
    if df.empty:
        return {"subjects": 0, "biomarkers": 0, "measurements": 0, "screening_deviations": 0}
    return {
        "subjects": int(df.subject_id.nunique()),
        "biomarkers": int(df.biomarker.nunique()),
        "measurements": int(len(df)),
        "screening_deviations": int((df.screening_status == "Screening deviation").sum()),
    }
