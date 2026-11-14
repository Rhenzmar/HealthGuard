"""Aggregate APDRA observations for transparent cohort exploration.

Results are descriptions of measurement-level *heuristic* screens, not
biological abnormalities or significance tests. All denominators are explicit.
"""
from __future__ import annotations

import pandas as pd

CLASSES = (
    "Consistent exploratory screen",
    "Baseline-sensitive screen",
    "No consistent screen",
    "Cannot evaluate",
)


def classify_status(status: str) -> str:
    if str(status).startswith("Consistent screening deviation"):
        return CLASSES[0]
    if status == "Baseline-sensitive screen":
        return CLASSES[1]
    if status == "No consistent screening deviation":
        return CLASSES[2]
    return CLASSES[3]


def measurement_overview(evidence: pd.DataFrame) -> pd.DataFrame:
    """Counts and proportions per crew with an explicitly given denominator."""
    needed={"phase", "subject_id", "screening_stability"}
    if not needed.issubset(evidence.columns):
        raise ValueError(f"Missing columns: {sorted(needed-set(evidence.columns))}")
    post=evidence[~evidence.phase.isin(["preflight", "baseline"])].copy()
    if post.empty:
        return pd.DataFrame(columns=["subject_id", "class", "count", "denominator", "percent"])
    post["class"] = post.screening_stability.map(classify_status)
    totals=post.groupby("subject_id").size().rename("denominator")
    freq=post.groupby(["subject_id","class"]).size().rename("count").reset_index()
    freq=freq.merge(totals.reset_index(),on="subject_id",validate="many_to_one")
    freq["percent"] = 100 * freq["count"] / freq["denominator"]
    freq["class"] = pd.Categorical(freq["class"], categories=CLASSES, ordered=True)
    return freq.sort_values(["subject_id","class"]).reset_index(drop=True)
