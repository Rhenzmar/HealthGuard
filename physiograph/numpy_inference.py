"""Pure NumPy CPU inference for the FROZEN trained five-channel 1D CNN.

Provides exactly the same network graph as the original PyTorch Sequential:
Conv1d, ELU, strided Conv1d, ELU, strided Conv1d, ELU,
Conv1d, ELU, ConvTranspose1d, ELU, ConvTranspose1d, ELU, Conv1d.

The NPZ weights are exported directly from the v1.1 checkpoint, never fit here.
No sensor data or NASA laboratory data are used for model training.
"""
from __future__ import annotations
import json
import math
from pathlib import Path
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

NPZ_PATH=Path(__file__).resolve().parent.parent/'models'/'deep_learning'/'cnn_autoencoder_numpy.npz'


def conv1d(x:np.ndarray,w:np.ndarray,b:np.ndarray,stride:int=1,padding:int=0) -> np.ndarray:
    x=np.asarray(x,dtype=np.float32)
    w=np.asarray(w,dtype=np.float32)
    if x.ndim!=2 or w.ndim!=3 or w.shape[1]!=x.shape[0]:
        raise ValueError('Conv1d dimensional mismatch')
    xp=np.pad(x,((0,0),(padding,padding)))
    windows=sliding_window_view(xp,w.shape[2],axis=1)[:,::stride,:]
    return np.einsum('ock,clk->ol',w,windows,optimize=True)+b[:,None]


def conv_transpose1d(x:np.ndarray,w:np.ndarray,b:np.ndarray,stride:int=2,padding:int=1) -> np.ndarray:
    x=np.asarray(x,dtype=np.float32)
    w=np.asarray(w,dtype=np.float32)
    if x.ndim!=2 or w.ndim!=3 or w.shape[0]!=x.shape[0]:
        raise ValueError('ConvTranspose1d dimensional mismatch')
    length=(x.shape[1]-1)*stride-2*padding+w.shape[2]
    y=np.zeros((w.shape[1],length),dtype=np.float32)
    for k in range(w.shape[2]):
        indices=np.arange(x.shape[1])*stride-padding+k
        keep=(indices>=0)&(indices<length)
        contrib=x[:,keep].T@w[:,:,k]
        # Every i maps to a different output index for fixed k.
        y[:,indices[keep]]+=contrib.T
    return y+b[:,None]


def elu(x:np.ndarray)->np.ndarray:
    return np.where(x>0,x,np.expm1(np.minimum(x,0))).astype(np.float32)


class NumpyCNNAnomalyModel:
    """Drop-in offline scorer using exported weights with no torch import."""
    def __init__(self,path:Path|str=NPZ_PATH):
        from .deep_learning import FEATURES,FEATURE_SCALES,WINDOW_POINTS,REFERENCE_POINTS
        self.path=Path(path)
        with np.load(self.path,allow_pickle=False) as f:
            self.metadata=json.loads(str(f['metadata_json']))
            self.layers={int(i):(
                np.array(f[f'layer_{i}_weight'],dtype=np.float32),
                np.array(f[f'layer_{i}_bias'],dtype=np.float32)) for i in (0,2,4,6,8,10,12)}
        md=self.metadata
        if (tuple(md['features']) != FEATURES or
            list(md['scales']) != [float(v) for v in FEATURE_SCALES] or
            md['reference_points']!=REFERENCE_POINTS or
            md['window_points']!=WINDOW_POINTS):
            raise ValueError('NumPy model has incompatible feature schema')
        self.threshold=float(md['calibration_threshold'])
        if not math.isfinite(self.threshold) or self.threshold<=0:
            raise ValueError('NumPy model has invalid calibration threshold')
        self._validate_layers()

    def _validate_layers(self):
        shapes={0:(16,5,5),2:(12,16,5),4:(8,12,5),6:(3,8,1),
                8:(3,12,4),10:(12,16,4),12:(5,16,5)}
        for i,shape in shapes.items():
            w,b=self.layers[i]
            if w.shape!=shape or b.shape!=(shape[0] if i<8 else shape[1] if i<12 else shape[0],):
                raise ValueError('NumPy weights do not match frozen architecture')
            if not np.isfinite(w).all() or not np.isfinite(b).all():
                raise ValueError('Nonfinite weights')

    def reconstruct_normalized(self,features_by_time:np.ndarray)->np.ndarray:
        x=np.asarray(features_by_time,dtype=np.float32)
        if x.shape!=(5,60) or not np.isfinite(x).all():
            raise ValueError('Expected finite 5x60 normalized input')
        for layer in (0,2,4,6):
            w,b=self.layers[layer]
            x=elu(conv1d(x,w,b,stride=2 if layer in (2,4) else 1,padding=0 if layer==6 else 2))
        for layer in (8,10):
            w,b=self.layers[layer]
            x=elu(conv_transpose1d(x,w,b,stride=2,padding=1))
        w,b=self.layers[12]
        x=conv1d(x,w,b,padding=2)
        return x

    def score(self,window:np.ndarray,reference:np.ndarray)->float:
        from .deep_learning import normalize_window
        x=normalize_window(window,reference)
        out=self.reconstruct_normalized(x)
        return float(np.square(out-x).mean())

    def info(self)->dict:
        from .deep_learning import WINDOW_POINTS,REFERENCE_POINTS,PERIOD_SECONDS
        return {'status':'LOADED','architecture':'1D_CNN_AUTOENCODER',
                'inference_engine':'NUMPY_FROZEN_CNN','version':self.metadata['version'],
                'training_domain':'SYNTHETIC_NORMAL_ONLY',
                'validation_domain':'HELD_OUT_SYNTHETIC_PROFILES',
                'window_points':WINDOW_POINTS,'reference_points':REFERENCE_POINTS,
                'cadence_seconds':PERIOD_SECONDS,'threshold':self.threshold,
                'threshold_note':'95th percentile held-out synthetic validation; not a medical limit',
                'output_interpretation':'reconstruction novelty, not disease or health risk'}
