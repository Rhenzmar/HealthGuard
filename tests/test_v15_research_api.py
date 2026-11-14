"""Historical NASA research routes must never mix with fictional telemetry."""
from fastapi.testclient import TestClient
from physiograph.live_api import build_app
from physiograph.research_api import _measurements,_reviews


def test_historical_nasa_overview_has_source_and_correct_denominators():
    with TestClient(build_app()) as c:
        d=c.get('/api/research/overview').json()
        assert d['observations']==5990
        assert d['astronauts']==4
        assert d['assays']['CMP']['observations']==509
        assert d['assays']['NULISA']['observations']==5481
        assert d['continuous_real_time'] is False
        assert d['clinical_validation'] is False
        assert d['measurement_review_rows']==887
        assert sum(d['phase_counts'].values())==5990


def test_historical_filters_and_units_not_converted():
    with TestClient(build_app()) as c:
        d=c.get('/api/research/measurements',params={'subject_id':'C001','assay':'CMP','biomarker':'GLUCOSE'}).json()
        assert d['total']>=2
        assert all(r['biomarker']=='GLUCOSE' and r['unit']=='mg/dL' for r in d['rows'])
        assert all(r['subject_id']=='C001' and r['source'].startswith('NASA OSD-575') for r in d['rows'])
        assert all(r['phase'] in {'preflight','postflight'} for r in d['rows'])
        assert all(r['assay']=='CMP' for r in d['rows'])
        assert c.get('/api/research/measurements',params={'subject_id':'SIM_CREW_01'}).status_code==422
        assert c.get('/api/research/measurements',params={'limit':10000}).status_code==422


def test_historical_review_is_read_only_and_separate_from_live():
    with TestClient(build_app()) as c:
        d=c.get('/api/research/review',params={'assay':'NULISA','limit':10}).json()
        assert d['total']==812
        assert len(d['rows'])==10
        assert all(row['source'].startswith('NASA OSD-575') for row in d['rows'])
        assert all(row['assay']=='NULISA' for row in d['rows'])
        assert d['algorithm'].startswith('FROZEN_APDRA')
        assert c.get('/api/live/snapshot').json()['subject_count']==0
        assert c.post('/api/research/measurements').status_code==405


def test_research_biomarker_assays_separated():
    with TestClient(build_app()) as c:
        cmp=c.get('/api/research/biomarkers',params={'assay':'CMP'}).json()['biomarkers']
        nul=c.get('/api/research/biomarkers',params={'assay':'NULISA'}).json()['biomarkers']
        assert len(cmp)==19
        assert len(nul)==203
        assert all(x['assay']=='CMP' for x in cmp)
        assert all(x['assay']=='NULISA' for x in nul)
        assert c.get('/api/research/biomarkers',params={'assay':'OTHER'}).status_code==422


def test_method_report_does_not_call_sensitive_flags_false_positives():
    with TestClient(build_app()) as c:
        m=c.get('/api/research/method').json()
        assert m['headline_exploratory_observation']['baseline_sensitive_of_these_flags']==68
        assert 'NOT established false positives' in m['headline_exploratory_observation']['interpretation']
        assert m['external_clinical_validation'] is False
