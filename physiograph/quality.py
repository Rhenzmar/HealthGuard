"""Strict monitoring-input checks to avoid misleading source and time comparisons."""
from __future__ import annotations

import re
import numpy as np
import pandas as pd


def validate_monitoring_input(data: pd.DataFrame) -> pd.DataFrame:
    """Review a normalized long-format frame; return it without modifying values.

    Do not mix mission-relative and ISO dates in the same analyte/source series.
    Verify source interval boundaries if explicitly supplied. Baselines must
    precede followups, preventing a later result from leaking into its own
    comparison reference. This is a software integrity check, not clinical QC.
    """
    if data.empty:
        raise ValueError("No measurement rows were supplied")
    for col in ("subject_id", "biomarker", "source", "timepoint"):
        if col not in data:
            raise ValueError(f"Missing data column: {col}")
    iso = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
    relative = re.compile(r"[LR][+-]\d+\Z", re.IGNORECASE)
    for (person,marker,source), group in data.groupby(["subject_id","biomarker","source"],sort=True):
        formats = set()
        for tp in group.timepoint:
            if relative.fullmatch(str(tp)):
                formats.add("relative")
            elif iso.fullmatch(str(tp)):
                try: pd.to_datetime(str(tp),format="%Y-%m-%d",errors="raise")
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"Invalid date {tp} for {person}/{marker}") from exc
                formats.add("date")
            else:
                raise ValueError(f"Timepoint {tp} must use YYYY-MM-DD, L-xx or R+xx")
        if len(formats)>1:
            raise ValueError(f"Mixed calendar and mission-relative dates for {person}/{marker}/{source}")
        past = group[group.phase.isin(["preflight","baseline"])]
        later = group[~group.phase.isin(["preflight","baseline"])]
        if len(past) and len(later):
            if float(past.time_numeric.max()) >= float(later.time_numeric.min()):
                raise ValueError(f"Baseline date must precede follow-up date for {person}/{marker}/{source}")
    lows = pd.Series(np.nan,index=data.index,dtype=float)
    highs = pd.Series(np.nan,index=data.index,dtype=float)
    for key, array in (("ref_low",lows),("ref_high",highs)):
        if key in data.columns:
            raw = data[key]
            defined = raw.notna() & raw.astype(str).str.strip().ne("")
            # nan strings count as missing when read from manually constructed forms
            defined &= raw.astype(str).str.lower().ne("nan")
            vals = pd.to_numeric(raw,errors="coerce")
            if (defined & ~np.isfinite(vals)).any():
                raise ValueError(f"Invalid source reference interval value in {key}")
            array[:] = vals
    if (np.isfinite(lows) & np.isfinite(highs) & (lows>highs)).any():
        raise ValueError("Source reference interval lower bound exceeds upper bound")
    return data
