"""Optional evidence-sourced reference-change calculation for positive-scale assays.

Not a clinical triage system. Applies a two-sided lognormal RCV with supplied
within-person and analytical coefficients of variation; never invents CVs.
The calculation compares a later value to *each observed preflight reading*,
not a fitted distribution from 2-3 astronaut samples. This is a conservative,
descriptive evidence-agreement check, not a medical conclusion.

Inspiration4 NPQ is a relative log2 signal, incompatible with concentration
CV assumptions here. It is intentionally rejected.
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import NormalDist
import math
import numpy as np

@dataclass(frozen=True)
class ReferenceChangeEvidence:
    label: str
    alpha: float
    baseline_count: int
    lower_percent: float
    upper_percent: float
    source: str
    direction_votes: tuple[int, ...]
    note: str


def assess_reference_change(
    baseline_values, later_value: float, *, unit: str,
    within_person_cv_percent: float, analytical_cv_percent: float,
    source: str, alpha: float = 0.05,
) -> ReferenceChangeEvidence:
    """Two-sided lognormal RCV per paired reading with external CVI and CVA.

    RCV up = exp(z*sqrt(2)*sqrt(log(1+CVI^2)+log(1+CVA^2)))-1
    RCV down = exp(-z*sqrt(2)*sqrt(...))-1. CV values are proportions inside.
    The comparison assumes positive-scale measurements and suitable external CVs.
    """
    if unit == 'NPQ (log2)':
        raise ValueError('NPQ is relative log2 signal, not a positive-scale concentration; RCV CV method is inapplicable')
    if not source or not source.strip():
        raise ValueError('A traceable source for within-person and laboratory CV values is required')
    if not 0 < alpha < 1:
        raise ValueError('alpha must be in (0,1)')
    vals = np.asarray(baseline_values, dtype=float)
    if vals.ndim != 1 or len(vals) < 2 or not np.isfinite(vals).all() or (vals <= 0).any():
        raise ValueError('At least two finite, strictly positive baseline observations are required')
    if not np.isfinite(later_value) or later_value <= 0:
        raise ValueError('The later value must be finite and strictly positive')
    cvs = (within_person_cv_percent, analytical_cv_percent)
    if any((not np.isfinite(x)) or x < 0 or x >= 100 for x in cvs) or all(x == 0 for x in cvs):
        raise ValueError('CVI and CVA must be plausible percentages, not both zero')
    cvi,cva = (x / 100. for x in cvs)
    scale = math.sqrt(math.log1p(cvi**2)+math.log1p(cva**2))
    log_cutoff = NormalDist().inv_cdf(1-alpha/2)*math.sqrt(2)*scale
    logratios = np.log(float(later_value)/vals)
    votes = tuple(int(np.sign(v)) if abs(v) > log_cutoff else 0 for v in logratios)
    if all(v > 0 for v in votes):
        label = 'Higher than every preflight reading by supplied RCV criteria'
    elif all(v < 0 for v in votes):
        label = 'Lower than every preflight reading by supplied RCV criteria'
    elif all(v == 0 for v in votes):
        label = 'No preflight comparison passes the supplied RCV criteria'
    else:
        label = 'Baseline-dependent RCV comparisons; verify supporting inputs'
    return ReferenceChangeEvidence(
        label=label,
        alpha=alpha,
        baseline_count=len(vals),
        lower_percent=100*(math.exp(-log_cutoff)-1),
        upper_percent=100*(math.exp(log_cutoff)-1),
        source=source.strip(),
        direction_votes=votes,
        note=('Research-only pairwise comparisons. The supplied CVI/CVA must match the biomarker, '
              'assay, specimen, lab conditions and context. A limited personal baseline and '
              'multiple comparisons are not independently validated clinical significance. '
              'Do not infer disease, medical fitness, or a required treatment.'),
    )
