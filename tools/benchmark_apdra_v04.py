"""APDRA v0.4 transparent synthetic trade-off evaluation.

The only ground truth is whether a NUMERICAL change was injected. This is
not human/astronaut clinical testing or a calibrated health-risk predictor.
Comparators use identical data and thresholds calibrated on independent
synthetic data within each scenario. Test results are never used for tuning.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

SCENARIOS = {
    "low_noise": {"baseline_sd": 5., "followup_sd": 5., "outlier_probability": 0.},
    "moderate_noise": {"baseline_sd": 10., "followup_sd": 10., "outlier_probability": 0.},
    "baseline_outliers": {"baseline_sd": 10., "followup_sd": 10., "outlier_probability": 0.15},
    "high_noise": {"baseline_sd": 20., "followup_sd": 20., "outlier_probability": 0.1},
}


def generate(rng: np.random.Generator, n: int, cfg: dict, shift_size=45.) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    injected = np.arange(n) % 2 == 1
    rng.shuffle(injected)
    pre = 100. + rng.normal(0, cfg["baseline_sd"], (n,3))
    corrupted = rng.random(n) < cfg["outlier_probability"]
    col = rng.integers(0,3,size=n)
    row = np.flatnonzero(corrupted)
    pre[row, col[row]] += rng.choice([-1.,1.],size=len(row)) * 50.
    # Positive and negative injected changes, both known by construction.
    direction = rng.choice([-1.,1.],size=n)
    post = 100. + rng.normal(0,cfg["followup_sd"],n) + injected*direction*shift_size
    return pre, post, injected


def decision_strengths(pre: np.ndarray, post: np.ndarray) -> dict[str, np.ndarray]:
    """Scores are |percentage deviation|; LOO consistent is worst LOO score.

    If the proposed screening direction changes across omissions, the
    LOO-conservative screening score is 0 (no direction-consistent screen).
    """
    pre = np.asarray(pre, dtype=float)
    post = np.asarray(post, dtype=float)
    if pre.ndim != 2 or pre.shape[1] < 2 or len(post) != len(pre):
        raise ValueError("Need >=2 preflight values and matching follow-up readings")
    center = np.median(pre,axis=1)
    centers = np.stack([np.median(np.delete(pre,i,axis=1),axis=1)
                        for i in range(pre.shape[1])],axis=1)
    with np.errstate(divide="ignore",invalid="ignore"):
        baseline = np.where(np.abs(center) > 1e-9, 100.*np.abs(post-center)/np.abs(center),0.)
        loo_deltas = post[:,None]-centers
        loo_scores = np.where(np.abs(centers)>1e-9,100.*np.abs(loo_deltas)/np.abs(centers),0.)
    same_sign=(np.all(loo_deltas>0,axis=1)|np.all(loo_deltas<0,axis=1))
    stable=np.where(same_sign, np.min(loo_scores,axis=1),0.)
    return {"median_only":baseline,"apdra_loo_consistent":stable}


def evaluate(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict:
    pred = scores >= threshold
    pos=np.asarray(labels,bool)
    tpr=float(np.mean(pred[pos]))
    fpr=float(np.mean(pred[~pos]))
    return {"true_shift_detection_rate":round(tpr,4),
            "false_screen_rate":round(fpr,4),
            "balanced_accuracy":round(0.5*(tpr+1-fpr),4),
            "hits":int(np.sum(pred&pos)),"false_screens":int(np.sum(pred&~pos))}


def run(n_per_split=3000, seeds=(1729,1730,1731), target_false_screen=0.05):
    if n_per_split%2:
        raise ValueError("n_per_split must be even")
    results=[]
    for name,cfg in SCENARIOS.items():
        for seed in seeds:
            rng=np.random.default_rng(seed)
            pre_cal,post_cal,y_cal=generate(rng,n_per_split,cfg)
            pre_test,post_test,y_test=generate(rng,n_per_split,cfg)
            cal=decision_strengths(pre_cal,post_cal)
            test=decision_strengths(pre_test,post_test)
            for method in sorted(test):
                # Deliberately use the exact nominal 30% to expose the tradeoff.
                for mode, threshold in [
                    ("fixed_30pct",30.),
                    ("calibrated_5pct_null",float(np.quantile(cal[method][~y_cal],1-target_false_screen)))
                ]:
                    res=evaluate(y_test,test[method],threshold)
                    results.append(dict(scenario=name,seed=seed,method=method,
                                        threshold_policy=mode,threshold_pct=round(threshold,4),
                                        n_test=n_per_split,**res))
    all_runs=pd.DataFrame(results)
    aggregate=(all_runs.groupby(["scenario","method","threshold_policy"])
               .agg(mean_sensitivity=("true_shift_detection_rate","mean"),
                    mean_false_screen=("false_screen_rate","mean"),
                    mean_balanced_accuracy=("balanced_accuracy","mean"),
                    min_sensitivity=("true_shift_detection_rate","min"),
                    max_sensitivity=("true_shift_detection_rate","max"),
                    min_false_screen=("false_screen_rate","min"),
                    max_false_screen=("false_screen_rate","max"))
               .reset_index())
    for col in aggregate.columns:
        if pd.api.types.is_float_dtype(aggregate[col]):
            aggregate[col]=aggregate[col].round(4)
    return all_runs,aggregate


def main():
    out=Path("research/apdra_v04_benchmark")
    out.mkdir(parents=True,exist_ok=True)
    detailed,aggregated=run()
    detailed.to_csv(out/"synthetic_runs.csv",index=False)
    aggregated.to_csv(out/"synthetic_summary.csv",index=False)
    report={"method":"Numerical known-shift simulation with independent calibration and test cohorts",
            "synthetic_design":"3 preflight observations, 1 later observation, known +45 or -45 AU shift in 50% of cases, 4 predefined noise/outlier regimes, 3 seeds, 3000 calibration and 3000 test cases per run",
            "comparison":"Median-only vs leave-one-baseline-out consistent direction; 30% common threshold or independent calibration at 5% null-screen target",
            "limitations":["Artificial numerical shifts are not clinical conditions or physiological ground truth.",
               "Calibrated threshold estimates are conditional on the synthetic scenario, not transferable to astronauts.",
               "More conservative screens may reduce both false positives and detection sensitivity.",
               "Three preflight values cannot establish a clinical reference distribution."],
            "results":aggregated.to_dict(orient="records")}
    (out/"report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(aggregated.to_string(index=False))
    return aggregated


if __name__=="__main__":
    main()
