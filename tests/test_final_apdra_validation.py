"""Known-answer and determinism tests for the frozen APDRA validation."""
import numpy as np
import pytest
from tools.final_apdra_validation import magnitudes, auc_binary, mean_ci, simulate, SCENARIOS, run_one


def test_known_sustained_shift_consistent():
    b=np.array([[100.,100.,100.]])
    x=np.array([145.])
    scores=magnitudes(b,x)
    assert scores['median_only'][0] == pytest.approx(45.)
    assert scores['loo_any'][0] == pytest.approx(45.)
    assert scores['loo_consistent'][0] == pytest.approx(45.)


def test_direction_change_suppresses_conservative_screen():
    b=np.array([[90.,110.]])
    x=np.array([100.])
    scores=magnitudes(b,x)
    assert scores['median_only'][0] == pytest.approx(0.)
    assert scores['loo_any'][0] > 10.
    assert scores['loo_consistent'][0] == 0.


def test_score_variants_order():
    b=np.array([[90.,100.,110.],[90.,110.,110.],[100.,100.,100.]])
    x=np.array([142., 140., 100.])
    s=magnitudes(b,x)
    assert np.all(s['loo_consistent'] <= s['loo_any'])
    assert (s['loo_consistent'] >= 0).all()


def test_invalid_zero_reference_raises():
    with pytest.raises(ValueError,match='zero baseline'):
        magnitudes(np.array([[0.,0.]]),np.array([3.]))


def test_auc_known_answers():
    assert auc_binary(np.array([0,0,1,1]),np.array([0.,1.,2.,3.]))==pytest.approx(1.)
    assert auc_binary(np.array([0,0,1,1]),np.ones(4))==pytest.approx(.5)


def test_synthetic_generator_reproducible_and_balanced():
    f=lambda:simulate(np.random.default_rng(1729),100,2,SCENARIOS['baseline_outliers'])
    a=f();b=f()
    for x,y in zip(a,b): np.testing.assert_array_equal(x,y)
    assert int(a[2].sum())==50


def test_independent_run_reproducible():
    assert run_one(1729,'high_noise',3)==run_one(1729,'high_noise',3)


def test_seed_interval_zero_width_for_constant_runs():
    mean,lo,hi=mean_ci(np.ones(24))
    assert (mean,lo,hi)==pytest.approx((1.,1.,1.))
