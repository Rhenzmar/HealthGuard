"""Candidate two-branch 17-channel CNN autoencoder for synthetic anomaly screening.

This candidate is NOT the frozen 5-channel model. It is deliberately not
loaded in production unless a separately validated candidate checkpoint is
provided. No NASA laboratory biomarker is used as a 1-Hz training feature.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
SCHEMA=ROOT/'data/synthetic_17ch/biomarker_schema.json'
CHECKPOINT=ROOT/'models/deep_learning/candidate_17ch/model.pt'
VERSION='candidate-17ch-two-branch-v1'
PHYS_COUNT=9
ENG_COUNT=8
WINDOW_POINTS=60
REFERENCE_POINTS=45

def load_schema(path:Path=SCHEMA)->dict:
    data=json.loads(Path(path).read_text(encoding='utf-8'))
    if data['feature_count']!=17 or len(data['feature_order'])!=17:
        raise ValueError('17-channel feature schema required')
    if data['branches']['physiological']!=list(range(9)) or data['branches']['engineering']!=list(range(9,17)):
        raise ValueError('Expected independent 9- and 8-channel branches')
    if (data['window_points'],data['reference_points'])!=(WINDOW_POINTS,REFERENCE_POINTS):
        raise ValueError('Incompatible baseline or window')
    return data

def schema_digest(path:Path=SCHEMA)->str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def create_network():
    try:
        import torch
        from torch import nn
    except ImportError as exc:
        raise RuntimeError('PyTorch required for training 17-channel candidate') from exc

    class TwoBranchAE(nn.Module):
        def __init__(self):
            super().__init__()
            self.phys_encoder=nn.Sequential(
                nn.Conv1d(9,16,5,padding=2), nn.ELU(),
                nn.Conv1d(16,12,5,stride=2,padding=2), nn.ELU(),
                nn.Conv1d(12,6,5,stride=2,padding=2), nn.ELU())
            self.eng_encoder=nn.Sequential(
                nn.Conv1d(8,12,5,padding=2), nn.ELU(),
                nn.Conv1d(12,10,5,stride=2,padding=2), nn.ELU(),
                nn.Conv1d(10,6,5,stride=2,padding=2), nn.ELU())
            self.fusion=nn.Sequential(nn.Conv1d(12,8,1),nn.ELU())
            self.expand=nn.Sequential(nn.Conv1d(8,12,1),nn.ELU())
            self.phys_decoder=nn.Sequential(
                nn.ConvTranspose1d(6,12,4,stride=2,padding=1), nn.ELU(),
                nn.ConvTranspose1d(12,16,4,stride=2,padding=1), nn.ELU(),
                nn.Conv1d(16,9,5,padding=2))
            self.eng_decoder=nn.Sequential(
                nn.ConvTranspose1d(6,10,4,stride=2,padding=1), nn.ELU(),
                nn.ConvTranspose1d(10,12,4,stride=2,padding=1), nn.ELU(),
                nn.Conv1d(12,8,5,padding=2))

        def forward(self,x):
            if x.ndim!=3 or x.shape[1:]!=(17,60):
                raise ValueError('Expected batch of normalized 17x60 signals')
            a=self.phys_encoder(x[:,:9,:])
            b=self.eng_encoder(x[:,9:,:])
            z=self.expand(self.fusion(torch.cat((a,b),dim=1)))
            return torch.cat((self.phys_decoder(z[:,:6,:]),
                              self.eng_decoder(z[:,6:,:])),dim=1)
    return TwoBranchAE()

def score_reconstruction(model, x:np.ndarray, *, batch_size:int=128)->dict[str,np.ndarray]:
    import torch
    tensor=np.asarray(x,dtype=np.float32)
    if tensor.ndim!=3 or tensor.shape[1:]!=(17,60) or not np.isfinite(tensor).all():
        raise ValueError('Finite 17x60 normalized sequences required')
    model.eval()
    errors=[]
    with torch.inference_mode():
        for start in range(0,len(tensor),batch_size):
            batch=torch.from_numpy(tensor[start:start+batch_size])
            result=model(batch)
            errors.append((result-batch).square().mean(dim=2).cpu().numpy())
    per_channel=np.concatenate(errors,axis=0)
    return {'per_channel':per_channel,
            'physiological':per_channel[:,:9].mean(axis=1),
            'engineering':per_channel[:,9:].mean(axis=1),
            'overall':per_channel.mean(axis=1)}

def verify_checkpoint(path:Path,expected_schema:Path=SCHEMA)->dict[str,Any]:
    import torch
    content=torch.load(path,map_location='cpu',weights_only=True)
    metadata=content['metadata']
    schema=load_schema(expected_schema)
    if metadata['feature_order']!=schema['feature_order'] or metadata['schema_sha256']!=schema_digest(expected_schema):
        raise ValueError('Candidate checkpoint schema mismatch')
    if metadata['version']!=VERSION or metadata['training_domain']!='FULLY_SYNTHETIC_NORMAL_ONLY':
        raise ValueError('Unexpected candidate training domain')
    model=create_network()
    model.load_state_dict(content['state_dict'],strict=True)
    return metadata
