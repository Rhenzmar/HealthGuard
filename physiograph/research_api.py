"""Read-only, provenance-preserving OSD-575 research data endpoints for v1.5.

These are *historical* discrete astronaut biomarkers, not current vitals.
The frozen APDRA v0.7 research method and v0.6 review CSVs are not
recomputed or modified here. This module uses Python's stdlib only so the
lightweight deployment does not import pandas or Streamlit.
"""
from __future__ import annotations

from collections import Counter
import csv
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Query, HTTPException

ROOT=Path(__file__).resolve().parent.parent
DATA={
    'CMP': ROOT/'data/nasa/osd575_cmp_long.csv',
    'NULISA': ROOT/'data/nasa/osd575_alamar_npq_long.csv',
}
REVIEWS={
    'CMP': ROOT/'research/osd575_cmp_long_v06_review_queue.csv',
    'NULISA': ROOT/'research/osd575_alamar_npq_long_v06_review_queue.csv',
}
router=APIRouter(prefix='/api/research',tags=['NASA OSD-575 historical research'])


def _scalar(value: str):
    if value in ('',None): return None
    try: return float(value)
    except (TypeError,ValueError): return value


@lru_cache(maxsize=1)
def _measurements():
    rows=[]
    for assay,path in DATA.items():
        if not path.is_file(): raise FileNotFoundError(f'Bundled research data missing: {path.name}')
        with path.open(encoding='utf-8-sig',newline='') as fh:
            for line in csv.DictReader(fh):
                # No unit conversion, interpolation, imputation, or pooling of assays.
                record={'assay':assay,**line}
                for field in ('value','ref_low','ref_high'):
                    record[field]=_scalar(record.get(field))
                rows.append(record)
    return tuple(rows)


@lru_cache(maxsize=1)
def _reviews():
    rows=[]
    for assay,path in REVIEWS.items():
        if not path.is_file(): raise FileNotFoundError(f'Bundled research results missing: {path.name}')
        with path.open(encoding='utf-8-sig',newline='') as fh:
            for line in csv.DictReader(fh):
                record={'assay':assay,**line}
                record['value']=_scalar(record.get('value'))
                try:record['baseline_n']=int(record['baseline_n'])
                except (ValueError,TypeError):record['baseline_n']=None
                rows.append(record)
    return tuple(rows)


def _validate_subject(subject_id):
    if subject_id is not None and subject_id not in {'C001','C002','C003','C004'}:
        raise HTTPException(422,'Only pseudonymous OSD-575 crew identifiers C001 through C004 are supported')


def _rows_with_filters(rows,subject_id,assay,biomarker):
    return [r for r in rows if (subject_id is None or r['subject_id']==subject_id)
            and (assay is None or r['assay']==assay)
            and (biomarker is None or r['biomarker']==biomarker)]


# The frozen APDRA v0.7 / legacy OSD-575 reviews above remain unchanged.
# All expanded 5-assay endpoints below use checksum-pinned NASA S3 originals.
# Do not silently fall back to the former third-party OSD-569 CBC mirror.
VERIFIED=ROOT/'data/nasa/verified'
VERIFIED_ASSAYS=('CBC','CMP','EVE_IMMUNE','EVE_CARDIOVASCULAR','ALAMAR_NPQ')
ALIASES={'NULISA':'ALAMAR_NPQ'}
COUNT_EXPECTED={'CBC':20,'CMP':19,'EVE_IMMUNE':71,
                'EVE_CARDIOVASCULAR':9,'ALAMAR_NPQ':203}

def _assay_name(assay: str | None) -> str | None:
    if assay is None:return None
    return ALIASES.get(assay,assay)

@lru_cache(maxsize=1)
def _verified():
    manifest_path=VERIFIED/'verified_manifest.json'
    if not manifest_path.is_file():
        raise FileNotFoundError('Verified NASA original assay import is missing: run source import workflow')
    import json
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    if not manifest.get('file_hashes_verified_against_nasa_s3_runner'):
        raise ValueError('Source provenance verification flag missing')
    result={}
    for assay in VERIFIED_ASSAYS:
        path=VERIFIED/f'{assay.lower()}.csv'
        if not path.is_file():
            raise FileNotFoundError(f'Verified NASA table missing: {path.name}')
        with path.open(encoding='utf-8',newline='') as f:
            records=[]
            for line in csv.DictReader(f):
                row=dict(line)
                for key in ('value','ref_low','ref_high'):
                    row[key]=_scalar(row.get(key))
                if row['assay']!=assay:
                    raise ValueError(f'Mismatched assay source row in {path.name}')
                records.append(row)
        if len({x['biomarker'] for x in records})!=COUNT_EXPECTED[assay]:
            raise ValueError(f'{assay} biomarker count mismatch')
        result[assay]=tuple(records)
    return result

def _verified_rows(assay: str|None=None) -> tuple[dict,...]:
    data=_verified()
    canonical=_assay_name(assay)
    if canonical is not None:
        return data[canonical]
    return tuple(row for name in VERIFIED_ASSAYS for row in data[name])

def _cbc_measurements():
    return _verified_rows('CBC')

@router.get('/cbc/quality')
def cbc_quality():
    records=_cbc_measurements()
    flagged=[x for x in records if x['qc_status']=='SOURCE_OUTLIER_REQUIRES_REVIEW']
    return {
        'dataset':'OSD-569 original transformed CBC from NASA-managed public S3',
        'source':'s3://nasa-osdr/OSD-569/version-4/Complete_Blood_Count/',
        'nasa_study':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
        'observation_count':sum(isinstance(x['value'],float) for x in records),
        'rows_including_missing':len(records),
        'biomarker_types':len({r['biomarker'] for r in records}),
        'participant_ids':sorted({r['subject_id'] for r in records}),
        'quality_review_samples':sorted({x['sample_id'] for x in flagged}),
        'quality_review_rows':len(flagged),
        'quarantined_source_samples':[],
        'independent_nasa_checksum_verification':True,
        'sample_character':'HISTORICAL_DISCRETE_NOT_REAL_TIME',
        'clinical_validation':False
    }

@router.get('/cbc/measurements')
def cbc_measurements(subject_id: str=Query(default='C001'),
                     biomarker: str | None=Query(default=None,max_length=128),
                     offset:int=Query(default=0,ge=0),
                     limit:int=Query(default=200,ge=1,le=500)):
    _validate_subject(subject_id)
    records=_rows_with_filters(_cbc_measurements(),subject_id,'CBC',biomarker)
    return {
        'source':'Original NASA OSD-569 transformed CBC',
        'source_kind':'NASA_OSDR_VERIFIED_HISTORICAL_LAB_NOT_LIVE',
        'quality_flags_preserved':True,'quarantined_samples':[],
        'total':len(records),'offset':offset,'rows':records[offset:offset+limit],
        'warning':'C003 L-92 source outliers are retained and flagged for review; no medical severity assigned.'
    }

@router.get('/overview')
def overview():
    legacy=_measurements()
    phases=Counter(row['phase'] for row in legacy)
    legacy_assays={name:{'observations':sum(row['assay']==name for row in legacy),
                        'biomarkers':len({row['biomarker'] for row in legacy if row['assay']==name})}
                   for name in DATA}
    all_new=_verified()
    expanded={key:{
        'rows_including_missing':len(data),
        'observations':sum(isinstance(x['value'],float) for x in data),
        'biomarkers':len({row['biomarker'] for row in data}),
        'flagged':sum(row['qc_status']=='SOURCE_OUTLIER_REQUIRES_REVIEW' for row in data)
    } for key,data in all_new.items()}
    return {
        'source':'NASA OSDR OSD-569 and OSD-575 / Inspiration4',
        'study_url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
        'data_kind':'HISTORICAL_PREFLIGHT_POSTFLIGHT_LABORATORY_ASSAYS',
        'continuous_real_time':False,
        'observations':len(legacy),'astronauts':len({r['subject_id'] for r in legacy}),
        'subject_ids':sorted({r['subject_id'] for r in legacy}),
        'phase_counts':dict(phases),'assays':legacy_assays,
        'verified_assays':expanded,
        'verified_numeric_observations':sum(v['observations'] for v in expanded.values()),
        'verified_biomarker_types':sum(v['biomarkers'] for v in expanded.values()),
        'measurement_review_rows':len(_reviews()),
        'apdra':'FROZEN_RESEARCH_METHOD_NOT_APPLIED_TO_LIVE_TELEMETRY',
        'clinical_validation':False,
        'limitations':'Historical sparse labs, separate from all fictional crew telemetry. CBC outliers preserved and marked for review.'
    }

@router.get('/biomarkers')
def biomarkers(assay: str | None=Query(default=None,
          pattern=r'^(CBC|CMP|NULISA|ALAMAR_NPQ|EVE_IMMUNE|EVE_CARDIOVASCULAR)$')):
    data=_verified_rows(assay)
    groups={}
    for row in data:
        key=(_assay_name(row['assay']),row['biomarker'],row['unit'],row['source'])
        groups[key]=groups.get(key,0)+1
    return {'source':'Official NASA OSDR study files',
            'biomarkers':[{'assay':a,'name':b,'unit':u,'source':s,'observations':n}
                         for (a,b,u,s),n in sorted(groups.items())]}

@router.get('/measurements')
def measurements(subject_id: str | None=None,
                 assay: str | None=Query(default=None,pattern=r'^(CMP|NULISA)$'),
                 biomarker: str | None=Query(default=None,max_length=128),
                 offset: int=Query(default=0,ge=0),
                 limit:int=Query(default=200,ge=1,le=500)):
    """Backward-compatible frozen OSD-575 measurements for legacy APDRA.
    The verified source routes below expose all five new assays.
    """
    _validate_subject(subject_id)
    rows=_rows_with_filters(_measurements(),subject_id,assay,biomarker)
    return {'source':'NASA OSD-575','source_kind':'HISTORICAL_NOT_REAL_TIME',
            'filters':{'subject_id':subject_id,'assay':assay,'biomarker':biomarker},
            'total':len(rows),'offset':offset,'limit':limit,'rows':rows[offset:offset+limit],
            'warning':'Discrete pre/postflight laboratory assays. No live astronaut sensor telemetry.'}

@router.get('/verified/measurements')
def verified_measurements(subject_id: str | None=None,
                     assay: str | None=Query(default=None,
                         pattern=r'^(CBC|CMP|NULISA|ALAMAR_NPQ|EVE_IMMUNE|EVE_CARDIOVASCULAR)$'),
                     biomarker: str|None=Query(default=None,max_length=128),
                     offset:int=Query(default=0,ge=0),
                     limit:int=Query(default=200,ge=1,le=500)):
    _validate_subject(subject_id)
    data=_verified_rows(assay)
    rows=[x for x in data if (subject_id is None or x['subject_id']==subject_id)
          and (biomarker is None or x['biomarker']==biomarker)]
    return {
        'source':'Verified original NASA OSD-569 / OSD-575 S3 laboratory files',
        'source_kind':'NASA_OSDR_VERIFIED_HISTORICAL_LAB_NOT_LIVE',
        'subject_id':subject_id,'assay':_assay_name(assay),
        'total':len(rows),'offset':offset,'limit':limit,
        'rows':rows[offset:offset+limit],
        'warning':'Historical labs only. No measurements are assigned to simulated astronaut profiles.'
    }

@router.get('/review')
def review(subject_id: str | None=None,
           assay: str | None=Query(default=None,pattern=r'^(CMP|NULISA)$'),
           biomarker: str | None=Query(default=None,max_length=128),
           offset:int=Query(default=0,ge=0),limit:int=Query(default=100,ge=1,le=300)):
    _validate_subject(subject_id)
    rows=_rows_with_filters(_reviews(),subject_id,assay,biomarker)
    return {'source':'NASA OSD-575 / frozen retrospective research review',
            'source_kind':'HISTORICAL_APDRA_DERIVED',
            'algorithm':'FROZEN_APDRA_v0.7_NO_RECOMPUTATION',
            'total':len(rows),'offset':offset,'limit':limit,'rows':rows[offset:offset+limit],
            'warning':'Exploratory review only. No medical diagnosis or verified risk.'}

NASA_SOURCE_CATALOG=(
    {'id':'OSD-575','title':'Inspiration4 chemistry, Eve immune/cardiovascular and Alamar protein assays',
     'url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
     'availability':'NASA_S3_CHECKSUM_VERIFIED',
     'assays':['CMP','EVE_IMMUNE','EVE_CARDIOVASCULAR','ALAMAR_NPQ']},
    {'id':'OSD-569','title':'Inspiration4 whole-blood CBC',
     'url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
     'availability':'NASA_S3_CHECKSUM_VERIFIED_WITH_QC_REVIEW',
     'assays':['CBC']},
    {'id':'NASA-CVL','title':'Cardiovascular and vision / fluid-shift background research',
     'url':'https://www.nasa.gov/directorates/esdmd/hhp/cardiovascular-and-vision/',
     'availability':'RESEARCH_CONTEXT_ONLY','assays':[]},
    {'id':'NASA-SANS','title':'Risk of spaceflight associated neuro-ocular syndrome',
     'url':'https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/',
     'availability':'RESEARCH_CONTEXT_ONLY','assays':[]},
)

def _flight_order(row):
    tp=str(row.get('timepoint') or '')
    if tp.startswith('L-'):
        try:return -int(tp[2:])
        except ValueError:return -999999
    if tp.startswith('R+'):
        try:return int(tp[2:])
        except ValueError:return -999999
    return -999999

@router.get('/source-catalog')
def source_catalog():
    return {
        'sources':list(NASA_SOURCE_CATALOG),
        'live_sensor_integration':False,
        'historical_cohort_is_fictional_crew':False,
        'warning':'NASA OSD-569/575 transformed original files verified against S3 hashes; C003 CBC outliers retained and labeled; CVL/SANS pages are background research.'
    }

@router.get('/biomarker-panel')
def biomarker_panel(subject_id: str=Query(default='C001'),
         assay: str|None=Query(default=None,
             pattern=r'^(CBC|CMP|NULISA|ALAMAR_NPQ|EVE_IMMUNE|EVE_CARDIOVASCULAR)$'),
         search: str|None=Query(default=None,max_length=120),
         offset:int=Query(default=0,ge=0),
         limit:int=Query(default=250,ge=1,le=300)):
    _validate_subject(subject_id)
    rows=_verified_rows(assay)
    grouped={}
    for rec in rows:
        if rec['subject_id']!=subject_id:continue
        if search and search.casefold() not in rec['biomarker'].casefold():continue
        key=(rec['assay'],rec['biomarker'],rec['unit'])
        group=grouped.setdefault(key,{'observations':0,'latest':None,'missing':0,'qc_flags':0})
        if not isinstance(rec['value'],float):
            group['missing']+=1
            continue
        group['observations']+=1
        if rec['qc_status']=='SOURCE_OUTLIER_REQUIRES_REVIEW':
            group['qc_flags']+=1
        if group['latest'] is None or _flight_order(rec)>_flight_order(group['latest']):
            group['latest']=rec
    items=[]
    for (a,name,unit),data in sorted(grouped.items()):
        rec=data['latest']
        items.append({'assay':a,'name':name,'unit':unit,
                      'observations':data['observations'],
                      'missing':data['missing'],'quality_flagged_observations':data['qc_flags'],
                      'latest':({
                          'value':rec['value'],'timepoint':rec['timepoint'],'phase':rec['phase'],
                          'sample_id':rec['sample_id'],'ref_low':rec['ref_low'],
                          'ref_high':rec['ref_high'],'qc_note':rec['qc_note'],
                          'qc_status':rec['qc_status'],'source':rec['source'],
                          'source_sha256':rec['source_sha256']
                      } if rec is not None else None)})
    return {
        'source':'Verified original NASA OSDR OSD-569 and OSD-575',
        'study_url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569' if _assay_name(assay)=='CBC'
                    else 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
        'source_kind':'NASA_OSDR_VERIFIED_HISTORICAL_LAB_NOT_LIVE',
        'subject_id':subject_id,'assay':_assay_name(assay),
        'total_biomarkers':len(items),'offset':offset,'limit':limit,
        'biomarkers':items[offset:offset+limit],
        'classification':'NOT_EVALUATED',
        'warning':'Most recent observed lab timepoint, not a live value. Source QC flags are preserved. Do not interpret as current astronaut health.'
    }

@router.get('/biomarker-screening/{subject_id}')
def biomarker_screening(subject_id:str,
          assay: str=Query(default='CMP',
                pattern=r'^(CBC|CMP|NULISA|ALAMAR_NPQ|EVE_IMMUNE|EVE_CARDIOVASCULAR)$'),
          offset:int=Query(default=0,ge=0),
          limit:int=Query(default=250,ge=1,le=300)):
    from .biomarker_detection import screen_historical_biomarkers
    _validate_subject(subject_id)
    canonical=_assay_name(assay)
    report=screen_historical_biomarkers(list(_verified_rows(canonical)),
                                        subject_id=subject_id,assay=canonical)
    return {**report,'offset':offset,'limit':limit,
            'biomarkers':report['biomarkers'][offset:offset+limit]}

@lru_cache(maxsize=1)
def _nasa_evaluation_report():
    import json
    path=ROOT/'research/nasa_real_data_evaluation/evaluation.json'
    if not path.is_file():
        raise FileNotFoundError('Real NASA retrospective evaluation has not been published')
    report=json.loads(path.read_text(encoding='utf-8'))
    if report.get('evaluation_kind')!='REAL_NASA_HISTORICAL_OBSERVATIONAL_DATA' or report.get('clinical_validation') is not False:
        raise ValueError('Invalid provenance or unsupported clinical evaluation claim')
    return report


@router.get('/evaluation/nasa-original')
def nasa_original_evaluation():
    """Authentic NASA records: retrospective screen stability, not CNN accuracy."""
    return _nasa_evaluation_report()


@router.get('/evaluation/nasa-original/{assay}')
def nasa_original_assay_evaluation(assay: str):
    report=_nasa_evaluation_report()
    if assay not in report['assays']:
        raise HTTPException(422,'Only five verified original NASA assay panels are available')
    return {
        'assay':assay,
        'evaluation_kind':report['evaluation_kind'],
        'data':report['assays'][assay],
        'clinical_validation':False,
        'real_nasa_validation_of_continuous_17ch_cnn':False,
        'warning':'These screens are based on real historical laboratory values but lack medical ground truth.',
    }


@router.get('/evaluation/nasa-rr1-environment')
def nasa_rr1_environment_evaluation():
    """Real NASA EDA environmental measurements, not a 17-channel CNN validation."""
    import json
    path=ROOT/'research/nasa_rr1_eda_evaluation/evaluation.json'
    if not path.is_file():
        raise HTTPException(503,'Real NASA EDA evaluation has not been published')
    data=json.loads(path.read_text(encoding='utf-8'))
    if (data.get('evaluation_domain')!='REAL_NASA_ISS_ENVIRONMENTAL_TELEMETRY'
        or data.get('model_17ch_scored_on_this_dataset') is not False):
        raise HTTPException(503,'Real NASA EDA provenance validation failed')
    return data


@router.get('/method')
def method():
    return {'algorithm':'APDRA','version':'0.7 FROZEN',
            'data_domain':'HISTORICAL_OSD_575_SERUM_LAB_ASSAYS',
            'core_property':'leave-one-baseline-out sign and screen consistency for sparse personal reference observations',
            'headline_exploratory_observation':{
                'median_only_heuristic_flags':195,'baseline_sensitive_of_these_flags':68,
                'percent':34.87,
                'interpretation':'68 flags depend on omitted reference observations; they are NOT established false positives'},
            'external_clinical_validation':False,
            'documentation':'FINAL_APDRA_VALIDATION_REPORT.md',
            'warning':'Do not apply this lab-panel method to simulated 1 Hz telemetry or interpret its screen as medical risk.'}
