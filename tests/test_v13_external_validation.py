"""Source and model isolation tests. No fabricated patient data is reported as real."""
from __future__ import annotations
import csv
from pathlib import Path
import numpy as np
import pytest
from physiograph.deep_learning import CNNAnomalyModel, DEFAULT_CHECKPOINT
from tools.external_bidmc_validation import (
    CHANNELS, REFERENCE, WINDOW, LIMITS, SEED, fixed_split, read_numerics,
    valid_matrix, nonoverlapping_windows, summarize3, inject,
    auc_unmodified_vs_injected,cnn3,run,
)


def make_values(n=481):
    t=np.arange(n,dtype=float)
    return np.column_stack([80+np.sin(t/24),17+.4*np.sin(t/30),98+.2*np.cos(t/50)])


def write_csv(path, values=None, *, miss=None, irregular=False):
    v=make_values() if values is None else values
    with open(path,'w',newline='') as f:
        w=csv.writer(f);w.writerow(['Time [s]',' HR',' PULSE',' RESP',' SpO2'])
        for i,(hr,rr,sp) in enumerate(v):
            if miss is not None and i==miss:rr=''
            w.writerow([i+.25 if (irregular and i==75) else i,hr,hr,rr,sp])


def test_clean_parsing_and_windows(tmp_path):
    path=tmp_path/'bidmc_01_Numerics.csv';write_csv(path)
    t,v=read_numerics(path)
    assert len(t)==481
    assert valid_matrix(v).all()
    windows=nonoverlapping_windows(v)
    assert windows.shape==(7,3,60)
    assert np.all(np.isfinite(windows))
    assert summarize3(windows).shape==(7,12)


def test_missing_measurement_rejected_without_imputation(tmp_path):
    p=tmp_path/'x.csv';write_csv(p,miss=54)
    _,x=read_numerics(p)
    assert np.isnan(x[54,1])
    assert not valid_matrix(x)[54]
    assert len(nonoverlapping_windows(x))==6
    p2=tmp_path/'y.csv';write_csv(p2,miss=10)
    _,y=read_numerics(p2)
    assert len(nonoverlapping_windows(y))==0


def test_reject_irregular_timestamps(tmp_path):
    p=tmp_path/'bad.csv';write_csv(p,irregular=True)
    with pytest.raises(ValueError,match='timestamps'):
        read_numerics(p)


def test_reject_out_of_range_heartbeat_or_respiration():
    v=make_values()
    v[62,0]=999
    assert len(nonoverlapping_windows(v))==6
    v[3,1]=0
    assert len(nonoverlapping_windows(v))==0


def test_record_disjoint_partition_reproducible():
    names=[f'bidmc_{i:02d}_Numerics' for i in range(1,54)]
    a=fixed_split(names)
    assert a==fixed_split(list(reversed(names)))
    assert sorted(set().union(*map(set,a.values())))==sorted(names)
    assert len(a['train'])==32 and len(a['calibration'])==11 and len(a['test'])==10
    assert set(a['train']).isdisjoint(a['test'])
    assert set(a['calibration']).isdisjoint(a['test'])


def test_perturbation_nonclinical_labels_and_auc():
    x=np.zeros((3,3,60),dtype=np.float32)
    y=inject(x,'large');z=inject(x,'subtle')
    assert y.shape==z.shape==x.shape
    assert np.allclose(y[:,:,0],x[:,:,0])
    assert y[0,0,-1]>z[0,0,-1]>0
    assert auc_unmodified_vs_injected(np.array([1.,1.,1.]),np.array([3.,3.,3.]))==1.


def test_external_3channel_model_not_deployed_5channel():
    import torch
    m=cnn3()
    assert m(torch.zeros(2,3,60)).shape==(2,3,60)
    assert next(m.parameters()).shape[1]==3
    deployed=CNNAnomalyModel(DEFAULT_CHECKPOINT)
    assert next(deployed.network.parameters()).shape[1]==5


def test_full_pipeline_on_isolated_fictional_fixture(tmp_path):
    """Software test ONLY; generated fixture cannot be reported as external data."""
    d=tmp_path/'fixture';d.mkdir()
    for k in range(1,54):
        v=make_values()
        v[:,0]+=k/17
        v[:,1]+=k/100
        write_csv(d/f'bidmc_{k:02d}_Numerics.csv',v)
    r=run(directory=d,output=tmp_path/'fixture_out',epochs=2,download=False)
    assert r['deployed_5channel_model_tested'] is False
    assert all(r['partition_window_counts'][key]>0 for key in ('train','calibration','test'))
    assert (tmp_path/'fixture_out'/'cnn3_research.pt').is_file()
    assert (tmp_path/'fixture_out'/'results.json').is_file()
    assert set(r['models'])=={'CNN3','COV3'}
