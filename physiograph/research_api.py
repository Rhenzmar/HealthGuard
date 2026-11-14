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


# Mirror of the public OSD-569 CBC TRANSFORMED table obtained from
# github.com/ibeastmanish/ASCLEPIUS, not independently checksum-verified
# against NASA's official object. Do not present it as an authenticated NASA
# download. C003 L-92 has documented column displacement; exclude the full
# observation rather than silently correcting or fabricating values.
CBC_MIRROR=ROOT/'data/nasa/osd569_cbc_raw_mirror.csv'
CBC_MIRROR_URL=('https://github.com/ibeastmanish/ASCLEPIUS/blob/main/'
                'data/raw/LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv')
CBC_QUARANTINED_SAMPLES={'C003_whole-blood_L-92_cbc'}
CBC_UNITS={'cells_per_microliter':'cells/µL',
           'percent':'%','picogram':'pg',
           'grams_per_deciliter':'g/dL','femtoliter':'fL',
           'thousand_per_microliter':'10³/µL',
           'million_per_microliter':'10⁶/µL'}

@lru_cache(maxsize=1)
def _cbc_measurements():
    if not CBC_MIRROR.is_file():
        raise FileNotFoundError('OSD-569 CBC mirror table not bundled')
    rows=[]
    quarantined=[]
    with CBC_MIRROR.open(encoding='utf-8-sig',newline='') as fh:
        reader=csv.DictReader(fh)
        if not reader.fieldnames or 'Sample Name' not in reader.fieldnames:
            raise ValueError('CBC mirror missing sample identifier')
        fields=[name for name in reader.fieldnames if '_value_' in name]
        if len(fields)!=20:
            raise ValueError(f'Unexpected CBC panel shape: {len(fields)} measurements')
        for rec in reader:
            sample=rec.get('Sample Name','')
            import re
            match=re.fullmatch(r'(C00[1-4])_whole-blood_(L-\d+|R\+\d+)_cbc',sample)
            if not match:
                raise ValueError(f'Unexpected CBC sample identifier: {sample}')
            if sample in CBC_QUARANTINED_SAMPLES:
                quarantined.append(sample)
                continue
            subject,timepoint=match.groups()
            for field in fields:
                marker,unit_code=field.split('_value_',1)
                unit=CBC_UNITS.get(unit_code)
                if not unit:
                    raise ValueError(f'Unsupported CBC source units: {unit_code}')
                value=_scalar(rec.get(field))
                if not isinstance(value,float):
                    # Preserve absent cells as missing instead of imputing.
                    continue
                low=_scalar(rec.get(f'{marker}_range_min_{unit_code}'))
                high=_scalar(rec.get(f'{marker}_range_max_{unit_code}'))
                rows.append({
                    'assay':'CBC','subject_id':subject,'timepoint':timepoint,
                    'biomarker':marker.upper().replace('_',' '),
                    'value':value,'unit':unit,
                    'system':'Complete blood count',
                    'phase':'preflight' if timepoint.startswith('L-') else 'postflight',
                    'source':'OSD-569-labelled CBC / unverified public mirror',
                    'source_assay':'CBC',
                    'sample_id':sample,
                    'ref_low':low,'ref_high':high,
                    'qc_note':'Public third-party mirror, not independently authenticated against official NASA file. '
                              'Source intervals are not spacecraft medical limits.'})
    if set(quarantined)!=CBC_QUARANTINED_SAMPLES:
        raise ValueError('Known malformed CBC record missing: review mirror integrity')
    return tuple(rows)

@router.get('/cbc/quality')
def cbc_quality():
    observations=_cbc_measurements()
    return {
        'dataset':'OSD-569 CBC public mirror','source':CBC_MIRROR_URL,
        'nasa_study':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
        'observation_count':len(observations),
        'biomarker_types':len({r['biomarker'] for r in observations}),
        'participant_ids':sorted({r['subject_id'] for r in observations}),
        'quarantined_source_samples':sorted(CBC_QUARANTINED_SAMPLES),
        'independent_nasa_checksum_verification':False,
        'sample_character':'HISTORICAL_DISCRETE_NOT_REAL_TIME',
        'clinical_validation':False
    }

@router.get('/cbc/measurements')
def cbc_measurements(subject_id: str=Query(default='C001'),
                     biomarker: str | None=Query(default=None,max_length=128),
                     offset:int=Query(default=0,ge=0),
                     limit:int=Query(default=200,ge=1,le=500)):
    _validate_subject(subject_id)
    rows=_rows_with_filters(_cbc_measurements(),subject_id,'CBC',biomarker)
    return {
        'source':'OSD-569 public mirrored table (independent authentication pending)',
        'source_kind':'HISTORICAL_THIRD_PARTY_MIRROR_NOT_LIVE',
        'quarantined_samples':sorted(CBC_QUARANTINED_SAMPLES),
        'total':len(rows),'rows':rows[offset:offset+limit],
        'warning':'CBC samples from public repository mirror; verify against NASA master file before scientific citation.'
    }

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
def biomarkers(assay: str | None = Query(default=None,pattern='^(CMP|NULISA|CBC)$')):
    data=_rows_with_filters(_cbc_measurements() if assay=='CBC' else _measurements(),None,assay,None)
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
     'availability':'PUBLIC_MIRROR_QUARANTINED_QC_PENDING','assays':['CBC']},
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
        'warning':'OSD-569 CBC currently uses a third-party public mirror with one quarantined record; independently verify with NASA. CVL and SANS are background research.'
    }

@router.get('/biomarker-panel')
def biomarker_panel(subject_id: str=Query(default='C001'),
                    assay: str | None=Query(default=None, pattern=r'^(CMP|NULISA|CBC)$'),
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
    for rec in (_cbc_measurements() if assay=='CBC' else _measurements()):
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
        'source_kind':'HISTORICAL_THIRD_PARTY_MIRROR_NOT_LIVE' if assay=='CBC' else 'HISTORICAL_DISCRETE_SAMPLES_NOT_LIVE',
        'subject_id':subject_id,'total_biomarkers':len(items),
        'offset':offset,'limit':limit,'biomarkers':items[offset:offset+limit],
        'classification':'NOT_EVALUATED',
        'cbc_mirror_qc':'ONE_RECORD_QUARANTINED_SOURCE_UNVERIFIED' if assay=='CBC' else None,
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
