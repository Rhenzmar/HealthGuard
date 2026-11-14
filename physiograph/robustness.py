"""Threshold-free diagnostic of sparse-baseline sensitivity.

The observed range of leave-one-out medians is NOT a confidence interval.
This module provides a continuous magnitude useful for checking how arbitrary
screening cutoffs influence labels, without inventing uncertainty estimates.
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass

@dataclass(frozen=True)
class Robustness:
    n_baseline: int
    direction: str
    minimum_omission_deviation: float | None
    maximum_omission_deviation: float | None
    deviation_unit: str
    median_center: float | None
    omission_centers: tuple[float, ...]
    note: str


def characterize_magnitude(baseline_values, later_value: float, unit: str) -> Robustness:
    baseline = np.asarray(baseline_values, float)
    if baseline.ndim != 1 or not np.isfinite(baseline).all() or not np.isfinite(later_value):
        raise ValueError('Finite one-dimensional baseline and follow-up required')
    if len(baseline) < 2:
        return Robustness(len(baseline),'Not assessable',None,None,'NPQ delta' if unit=='NPQ (log2)' else '%',
                          float(np.median(baseline)) if len(baseline) else None,(),
                          'At least 2 baseline observations needed for LOO analysis')
    centers=np.array([np.median(np.delete(baseline,i)) for i in range(len(baseline))])
    delta = later_value - centers
    if unit=='NPQ (log2)':
        strengths=abs(delta)
        outunit='log2 NPQ difference'
    else:
        if np.any(abs(centers)<1e-12):
            return Robustness(len(baseline),'Not assessable',None,None,'%',float(np.median(baseline)),
                              tuple(map(float,centers)), 'Percent change cannot be calculated from a zero LOO center')
        strengths=100*abs(delta)/abs(centers)
        outunit='% from LOO reference'
    direction=('Higher in all omissions' if (delta>0).all() else
               'Lower in all omissions' if (delta<0).all() else
               'Direction depends on baseline omission')
    minimum=float(strengths.min()) if direction!='Direction depends on baseline omission' else 0.
    return Robustness(len(baseline),direction,minimum,float(strengths.max()),outunit,
                      float(np.median(baseline)),tuple(map(float,centers)),
                      'Observed leave-one-out robustness magnitude, not a probability or reference interval')
