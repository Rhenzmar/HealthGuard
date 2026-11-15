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
        assert all(x['assay']=='ALAMAR_NPQ' for x in nul)
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
        assert sources['OSD-575']['availability']=='NASA_S3_CHECKSUM_VERIFIED'
        assert sources['OSD-569']['availability']=='NASA_S3_CHECKSUM_VERIFIED_WITH_QC_REVIEW'
        assert sources['NASA-SANS']['availability']=='RESEARCH_CONTEXT_ONLY'
        assert catalog['historical_cohort_is_fictional_crew'] is False


def test_biomarker_panel_observations_are_historical_and_source_attributed():
    with TestClient(build_app()) as c:
        for assay,count in (('CMP',19),('NULISA',203)):
            data=c.get('/api/research/biomarker-panel',params={
                'subject_id':'C001','assay':assay}).json()
            assert data['source_kind']=='NASA_OSDR_VERIFIED_HISTORICAL_LAB_NOT_LIVE'
            assert data['classification']=='NOT_EVALUATED'
            assert data['total_biomarkers']==count
            for row in data['biomarkers']:
                assert row['assay']==('ALAMAR_NPQ' if assay=='NULISA' else assay)
                assert row['observations']>=1
                assert row['latest']['sample_id'].startswith('C001_serum_')
                assert row['latest']['source'].startswith('NASA OSDR OSD-575')
                assert row['latest']['phase'] in {'preflight','postflight'}
        row=c.get('/api/research/biomarker-panel',params={
            'subject_id':'C001','assay':'CMP','search':'GLUCOSE'}).json()
        assert row['total_biomarkers']==1
        assert row['biomarkers'][0]['name']=='GLUCOSE'
        assert row['biomarkers'][0]['unit']=='mg/dL'
        assert c.get('/api/research/biomarker-panel',params={'subject_id':'SIM_CREW_01'}).status_code==422
        assert c.get('/api/research/biomarker-panel',params={'assay':'CBC'}).status_code==200
        assert c.get('/api/research/biomarker-panel',params={'offset':999,'limit':10}).json()['biomarkers']==[]


def test_cbc_mirror_isolation_and_quarantined_malformed_source_row():
    with TestClient(build_app()) as client:
        q=client.get('/api/research/cbc/quality').json()
        assert q['biomarker_types']==20
        assert q['independent_nasa_checksum_verification'] is True
        assert q['quality_review_samples']==['C003_whole-blood_L-92_cbc']
        assert q['quality_review_rows']==20
        assert q['quarantined_source_samples']==[]
        assert q['observation_count']>400
        panel=client.get('/api/research/biomarker-panel',params={
            'assay':'CBC','subject_id':'C003','limit':40}).json()
        assert panel['total_biomarkers']==20
        assert panel['classification']=='NOT_EVALUATED'
        assert panel['source_kind']=='NASA_OSDR_VERIFIED_HISTORICAL_LAB_NOT_LIVE'
        assert panel['total_biomarkers']==20
        assert any(r['quality_flagged_observations']>0 for r in panel['biomarkers'])
        assert all(r['latest']['source'].startswith('NASA OSDR OSD-569') for r in panel['biomarkers'] if r['latest'])
        measurements=client.get('/api/research/cbc/measurements',params={
            'subject_id':'C003'}).json()
        assert measurements['source_kind']=='NASA_OSDR_VERIFIED_HISTORICAL_LAB_NOT_LIVE'
        assert any(x['sample_id']=='C003_whole-blood_L-92_cbc' and x['qc_status']=='SOURCE_OUTLIER_REQUIRES_REVIEW' for x in measurements['rows'])
        assert client.get('/api/research/cbc/measurements',params={'subject_id':'SIM_CREW_01'}).status_code==422

def test_five_original_nasa_assays_include_all_322_biomarker_types():
    with TestClient(build_app()) as c:
        overview=c.get('/api/research/overview').json()
        assert overview['verified_numeric_observations']==8783
        assert overview['verified_biomarker_types']==322
        assert set(overview['verified_assays'])=={
            'CBC','CMP','EVE_IMMUNE','EVE_CARDIOVASCULAR','ALAMAR_NPQ'}
        for assay,expected in [
            ('CBC',20),('CMP',19),('EVE_IMMUNE',71),
            ('EVE_CARDIOVASCULAR',9),('ALAMAR_NPQ',203)
        ]:
            d=c.get('/api/research/biomarker-panel',
                    params={'subject_id':'C001','assay':assay}).json()
            assert d['total_biomarkers']==expected
            assert d['classification']=='NOT_EVALUATED'
            assert d['source_kind']=='NASA_OSDR_VERIFIED_HISTORICAL_LAB_NOT_LIVE'
            assert all(x['assay']==assay for x in d['biomarkers'])
            assert all(x['latest']['source_sha256'] for x in d['biomarkers'] if x['latest'])
        assert c.get('/api/research/biomarker-panel',params={'assay':'NULISA'}).json()['total_biomarkers']==203
        all_rows=c.get('/api/research/verified/measurements',
                       params={'assay':'CBC','subject_id':'C003','limit':500}).json()
        assert all_rows['total']>0
        assert any(x['qc_status']=='SOURCE_OUTLIER_REQUIRES_REVIEW' for x in all_rows['rows'])
        hemoglobin=[x for x in all_rows['rows'] if x['biomarker']=='HEMOGLOBIN']
        assert hemoglobin and all(x['unit']=='g/dL' for x in hemoglobin)
        assert c.get('/api/research/verified/measurements',
                     params={'subject_id':'SIM_CREW_01'}).status_code==422

def test_authentic_nasa_evaluation_api_is_source_aware_and_not_cnn_validation():
    with TestClient(build_app()) as c:
        resp=c.get('/api/research/evaluation/nasa-original')
        assert resp.status_code==200
        evaluation=resp.json()
        assert evaluation['evaluation_kind']=='REAL_NASA_HISTORICAL_OBSERVATIONAL_DATA'
        assert evaluation['biological_independent_participants']==4
        assert evaluation['original_numeric_source_rows']==8783
        assert evaluation['assay_specific_marker_types']==322
        assert evaluation['overall_postflight_screening']['median_only_flags']==829
        assert evaluation['overall_postflight_screening']['apdra_consistent_flags']==557
        assert evaluation['overall_postflight_screening']['median_flags_not_loo_consistent']==272
        assert evaluation['method']['synthetic_records_used'] is False
        assert evaluation['clinical_validation'] is False
        assert evaluation['real_nasa_validation_of_continuous_17ch_cnn'] is False
        for assay in ('CBC','CMP','EVE_IMMUNE','EVE_CARDIOVASCULAR','ALAMAR_NPQ'):
            d=c.get('/api/research/evaluation/nasa-original/'+assay)
            assert d.status_code==200
            assert d.json()['data']==evaluation['assays'][assay]
        assert c.get('/api/research/evaluation/nasa-original/unknown').status_code==422

def test_real_nasa_iss_eda_evaluation_endpoint_no_cnn_accuracy_claim():
    with TestClient(build_app()) as client:
        resp=client.get('/api/research/evaluation/nasa-rr1-environment')
        assert resp.status_code==200
        data=resp.json()
        assert data['evaluation_domain']=='REAL_NASA_ISS_ENVIRONMENTAL_TELEMETRY'
        assert data['telemetry']['n_records']==12087
        assert data['radiation']['n_daily_records']==39
        assert data['model_17ch_scored_on_this_dataset'] is False
        assert data['physiological_channels_present']==0
        assert data['environmental_heuristic_screen']['used_synthetic_data'] is False
        assert data['environmental_heuristic_screen']['independently_labeled_events'] is False
