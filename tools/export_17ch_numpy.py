"""Export fully trained 17-channel candidate to pure NumPy CPU inference.

Parity is checked on independently generated normal and held-out artificial
episodes. Export fails on any numerical discrepancy above tolerance.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

import numpy as np

from physiograph.candidate_17ch import CHECKPOINT,create_network, verify_checkpoint
from physiograph.candidate_17ch_numpy import (
    DEFAULT_EXPORT,Numpy17Candidate,LAYER_KEYS
)
from tools.generate_17ch_dataset import load_schema


def export(checkpoint:Path=CHECKPOINT, output:Path=DEFAULT_EXPORT,
           test_data:Path|None=None)->dict:
    import torch
    meta=verify_checkpoint(checkpoint)
    payload=torch.load(checkpoint,map_location='cpu',weights_only=True)
    model=create_network()
    model.load_state_dict(payload['state_dict'])
    model.eval()
    arrays={}
    for name in LAYER_KEYS:
        for suffix in ('weight','bias'):
            key=f'{name}.{suffix}'
            arrays[key]=payload['state_dict'][key].detach().cpu().numpy().astype(np.float32)
    arrays['metadata_json']=np.array(json.dumps(meta,sort_keys=True))
    output=Path(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    np.savez_compressed(output,**arrays)
    numpy_model=Numpy17Candidate(output)
    if test_data is None:
        test_data=checkpoint.parent/'generated'
    paths=[test_data/'test_normal.npz',test_data/'test_oxygenation.npz',
           test_data/'test_co2.npz',test_data/'test_radiation.npz']
    count=0
    max_difference=0.0
    for file in paths:
        with np.load(file,allow_pickle=False) as f:
            examples=np.asarray(f['X'],dtype=np.float32)
        for x in examples[:3]:
            with torch.inference_mode():
                expected=model(torch.from_numpy(x[None,:,:])).numpy()[0]
            actual=numpy_model.reconstruct(x)
            delta=float(np.max(np.abs(expected-actual)))
            max_difference=max(max_difference,delta)
            if not np.allclose(expected,actual,atol=1e-4,rtol=1e-4):
                raise ValueError(f'NumPy and PyTorch reconstruction differ at {file}: {delta}')
            count+=1
    result={'model_version':meta['version'],'cpu_export':str(output),
            'parity_examples':count,'max_abs_reconstruction_delta':max_difference,
            'tolerance':1e-4,
            'clinical_validation':False,'training_domain':meta['training_domain']}
    (output.parent/'numpy_parity_report.json').write_text(
        json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2),flush=True)
    return result

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--checkpoint',type=Path,default=CHECKPOINT)
    p.add_argument('--output',type=Path,default=DEFAULT_EXPORT)
    p.add_argument('--test-data',type=Path)
    args=p.parse_args()
    export(args.checkpoint,args.output,args.test_data)

if __name__=='__main__':
    main()
