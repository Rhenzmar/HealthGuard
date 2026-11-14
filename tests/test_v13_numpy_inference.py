import numpy as np
import pytest
from pathlib import Path
from physiograph.deep_learning import CNNAnomalyModel,load_monitor,normalize_window
from physiograph.numpy_inference import NumpyCNNAnomalyModel,NPZ_PATH,conv1d,conv_transpose1d
from tools.export_frozen_cnn_numpy import run as parity_run


def test_export_parity(tmp_path):
    result=parity_run(path=tmp_path/'m.npz',n=12)
    assert result['status']=='PASS'
    assert result['max_abs_reconstruction_difference'] < 1e-5


def test_npz_model_loaded_and_matching_scores():
    import torch
    first=CNNAnomalyModel();second=NumpyCNNAnomalyModel()
    assert first.metadata['version']==second.metadata['version']
    assert first.threshold==second.threshold
    rng=np.random.default_rng(1912)
    ref=np.array([68.,97.9,15.,36.7,63.],dtype=np.float32)
    for i in range(4):
        x=ref[None,:]+rng.normal(0,1,(60,5)).astype(np.float32)*(1.0+i)
        a=first.score(x,ref);b=second.score(x,ref)
        assert a==pytest.approx(b,abs=2e-5)


def test_force_numpy_without_importing_torch(monkeypatch):
    monkeypatch.setenv('PHYSIOGRAPH_INFERENCE_BACKEND','numpy')
    monitor=load_monitor()
    assert monitor.model_status()['status']=='LOADED'
    assert monitor.model_status()['inference_engine']=='NUMPY_FROZEN_CNN'
    assert 'torch' not in type(monitor.model).__module__


def test_no_hidden_fallback_for_custom_missing_checkpoint(monkeypatch,tmp_path):
    monkeypatch.setenv('PHYSIOGRAPH_INFERENCE_BACKEND','numpy')
    m=load_monitor(tmp_path/'missing.pt')
    assert m.model_status()['status']=='MODEL_UNAVAILABLE'


def test_invalid_numpy_artifact_rejected(tmp_path):
    with pytest.raises(FileNotFoundError):NumpyCNNAnomalyModel(tmp_path/'missing.npz')


def test_numpy_shape_rejection():
    m=NumpyCNNAnomalyModel(NPZ_PATH)
    with pytest.raises(ValueError):m.reconstruct_normalized(np.zeros((5,59)))
    with pytest.raises(ValueError):conv1d(np.zeros((5,60)),np.zeros((1,6,3)),np.zeros(1))
    with pytest.raises(ValueError):conv_transpose1d(np.zeros((5,15)),np.zeros((6,3,4)),np.zeros(3))
