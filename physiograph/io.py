"""Explicit CSV input helpers. NASA transformed assays must be inspected and mapped."""
from __future__ import annotations
import re
import pandas as pd


def parse_inspiration4_sample(sample_name: str) -> tuple[str, str]:
    """Parse NASA OSD-575 sample IDs such as C001_serum_L-92 or C004_serum_R+45."""
    match = re.fullmatch(r"(C\d{3})_serum_([LR][+-]\d+)", str(sample_name).strip(), re.I)
    if not match:
        raise ValueError(f"Unrecognized Inspiration4 sample identifier: {sample_name}")
    return match.group(1).upper(), match.group(2).upper()


def from_nasa_wide(data: pd.DataFrame, sample_col: str, biomarker_cols: list[str],
                   unit: str, system: str, source: str = "NASA OSD-575") -> pd.DataFrame:
    """Convert user-inspected NASA transformed table to app schema.

    Do not auto-guess which numeric columns are biomarkers or their units.
    Callers must explicitly select both columns and the correct assay unit.
    """
    if sample_col not in data:
        raise ValueError(f"Sample column not found: {sample_col}")
    if not biomarker_cols or any(c not in data for c in biomarker_cols):
        raise ValueError("Choose biomarker columns present in the actual assay table")
    if not unit.strip():
        raise ValueError("Verify and enter the assay's unit; do not assume a unit")
    rows = []
    for _, record in data.iterrows():
        person, timepoint = parse_inspiration4_sample(record[sample_col])
        for marker in biomarker_cols:
            raw = pd.to_numeric(record[marker], errors="coerce")
            if pd.isna(raw):
                continue
            rows.append({"subject_id":person, "timepoint":timepoint, "biomarker":marker,
                         "value":float(raw), "unit":unit.strip(),"system":system,
                         "source":source})
    if not rows:
        raise ValueError("No finite numeric assay measurements in the chosen columns")
    return pd.DataFrame(rows)
