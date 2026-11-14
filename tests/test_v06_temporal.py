import pandas as pd
import pytest
from physiograph.temporal import trajectory_between_baselines


def f(rows):
    return pd.DataFrame(rows,columns=['phase','value','time_numeric'])


def test_time_normalized_proximity_uses_real_days():
    d=f([('preflight',10,-50),('preflight',11,-20),('preflight',12,-1),
         ('postflight',20,4),('postflight',12,94)])
    r=trajectory_between_baselines(d)
    assert r.elapsed_days==90
    assert r.label=='Closer to baseline across all omissions'
    assert r.median_change_in_abs_distance_per_30_days==pytest.approx(8*30/90)


def test_postflight_direction_not_medical_recovery():
    d=f([('preflight',10,-50),('preflight',11,-20),('postflight',20,4),('postflight',30,34)])
    assert trajectory_between_baselines(d).label=='Farther from baseline across all omissions'


def test_insufficient_series():
    d=f([('preflight',10,-50),('postflight',20,4),('postflight',30,34)])
    assert trajectory_between_baselines(d).label=='Insufficient serial samples'


def test_nonincreasing_time_not_time_rate():
    d=f([('preflight',10,-50),('preflight',11,-20),('postflight',20,4),('postflight',30,4)])
    assert trajectory_between_baselines(d).median_change_in_abs_distance_per_30_days is None
