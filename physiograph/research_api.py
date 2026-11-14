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


@router.get('/overview')
def overview():
    data=_measurements()
    phase=Counter(row['phase'] for row in data)
    assays={name:{'observations':sum(row['assay']==name for row in data),
                  'biomarkers':len({row['biomarker'] for row in data if row['assay']==name})}
            for name in DATA}
    return {'source':'NASA OSD-575 / Inspiration4',
            'study_url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
            'data_kind':'HISTORICAL_PREFLIGHT_POSTFLIGHT_LABORATORY_ASSAYS',
            'continuous_real_time':False,
            'observations':len(data),'astronauts':len({r['subject_id'] for r in data}),
            'subject_ids':sorted({r['subject_id'] for r in data}),
            'phase_counts':dict(phase),'assays':assays,
            'measurement_review_rows':len(_reviews()),
            'apdra':'FROZEN_RESEARCH_METHOD_NOT_APPLIED_TO_LIVE_TELEMETRY',
            'clinical_validation':False,
            'limitations':'Four crew members; correlated repeated observations; research screening is not a diagnosis or emergency classification.'}


@router.get('/biomarkers')
def biomarkers(assay: str | None = Query(default=None,pattern='^(CMP|NULISA)$')):
    data=_rows_with_filters(_measurements(),None,assay,None)
    groups={}
    for row in data:
        key=(row['assay'],row['biomarker'],row['unit'],row['source'])
        groups[key]=groups.get(key,0)+1
    return {'source':'NASA OSD-575',
            'biomarkers':[{'assay':a,'name':b,'unit':u,'source':s,'observations':n}
                          for (a,b,u,s),n in sorted(groups.items())]}


@router.get('/measurements')
def measurements(subject_id: str | None=None,
                 assay: str | None=Query(default=None,pattern='^(CMP|NULISA)$'),
                 biomarker: str | None=Query(default=None,max_length=128),
                 offset: int=Query(default=0,ge=0),limit:int=Query(default=200,ge=1,le=500)):
    _validate_subject(subject_id)
    rows=_rows_with_filters(_measurements(),subject_id,assay,biomarker)
    return {'source':'NASA OSD-575','source_kind':'HISTORICAL_NOT_REAL_TIME',
            'filters':{'subject_id':subject_id,'assay':assay,'biomarker':biomarker},
            'total':len(rows),'offset':offset,'limit':limit,'rows':rows[offset:offset+limit],
            'warning':'Discrete pre/postflight laboratory assays. No live astronaut sensor telemetry.'}


@router.get('/review')
def review(subject_id: str | None=None,
           assay: str | None=Query(default=None,pattern='^(CMP|NULISA)$'),
           biomarker: str | None=Query(default=None,max_length=128),
           offset:int=Query(default=0,ge=0),limit:int=Query(default=100,ge=1,le=300)):
    _validate_subject(subject_id)
    rows=_rows_with_filters(_reviews(),subject_id,assay,biomarker)
    return {'source':'NASA OSD-575 / frozen retrospective research review',
            'source_kind':'HISTORICAL_APDRA_DERIVED',
            'algorithm':'FROZEN_APDRA_v0.7_NO_RECOMPUTATION',
            'total':len(rows),'offset':offset,'limit':limit,'rows':rows[offset:offset+limit],
            'warning':'Review queue is an exploratory measurement-check prompt. No medical diagnosis or verified risk.'}



# Distinguish availability of bundled historical data from NASA context-only
# research pages. These sources are not live sensors or fictional crew profiles.
NASA_SOURCE_CATALOG = (
    {'id':'OSD-575','title':'Inspiration4 serum chemistry and immune protein panels',
     'url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
     'availability':'BUNDLED_HISTORICAL_OBSERVATIONS',
     'assays':['CMP','NULISA']},
    {'id':'OSD-569','title':'Inspiration4 whole blood and complete blood count',
     'url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
     'availability':'SOURCE_IDENTIFIED_NOT_INGESTED','assays':['CBC']},
    {'id':'NASA-CVL','title':'Cardiovascular adaptations and headward fluid shifts',
     'url':'https://www.nasa.gov/directorates/esdmd/hhp/cardiovascular-and-vision/',
     'availability':'RESEARCH_CONTEXT_ONLY','assays':[]},
    {'id':'NASA-SANS','title':'Risk of spaceflight associated neuro-ocular syndrome',
     'url':'https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/',
     'availability':'RESEARCH_CONTEXT_ONLY','assays':[]},
)

def _flight_order(record):
    timepoint = str(record.get('timepoint') or '')
    if timepoint.startswith('L-'):
        try:return -int(timepoint[2:])
        except ValueError:return -999999
    if timepoint.startswith('R+'):
        try:return int(timepoint[2:])
        except ValueError:return -999999
    return -999999

@router.get('/source-catalog')
def source_catalog():
    return {
        'sources':list(NASA_SOURCE_CATALOG),
        'live_sensor_integration':False,
        'historical_cohort_is_fictional_crew':False,
        'warning':'OSD-569 CBC is not part of the bundled numerical data. NASA CVL and SANS are scientific background, not telemetry datasets.'
    }

@router.get('/biomarker-panel')
def biomarker_panel(subject_id: str=Query(default='C001'),
                    assay: str | None=Query(default=None, pattern=r'^(CMP|NULISA)$'),
                    search: str | None=Query(default=None,max_length=120),
                    offset:int=Query(default=0,ge=0),
                    limit:int=Query(default=250,ge=1,le=300)):
    """Latest *observed* sample per NASA biomarker for a selected historical
    participant. These are not current physiology, extrapolated lab values,
    or severity classifications. Unit, collection timepoint and sample ID
    remain exactly as recorded.
    """
    _validate_subject(subject_id)
    groups={}
    for rec in _measurements():
        if rec['subject_id']!=subject_id or (assay and rec['assay']!=assay):
            continue
        if search and search.casefold() not in rec['biomarker'].casefold():
            continue
        key=(rec['assay'],rec['biomarker'],rec['unit'])
        group=groups.setdefault(key,{'observations':0,'latest':None})
        group['observations']+=1
        if group['latest'] is None or _flight_order(rec)>_flight_order(group['latest']):
            group['latest']=rec
    items=[]
    for (a,name,unit),group in sorted(groups.items()):
        latest=group['latest']
        items.append({
            'assay':a,'name':name,'unit':unit,'observations':group['observations'],
            'latest':{
                'value':latest['value'],'timepoint':latest['timepoint'],
                'phase':latest['phase'],'sample_id':latest['sample_id'],
                'ref_low':latest['ref_low'],'ref_high':latest['ref_high'],
                'qc_note':latest['qc_note'],'source':latest['source']
            }
        })
    return {
        'source':'NASA OSD-575 / Inspiration4',
        'study_url':NASA_SOURCE_CATALOG[0]['url'],
        'source_kind':'HISTORICAL_DISCRETE_SAMPLES_NOT_LIVE',
        'subject_id':subject_id,'total_biomarkers':len(items),
        'offset':offset,'limit':limit,'biomarkers':items[offset:offset+limit],
        'classification':'NOT_EVALUATED',
        'warning':'Last available sample by study timepoint, not a current reading. Source intervals are lab metadata, not mission emergency thresholds. No extrapolation or linkage to fictional simulator crew.'
    }


@router.get('/method')
def method():
    return {'algorithm':'APDRA', 'version':'0.7 FROZEN',
            'data_domain':'HISTORICAL_OSD_575_SERUM_LAB_ASSAYS',
            'core_property':'leave-one-baseline-out sign and screen consistency for sparse personal reference observations',
            'headline_exploratory_observation':{'median_only_heuristic_flags':195,
                 'baseline_sensitive_of_these_flags':68,'percent':34.87,
                 'interpretation':'68 flags depend on omitted reference observations; they are NOT established false positives'},
            'external_clinical_validation':False,
            'documentation':'FINAL_APDRA_VALIDATION_REPORT.md',
            'warning':'Do not apply this lab-panel method to simulated 1 Hz telemetry or interpret its screen as medical risk.'}
