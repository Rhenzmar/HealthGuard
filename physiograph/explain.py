"""Offline explanations generated strictly from computed APDRA records."""
from __future__ import annotations
import math


def explain_row(row: dict) -> str:
    person = row["subject_id"]
    marker = row["biomarker"]
    point = row["timepoint"]
    status = row["screening_status"]
    n = int(row["baseline_n"])
    if n == 0:
        return (f"{person}: {marker} at {point} has no explicitly supplied personal "
                "baseline. No deviation or clinical interpretation is possible.")
    delta = row["delta"]
    center = row["baseline_median"]
    verb = "above" if delta > 0 else "below" if delta < 0 else "equal to"
    wording = (f"{person}: {marker} at {point} is {verb} the median of {n} "
               f"baseline measurement(s) ({center:.4g} {row['unit']}).")
    pct = row["percent_change"]
    fold = row.get("fold_change_vs_personal_baseline")
    if row["unit"] == "NPQ (log2)":
        wording += f" The difference on the log2 NPQ scale is {delta:+.3f}."
        if fold is not None and isinstance(fold,(int,float)) and math.isfinite(fold):
            wording += f" This corresponds to an estimated {fold:.3g}-fold relative signal versus that individual's preflight median."
        wording += " This is relative protein signal, not absolute concentration or a clinical risk estimate."
    elif pct is not None and isinstance(pct, (float, int)) and math.isfinite(pct):
        wording += f" The difference from that median is {pct:+.1f}%."
    range_status = str(row.get("source_range_status", ""))
    if range_status in ("Below source reference interval", "Above source reference interval"):
        wording += f" The measurement is {range_status.lower()} in the supplied assay file."
        wording += " Verify the measurement context and use approved medical review procedures; the research prototype does not diagnose conditions."
    if status == "Screening deviation":
        wording += (" This exceeds an exploratory screening criterion. Verify the "
                    "measurement and consult the relevant approved medical process "
                    "if the reading warrants review; this is not a diagnosis.")
    elif status == "Insufficient baseline variability":
        wording += " There are too few baseline measurements to estimate reliable variability."
    else:
        wording += " A statistical screening label does not establish medical normality."
    return wording
