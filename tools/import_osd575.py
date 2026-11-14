"""Import exact NASA OSD-575 assay formats with metadata provenance.

This is research-data transformation, not a medical interpretation.
NPQ is log2 relative quantification; CMP has analyte-specific clinical units.
"""
from __future__ import annotations

import csv
from pathlib import Path
import re
import zipfile

NAMES = {
    "meta": "OSD-575_metadata_OSD-575-ISA.zip",
    "cmp": "LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv",
    "immune": "LSDS-8_Multiplex_serum.immune.AlamarPanel_TRANSFORMED.csv",
}
SAMPLE_RE = re.compile(r"^(C\d{3})_serum_(L-\d+|R\+\d+)$")


def _reader(file):
    with open(file, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def _as_float(value):
    try:
        v = float(value)
        return v if v == v and v not in [float("inf"), float("-inf")] else None
    except (TypeError, ValueError):
        return None


def sample_details(sample_name, metadata):
    match = SAMPLE_RE.fullmatch(sample_name)
    if not match:
        raise ValueError(f"Unexpected sample identifier: {sample_name}")
    if sample_name not in metadata:
        raise ValueError(f"Metadata missing for sample: {sample_name}")
    subject, timepoint = match.groups()
    record = metadata[sample_name]
    if record["Source Name"] != subject:
        raise ValueError(f"Subject mismatch: {sample_name}")
    phase = "preflight" if timepoint.startswith("L") else "postflight"
    metadata_phase = record["Factor Value[Spaceflight]"].lower().replace("-", "")
    if phase.replace("flight", "") not in metadata_phase:
        raise ValueError(f"Phase mismatch: {sample_name}")
    return subject, timepoint, phase


def build(meta_zip: Path, cmp_csv: Path, immune_csv: Path, outdir: Path) -> dict:
    with zipfile.ZipFile(meta_zip) as archive:
        metadata_text = archive.read("s_OSD-575.txt").decode("utf-8-sig")
        meta_rows = list(csv.DictReader(metadata_text.splitlines(), delimiter="\t"))
    metadata = {r["Sample Name"]: r for r in meta_rows}
    if len(metadata) != len(meta_rows):
        raise ValueError("Duplicate sample names in ISA metadata")
    output = []
    metrics = {"cmp_source_rows": 0, "cmp_missing_values": 0,
               "immune_samples": 0, "immune_proteins": 0,
               "immune_zero_npq_values": 0, "metadata_samples": len(metadata)}
    for rec in _reader(cmp_csv):
        metrics["cmp_source_rows"] += 1
        sample = f'{rec["SUBJECT_ID"]}_serum_{rec["timepoint"]}'
        sid, timepoint, phase = sample_details(sample, metadata)
        val = _as_float(rec["VALUE"])
        if val is None:
            metrics["cmp_missing_values"] += 1
            continue
        unit = rec["UNITS"].strip()
        if not unit or not rec["ANALYTE"].strip():
            raise ValueError(f"Missing analyte or unit: {sample}")
        min_ref = _as_float(rec["RANGE_MIN"])
        max_ref = _as_float(rec["RANGE_MAX"])
        output.append({"subject_id":sid,"timepoint":timepoint,
            "biomarker":rec["ANALYTE"].strip(),"value":val,"unit":unit,
            "system":"Comprehensive metabolic panel","phase":phase,
            "source":"NASA OSD-575 / CMP submitted clinical assay",
            "sample_id":sample,"source_assay":"CMP",
            "ref_low": "" if min_ref is None else min_ref,
            "ref_high": "" if max_ref is None else max_ref,
            "qc_note":"Reference intervals are from source file; not spaceflight-specific"})
    immune = _reader(immune_csv)
    if not immune:
        raise ValueError("Empty Alamar file")
    protein_columns = [k for k in immune[0] if k.endswith("_concentration_npq")]
    metrics["immune_samples"] = len(immune)
    metrics["immune_proteins"] = len(protein_columns)
    if not protein_columns:
        raise ValueError("No log2 NPQ protein columns")
    for rec in immune:
        sample = rec["Sample ID"]
        sid, timepoint, phase = sample_details(sample, metadata)
        for col in protein_columns:
            val = _as_float(rec[col])
            if val is None:
                raise ValueError(f"Missing or invalid Alamar NPQ: {sample}, {col}")
            if val == 0:
                metrics["immune_zero_npq_values"] += 1
            output.append({"subject_id":sid,"timepoint":timepoint,
                "biomarker":col.removesuffix("_concentration_npq").upper(),
                "value":val,"unit":"NPQ (log2)",
                "system":"NULISA inflammation/protein panel","phase":phase,
                "source":"NASA OSD-575 / Alamar NULISAseq",
                "sample_id":sample,"source_assay":"NULISAseq",
                "ref_low":"","ref_high":"",
                "qc_note":"NPQ=0, review detectability/LOD metadata" if val == 0 else "Log2 relative signal; not an absolute concentration"})
    outdir.mkdir(parents=True, exist_ok=True)
    names = ["subject_id","timepoint","biomarker","value","unit","system",
             "phase","source","sample_id","source_assay","ref_low","ref_high","qc_note"]
    for assay, filename in (("CMP","osd575_cmp_long.csv"),
                            ("NULISAseq","osd575_alamar_npq_long.csv")):
        rows = [x for x in output if x["source_assay"] == assay]
        with open(outdir / filename,"w",encoding="utf-8",newline="") as stream:
            writer=csv.DictWriter(stream,fieldnames=names)
            writer.writeheader(); writer.writerows(rows)
        metrics[f"{assay}_analysis_rows"] = len(rows)
    metrics["unique_crew"] = len({x["subject_id"] for x in output})
    metrics["immune_missing_expected_samples"] = sorted(set(metadata) - {x["Sample ID"] for x in immune})
    return metrics


def main():
    import argparse,json
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source-dir",type=Path,required=True)
    p.add_argument("--output-dir",type=Path,default=Path("data/nasa"))
    args=p.parse_args()
    stats=build(*(args.source_dir / NAMES[k] for k in ("meta","cmp","immune")),args.output_dir)
    print(json.dumps(stats,indent=2))

if __name__ == "__main__":main()
