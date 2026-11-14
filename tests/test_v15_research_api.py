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


def test_nasa_source_catalog_does_not_claim_uningested_cbc_or_ocular_live_data():
    with TestClient(build_app()) as c:
        catalog=c.get('/api/research/source-catalog').json()
        sources={x['id']:x for x in catalog['sources']}
        assert sources['OSD-575']['availability']=='BUNDLED_HISTORICAL_OBSERVATIONS'
        assert sources['OSD-569']['availability']=='PUBLIC_MIRROR_QUARANTINED_QC_PENDING'
        assert sources['NASA-SANS']['availability']=='RESEARCH_CONTEXT_ONLY'
        assert catalog['historical_cohort_is_fictional_crew'] is False


def test_biomarker_panel_observations_are_historical_and_source_attributed():
    with TestClient(build_app()) as c:
        for assay,count in (('CMP',19),('NULISA',203)):
            data=c.get('/api/research/biomarker-panel',params={
                'subject_id':'C001','assay':assay}).json()
            assert data['source_kind']=='HISTORICAL_DISCRETE_SAMPLES_NOT_LIVE'
            assert data['classification']=='NOT_EVALUATED'
            assert data['total_biomarkers']==count
            for row in data['biomarkers']:
                assert row['assay']==assay
                assert row['observations']>=1
                assert row['latest']['sample_id'].startswith('C001_serum_')
                assert row['latest']['source'].startswith('NASA OSD-575')
                assert row['latest']['phase'] in {'preflight','postflight'}
        row=c.get('/api/research/biomarker-panel',params={
            'subject_id':'C001','assay':'CMP','search':'GLUCOSE'}).json()
        assert row['total_biomarkers']==1
        assert row['biomarkers'][0]['name']=='GLUCOSE'
        assert row['biomarkers'][0]['unit']=='mg/dL'
        assert c.get('/api/research/biomarker-panel',params={'subject_id':'SIM_CREW_01'}).status_code==422
        assert c.get('/api/research/biomarker-panel',params={'assay':'CBC'}).status_code==422
        assert c.get('/api/research/biomarker-panel',params={'offset':999,'limit':10}).json()['biomarkers']==[]


def test_cbc_mirror_isolation_and_quarantined_malformed_source_row():
    with TestClient(build_app()) as client:
        q=client.get('/api/research/cbc/quality').json()
        assert q['biomarker_types']==20
        assert q['independent_nasa_checksum_verification'] is False
        assert q['quarantined_source_samples']==['C003_whole-blood_L-92_cbc']
        assert q['observation_count']>400
        panel=client.get('/api/research/biomarker-panel',params={
            'assay':'CBC','subject_id':'C003','limit':40}).json()
        assert panel['total_biomarkers']==20
        assert panel['classification']=='NOT_EVALUATED'
        assert panel['source_kind']=='HISTORICAL_THIRD_PARTY_MIRROR_NOT_LIVE'
        assert all(r['latest']['sample_id']!='C003_whole-blood_L-92_cbc' for r in panel['biomarkers'])
        assert all('unverified public mirror' in r['latest']['source'] for r in panel['biomarkers'])
        measurements=client.get('/api/research/cbc/measurements',params={
            'subject_id':'C003'}).json()
        assert measurements['source_kind']=='HISTORICAL_THIRD_PARTY_MIRROR_NOT_LIVE'
        assert all(x['sample_id']!='C003_whole-blood_L-92_cbc' for x in measurements['rows'])
        assert client.get('/api/research/cbc/measurements',params={'subject_id':'SIM_CREW_01'}).status_code==422
