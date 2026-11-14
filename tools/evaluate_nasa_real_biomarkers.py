"""Retrospective NASA-only evaluation of HealthGuard laboratory biomarker screening.

Command: python -m tools.evaluate_nasa_real_biomarkers

Reads the five SHA-256-verified NASA OSD-569 and OSD-575 source-derived CSVs
and audits the *frozen* median-only and APDRA leave-one-out stability rules.
The output is descriptive methodological evaluation on genuine observations,
NOT ground-truth anomaly/diagnosis classification or a 17-channel CNN test.

No synthetic values, random splits, training, imputation, or in-flight
interpolation. Locked exploratory cutoffs: 30% for non-NPQ assays and
an absolute 1.0 log2 NPQ difference for Alamar.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from statistics import median
import csv
import json
import math

ROOT=Path(__file__).resolve().parent.parent
VERIFIED=ROOT/"data/nasa/verified"
REPORTS=ROOT/"research/nasa_real_data_evaluation"
SUBJECT_IDS=("C001","C002","C003","C004")
ASSAYS=("CBC","CMP","EVE_IMMUNE","EVE_CARDIOVASCULAR","ALAMAR_NPQ")
PERCENT_THRESHOLD=30.0
NPQ_THRESHOLD=1.0
QC_EXCLUSION="SOURCE_OUTLIER_REQUIRES_REVIEW"
FIELD_NAMES=(
    "study_id","assay","subject_id","timepoint","phase","sample_id",
    "biomarker","value","unit","system","ref_low","ref_high","qc_status",
    "qc_note","source","source_assay","source_file","source_sha256","source_s3_key",
)


def _numeric(value:str|None)->float|None:
    if value is None or str(value).strip()=="":
        return None
    try: v=float(value)
    except (TypeError,ValueError) as exc:
        raise ValueError("Nonnumeric NASA measurement in normalized source") from exc
    if not math.isfinite(v):
        raise ValueError("Nonfinite source measurement")
    return v


def _study_point(point:str,phase:str)->int:
    if phase=="preflight" and point.startswith("L-"):
        try:return -int(point[2:])
        except ValueError:pass
    if phase=="postflight" and point.startswith("R+"):
        try:return int(point[2:])
        except ValueError:pass
    raise ValueError("Unrecognized NASA study timepoint or phase")


def load_verified(root:Path=VERIFIED)->tuple[list[dict],dict]:
    manifest=json.loads((root/"verified_manifest.json").read_text(encoding="utf-8"))
    if manifest.get("file_hashes_verified_against_nasa_s3_runner") is not True:
        raise ValueError("Unverified original NASA provenance")
    source_files={a["assay"]:a for a in manifest["assays"]}
    if set(source_files)!=set(ASSAYS):
        raise ValueError("Unexpected verified NASA panel set")
    rows=[]
    for assay in ASSAYS:
        meta=source_files[assay]
        path=root/meta["result_csv"]
        data=path.read_bytes()
        if sha256(data).hexdigest()!=meta["result_sha256"]:
            raise ValueError(f"Normalized NASA data SHA256 mismatch: {assay}")
        if not meta.get("source_sha256") or meta["source_kind"]!="NASA_OSDR_ORIGINAL_HISTORICAL_LAB":
            raise ValueError(f"NASA original provenance unavailable: {assay}")
        seen=set();numeric=missing=0
        with path.open(encoding="utf-8",newline="") as fh:
            reader=csv.DictReader(fh)
            if set(reader.fieldnames or ()) != set(FIELD_NAMES):
                raise ValueError(f"Unexpected NASA normalized columns: {assay}")
            for item in reader:
                if item["assay"]!=assay or item["subject_id"] not in SUBJECT_IDS:
                    raise ValueError("Cross-study or unknown-person row")
                if item["source_sha256"]!=meta["source_sha256"] or item["source_file"]!=meta["source_filename"]:
                    raise ValueError("NASA source mismatch or modified provenance")
                if item["phase"] not in ("preflight","postflight"):
                    raise ValueError("Unsupported study phase")
                item["study_day"]=_study_point(item["timepoint"],item["phase"])
                identity=(item["subject_id"],item["biomarker"],item["unit"],item["timepoint"])
                if identity in seen:
                    raise ValueError(f"Duplicate measurement for {assay}: {identity}")
                seen.add(identity)
                item["value"]=_numeric(item["value"])
                item["ref_low"]=_numeric(item["ref_low"])
                item["ref_high"]=_numeric(item["ref_high"])
                numeric+=item["value"] is not None
                missing+=item["value"] is None
                rows.append(item)
        if (numeric!=meta["numeric_observations"] or missing!=meta["missing_observations"]
                or numeric+missing!=meta["rows"]):
            raise ValueError(f"NASA manifest source rows mismatch: {assay}")
    if len(rows)!=manifest["total_rows_including_missing"]:
        raise ValueError("NASA source total row count mismatch")
    return rows,manifest


def _npq(unit:str)->bool:
    # Alamar NPQ is a relative log2 assay measurement, not a concentration.
    return "NPQ" in unit.upper()


def _threshold_cross(value:float,reference:float,unit:str)->int|None:
    """Return signed screening rule result: -1/0/+1 or None if not defined."""
    delta=value-reference
    if _npq(unit):
        triggered=abs(delta)>=NPQ_THRESHOLD-1e-12
    else:
        if abs(reference)<1e-12:
            return None
        triggered=100*abs(delta)/abs(reference)>=PERCENT_THRESHOLD-1e-12
    if not triggered:return 0
    return 1 if delta>0 else -1


def screening(reference_values:list[float], value:float,unit:str)->dict:
    """Frozen APDRA logic: every omit-one-reference center must trigger
    in the same direction; compare separately with median-only.
    """
    n=len(reference_values)
    if n<2:return {"status":"INSUFFICIENT_BASELINE","median_flag":None,
                   "loo_consistent_flag":None,"median_unstable":None,
                   "baseline_count":n}
    full_ref=median(reference_values)
    full=_threshold_cross(value,full_ref,unit)
    loo=[_threshold_cross(value,median(reference_values[:i]+reference_values[i+1:]),unit)
         for i in range(n)]
    if full is None or any(x is None for x in loo):
        return {"status":"UNDEFINED_REFERENCE","median_flag":None,
                "loo_consistent_flag":None,"median_unstable":None,
                "baseline_count":n}
    if all(x==1 for x in loo):
        status="CONSISTENT_HIGHER"
    elif all(x==-1 for x in loo):
        status="CONSISTENT_LOWER"
    elif any(x!=0 for x in loo):
        status="BASELINE_SENSITIVE"
    else:
        status="NO_CONSISTENT_SCREEN"
    consistency=status.startswith("CONSISTENT")
    return {
        "status":status,"median_flag":full!=0,
        "loo_consistent_flag":consistency,
        "median_unstable":bool(full!=0 and not consistency),
        "baseline_count":n,
    }


def _pack_rates(summary:Counter) ->dict:
    comparable=summary["comparable"]
    median_flags=summary["median_flags"]
    return {
        "assessable_observations":comparable,
        "median_only_flags":median_flags,
        "apdra_consistent_flags":summary["loo_consistent"],
        "baseline_sensitive_screens":summary["baseline_sensitive"],
        "median_flags_not_loo_consistent":summary["median_unstable"],
        "insufficient_reference_or_undefined":summary["unassessable"],
        "median_flags_baseline_sensitive_fraction":
            summary["median_unstable"]/median_flags if median_flags else None,
        "median_flag_fraction_of_assessable":median_flags/comparable if comparable else None,
        "loo_consistent_fraction_of_assessable":
            summary["loo_consistent"]/comparable if comparable else None,
        "below_source_interval":summary["below_source_interval"],
        "above_source_interval":summary["above_source_interval"],
        "source_interval_present":summary["has_source_interval"],
    }


def _accumulate(out:Counter, result:dict, record:dict)->None:
    if result["status"] in ("INSUFFICIENT_BASELINE","UNDEFINED_REFERENCE"):
        out["unassessable"]+=1
        return
    out["comparable"]+=1
    out["median_flags"]+=bool(result["median_flag"])
    out["loo_consistent"]+=bool(result["loo_consistent_flag"])
    out["baseline_sensitive"]+=result["status"]=="BASELINE_SENSITIVE"
    out["median_unstable"]+=bool(result["median_unstable"])
    lo=record.get("ref_low");hi=record.get("ref_high")
    if lo is not None or hi is not None:
        out["has_source_interval"]+=1
        v=record["value"]
        out["below_source_interval"]+=lo is not None and v<lo
        out["above_source_interval"]+=hi is not None and v>hi


def evaluate(rows:list[dict], manifest:dict, *, include_records:bool=True)->tuple[dict,list[dict]]:
    groups=defaultdict(list)
    counters=defaultdict(Counter)
    records=[]
    included=0
    available=0
    qc_removed=0
    for rec in rows:
        counters[rec["assay"]]["source_rows"]+=1
        if rec["value"] is None:
            counters[rec["assay"]]["missing_source_rows"]+=1
            continue
        available+=1
        counters[rec["assay"]]["numeric_source_rows"]+=1
        if rec["qc_status"]==QC_EXCLUSION:
            qc_removed+=1
            counters[rec["assay"]]["quality_excluded_source_rows"]+=1
            continue
        included+=1
        key=(rec["assay"],rec["subject_id"],rec["biomarker"],rec["unit"])
        groups[key].append(rec)
    for (assay,sid,marker,unit),series in sorted(groups.items()):
        pre=sorted((r for r in series if r["phase"]=="preflight"),key=lambda r:r["study_day"])
        post=sorted((r for r in series if r["phase"]=="postflight"),key=lambda r:r["study_day"])
        baseline=[r["value"] for r in pre]
        counters[assay]["distinct_biomarker_subject_groups"]+=1
        counters[assay]["groups_3plus_reference"]+=len(baseline)>=3
        counters[assay]["groups_2_reference"]+=len(baseline)==2
        counters[assay]["groups_under_2_reference"]+=len(baseline)<2
        for rec in post:
            outcome=screening(baseline,rec["value"],unit)
            keys=[("per_assay",assay),("per_subject",sid),("per_timepoint",rec["timepoint"])]
            for key in keys:
                target=counters[tuple(key)]
                target["total_postflight_numeric"]+=1
                _accumulate(target,outcome,rec)
            counters[assay]["postflight_numeric"]+=1
            if include_records:
                records.append({
                    "evaluation_partition":"POSTFLIGHT_OBSERVATION",
                    "study_id":rec["study_id"],"assay":assay,"subject_id":sid,
                    "biomarker":marker,"unit":unit,"timepoint":rec["timepoint"],
                    "sample_id":rec["sample_id"],"observed_value":rec["value"],
                    "baseline_count":outcome["baseline_count"],"status":outcome["status"],
                    "median_only_flag":outcome["median_flag"],
                    "apdra_consistent_flag":outcome["loo_consistent_flag"],
                    "median_flag_baseline_unstable":outcome["median_unstable"],
                    "data_source":"VERIFIED_ORIGINAL_NASA_OSDR_OBSERVATION",
                    "clinical_ground_truth":None,
                })
        # Real preflight-only leave-one-out PLACEBO checks. Withhold one actual
        # preflight measurement; it is NEVER used in its own reference.
        # A preflight observation may naturally vary, so a screen here cannot
        # be called a known false positive.
        for ix,held in enumerate(pre):
            reference=[r["value"] for j,r in enumerate(pre) if j!=ix]
            outcome=screening(reference,held["value"],unit)
            target=counters[("preflight_placebo",assay)]
            target["held_out_preflight_numeric"]+=1
            _accumulate(target,outcome,held)
            if include_records:
                records.append({
                    "evaluation_partition":"HELD_OUT_PREFLIGHT_MEASUREMENT",
                    "study_id":held["study_id"],"assay":assay,"subject_id":sid,
                    "biomarker":marker,"unit":unit,"timepoint":held["timepoint"],
                    "sample_id":held["sample_id"],"observed_value":held["value"],
                    "baseline_count":outcome["baseline_count"],"status":outcome["status"],
                    "median_only_flag":outcome["median_flag"],
                    "apdra_consistent_flag":outcome["loo_consistent_flag"],
                    "median_flag_baseline_unstable":outcome["median_unstable"],
                    "data_source":"VERIFIED_ORIGINAL_NASA_OSDR_PREFLIGHT_HOLDOUT",
                    "clinical_ground_truth":None,
                })
    by_assay={}
    for assay in ASSAYS:
        source=counters[assay]
        p=counters[("per_assay",assay)]
        placebo=counters[("preflight_placebo",assay)]
        by_assay[assay]={
            "source_rows":source["source_rows"],
            "numeric_source_rows":source["numeric_source_rows"],
            "missing_rows":source["missing_source_rows"],
            "excluded_review_flagged_rows":source["quality_excluded_source_rows"],
            "participant_biomarker_groups":source["distinct_biomarker_subject_groups"],
            "groups_with_3plus_preflight":source["groups_3plus_reference"],
            "groups_with_2_preflight":source["groups_2_reference"],
            "groups_with_under_2_preflight":source["groups_under_2_reference"],
            "postflight_numeric_rows":source["postflight_numeric"],
            "postflight_screening":_pack_rates(p),
            "preflight_placebo":{
                "withheld_preflight_observations":placebo["held_out_preflight_numeric"],
                "screening":_pack_rates(placebo),
            },
            "source_versions_and_hashes":{
                "study_id":next(x["study_id"] for x in manifest["assays"] if x["assay"]==assay),
                "original_sha256":next(x["source_sha256"] for x in manifest["assays"] if x["assay"]==assay),
                "normalized_sha256":next(x["result_sha256"] for x in manifest["assays"] if x["assay"]==assay),
            },
        }
    total=Counter()
    total_placebo=Counter()
    for assay in ASSAYS:
        total.update(counters[("per_assay",assay)])
        total_placebo.update(counters[("preflight_placebo",assay)])
    report={
        "evaluation_name":"NASA OSDR OSD-569 / OSD-575 retrospective nonclinical biomarker screening audit",
        "evaluation_kind":"REAL_NASA_HISTORICAL_OBSERVATIONAL_DATA",
        "dataset_sources":["OSD-569 (CBC)","OSD-575 (CMP, Eve immune, Eve cardiovascular, Alamar NPQ)"],
        "source_manifest_sha256":sha256((VERIFIED/"verified_manifest.json").read_bytes()).hexdigest(),
        "participants":list(SUBJECT_IDS),
        "biological_independent_participants":4,
        "assay_specific_marker_types":manifest["total_assay_specific_biomarkers"],
        "original_numeric_source_rows":available,
        "original_missing_source_rows":len(rows)-available,
        "excluded_unverified_phenotype_or_qc_rows":qc_removed,
        "numeric_source_rows_after_qc":included,
        "method":{
            "apdra":"FROZEN_LEAVE_ONE_OUT_ALL_SAME_SIGN_SCREEN",
            "median_only":"ABSOLUTE_CHANGE_FROM_PERSONAL_PREFLIGHT_MEDIAN",
            "percent_screen_threshold":PERCENT_THRESHOLD,
            "npq_screen_threshold_abs_log2":NPQ_THRESHOLD,
            "thresholds_fit_on_nasa_data":False,
            "inflight_data_interpolated":False,
            "synthetic_records_used":False,
            "missing_values_imputed":False,
            "test_measurement_in_its_own_reference":False,
            "qc_review_sample_excluded_from_reference":"C003_whole-blood_L-92_cbc",
            "postflight_reference_period":"PREFLIGHT_ONLY",
            "preflight_placebo_reference_period":"OTHER_PREFLIGHT_ONLY",
        },
        "overall_postflight_screening":_pack_rates(total),
        "overall_preflight_placebo":{
            "withheld_preflight_observations":total_placebo["held_out_preflight_numeric"],
            "screening":_pack_rates(total_placebo),
        },
        "assays":by_assay,
        "per_subject":{sid:_pack_rates(counters[("per_subject",sid)]) for sid in SUBJECT_IDS},
        "per_timepoint":{tp:_pack_rates(c) for tp,c in sorted(
            ((key[1],value) for key,value in counters.items()
             if isinstance(key,tuple) and key[0]=="per_timepoint"),
            key=lambda x:int(x[0][2:]))},
        "real_nasa_training_of_continuous_17ch_cnn":False,
        "real_nasa_validation_of_continuous_17ch_cnn":False,
        "ground_truth_illness_labels_available":False,
        "sensitivity_specificity_roc_auc_estimable":False,
        "clinical_validation":False,
        "causal_spaceflight_attribution":False,
        "generalizability_to_future_astronauts":False,
        "interpretation":"Counts are observations across correlated assays and four people, not independent events or diagnoses. Preflight holdouts measure method behavior on genuine preflight samples, NOT an empirical false-positive rate.",
        "notes":[
            "CMP and CBC reference intervals are contextual lab metadata, not clinical outcomes.",
            "Alamar NPQ is relative log2-scale; no percent difference is calculated for this assay.",
            "Eve panels are concentration assays and the 30-percent screening threshold is an arbitrary frozen research heuristic.",
            "A baseline-sensitive flag is not evidence of a false alarm or a wrong diagnosis.",
            "All original source values and missingness remain unchanged.",
        ],
    }
    return report,records


def write_outputs(out:Path=REPORTS, data_root:Path=VERIFIED)->dict:
    rows,manifest=load_verified(data_root)
    result,details=evaluate(rows,manifest)
    out.mkdir(parents=True,exist_ok=True)
    (out/"evaluation.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    fields=("evaluation_partition","study_id","assay","subject_id","biomarker",
            "unit","timepoint","sample_id","observed_value","baseline_count",
            "status","median_only_flag","apdra_consistent_flag",
            "median_flag_baseline_unstable","data_source","clinical_ground_truth")
    with (out/"observation_level_evidence.csv").open("w",encoding="utf-8",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=fields)
        writer.writeheader()
        writer.writerows(details)
    return result


def main():
    report=write_outputs()
    print(json.dumps({
        "data_domain":report["evaluation_kind"],
        "verified_original_numeric_rows":report["original_numeric_source_rows"],
        "postflight":report["overall_postflight_screening"],
        "preflight_holdout":report["overall_preflight_placebo"],
        "per_assay":{
            k:{"postflight":v["postflight_screening"],"preflight_placebo":v["preflight_placebo"]}
            for k,v in report["assays"].items()
        },
        "clinical_validation":False,
        "cnn_17ch_nasa_data_tested":False,
    },indent=2),flush=True)


if __name__=="__main__":
    main()
