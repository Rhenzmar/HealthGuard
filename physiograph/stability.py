"""APDRA v0.3: baseline-sensitivity analysis for sparse repeated biomarkers.

An evidence-characterization algorithm, NOT a medical prediction or
statistical significance test. A `stable` designation means the *heuristic*
result survives omission of any one observed baseline sample, not that
any clinical or population effect is established.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from physiograph.apdra import normalize_measurements


def _exceeds(value: float, center: float, unit: str, threshold_percent: float,
             threshold_npq: float) -> bool:
    if unit == "NPQ (log2)":
        return abs(value - center) >= threshold_npq - 1e-12
    if abs(center) < 1e-12:
        return False  # percent relative change is undefined at zero baseline
    return 100.0 * abs(value - center) / abs(center) >= threshold_percent - 1e-12


def characterize(df: pd.DataFrame, *, threshold_percent: float = 30.0,
                 threshold_npq: float = 1.0) -> pd.DataFrame:
    """Review individual observations against leave-one-baseline-out centers.

    For each person+biomarker+unit, the leave-one-out (LOO) centers are the
    medians of all explicitly labeled baseline/preflight values except one.
    This is a *sensitivity check*, not a confidence/credible interval.

    Status `consistent screening deviation` means the threshold is exceeded
    with the SAME direction under *every* LOO center. `baseline-sensitive`
    means omitting some baseline observation changes the screening conclusion
    or its direction. It is not safe to interpret any of these as pathology.
    """
    if not (0 < threshold_percent <= 1000):
        raise ValueError("threshold_percent must be in (0, 1000]")
    if not (0 < threshold_npq <= 100):
        raise ValueError("threshold_npq must be in (0, 100]")
    data = normalize_measurements(df)
    records: list[dict] = []
    for (person, marker, unit, provenance), subset in data.groupby(
        ["subject_id", "biomarker", "unit", "source"], sort=True
    ):
        ordered = subset.sort_values(["time_numeric", "timepoint"], na_position="last")
        reference = ordered[ordered.phase.isin(["preflight", "baseline"])]
        baseline = reference.value.to_numpy(float)
        n = len(baseline)
        center = float(np.median(baseline)) if n else np.nan
        baseline_min = float(baseline.min()) if n else np.nan
        baseline_max = float(baseline.max()) if n else np.nan
        centers = np.array(
            [np.median(np.delete(baseline, i)) for i in range(n)], dtype=float
        ) if n >= 2 else np.array([], dtype=float)
        # User-entered monitoring observations also form a serial follow-up
        # sequence. This does not change the frozen baseline screening rule.
        post = ordered[ordered.phase.isin(["postflight", "monitoring"])]
        first_post = float(post.iloc[0].value) if len(post) else np.nan
        post_samples = len(post)
        sorted_postpoints = list(post.timepoint)
        for obs in ordered.itertuples(index=False):
            phase = str(obs.phase)
            v = float(obs.value)
            if phase in ("preflight", "baseline"):
                deviation_status = "Preflight/reference sample"
                review = "Reference measurement"
                stable_sign = "not applicable"
                fraction = np.nan
            elif n < 2:
                deviation_status = "Insufficient baseline for stability check"
                review = "Establish or verify baseline"
                stable_sign = "unknown"
                fraction = np.nan
            elif unit != "NPQ (log2)" and np.any(np.abs(centers) < 1e-12):
                deviation_status = "Percent screening undefined at zero reference"
                review = "Check baseline scale and measurement units"
                stable_sign = "unknown"
                fraction = np.nan
            else:
                deviations = v - centers
                significant_signs = np.array([
                    np.sign(delta) if _exceeds(v, c, unit, threshold_percent, threshold_npq)
                    else 0 for c, delta in zip(centers, deviations)
                ])
                fraction = float(np.mean(significant_signs != 0))
                if np.all(significant_signs > 0):
                    deviation_status = "Consistent screening deviation (higher)"
                    stable_sign = "higher"
                    review = "Review observed deviation"
                elif np.all(significant_signs < 0):
                    deviation_status = "Consistent screening deviation (lower)"
                    stable_sign = "lower"
                    review = "Review observed deviation"
                elif np.any(significant_signs != 0):
                    deviation_status = "Baseline-sensitive screen"
                    stable_sign = "uncertain"
                    review = "Verify baseline and repeat reading"
                else:
                    deviation_status = "No consistent screening deviation"
                    stable_sign = "not screened"
                    review = "No deviation screen; continue routine monitoring"
            if phase not in ("postflight", "monitoring") or n < 2 or post_samples < 2:
                trajectory = "Not enough postflight or baseline observations"
                recovery_fraction = np.nan
            elif obs.timepoint == sorted_postpoints[0]:
                trajectory = "First available postflight sample"
                recovery_fraction = 0.0
            else:
                # Only compare existing observations: no interpolated in-flight data.
                earlier = np.abs(first_post - centers)
                later = np.abs(v - centers)
                with np.errstate(invalid="ignore", divide="ignore"):
                    ratios = np.where(earlier > 1e-12, (earlier - later) / earlier, np.nan)
                recovery_fraction = float(np.nanmedian(ratios)) if np.isfinite(ratios).any() else np.nan
                if np.all(later < earlier - 1e-10):
                    trajectory = "Closer to reference for every LOO baseline"
                elif np.all(later > earlier + 1e-10):
                    trajectory = "Farther from reference for every LOO baseline"
                else:
                    trajectory = "Reference-sensitive or unchanged trajectory"
            # The original file's source laboratory interval is a distinct
            # quality/context marker, not an astronaut fitness threshold.
            low = pd.to_numeric(getattr(obs, "ref_low", np.nan), errors="coerce")
            high = pd.to_numeric(getattr(obs, "ref_high", np.nan), errors="coerce")
            interval_status = "No source interval"
            if np.isfinite(low) and v < low:
                interval_status = "Below source interval"
            elif np.isfinite(high) and v > high:
                interval_status = "Above source interval"
            elif np.isfinite(low) or np.isfinite(high):
                interval_status = "Inside available source interval"
            # Do not suppress interval context even if the individual median is similar.
            if phase not in ("preflight", "baseline") and interval_status in (
                "Below source interval", "Above source interval"
            ):
                review = "Review source laboratory interval and measurement"
            records.append({
                "subject_id": person, "biomarker": marker, "unit": unit,
                "timepoint": obs.timepoint, "phase": phase, "system": obs.system,
                "source": obs.source, "value": v, "time_numeric": obs.time_numeric,
                "baseline_n": n, "baseline_median": center,
                "baseline_support": ("3+ sparse observations" if n >= 3 else
                                     "2 observations only" if n == 2 else
                                     "fewer than 2 observations"),
                "baseline_observed_min": baseline_min, "baseline_observed_max": baseline_max,
                "loo_reference_min": float(centers.min()) if len(centers) else np.nan,
                "loo_reference_max": float(centers.max()) if len(centers) else np.nan,
                "delta": v - center if n else np.nan,
                "npq_signal_fold_vs_median": float(2.0 ** (v - center))
                    if unit == "NPQ (log2)" and n else np.nan,
                "screening_stability_fraction": fraction,
                "screening_stability": deviation_status,
                "screening_direction": stable_sign,
                "trajectory_evidence": trajectory,
                "distance_return_fraction": recovery_fraction,
                "source_interval_status": interval_status,
                "measurement_review": review,
                "screening_percent_heuristic": threshold_percent,
                "screening_npq_heuristic": threshold_npq,
            })
    return pd.DataFrame.from_records(records)


def summary(df: pd.DataFrame) -> dict[str, int]:
    post = df[~df.phase.isin(["preflight", "baseline"])]
    status = post.screening_stability if len(post) else pd.Series([], dtype=str)
    return {
        "individuals": int(df.subject_id.nunique()),
        "unique_biomarker_names": int(df.biomarker.nunique()),
        "reviewed_nonbaseline_measurements": int(len(post)),
        "consistent_deviations": int(status.str.startswith("Consistent screening deviation").sum()),
        "baseline_sensitive_screens": int((status == "Baseline-sensitive screen").sum()),
        "unassessable_baselines": int((status == "Insufficient baseline for stability check").sum()),
    }
