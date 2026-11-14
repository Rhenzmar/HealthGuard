"""Reproducible descriptive NASA audit + controlled synthetic APDRA benchmark.

No patient/astronaut health outcomes or diagnostic truth are inferred.
Controlled injection labels mean only that a numerical shift was injected.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from physiograph.stability import characterize, summary


def experiments(root: Path, seed: int = 1729, scenarios: int = 1200) -> dict:
    rng = np.random.default_rng(seed)
    rows = []
    truths = []
    for i in range(scenarios):
        center = 100.0
        pre = center + rng.normal(0, 10, 3)
        if rng.random() < 0.15:
            pre[int(rng.integers(0,3))] += rng.choice([-1,1]) * 50
        injected = bool(i % 2)
        # Entirely synthetic: one positive numerical shift, not a disease label.
        post = center + 45 * int(injected) + rng.normal(0, 10)
        sid = f"S{i:04d}"
        for j, val in enumerate(pre):
            rows.append(dict(subject_id=sid, timepoint=f"L-{30-10*j}",
                             biomarker="SYNTHETIC", unit="AU", system="simulation",
                             value=float(val), phase="preflight", source="synthetic"))
        rows.append(dict(subject_id=sid, timepoint="R+1", biomarker="SYNTHETIC",
                         unit="AU", system="simulation", value=float(post),
                         phase="postflight", source="synthetic"))
        truths.append((sid,injected,float(np.median(pre)),float(post)))
    samples=pd.DataFrame(rows)
    evaluated=characterize(samples)
    eval_post=evaluated.query("phase == 'postflight'").set_index("subject_id")
    detail=[]
    for sid, injected, baseline_center, post in truths:
        naive=(100*abs(post-baseline_center)/abs(baseline_center) >=30)
        stable=eval_post.loc[sid,"screening_stability"].startswith("Consistent screening deviation")
        detail.append(dict(subject_id=sid,injected_numerical_shift=injected,
                           median_threshold_screen=bool(naive),
                           apdra_loo_stable_screen=bool(stable),
                           apdra_status=eval_post.loc[sid,"screening_stability"]))
    detail=pd.DataFrame(detail)
    results={}
    for col, name in [("median_threshold_screen", "Median-only 30% screen"),
                      ("apdra_loo_stable_screen", "APDRA consistent LOO screen")]:
        predicted=detail[col]
        truth=detail.injected_numerical_shift
        tp=int((predicted & truth).sum()); fn=int((~predicted & truth).sum())
        fp=int((predicted & ~truth).sum()); tn=int((~predicted & ~truth).sum())
        results[name]={"true_positive":tp,"false_negative":fn,
                       "false_positive":fp,"true_negative":tn,
                       "synthetic_sensitivity":round(tp/(tp+fn),4),
                       "synthetic_false_positive_rate":round(fp/(fp+tn),4)}
    return {"design":{"seed":seed,"scenarios":scenarios,
                       "known_truth":"a synthetic +45 unit shift, no clinical diagnosis",
                       "null_scenario":"no injected shift",
                       "baseline_noise_sd":10,"post_noise_sd":10,
                       "preflight_outlier_probability":0.15,"preflight_outlier_magnitude":50,
                       "screen_threshold_pct":30,
                       "caveat":"Designed numerical perturbation test, not external clinical validation or statistical evidence of spaceflight effects."},
            "results":results}, detail


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,default=Path("research/apdra_v03_benchmark"))
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    args.output.mkdir(parents=True, exist_ok=True)
    benchmark, detail=experiments(root)
    detail.to_csv(args.output/"synthetic_benchmark_cases.csv",index=False)
    actual={}
    for stem in ["cmp","alamar_npq"]:
        df=pd.read_csv(root/"data/nasa"/f"osd575_{stem}_long.csv")
        scored=characterize(df)
        scored.to_csv(args.output/f"osd575_{stem}_apdra_stability.csv",index=False)
        post=scored[scored.phase=="postflight"]
        actual[stem]={
            "measurement_rows":int(len(df)),"subjects":int(df.subject_id.nunique()),
            "distinct_markers":int(df.biomarker.nunique()),
            "postflight_records":int(len(post)),
            "screening_stability_counts":{str(k):int(v) for k,v in post.screening_stability.value_counts().items()},
            "trajectory_counts":{str(k):int(v) for k,v in post.trajectory_evidence.value_counts().items()},
            "summary":summary(scored),
        }
    report={"method_version":"APDRA v0.3 baseline-sensitivity analysis",
            "source":"NASA OSD-575 files uploaded by project user; see research/sources.md",
            "real_data_descriptive_audit":actual,
            "controlled_synthetic_benchmark":benchmark,
            "limitations":["All numerical screens are unvalidated, exploratory heuristics.",
                           "Leave-one-baseline-out variation is not a confidence interval.",
                           "Only 4 astronaut subjects; thousands of proteins are correlated measurements, not independent astronauts.",
                           "Postflight trajectory comparisons are observational and do not prove recovery.",
                           "Simulated injected numerical shifts do not represent medical conditions."]}
    (args.output/"report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))


if __name__=="__main__":
    main()
