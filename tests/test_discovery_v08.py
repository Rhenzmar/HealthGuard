"""Pure UI calculation regression tests, including the original NASA 68/195 crosscheck."""
from pathlib import Path
import pandas as pd
import pytest
from physiograph.stability import characterize
from physiograph.discovery import (median_vs_apdra, comparison_summary, snapshot_heatmap,
                                    crew_summary, rank_markers)

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def real():
    assay={}
    for code,file in [('cmp','osd575_cmp_long.csv'),('npq','osd575_alamar_npq_long.csv')]:
        raw=pd.read_csv(ROOT/'data'/'nasa'/file)
        ev=characterize(raw,threshold_percent=30, threshold_npq=1.)
        assay[code] = (ev,median_vs_apdra(ev))
    return assay


def test_original_real_nasa_crosscheck(real):
    out=comparison_summary({k:v[1] for k,v in real.items()})
    assert out['median_flagged']==195
    assert out['not_stable']==68
    assert out['stable']==127
    assert out['conditional_percent']==pytest.approx(34.8717948718)
    assert int(real['cmp'][1].median_flagged.sum())==25
    assert int(real['cmp'][1].flag_not_stable.sum())==7
    assert int(real['npq'][1].median_flagged.sum())==170
    assert int(real['npq'][1].flag_not_stable.sum())==61


def test_assay_separation_and_heatmap(real):
    cmp_evidence=real['cmp'][0]
    matrix=snapshot_heatmap(cmp_evidence,timepoint='R+1')
    assert matrix.shape[1] == 4
    assert 'GLUCOSE' in matrix.index
    assert set(matrix.stack().unique()).issubset({0,1,2,3})
    assert snapshot_heatmap(cmp_evidence,timepoint='NOT-A-SAMPLE').empty


def test_crew_denominators(real):
    for evidence,_ in real.values():
        summary=crew_summary(evidence)
        assert summary['Later readings'].sum() == (~evidence.phase.isin(['preflight','baseline'])).sum()
        assert len(summary)==4


def test_rank_markers(real):
    for evidence,_ in real.values():
        markers=rank_markers(evidence,limit=12)
        assert 0 < len(markers)<=12
        assert set(markers).issubset(set(evidence.biomarker))


def test_npq_vs_clinical_scales():
    p=pd.DataFrame([
        {'phase':'postflight','value':2.,'unit':'NPQ (log2)','baseline_median':1.,'baseline_n':2,'screening_stability':'Baseline-sensitive screen'},
        {'phase':'postflight','value':110.,'unit':'mg/dL','baseline_median':100.,'baseline_n':2,'screening_stability':'No consistent screening deviation'},
    ])
    r=median_vs_apdra(p,cmp_threshold=30,npq_threshold=1.)
    assert r.median_flagged.tolist() == [True,False]
    assert r.flag_not_stable.tolist() == [True,False]


def test_empty_and_bad_threshold():
    p=pd.DataFrame(columns=['phase','value','unit','baseline_median','baseline_n','screening_stability'])
    assert median_vs_apdra(p).empty
    with pytest.raises(ValueError,match='threshold'):
        median_vs_apdra(p,cmp_threshold=0)
