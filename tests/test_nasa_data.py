"""Verify the exact public OSD-575 tables bundled in the v0.2 research prototype."""
from pathlib import Path
import pandas as pd
from physiograph.apdra import analyze

ROOT=Path(__file__).resolve().parents[1]


def test_uploaded_nasa_data_coverage():
    metabolic=pd.read_csv(ROOT/'data/nasa/osd575_cmp_long.csv')
    immune=pd.read_csv(ROOT/'data/nasa/osd575_alamar_npq_long.csv')
    assert len(metabolic)==509
    assert len(immune)==27*203
    assert metabolic.biomarker.nunique()==19
    assert immune.biomarker.nunique()==203
    assert set(metabolic.subject_id)==set(immune.subject_id)=={'C001','C002','C003','C004'}
    assert not metabolic.duplicated(['subject_id','timepoint','biomarker']).any()
    assert not immune.duplicated(['subject_id','timepoint','biomarker']).any()
    assert not ((immune.subject_id=='C003') & (immune.timepoint=='L-44')).any()
    assert immune.unit.eq('NPQ (log2)').all()


def test_actual_npq_stays_logscale():
    immune=pd.read_csv(ROOT/'data/nasa/osd575_alamar_npq_long.csv')
    subset=immune[immune.biomarker=='IL6']
    analyzed=analyze(subset)
    assert analyzed.percent_change.isna().all()
    assert analyzed[analyzed.phase=='postflight'].fold_change_vs_personal_baseline.notna().all()


def test_cmp_source_intervals_still_available():
    metabolic=pd.read_csv(ROOT/'data/nasa/osd575_cmp_long.csv')
    glucose=metabolic[metabolic.biomarker=='GLUCOSE']
    assert glucose.ref_low.eq(65).all()
    assert glucose.ref_high.eq(99).all()
    checked=analyze(glucose)
    assert (checked.source_range_status=='Below source reference interval').any()
