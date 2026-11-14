"""Recompute transparent APDRA v0.6 real-data summaries; no clinical validation."""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd
from physiograph.stability import characterize
from physiograph.review_queue import build_review_queue


def run(root: Path = Path('.')):
    out={"scope":"Authentic NASA OSD-575 assays; exploratory measurement-level descriptions only",
         "thresholds":"CMP screening: 20%, 30%, 40% sensitivity; NPQ fixed at 1 log2 unit",
         "reference_change_values":"Disabled: no verified biomarker-specific CVI/CVA were supplied with these NASA files",
         "datasets":{}}
    for dataset in ['osd575_cmp_long','osd575_alamar_npq_long']:
        df=pd.read_csv(root/'data/nasa'/f'{dataset}.csv')
        x={"records":int(len(df)),"subjects":int(df.subject_id.nunique()),
           "unique_biomarkers":int(df.biomarker.nunique()),"threshold_sensitivity":{}}
        for threshold in [20.,30.,40.]:
            result=characterize(df,threshold_percent=threshold)
            post=result[result.phase=='postflight']
            counts={k:int(v) for k,v in post.screening_stability.value_counts().items()}
            x['threshold_sensitivity'][str(int(threshold))]={"postflight_measurements":int(len(post)),"class_counts":counts}
            if threshold==30.:
                queue=build_review_queue(result)
                x['latest_measurement_queue']={"total_latest":int(len(queue)),
                    "category_counts":{k:int(v) for k,v in queue.review_category.value_counts().items()}}
                (root/'research'/f'{dataset}_v06_review_queue.csv').parent.mkdir(parents=True,exist_ok=True)
                queue.to_csv(root/'research'/f'{dataset}_v06_review_queue.csv',index=False)
        out['datasets'][dataset]=x
    (root/'research/APDRA_v06_audit.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
    print(json.dumps(out,indent=2))


if __name__=='__main__':run()
