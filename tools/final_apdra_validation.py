"""PHYSIOGRAPH APDRA v0.7 frozen-method audit.

Ablate two baseline-sensitivity strategies against a median-only reference.
All cohorts are synthetic: indicators are *known injected numerical changes*,
not real disease or physiological adaptation labels. Independent null-only
calibration and held-out evaluation are used per replicate/regime.

Usage: python tools/final_apdra_validation.py
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import sys
import numpy as np
import pandas as pd
from scipy.stats import rankdata, t

# Previous scenarios retained without changing them to improve results.
SCENARIOS = {
    "low_noise": (5., 5., 0.),
    "moderate_noise": (10., 10., 0.),
    "baseline_outliers": (10., 10., .15),
    "high_noise": (20., 20., .10),
}
SEEDS = tuple(range(1729, 1753))
BASELINE_NS = (2, 3)
N_CAL = 3000
N_TEST = 3000
INJECTED_SHIFT = 45.
TARGET_FPR = 0.05
METHODS = ("median_only", "loo_any", "loo_consistent")


def simulate(rng: np.random.Generator, n: int, baseline_n: int,
             scenario: tuple[float, float, float], shift: float = INJECTED_SHIFT):
    """Construct independent synthetic cases, half unchanged and half shifted."""
    base_sd, follow_sd, outlier_fraction = scenario
    y = np.arange(n) % 2 == 1
    rng.shuffle(y)
    baseline = 100. + rng.normal(0., base_sd, (n, baseline_n))
    outlier_mask = rng.random(n) < outlier_fraction
    rows = np.flatnonzero(outlier_mask)
    cols = rng.integers(0, baseline_n, size=len(rows))
    baseline[rows, cols] += rng.choice([-1, 1], size=len(rows)) * 50.
    later = 100. + rng.normal(0., follow_sd, n) + (y * rng.choice([-1, 1], size=n) * shift)
    return baseline, later, y


def magnitudes(baseline: np.ndarray, later: np.ndarray) -> dict[str, np.ndarray]:
    """Scores in relative-percent units for this positive-scale simulation.

    Median: single personal baseline center.
    LOO any: worst-case apparent deviation under baseline omission.
    LOO consistent: smallest apparent deviation, zero if signs disagree.
    There are no NPQ measures in this synthetic test; NPQ handling is tested
    separately by existing v0.6 unit tests and real NASA data audits.
    """
    if baseline.ndim != 2 or later.shape != (len(baseline),):
        raise ValueError('Expected n_cases x n_baseline and one value per case')
    if baseline.shape[1] < 2 or not np.isfinite(baseline).all() or not np.isfinite(later).all():
        raise ValueError('At least two finite baseline values required')
    center = np.median(baseline, axis=1)
    loo_centers = np.stack([
        np.median(np.delete(baseline, i, axis=1), axis=1)
        for i in range(baseline.shape[1])
    ], axis=1)
    if (np.abs(center) < 1e-9).any() or (np.abs(loo_centers) < 1e-9).any():
        raise ValueError('Undefined percent change at a zero baseline; abstain')
    delta = later[:, None] - loo_centers
    all_same_direction = (np.all(delta > 0, axis=1) | np.all(delta < 0, axis=1))
    loo_magnitude = 100. * np.abs(delta) / np.abs(loo_centers)
    return {
        'median_only': 100. * np.abs(later - center) / np.abs(center),
        'loo_any': np.max(loo_magnitude, axis=1),
        'loo_consistent': np.where(all_same_direction, np.min(loo_magnitude, axis=1), 0.),
    }


def auc_binary(y: np.ndarray, values: np.ndarray) -> float:
    positive = np.asarray(y, bool)
    n1 = int(positive.sum()); n0 = len(positive) - n1
    if min(n0, n1) == 0:
        raise ValueError('Both classes required for AUC')
    ranks = rankdata(values)
    return float((ranks[positive].sum() - n1 * (n1 + 1) / 2) / (n1*n0))


def run_one(seed: int, scenario: str, n_baseline: int):
    rng = np.random.default_rng(seed)
    bcal, xcal, ycal = simulate(rng, N_CAL, n_baseline, SCENARIOS[scenario])
    btest, xtest, ytest = simulate(rng, N_TEST, n_baseline, SCENARIOS[scenario])
    cal = magnitudes(bcal, xcal)
    test = magnitudes(btest, xtest)
    rows = []
    for method in METHODS:
        # Calibrate on synthetic *no-change* cases. This yields matched nominal
        # false-positive targets without consulting the held-out labels.
        threshold = float(np.quantile(cal[method][~ycal], 1 - TARGET_FPR))
        predicted = test[method] > threshold  # strict: ties should not force a screen
        rows.append({
            'seed': seed, 'condition': scenario, 'baseline_n': n_baseline,
            'method': method, 'threshold_percent': threshold,
            'test_shift_cases': int(ytest.sum()), 'test_null_cases': int((~ytest).sum()),
            'true_positive_rate': float(predicted[ytest].mean()),
            'false_positive_rate': float(predicted[~ytest].mean()),
            'roc_auc': auc_binary(ytest, test[method]),
        })
    return rows


def mean_ci(values: np.ndarray):
    a = np.asarray(values, dtype=float)
    mean = float(np.mean(a))
    if len(a) < 2:
        return mean, None, None
    half = float(t.ppf(.975, len(a)-1) * np.std(a, ddof=1) / np.sqrt(len(a)))
    return mean, mean - half, mean + half


def compare(runs: pd.DataFrame):
    summaries = []
    for (n, scenario, method), grp in runs.groupby(['baseline_n','condition','method'], sort=True):
        result={'baseline_n':int(n),'condition':scenario,'method':method,'independent_seeds':len(grp)}
        for metric in ('true_positive_rate','false_positive_rate','roc_auc'):
            mean,lo,hi=mean_ci(grp[metric].to_numpy())
            result.update({f'{metric}_mean':mean, f'{metric}_ci95_low':lo, f'{metric}_ci95_high':hi})
        summaries.append(result)
    diffs=[]
    pivot=runs.pivot(index=['baseline_n','condition','seed'], columns='method', values=['true_positive_rate','false_positive_rate','roc_auc'])
    for (n, scenario), group in pivot.groupby(level=['baseline_n','condition']):
        for method in ('loo_any','loo_consistent'):
            for metric in ('true_positive_rate','false_positive_rate','roc_auc'):
                delta=group[(metric,method)]-group[(metric,'median_only')]
                mean,lo,hi=mean_ci(delta.to_numpy())
                diffs.append({'baseline_n':int(n),'condition':scenario,'method':method,
                              'comparator':'median_only','metric':metric,'mean_difference':mean,
                              'paired_seed_t_ci95_low':lo,'paired_seed_t_ci95_high':hi,
                              'independent_seeds':len(delta)})
    return pd.DataFrame(summaries), pd.DataFrame(diffs)


def nasa_audit(project_root: Path):
    """Use exact v0.6 screening engine, never treat observations as independent crew."""
    sys.path.insert(0, str(project_root))
    from physiograph.stability import characterize
    from physiograph.robustness import characterize_magnitude
    report={}
    for name in ('osd575_cmp_long','osd575_alamar_npq_long'):
        path=project_root/'data'/'nasa'/f'{name}.csv'
        df=pd.read_csv(path)
        threshold=30.
        evidence=characterize(df, threshold_percent=threshold, threshold_npq=1.)
        follow=evidence[evidence.phase=='postflight'].copy()
        groupcols=['subject_id','biomarker','unit','source']
        post_count=len(follow)
        median_flag=0; median_unstable=0; n2=0; n3=0
        # Median and leave-one-out methods use the same case and cutoff.
        for keys, grp in df.groupby(groupcols, sort=True):
            baseline=grp[grp.phase.isin(['preflight','baseline'])].value.to_numpy(float)
            if len(baseline) < 2:
                continue
            n2 += int(len(baseline)==2)
            n3 += int(len(baseline)==3)
            center=float(np.median(baseline))
            later=grp[grp.phase=='postflight']
            for obs in later.itertuples(index=False):
                if obs.unit=='NPQ (log2)':
                    flagged=abs(obs.value-center)>=1.
                else:
                    flagged=abs(center)>1e-12 and (100*abs(obs.value-center)/abs(center)>=threshold)
                if flagged:
                    median_flag+=1
                    match=follow[(follow.subject_id==obs.subject_id)&(follow.biomarker==obs.biomarker)&(follow.timepoint==obs.timepoint)&(follow.source==obs.source)]
                    if len(match)!=1:
                        raise ValueError('Missing/duplicate evidence match')
                    consistent=str(match.iloc[0].screening_stability).startswith('Consistent screening deviation')
                    median_unstable += int(not consistent)
        counts={str(k):int(v) for k,v in follow.screening_stability.value_counts().items()}
        report[name]={'records':len(df),'subjects':int(df.subject_id.nunique()),
          'distinct_biomarkers':int(df.biomarker.nunique()),'postflight_measurements':post_count,
          'reference_groups_with_2_samples':n2,'reference_groups_with_3_samples':n3,
          'median_only_flagged':median_flag,'median_only_not_consistently_loo_flagged':median_unstable,
          'median_only_unstable_fraction':median_unstable/median_flag if median_flag else None,
          'apdra_status_counts':counts,'threshold_percent_cmp':threshold,
          'threshold_log2_npq':1.,
          'description':'Observational case counts, not independent subjects; no clinical labels.'}
    return report


def main():
    root=Path(__file__).resolve().parents[1]
    out=root/'research'/'apdra_v07_final_validation'
    out.mkdir(parents=True, exist_ok=True)
    runs=[]
    for baseline_n in BASELINE_NS:
        for scenario in SCENARIOS:
            for seed in SEEDS:
                runs.extend(run_one(seed, scenario, baseline_n))
    detailed=pd.DataFrame(runs)
    summary, differences=compare(detailed)
    detailed.to_csv(out/'all_independent_runs.csv',index=False)
    summary.to_csv(out/'summary_with_seed_ci95.csv',index=False)
    differences.to_csv(out/'paired_differences_ci95.csv',index=False)
    real=nasa_audit(root)
    (out/'nasa_crosscheck.json').write_text(json.dumps(real,indent=2),encoding='utf-8')
    report={
       'version':'APDRA v0.7 retrospective final methods audit',
       'status':'Exploratory/post-hoc robustness evaluation. Not preregistered; no clinical labels.',
       'n_seed_replicates':len(SEEDS),'seed_first':min(SEEDS),'seed_last':max(SEEDS),
       'n_calibration_cases_each_run':N_CAL,'n_heldout_cases_each_run':N_TEST,
       'null_target_fpr':TARGET_FPR,'shift_magnitude_AU':INJECTED_SHIFT,
       'baseline_sample_counts':list(BASELINE_NS),
       'scenarios':SCENARIOS,
       'methods':{'median_only':'Deviation vs full baseline median',
          'loo_any':'Maximum deviation magnitude over LOO references (flag if any)',
          'loo_consistent':'Minimum LOO deviation if direction consistent; else 0 (flag only if all)'},
       'confidence_intervals':'Student-t 95% intervals across independent seed-level runs, not patient or clinical CIs; 24 replicates are synthetic.',
       'test_set_guard':'Each method calibrated on separate synthetic no-change cases; no test labels used for threshold.',
       'not_evaluated':['RCV: no externally validated per-analyte CVi/CVa supplied',
         'Biological recovery: no verified clinical recovery ground truth',
         'Generalizable astronaut health outcomes or disease diagnosis'],
       'nasa_observational_summary':real,
    }
    (out/'run_metadata.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Wrote',out)
    print(summary[['baseline_n','condition','method','true_positive_rate_mean','false_positive_rate_mean','roc_auc_mean']].to_string(index=False))
    print('NASA audit',json.dumps(real,indent=2))
    return out


if __name__=='__main__':
    main()
