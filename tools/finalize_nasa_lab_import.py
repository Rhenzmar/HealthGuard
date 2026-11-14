"""Build source-verified OSD-569/575 laboratory tables from NASA's S3 originals.

Input: the five TRANSFORMED CSVs downloaded from s3://nasa-osdr,
       already independently matched by SHA-256 to user-supplied archives.
Output: five long-form UTF-8 CSVs + source/quality manifest.

No imputation, pooling of assays, assignment to fictional astronauts,
or use of lab data as 1 Hz live physiological telemetry.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
INPUT=ROOT/'data/external/nasa_osdr'
OUTPUT=ROOT/'data/nasa/verified'
STUDIES={
    'CBC':('OSD-569','LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv',
        '32e4f9c97d3b636b5d5c2e72dab8c4d3319dee64c437508b092dad04603b2b8f'),
    'CMP':('OSD-575','LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv',
        '5eb1e7f025dd8443a9e70111e62bc32afae3432753024489c5c013e401d709d9'),
    'EVE_IMMUNE':('OSD-575','LSDS-8_Multiplex_serum_immune_EvePanel_TRANSFORMED.csv',
        'efa8fb807e3b7e363df47f64f48d03c57d2397daf8fd22afc0ea4335d5d3d53e'),
    'EVE_CARDIOVASCULAR':('OSD-575','LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv',
        'fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c'),
    'ALAMAR_NPQ':('OSD-575','LSDS-8_Multiplex_serum.immune.AlamarPanel_TRANSFORMED.csv',
        'b53bcf9c325ae1d86e6d0d16df31ddd123423f449c7d550ac026ee01659241bc'),
}
PREFERRED_S3_KEYS={
    'CBC':'OSD-569/version-4/Complete_Blood_Count/',
    'CMP':'OSD-575/version-3/Comprehensive_Metabolic_Panel/',
    'EVE_IMMUNE':'OSD-575/version-3/Multiplex/',
    'EVE_CARDIOVASCULAR':'OSD-575/version-3/Multiplex/',
    'ALAMAR_NPQ':'OSD-575/version-3/Multiplex/',
}
UNITS={
    'cells_per_microliter':'cells/µL',
    'percent':'%',
    'picogram':'pg',
    'grams_per_deciliter':'g/dL',
    'gram_per_deciliter':'g/dL',
    'femtoliter':'fL',
    'thousand_per_microliter':'10³/µL',
    'million_per_microliter':'10⁶/µL',
    'milligram_per_deciliter':'mg/dL',
    'millimol_per_liter':'mmol/L',
    'units_per_liter':'U/L',
    'milliliter_per_minute_per_1.73_meter_squared':'mL/min/1.73m²',
    'nanogram_per_milliliter':'ng/mL',
    'picogram_per_milliliter':'pg/mL',
    'npq':'NPQ (relative log2-scale assay units)',
}
FIELDS=[
    'study_id','assay','subject_id','timepoint','phase','sample_id',
    'biomarker','value','unit','system','ref_low','ref_high','qc_status',
    'qc_note','source','source_assay','source_file','source_sha256','source_s3_key',
]
SAMPLE_RE=re.compile(r'^(C00[1-4])_(?:serum|whole-blood)_(L-\d+|R\+\d+)(?:_cbc)?$')
REVIEW_SAMPLE='C003_whole-blood_L-92_cbc'


def parse_numeric(s: str|None):
    if s is None or str(s).strip().upper() in {'','NA','N/A','NAN','NULL'}:
        return ''
    try:
        num=float(s)
    except (ValueError,TypeError) as exc:
        raise ValueError(f'Unexpected nonnumeric value: {s!r}') from exc
    from math import isfinite
    if not isfinite(num):
        raise ValueError('Nonfinite NASA numeric measurement')
    return repr(num)


def parse_columns(assay:str, names:list[str])->list[dict]:
    result=[]
    for key in names:
        m=re.fullmatch(r'(.+)_value(?:_(.+))?',key) if assay in {'CBC','CMP'} else \
          re.fullmatch(r'(.+)_concentration_(.+)',key)
        if not m:
            continue
        biomarker,unit_code=m.groups()
        if not unit_code:
            unit='ratio (unitless)'
        elif unit_code not in UNITS:
            raise ValueError(f'Unrecognized {assay} unit {unit_code}')
        else:
            unit=UNITS[unit_code]
        if assay=='CBC' and biomarker=='hemoglobin':
            if unit!='%':
                raise ValueError('Expected known hemoglobin unit discrepancy in transformed source')
            # The separately supplied OSD-569 SUBMITTED table explicitly records
            # hemoglobin values in g/dL. Do not change the numerical values.
            unit='g/dL'
        if assay in {'CBC','CMP'}:
            pre=f'{biomarker}_'
            low=f'{pre}range_min'+('_'+unit_code if unit_code else '')
            high=f'{pre}range_max'+('_'+unit_code if unit_code else '')
        else:
            low=high=None
        result.append({'key':key,'biomarker':biomarker.upper().replace('_',' '),
                       'unit':unit,'range_low':low,'range_high':high,
                       'unit_corrected':assay=='CBC' and biomarker=='hemoglobin'})
    return result


def import_one(assay:str, input_dir:Path, output_dir:Path) -> dict:
    study,filename,expected_sha=STUDIES[assay]
    path=input_dir/study/filename
    blob=path.read_bytes()
    actual=hashlib.sha256(blob).hexdigest()
    if actual!=expected_sha:
        raise ValueError(f'{assay}: NASA source SHA-256 mismatch; refusing unverified import')
    with path.open(encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError('Missing NASA source columns')
        sample_col='Sample ID' if assay=='ALAMAR_NPQ' else 'Sample Name'
        if sample_col not in reader.fieldnames:
            raise ValueError(f'{assay}: sample column absent')
        fields=parse_columns(assay,reader.fieldnames)
        expected={'CBC':20,'CMP':19,'EVE_IMMUNE':71,'EVE_CARDIOVASCULAR':9,'ALAMAR_NPQ':203}[assay]
        if len(fields)!=expected:
            raise ValueError(f'{assay}: expected {expected}, got {len(fields)} biomarkers')
        rows=[]
        source_rows=0
        for line in reader:
            source_rows+=1
            sample=line[sample_col]
            match=SAMPLE_RE.fullmatch(sample)
            if not match:
                raise ValueError(f'{assay}: unexpected source sample {sample!r}')
            sid,timepoint=match.groups()
            for field in fields:
                value=parse_numeric(line[field['key']])
                status='MISSING_SOURCE_VALUE' if value=='' else 'SOURCE_REPORTED'
                notes=[]
                if sample==REVIEW_SAMPLE and assay=='CBC':
                    status='SOURCE_OUTLIER_REQUIRES_REVIEW'
                    notes.append('C003 L-92 CBC sample has unusual values in original submitted and transformed tables; retained unmodified')
                if field['unit_corrected']:
                    notes.append('Hemoglobin unit corrected to g/dL from submitted OSD-569 assay; transformed header says percent')
                if value=='':
                    notes.append('Missing source value preserved as missing')
                if assay=='ALAMAR_NPQ':
                    notes.append('NPQ relative units are not absolute protein concentrations')
                row={
                    'study_id':study,'assay':assay,'subject_id':sid,
                    'timepoint':timepoint,
                    'phase':'preflight' if timepoint.startswith('L-') else 'postflight',
                    'sample_id':sample,
                    'biomarker':field['biomarker'],
                    'value':value,'unit':field['unit'],
                    'system':{
                        'CBC':'Complete blood count',
                        'CMP':'Comprehensive metabolic panel',
                        'EVE_IMMUNE':'Eve immune protein panel',
                        'EVE_CARDIOVASCULAR':'Eve cardiovascular protein panel',
                        'ALAMAR_NPQ':'Alamar immune protein panel',
                    }[assay],
                    'ref_low':parse_numeric(line.get(field['range_low'])) if field['range_low'] else '',
                    'ref_high':parse_numeric(line.get(field['range_high'])) if field['range_high'] else '',
                    'qc_status':status,'qc_note':'; '.join(notes),
                    'source':f'NASA OSDR {study} / {assay} (S3 original transformed table)',
                    'source_assay':assay,'source_file':filename,
                    'source_sha256':actual,
                    'source_s3_key':PREFERRED_S3_KEYS[assay]+filename,
                }
                rows.append(row)
    unique={(r['assay'],r['sample_id'],r['biomarker'],r['unit']) for r in rows}
    if len(unique)!=len(rows):
        raise ValueError(f'{assay}: duplicate source biomarker rows')
    out=output_dir/f'{assay.lower()}.csv'
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('w',encoding='utf-8',newline='') as fp:
        writer=csv.DictWriter(fp,FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return {
        'assay':assay,'study_id':study,'source_filename':filename,
        'official_nasa_s3_key':PREFERRED_S3_KEYS[assay]+filename,
        'source_sha256':actual,
        'source_sample_rows':source_rows,
        'biomarker_types':len(fields),'rows':len(rows),
        'numeric_observations':sum(r['value']!='' for r in rows),
        'missing_observations':sum(r['value']=='' for r in rows),
        'review_flagged_rows':sum(r['qc_status']=='SOURCE_OUTLIER_REQUIRES_REVIEW' for r in rows),
        'source_kind':'NASA_OSDR_ORIGINAL_HISTORICAL_LAB',
        'result_csv':out.name,
        'result_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
    }


def finalize(input_dir:Path=INPUT,output_dir:Path=OUTPUT)->dict:
    summaries=[import_one(assay,input_dir,output_dir) for assay in STUDIES]
    manifest={
        'version':'verified-osdr-v1',
        'source':'Official NASA-managed public S3: s3://nasa-osdr',
        'file_hashes_verified_against_nasa_s3_runner':True,
        'user_uploaded_transformed_files_match_nasa_s3':True,
        'note':'NASA source hash values were captured from the GitHub runner downloading official NASA S3 originals and independently checked against user uploads.',
        'raw_sources_stored_in_repository':False,
        'clinical_validation':False,
        'lab_data_are_live_telemetry':False,
        'assays':summaries,
        'total_numeric_observations':sum(x['numeric_observations'] for x in summaries),
        'total_rows_including_missing':sum(x['rows'] for x in summaries),
        'total_assay_specific_biomarkers':sum(x['biomarker_types'] for x in summaries),
        'qc_notes':['C003 L-92 CBC retained and flagged, not silently replaced or excluded',
                    'Hemoglobin transformed header incorrectly says percent; unit is g/dL in submitted OSD-569 table',
                    'Missing values are blank; no interpolation or imputation',
                    'NPQ values are relative assay values; Eve assays use mass concentration units'],
    }
    (output_dir/'verified_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    return manifest


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--input',type=Path,default=INPUT)
    p.add_argument('--output',type=Path,default=OUTPUT)
    args=p.parse_args()
    print(json.dumps(finalize(args.input,args.output),indent=2))


if __name__=='__main__':
    main()
