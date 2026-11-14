"""Offline, reproducible APDRA+PhysioAlert analysis without Streamlit.

Run from project root:
  python -m tools.monitoring_audit --input data/templates/measurements_template.csv

Only use pseudonymous demo data: exported files are unencrypted local copies.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import pandas as pd

from physiograph.monitoring import monitor
from physiograph.workflow import import_review_json


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,default=Path('data/processed/monitoring_audit'))
    parser.add_argument('--threshold-percent',type=float,default=30.)
    parser.add_argument('--threshold-npq',type=float,default=1.)
    parser.add_argument('--review-log',type=Path,default=None)
    args=parser.parse_args()
    if not args.input.is_file():
        raise FileNotFoundError(args.input)
    events=import_review_json(args.review_log.read_bytes()) if args.review_log else []
    result=monitor(pd.read_csv(args.input),threshold_percent=args.threshold_percent,
                   threshold_npq=args.threshold_npq,review_events=events)
    args.output_dir.mkdir(parents=True,exist_ok=True)
    result.apdra.to_csv(args.output_dir/'apdra_measurements.csv',index=False)
    result.evidence.to_csv(args.output_dir/'baseline_evidence.csv',index=False)
    result.alerts.to_csv(args.output_dir/'physioalert_review.csv',index=False)
    report={
        'app':'PHYSIOGRAPH v0.9',
        'input':str(args.input),
        'subject_codes':int(result.measurements.subject_id.nunique()),
        'measurements':int(len(result.measurements)),
        'biomarker_assay_series':int(result.measurements[['subject_id','biomarker','unit','source']].drop_duplicates().shape[0]),
        'latest_nonbaseline_observations':int(len(result.alerts)),
        'observations_for_verification':int(result.alerts.is_flagged.sum()),
        'review_events_loaded':len(events),
        'review_reasons':{str(k):int(v) for k,v in result.alerts.review_category.value_counts().items()},
        'algorithm':'Frozen APDRA baseline-omission screening + nonclinical PhysioAlert',
        'warning':'No disease diagnoses or NASA-certified medical protocols. Unflagged is not proof of normal health.',
    }
    (args.output_dir/'audit_summary.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
