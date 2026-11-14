"""Transparent, non-clinical measurement verification queue.

Review labels are NOT medical urgency rankings. They help researchers and crew
spot record-quality issues and inspect observations in a structured order.
"""
from __future__ import annotations
import pandas as pd

COLUMNS = ('subject_id','biomarker','unit','source','timepoint','value',
           'review_category','reason','baseline_n','screening_stability',
           'source_interval_status','trajectory_evidence')


def build_review_queue(evidence: pd.DataFrame) -> pd.DataFrame:
    required = {'subject_id','biomarker','unit','source','timepoint','value','time_numeric',
                'phase','baseline_n','screening_stability','source_interval_status','trajectory_evidence'}
    if not required.issubset(evidence.columns):
        raise ValueError('Missing APDRA evidence columns: '+', '.join(sorted(required-set(evidence.columns))))
    later=evidence[~evidence.phase.isin(['preflight','baseline'])].copy()
    if later.empty:
        return pd.DataFrame(columns=COLUMNS)
    # Latest later measurement within the same assay. Do not merge assay scales.
    latest=(later.sort_values(['time_numeric','timepoint'],na_position='first')
            .groupby(['subject_id','biomarker','unit','source'],as_index=False,sort=True).tail(1).copy())
    labels=[]
    for row in latest.itertuples(index=False):
        reasons=[]
        if row.source_interval_status in ('Below source interval','Above source interval'):
            reasons.append('Outside supplied laboratory interval; verify assay context')
        if int(row.baseline_n) < 2 or str(row.screening_stability).startswith(('Insufficient baseline','Percent screening undefined')):
            reasons.append('Baseline insufficient or invalid for personal stability analysis')
        elif row.screening_stability=='Baseline-sensitive screen':
            reasons.append('Screening depends on which baseline observation is omitted')
        elif str(row.screening_stability).startswith('Consistent screening deviation'):
            reasons.append('Exploratory deviation persists across baseline omissions')
        sparse_note = 'Only 2–3 preflight reference observations' if int(row.baseline_n) in (2,3) else ''
        if not reasons:
            category='No current verification prompt'
            reason='No exploratory screen in the latest reading; does not establish health normality'
            rank=4
        elif 'Outside supplied laboratory interval; verify assay context' in reasons:
            category='Verify laboratory reference context';reason='; '.join(reasons);rank=0
        elif 'Baseline insufficient or invalid for personal stability analysis' in reasons:
            category='Check baseline/data quality';reason='; '.join(reasons);rank=1
        elif 'Screening depends on which baseline observation is omitted' in reasons:
            category='Verify reference measurements';reason='; '.join(reasons);rank=2
        elif 'Exploratory deviation persists across baseline omissions' in reasons:
            category='Review consistent observation';reason='; '.join(reasons);rank=3
        else:
            category='No current verification prompt';reason='No other exploratory screen';rank=4
        if sparse_note:
            reason += '; ' + sparse_note
        labels.append((category,reason,rank))
    latest['review_category']=[v[0] for v in labels]
    latest['reason']=[v[1] for v in labels]
    latest['_rank']=[v[2] for v in labels]
    return latest.sort_values(['_rank','subject_id','biomarker'])[list(COLUMNS)].reset_index(drop=True)
