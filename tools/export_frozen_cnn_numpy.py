"""Export existing checkpoint to NumPy (never retrain) and verify PyTorch parity.
Run on development machine: python -m tools.export_frozen_cnn_numpy
"""
import json
from pathlib import Path
import numpy as np
import torch
from physiograph.deep_learning import CNNAnomalyModel,normalize_window
from physiograph.numpy_inference import NPZ_PATH,NumpyCNNAnomalyModel


def run(path=NPZ_PATH, seed=777, n=32, tolerance=4e-5):
    torch.set_num_threads(2)
    model=CNNAnomalyModel()
    payload={'metadata_json':np.array(json.dumps(model.metadata,sort_keys=True))}
    for i,layer in enumerate(model.network):
        if isinstance(layer,(torch.nn.Conv1d,torch.nn.ConvTranspose1d)):
            payload[f'layer_{i}_weight']=layer.weight.detach().numpy().astype(np.float32)
            payload[f'layer_{i}_bias']=layer.bias.detach().numpy().astype(np.float32)
    path=Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    np.savez_compressed(path,**payload)
    numpy_model=NumpyCNNAnomalyModel(path)
    rng=np.random.default_rng(seed)
    maximum=0.
    for i in range(n):
        ref=np.array([rng.uniform(55,90),rng.uniform(96,99),rng.uniform(10,20),
                      rng.uniform(36,37.2),rng.uniform(35,85)],dtype=np.float32)
        # Include both plausible and out-of-family values as regression tests.
        scale=np.array([15,2.5,5,.5,25],dtype=np.float32)
        window=ref[None,:]+rng.normal(0,1,(60,5)).astype(np.float32)*scale[None,:]*(.05+i/12)
        x=normalize_window(window,ref)
        with torch.inference_mode():
            refout=model.network(torch.from_numpy(x[None,:,:]))[0].numpy()
        newout=numpy_model.reconstruct_normalized(x)
        diff=float(np.max(np.abs(refout-newout)))
        maximum=max(maximum,diff)
        if diff>tolerance:raise AssertionError(f'NumPy CNN parity failed: {diff} > {tolerance}')
        p=model.score(window,ref);q=numpy_model.score(window,ref)
        if abs(p-q)>tolerance:raise AssertionError(f'CNN score parity failed: {p} vs {q}')
    result={'status':'PASS','windows_tested':n,'max_abs_reconstruction_difference':maximum,
            'required_tolerance':tolerance,'source_checkpoint':str(model.path.name),
            'weights_exported_file':path.name,
            'note':'NumPy implementation runs same learned CNN weights, NOT a new ML model.'}
    (path.parent/'numpy_parity_report.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2));return result

if __name__=='__main__':run()
