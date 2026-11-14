"""Known-answer and input-safety controls for APDRA v0.6 add-ons."""
import math
import pytest
from physiograph.rcv import assess_reference_change
from physiograph.robustness import characterize_magnitude


def test_rcv_exact_expected_scale():
    res=assess_reference_change([100,101,99],150,unit='mg/dL',within_person_cv_percent=5,
                                analytical_cv_percent=2,source='Synthetic benchmark CV only')
    assert res.lower_percent < 0 < res.upper_percent
    assert res.upper_percent > abs(res.lower_percent)
    assert res.direction_votes==(1,1,1)
    assert res.label.startswith('Higher')


def test_rcv_reports_baseline_dependence():
    r=assess_reference_change([100,120,140],130,unit='g/L',within_person_cv_percent=2,
                              analytical_cv_percent=1,source='Synthetic benchmark only')
    assert r.label.startswith('Baseline-dependent')


def test_rcv_no_automatic_clinical_values():
    with pytest.raises(ValueError,match='traceable source'):
        assess_reference_change([100,101],150,unit='mg/dL',within_person_cv_percent=5,
                                analytical_cv_percent=2,source='')


def test_rcv_rejects_npq():
    with pytest.raises(ValueError,match='NPQ'):
        assess_reference_change([10,11],13,unit='NPQ (log2)',within_person_cv_percent=5,
                                analytical_cv_percent=2,source='not applicable')


def test_rcv_rejects_zero_or_negative_values():
    with pytest.raises(ValueError,match='strictly positive'):
        assess_reference_change([0,1],2,unit='g/L',within_person_cv_percent=5,
                                analytical_cv_percent=2,source='synthetic')


def test_rcv_rejects_zero_variation():
    with pytest.raises(ValueError,match='not both zero'):
        assess_reference_change([1,2],2,unit='g/L',within_person_cv_percent=0,
                                analytical_cv_percent=0,source='synthetic')


def test_rcv_no_significant_pairwise_change_when_close():
    r=assess_reference_change([100,101],100.5,unit='g/L',within_person_cv_percent=5,
                              analytical_cv_percent=2,source='synthetic')
    assert r.direction_votes==(0,0)


def test_robust_magnitude_not_threshold_heuristic():
    r=characterize_magnitude([10,11,12],20,'g/dL')
    assert r.direction=='Higher in all omissions'
    assert r.minimum_omission_deviation == pytest.approx(100*(20-11.5)/11.5)
    assert r.maximum_omission_deviation == pytest.approx(100*(20-10.5)/10.5)


def test_robust_handles_direction_conflict():
    r=characterize_magnitude([10,11,30],15,'g/dL')
    assert r.minimum_omission_deviation == 0
    assert r.direction=='Direction depends on baseline omission'


def test_robust_npq_uses_absolute_deltas():
    r=characterize_magnitude([8,9,10],11,'NPQ (log2)')
    assert r.minimum_omission_deviation == pytest.approx(1.5)
    assert r.deviation_unit=='log2 NPQ difference'


def test_robust_single_baseline_not_assessable():
    r=characterize_magnitude([10],12,'g/dL')
    assert r.minimum_omission_deviation is None


def test_robust_zero_center_not_a_percent():
    r=characterize_magnitude([0,0,0],4,'mg/dL')
    assert r.minimum_omission_deviation is None
