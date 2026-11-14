"""Sparse time-aware biomarker trajectory descriptions, never recovery prognosis."""
from __future__ import annotations
from dataclasses import dataclass
import numpy as np
import pandas as pd

@dataclass(frozen=True)
class TrajectoryEvidence:
    label: str
    elapsed_days: float | None
    median_change_in_abs_distance_per_30_days: float | None
    fraction_omissions_closer: float | None
    note: str


def trajectory_between_baselines(df: pd.DataFrame) -> TrajectoryEvidence:
    """Compare first and last available postflight points with each LOO center.

    Uses real elapsed mission-relative days, not category spacing or a fitted
    curve. With sparse samples this cannot estimate clinical recovery kinetics.
    """
    req={'phase','value','time_numeric'}
    if not req.issubset(df.columns):
        raise ValueError('Required: phase, value and time_numeric')
    pre=df[df.phase.isin(['baseline','preflight'])]
    post=df[df.phase=='postflight'].sort_values('time_numeric')
    if len(pre)<2 or len(post)<2:
        return TrajectoryEvidence('Insufficient serial samples',None,None,None,
                                  'Need at least two reference and two postflight values')
    if post.time_numeric.isna().any():
        return TrajectoryEvidence('Postflight dates unavailable',None,None,None,
                                  'Timing cannot be determined from current metadata')
    start,end=post.iloc[0],post.iloc[-1]
    elapsed=float(end.time_numeric-start.time_numeric)
    if not elapsed>0:
        return TrajectoryEvidence('No positive time span',None,None,None,
                                  'Duplicate or non-increasing postflight dates')
    b=pre.value.to_numpy(float)
    centers=np.array([np.median(np.delete(b,i)) for i in range(len(b))])
    first_dist=np.abs(float(start.value)-centers)
    last_dist=np.abs(float(end.value)-centers)
    delta=first_dist-last_dist
    if (delta>1e-10).all():
        label='Closer to baseline across all omissions'
    elif (delta< -1e-10).all():
        label='Farther from baseline across all omissions'
    else:
        label='Baseline-sensitive or approximately unchanged'
    return TrajectoryEvidence(label,elapsed,float(np.median(delta))*30/elapsed,
                              float(np.mean(delta>1e-10)),
                              'Signed descriptive change in absolute distance per 30 elapsed days; '
                              'not recovery velocity, time-to-recovery, significance, or causal effect')
