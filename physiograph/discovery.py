"""Pure display and comparison data for PHYSIOGRAPH's evidence-first dashboard.

These functions do not alter the frozen APDRA algorithm. They operate on
measurement-level exploratory screens, NOT clinical diagnostic labels.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from physiograph.overview import classify_status, CLASSES

HEATMAP_CODES = {
    "No consistent screen": 0,
    "Baseline-sensitive screen": 1,
    "Consistent exploratory screen": 2,
    "Cannot evaluate": 3,
}


def median_vs_apdra(evidence: pd.DataFrame, *, cmp_threshold: float = 30.0,
                    npq_threshold: float = 1.0) -> pd.DataFrame:
    """Align median-only and leave-one-out rules on the SAME later observations.

    NPQ uses absolute log2 differences. Clinical-unit analytes use relative
    differences (only for nonzero personal baseline). No between-analyte pooling.
    """
    if not 0 < cmp_threshold < 1000 or not 0 < npq_threshold < 100:
        raise ValueError("Screening thresholds must be positive and within supported bounds")
    need = {"phase", "value", "unit", "baseline_median", "baseline_n", "screening_stability"}
    if not need.issubset(evidence):
        raise ValueError(f"Missing fields: {sorted(need-set(evidence.columns))}")
    post = evidence[~evidence.phase.isin(["preflight", "baseline"])].copy()
    if post.empty:
        post["median_flagged"] = pd.Series(dtype=bool)
        post["apdra_consistent"] = pd.Series(dtype=bool)
        post["flag_not_stable"] = pd.Series(dtype=bool)
        return post
    v = pd.to_numeric(post.value, errors="coerce").to_numpy(float)
    center = pd.to_numeric(post.baseline_median, errors="coerce").to_numpy(float)
    n = pd.to_numeric(post.baseline_n, errors="coerce").to_numpy(float)
    npq = post.unit.eq("NPQ (log2)").to_numpy(bool)
    diff = np.abs(v-center)
    with np.errstate(divide="ignore", invalid="ignore"):
        pct = 100. * diff / np.abs(center)
    allowed = np.isfinite(v)&np.isfinite(center)&(n>=2)
    flags = allowed & np.where(npq, diff >= npq_threshold,
                               (np.abs(center)>1e-12)&(pct>=cmp_threshold))
    post["median_flagged"] = flags
    post["apdra_consistent"] = post.screening_stability.str.startswith("Consistent screening deviation").fillna(False).astype(bool)
    post["flag_not_stable"] = post.median_flagged & ~post.apdra_consistent
    post["evidence_class"] = post.screening_stability.map(classify_status)
    return post


def comparison_summary(assays: dict[str, pd.DataFrame]) -> dict:
    """Aggregate comparison conditional on median-screened readings.

    There are repeated correlated readings from FOUR crew members. Never
    interpret the counts as independent participant outcomes.
    """
    pieces = [df for df in assays.values()]
    if not pieces:
        raise ValueError("At least one assay is required")
    all_post = pd.concat(pieces, ignore_index=True)
    flagged = int(all_post.median_flagged.sum())
    unstable = int(all_post.flag_not_stable.sum())
    return {
        "later_readings": int(len(all_post)),
        "median_flagged": flagged,
        "not_stable": unstable,
        "stable": flagged-unstable,
        "conditional_percent": 100.0*unstable/flagged if flagged else None,
    }


def snapshot_heatmap(evidence: pd.DataFrame, *, timepoint: str, markers: list[str] | None = None):
    """Return numerical status matrix for one assay and one sampled timepoint.

    Columns are crew IDs, rows are biomarkers. Every cell is a reading-level
    status; unmeasured cells are NaN, not a presumed normal result.
    """
    selected = evidence[(evidence.phase == "postflight") & (evidence.timepoint == timepoint)].copy()
    if markers is not None:
        selected = selected[selected.biomarker.isin(markers)]
    if selected.empty:
        return pd.DataFrame()
    selected["screen_class"] = selected.screening_stability.map(classify_status)
    selected["code"] = selected.screen_class.map(HEATMAP_CODES)
    if selected.duplicated(["subject_id", "biomarker"]).any():
        raise ValueError("Multiple assays / units for one biomarker: select an assay first")
    result = selected.pivot(index="biomarker", columns="subject_id", values="code")
    return result.sort_index()


def rank_markers(evidence: pd.DataFrame, *, limit: int = 35) -> list[str]:
    """Order markers by the number of baseline-sensitive postflight readings.

    This is a *display order*, not a clinical risk ranking.
    """
    if limit <= 0:
        return []
    post = evidence[evidence.phase == "postflight"]
    if post.empty:
        return []
    freq = (post.assign(sensitive=post.screening_stability.eq("Baseline-sensitive screen").astype(int))
            .groupby("biomarker").sensitive.sum()
            .sort_values(ascending=False,kind="stable"))
    return list(freq.head(limit).index)


def crew_summary(evidence: pd.DataFrame) -> pd.DataFrame:
    """Exploratory counts by crew with denominators, not medical risk scores."""
    post = evidence[~evidence.phase.isin(["preflight", "baseline"])].copy()
    if post.empty:
        return pd.DataFrame(columns=["Crew", "Later readings", "Consistent", "Baseline-sensitive", "Not screened", "Cannot evaluate"])
    post["category"] = post.screening_stability.map(classify_status)
    pivot = pd.crosstab(post.subject_id,post.category)
    for v in CLASSES:
        if v not in pivot:
            pivot[v] = 0
    pivot = pivot.reindex(columns=CLASSES)
    result = pivot.reset_index().rename(columns={"subject_id":"Crew",
        "Consistent exploratory screen":"Consistent",
        "Baseline-sensitive screen":"Baseline-sensitive",
        "No consistent screen":"Not screened"})
    result.insert(1,"Later readings",result[["Consistent","Baseline-sensitive","Not screened","Cannot evaluate"]].sum(axis=1))
    return result
