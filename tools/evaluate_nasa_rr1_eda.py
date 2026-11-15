"""External NASA ISS RR-1 EDA telemetry audit (no fabricated 1-Hz samples).

Three user-supplied NASA Environmental Data Application CSVs are preserved
byte-for-byte in data/nasa/rr1_eda. This evaluates three compatible ISS
engineering channels (temperature, relative humidity, cabin CO2), plus
separate DAILY radiation records. The 17-channel CNN is NOT scored: its
pretrained network requires 17 synchronized measurements at 1 Hz.

The illustrative baseline-delta thresholds imported from the simulator
are NOT NASA medical/engineering limits and NOT ground-truth labels.
"""
from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from statistics import median, fmean

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data/nasa/rr1_eda"
OUTPUT = ROOT / "research/nasa_rr1_eda_evaluation"
SOURCES = {
    "telemetry": "RR-1_EDA_Telemetry_table.csv",
    "radiation": "RR-1_EDA_Radiation_table.csv",
    "summary": "RR-1_EDA_Summary_table.csv",
}
TELEMETRY_COLUMNS = (
    "Controller_Time_GMT",
    "Temp_degC_Ground","Temp_degC_ISS",
    "RH_percent_Ground","RH_percent_ISS",
    "CO2_ppm_Ground","CO2_ppm_ISS",
)
RADIATION_COLUMNS = (
    "Date","GCR_Dose_mGy_d","SAA_Dose_mGy_d",
    "Total_Dose_mGy_d","Accumulated_Dose_mGy_d",
)
# Explicitly separate ISS engineering measurements from concurrently reported
# terrestrial experiment controls.
MAPPING = (
    ("cabin_temp_c", "Temp_degC_ISS", "degC", (3.0,7.0,11.0)),
    ("cabin_humidity_percent", "RH_percent_ISS", "%", (12.0,23.0,35.0)),
    ("cabin_co2_ppm", "CO2_ppm_ISS", "ppm", (550.0,1800.0,3500.0)),
)
TIERS = ("BASELINE_RANGE","TIER_1_DELTA","TIER_2_DELTA","TIER_3_DELTA")


def _read(path:Path,columns:tuple[str,...])->list[dict[str,str]]:
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if tuple(reader.fieldnames or ())!=columns:
            raise ValueError(f"Wrong source columns in {path.name}")
        records=list(reader)
    if not records:
        raise ValueError(f"Empty source table {path}")
    return records


def _number(value:str|None)->float|None:
    import math
    if value is None or not str(value).strip():
        return None
    try:
        result=float(value)
    except (ValueError,TypeError) as exc:
        raise ValueError(f"Unexpected nonnumeric NASA source value: {value}") from exc
    if not math.isfinite(result):
        raise ValueError(f"Nonfinite NASA source value: {value}")
    return result


def _stats(values:list[float])->dict:
    if not values:
        return {"n":0}
    ordered=sorted(values)
    return {
        "n":len(values),"min":min(values),"max":max(values),
        "mean":round(fmean(values),6),
        "median":round(float(median(values)),6),
        "p05":round(_quantile(ordered,.05),6),
        "p95":round(_quantile(ordered,.95),6),
    }


def _quantile(ordered:list[float],p:float)->float:
    v=(len(ordered)-1)*p
    lo=int(v)
    return ordered[lo]+(ordered[min(lo+1,len(ordered)-1)]-ordered[lo])*(v-lo)


def _tier(delta:float,thresholds:tuple[float,float,float])->str:
    if delta>=thresholds[2]:return "TIER_3_DELTA"
    if delta>=thresholds[1]:return "TIER_2_DELTA"
    if delta>=thresholds[0]:return "TIER_1_DELTA"
    return "BASELINE_RANGE"


def evaluate(data_root:Path=DATA)->dict:
    telemetry=_read(data_root/SOURCES["telemetry"], TELEMETRY_COLUMNS)
    radiation=_read(data_root/SOURCES["radiation"], RADIATION_COLUMNS)
    files={}
    for label,name in SOURCES.items():
        path=data_root/name
        if not path.is_file():
            raise FileNotFoundError(path)
        files[label]={"filename":name,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),
                      "bytes":path.stat().st_size}
    with (data_root/SOURCES["summary"]).open(encoding="utf-8-sig",newline="") as f:
        raw=list(csv.reader(f))
    if len(raw)!=11 or raw[0]!=["","Max","Min","Mean","Standard Deviation","Median"]:
        raise ValueError("Original NASA EDA summary format changed")
    summary_lookup={line[0]:dict(zip(raw[0][1:],line[1:])) for line in raw[1:]}

    timeline=[]
    numeric={key:[] for key in TELEMETRY_COLUMNS[1:]}
    missing={key:0 for key in TELEMETRY_COLUMNS[1:]}
    records=[]
    for row in telemetry:
        when=datetime.strptime(row["Controller_Time_GMT"],"%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
        if timeline and when<=timeline[-1]:
            raise ValueError("NASA timeline not strictly increasing")
        timeline.append(when)
        values={}
        for col in TELEMETRY_COLUMNS[1:]:
            n=_number(row[col])
            values[col]=n
            if n is None:missing[col]+=1
            else:numeric[col].append(n)
        records.append(values)
    interval_minutes=Counter(
        int((timeline[i]-timeline[i-1]).total_seconds()/60)
        for i in range(1,len(timeline))
    )
    if sum(interval_minutes.values())!=len(timeline)-1:
        raise ValueError("Cadence denominator mismatch")
    first_day_end=timeline[0].timestamp()+24*60*60
    reference_ids=[i for i,t in enumerate(timeline) if t.timestamp()<first_day_end]
    test_ids=[i for i,t in enumerate(timeline) if t.timestamp()>=first_day_end]
    if not reference_ids or not test_ids:
        raise ValueError("Need first-24h baseline and later real observations")

    # Source-table summary provides a useful independent crosscheck for
    # original numeric fields. NASA summaries have two-decimal rounding.
    summary_names={
        "Temp_degC_Ground":"Temperature Ground [C]",
        "Temp_degC_ISS":"Temperature ISS [C]",
        "RH_percent_Ground":"Relative Humidity Ground [%]",
        "RH_percent_ISS":"Relative Humidity ISS [%]",
        "CO2_ppm_Ground":"CO2 Ground [PPM]",
        "CO2_ppm_ISS":"CO2 ISS [PPM]",
    }
    source_summary_checked={}
    for col,source_label in summary_names.items():
        stated=summary_lookup[source_label]
        computed=_stats(numeric[col])
        for key,value in (("Min",computed["min"]),("Max",computed["max"]),
                          ("Mean",computed["mean"]),("Median",computed["median"])):
            if abs(float(stated[key])-value)>.011:
                raise ValueError(f"NASA EDA source summary mismatch for {col} {key}: {stated[key]} vs {value}")
        source_summary_checked[col]=True

    evaluations={}
    for key,col,unit,limits in MAPPING:
        baseline=[records[i][col] for i in reference_ids if records[i][col] is not None]
        held=[(timeline[i],records[i][col]) for i in test_ids if records[i][col] is not None]
        if len(baseline)<12 or not held:
            evaluations[key]={"status":"INSUFFICIENT_REAL_NASA_DATA"}
            continue
        center=float(median(baseline))
        counts=Counter()
        for t,value in held:
            counts[_tier(abs(value-center),limits)]+=1
        evaluations[key]={
            "status":"EVALUATED_UNLABELED_REAL_NASA_ISS_TELEMETRY",
            "original_column":col,"unit":unit,
            "source_sampling_not_one_hz":True,
            "first_24h_baseline_samples":len(baseline),
            "first_24h_baseline_median":center,
            "subsequent_real_samples":len(held),
            "fixed_illustrative_absolute_delta_thresholds":list(limits),
            "threshold_units":unit,
            "retrospective_deviation_tier_counts":{tier:int(counts[tier]) for tier in TIERS},
            "deviations_are_known_anomalies":False,
            "clinical_or_nasa_operational_limit_validation":False,
        }
    rad_rows=[]
    for row in radiation:
        t=datetime.strptime(row["Date"],"%Y-%m-%d").date()
        values={k:_number(row[k]) for k in RADIATION_COLUMNS[1:]}
        if any(v is None for v in values.values()):
            raise ValueError("Missing daily radiation aggregate")
        rad_rows.append((t,values))
    for i in range(1,len(rad_rows)):
        if (rad_rows[i][0]-rad_rows[i-1][0]).days!=1:
            raise ValueError("Daily radiation records not consecutive")
    dose_rates=[r["Total_Dose_mGy_d"] for _,r in rad_rows]
    accumulated=[r["Accumulated_Dose_mGy_d"] for _,r in rad_rows]
    if any(accumulated[i]<accumulated[i-1] for i in range(1,len(accumulated))):
        raise ValueError("Unexpected decrease in NASA cumulative radiation table")
    radiation_data={
        "n_daily_records":len(rad_rows),
        "start_date":rad_rows[0][0].isoformat(),"end_date":rad_rows[-1][0].isoformat(),
        "daily_total_mgy_per_day":_stats(dose_rates),
        "final_accumulated_mgy":accumulated[-1],
        "reported_unit":"mGy/day for daily dose and mGy for accumulated dose",
        "not_converted_to_1hz":True,
        "not_equivalent_to_synthetic_usv_per_hour_or_usv":True,
        "not_used_as_17ch_cnn_input":True,
    }
    return {
        "dataset":"NASA EDA Rodent Research-1 (RR-1)",
        "evaluation_domain":"REAL_NASA_ISS_ENVIRONMENTAL_TELEMETRY",
        "files":files,
        "telemetry":{
            "source":"NASA ISS RR-1 environmental measurements and ground-control telemetry",
            "n_records":len(telemetry),
            "start_utc":timeline[0].isoformat(),"end_utc":timeline[-1].isoformat(),
            "interval_minutes_counts":{str(k):v for k,v in sorted(interval_minutes.items())},
            "irregular_intervals_not_5min":sum(v for k,v in interval_minutes.items() if k!=5),
            "largest_observed_gap_minutes":max(interval_minutes),
            "missing_per_column":missing,
            "statistics":{k:_stats(v) for k,v in numeric.items()},
            "source_summary_crosschecked":source_summary_checked,
            "first_24h_records":len(reference_ids),
            "later_records":len(test_ids),
        },
        "environmental_heuristic_screen":{
            "method":"FIXED_SYNTHETIC_DELTA_LIMITS_APPLIED_TO_GENUINE_ISS_RECORDINGS",
            "baseline_definition":"FIRST_24_HOURS_PER_CHANNEL_MEDIAN_FROM_ACTUAL_OBSERVATIONS",
            "reference_cohort":"SAME_RR1_ISS_TIME_SERIES",
            "used_synthetic_data":False,
            "thresholds_fitted_to_this_nasa_data":False,
            "independently_labeled_events":False,
            "ground_truth_sensitivity_specificity_available":False,
            "source_values_interpolated":False,
            "classification_labels_are_nasa_emergency_limits":False,
            "results":evaluations,
        },
        "radiation":radiation_data,
        "physiological_channels_present":0,
        "model_17ch_original_architecture_validated_on_this_dataset":False,
        "model_17ch_scored_on_this_dataset":False,
        "no_assumed_1hz_sampling":True,
        "clinical_validation":False,
        "limitations":[
            "RR-1 EDA telemetry describes environmental measurements during a rodent experiment; it is not individualized astronaut physiology.",
            "Rows were recorded around five minutes apart with irregular gaps. A 60-sample CNN window here would span hours, not 60 seconds.",
            "Daily mGy radiation summaries cannot be transformed into actual instantaneous µSv/h signals without assumptions about radiation quality or sub-daily dynamics.",
            "CO2, temperature and relative humidity cover only three of eight engineering features. None of the nine physiological features are present.",
            "Tier counts quantify excursions relative to an arbitrary first-day baseline under frozen simulation thresholds; they do not identify verified anomalies, medical severity or NASA safety-rule violations.",
            "Ground-control columns are distinct and are not substituted as ISS astronaut measurements.",
        ],
    }


def save_report(output:Path=OUTPUT,data_root:Path=DATA)->dict:
    data=evaluate(data_root)
    output.mkdir(parents=True,exist_ok=True)
    (output/"evaluation.json").write_text(json.dumps(data,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    lines=[
        "# Real NASA ISS Environmental Data Evaluation: RR-1",
        "",
        "Source: user-supplied, original NASA EDA RR-1 telemetry, radiation and summary CSV files. "
        "SHA-256 digests for exact archived files appear in evaluation.json.",
        "",
        f"**Telemetry:** {data['telemetry']['n_records']:,} records from "
        f"{data['telemetry']['start_utc']} to {data['telemetry']['end_utc']}; "
        f"{data['telemetry']['irregular_intervals_not_5min']} irregular intervals, "
        "with the predominant cadence of **five minutes**, not one second. "
        f"First-day reference: {data['telemetry']['first_24h_records']} rows; "
        f"held-out later observations: {data['telemetry']['later_records']:,}.",
        "",
        "| ISS channel | Baseline median | Later samples | Below demo tier 1 | Demo tier 1 | Demo tier 2 | Demo tier 3 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for key,col,unit,limits in MAPPING:
        row=data["environmental_heuristic_screen"]["results"][key]
        if row["status"].startswith("INSUFFICIENT"):
            continue
        counts=row["retrospective_deviation_tier_counts"]
        lines.append(
            f"| {key} | {row['first_24h_baseline_median']} {unit} "
            f"| {row['subsequent_real_samples']:,} "
            + " | ".join(str(counts[k]) for k in TIERS) + " |"
        )
    lines += [
        "",
        "The table contains **real ISS measurements**, but all tier definitions are "
        "**arbitrary numerical departure rules inherited from the fictional simulator**, "
        "not validated NASA operational limits. No ground-truth anomaly labels exist.",
        "",
        f"**Radiation:** {data['radiation']['n_daily_records']} daily records "
        f"({data['radiation']['start_date']} to {data['radiation']['end_date']}); "
        f"mean total daily dose {data['radiation']['daily_total_mgy_per_day']['mean']:.4f} mGy/day, "
        f"last accumulated dose {data['radiation']['final_accumulated_mgy']:.2f} mGy. "
        "The daily dose is kept separate from the five-minute telemetry and the "
        "17-channel CNN input.",
        "",
        "**17-channel CNN NASA validation: NOT PERFORMED.** The raw RR-1 files have "
        "three directly compatible engineering channels, zero physiological channels, "
        "no synchronized 17-feature 1-Hz records and no independently labeled anomalies. "
        "No values were imputed or upsampled to make the pretrained CNN run.",
        "",
        "**Scientific interpretation:** a reproducible external real-NASA-data "
        "screening-behavior/coverage evaluation, not a medical diagnosis or full-model "
        "sensitivity, specificity, AUROC, or NASA hazard prediction evaluation.",
    ]
    (output/"REPORT.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    return data


if __name__=="__main__":
    result=save_report()
    print(json.dumps({
        "rows":result["telemetry"]["n_records"],
        "cadence":result["telemetry"]["interval_minutes_counts"],
        "radiation_days":result["radiation"]["n_daily_records"],
        "screen_counts":result["environmental_heuristic_screen"]["results"],
        "cnn_17ch_evaluated":False,
    },indent=2))
