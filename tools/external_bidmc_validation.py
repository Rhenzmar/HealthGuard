"""Independent-domain, 3-channel BIDMC research experiment.

Run: python -m tools.external_bidmc_validation
     python -m tools.external_bidmc_validation --no-download

This does NOT score the deployed five-channel model. It trains NEW 3-channel
research models on the real public BIDMC numerics. BIDMC consists of hospital
recordings without gold-standard abnormal-event labels. All detection labels
below come from deliberately injected, simulated perturbations into HELD-OUT
real numerical sequences. They are not clinical or astronaut risk labels.

Reference: Pimentel et al., BIDMC PPG and Respiration Dataset v1.0.0,
PhysioNet DOI 10.13026/C2208R; ODC Attribution License 1.0.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parent.parent
SOURCE = 'https://physionet.org/files/bidmc/1.0.0/bidmc_csv'
DATASET_DOI = '10.13026/C2208R'
DATA_DIR = BASE / 'data' / 'external' / 'bidmc_numerics'
RESULTS_DIR = BASE / 'research' / 'external_bidmc_v13'
CHANNELS = ('HR', 'RESP', 'SpO2')
SCALES = np.array([12.0, 4.0, 2.0], dtype=np.float32)
LIMITS = np.array([[20., 250.], [4., 70.], [50., 100.]], dtype=float)
REFERENCE = 45
WINDOW = 60
SEED = 1729


def download_numerics(directory: Path, *, timeout: int = 20) -> list[Path]:
    """Download only 53 public numeric files (~0.45 MB total), not 208 MB waveforms."""
    import requests
    directory.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    paths=[]
    for i in range(1,54):
        filename=f'bidmc_{i:02d}_Numerics.csv'
        path=directory/filename
        if not path.exists():
            url=f'{SOURCE}/{filename}'
            response=session.get(url,timeout=timeout)
            response.raise_for_status()
            content=response.content
            if len(content)>200_000 or not content.startswith(b'Time [s]'):
                raise RuntimeError(f'Unexpected BIDMC response for {filename}: cannot use as dataset')
            path.write_bytes(content)
        paths.append(path)
    return paths


def read_numerics(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Parse original per-second timestamps; preserve missing/invalid numbers as NaN."""
    with path.open('r',encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f,skipinitialspace=True)
        if reader.fieldnames is None:
            raise ValueError('No BIDMC CSV header')
        names={s.strip():s for s in reader.fieldnames}
        if not {'Time [s]','HR','RESP','SpO2'}.issubset(names):
            raise ValueError(f'Unexpected BIDMC columns {reader.fieldnames!r}')
        times=[]; values=[]
        for row in reader:
            try: t=float(row[names['Time [s]']])
            except (TypeError,ValueError): t=float('nan')
            v=[]
            for col in CHANNELS:
                try: val=float(row[names[col]])
                except (TypeError,ValueError): val=float('nan')
                v.append(val)
            times.append(t); values.append(v)
    t=np.asarray(times,dtype=float)
    v=np.asarray(values,dtype=float)
    if t.size<105 or not np.isfinite(t).all() or not np.allclose(np.diff(t),1,atol=0.05):
        raise ValueError(f'BIDMC timestamps are missing, irregular, or too short in {path.name}')
    return t,v


def valid_matrix(v: np.ndarray) -> np.ndarray:
    if v.ndim != 2 or v.shape[1] != 3: raise ValueError('Expected HR, RESP, SpO2 matrix')
    return np.isfinite(v).all(axis=1) & np.all((v>=LIMITS[:,0])&(v<=LIMITS[:,1]),axis=1)


def nonoverlapping_windows(v: np.ndarray) -> np.ndarray:
    """First 45 s fix baseline. Reject any incomplete window without imputation."""
    good=valid_matrix(v)
    if len(v)<REFERENCE+WINDOW or not good[:REFERENCE].all():
        return np.empty((0,3,WINDOW),dtype=np.float32)
    ref=np.median(v[:REFERENCE],axis=0)
    result=[]
    for start in range(REFERENCE,len(v)-WINDOW+1,WINDOW):
        if not good[start:start+WINDOW].all():continue
        result.append(((v[start:start+WINDOW]-ref)/SCALES).T.astype(np.float32))
    return np.stack(result) if result else np.empty((0,3,WINDOW),dtype=np.float32)


def fixed_split(names: list[str]) -> dict[str,list[str]]:
    """Recording-disjoint split; same recording never contributes to two partitions."""
    names=sorted(set(names))
    rng=np.random.default_rng(SEED)
    ordered=[names[i] for i in rng.permutation(len(names))]
    n=len(ordered)
    train=int(round(n*.60)); valid=int(round(n*.20))
    out={'train':sorted(ordered[:train]),'calibration':sorted(ordered[train:train+valid]),
         'test':sorted(ordered[train+valid:])}
    assert len({s for x in out.values() for s in x})==n
    return out


def summarize3(x: np.ndarray) -> np.ndarray:
    """Twelve features using the same four summaries as the 5-channel baseline."""
    a=np.asarray(x,dtype=np.float64)
    if a.ndim!=3 or a.shape[1:]!=(3,WINDOW):raise ValueError('Expected B x 3 x 60')
    return np.concatenate([a.mean(axis=2),a.std(axis=2),np.max(abs(a),axis=2),
                           a[:,:,-10:].mean(axis=2)-a[:,:,:10].mean(axis=2)],axis=1)


def cnn3():
    from torch import nn
    return nn.Sequential(nn.Conv1d(3,12,5,padding=2),nn.ELU(),
                         nn.Conv1d(12,8,5,stride=2,padding=2),nn.ELU(),
                         nn.ConvTranspose1d(8,12,4,stride=2,padding=1),nn.ELU(),
                         nn.Conv1d(12,3,5,padding=2))


def error_scores(model,x: np.ndarray) -> np.ndarray:
    import torch
    if not len(x):return np.empty(0)
    model.eval();errors=[]
    with torch.inference_mode():
        for group in np.array_split(x,max(1,int(math.ceil(len(x)/128)))):
            a=torch.from_numpy(np.asarray(group,dtype=np.float32))
            errors.extend((model(a)-a).square().mean(dim=(1,2)).tolist())
    return np.asarray(errors,dtype=float)


def covfit(x):
    z=summarize3(x)
    mu=z.mean(axis=0)
    c=np.cov(z,rowvar=False)
    mat=.70*c+.30*np.diag(np.diag(c))+.01*np.eye(12)
    return mu,np.linalg.inv(mat)


def covscore(x,mu,precision):
    if not len(x):return np.empty(0)
    d=summarize3(x)-mu
    return np.einsum('bi,ij,bj->b',d,precision,d)/len(mu)


def inject(x:np.ndarray,strength:str) -> np.ndarray:
    """Artificial numerical intervention, NOT a true medical event label."""
    x=np.asarray(x,dtype=np.float32).copy()
    if strength=='large':amount=np.array([18./12.,5./4.,-3./2.],dtype=np.float32)
    elif strength=='subtle':amount=np.array([5./12.,1./4.,-0.5/2.],dtype=np.float32)
    else:raise ValueError('Unknown perturbation')
    s=np.arange(WINDOW,dtype=np.float32)
    ramp=np.clip((s-10)/30,0,1)
    x += amount[None,:,None]*ramp[None,None,:]
    return x


def auc_unmodified_vs_injected(unmodified:np.ndarray, injected:np.ndarray) -> float | None:
    """Paired numerical-perturbation discrimination, NOT medical detection AUC."""
    if not len(unmodified) or len(unmodified)!=len(injected):return None
    from scipy.stats import rankdata
    scores=np.concatenate([unmodified,injected]);n=len(unmodified)
    ranks=rankdata(scores)
    return float((ranks[n:].sum()-n*(n+1)/2)/(n*n))


def run(*,directory:Path=DATA_DIR,output:Path=RESULTS_DIR,epochs:int=25,
        download:bool=True) -> dict:
    import torch
    torch.set_num_threads(2)
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    if download: paths=download_numerics(directory)
    else:
        paths=sorted(directory.glob('bidmc_??_Numerics.csv'))
        if len(paths)!=53:raise ValueError(f'Expected 53 BIDMC numerics files, found {len(paths)}')
    all_windows={};audit=[];hashes={}
    for path in sorted(paths):
        _,v=read_numerics(path)
        good=valid_matrix(v)
        frames=nonoverlapping_windows(v)
        all_windows[path.stem]=frames
        audit.append({'record':path.stem,'rows':len(v),'valid_rows':int(good.sum()),
                      'eligible_windows':len(frames),'complete_45s_baseline':bool(good[:REFERENCE].all())})
        hashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
    splits=fixed_split(list(all_windows))
    def gather(part):
        rows=[all_windows[s] for s in splits[part] if len(all_windows[s])]
        return np.concatenate(rows) if rows else np.empty((0,3,WINDOW),dtype=np.float32)
    train,cal,test=(gather(part) for part in ('train','calibration','test'))
    if min(map(len,[train,cal,test]))<5:raise ValueError('Insufficient complete windows in at least one record-disjoint split')
    network=cnn3()
    opt=torch.optim.Adam(network.parameters(),lr=.002,weight_decay=1e-5)
    history=[];best=float('inf');best_state=None
    from copy import deepcopy
    for epoch in range(epochs):
        network.train();order=torch.randperm(len(train))
        for ix in order.split(32):
            x=torch.from_numpy(train[ix.numpy()])
            loss=(network(x)-x).square().mean()
            opt.zero_grad();loss.backward();opt.step()
        val=float(error_scores(network,cal).mean())
        history.append({'epoch':epoch+1,'calibration_reconstruction_mean':val})
        if val<best:best=val;best_state=deepcopy(network.state_dict())
    network.load_state_dict(best_state)
    mean,precision=covfit(train)
    cnn_val=error_scores(network,cal);stat_val=covscore(cal,mean,precision)
    thresholds={'CNN3':float(np.quantile(cnn_val,.95)),'COV3':float(np.quantile(stat_val,.95))}
    baselines={'CNN3':error_scores(network,test),'COV3':covscore(test,mean,precision)}
    injections={level:inject(test,level) for level in ('large','subtle')}
    tests={}
    for label,baseline in baselines.items():
        score=lambda z: error_scores(network,z) if label=='CNN3' else covscore(z,mean,precision)
        vals={}
        for strength,xtest in injections.items():
            v=score(xtest)
            vals[strength]={'perturbed_window_flag_fraction':float(np.mean(v>thresholds[label])),
                            'paired_injection_discrimination_auc':auc_unmodified_vs_injected(baseline,v),
                            'new_flags_on_perturbed_windows':int(np.sum((baseline<=thresholds[label])&(v>thresholds[label])))}
        tests[label]={'threshold':thresholds[label],
                      'unmodified_test_novelty_fraction_NOT_false_positive_rate':float(np.mean(baseline>thresholds[label])),
                      'perturbation_experiments':vals}
    output.mkdir(parents=True,exist_ok=True)
    torch.save({'model_state':network.state_dict(),'channels':CHANNELS,
                'reference_points':REFERENCE,'window_points':WINDOW,
                'train_recordings':splits['train'],'domain':'BIDMC_ICU'},output/'cnn3_research.pt')
    np.savez_compressed(output/'cov3_research.npz',mean=mean,precision=precision,
                        threshold=thresholds['COV3'],channels=np.array(CHANNELS))
    result={
        'version':'v1.3','status':'COMPLETED_LOCAL_BIDMC_EVALUATION',
        'source':SOURCE,'citation_doi':DATASET_DOI,'license':'ODC-By-1.0',
        'population':'ICU recordings (NOT astronauts or healthy controls)',
        'training_input_channels':list(CHANNELS),'deployed_5channel_model_tested':False,
        'reason_5channel_unavailable':'BIDMC lacks measured core temperature and HRV; no imputation or fake observations used',
        'training_strategy':'New 3-channel research CNN and covariance comparator; never replaces deployed five-channel model',
        'record_disjoint_split':splits,
        'window_rule':'Fixed initial 45 s reference; 60-second nonoverlapping complete windows only',
        'records':audit,'file_sha256':hashes,
        'partition_window_counts':{'train':len(train),'calibration':len(cal),'test':len(test)},
        'models':tests,'training_curve':history,
        'warning':'No clinical event labels. Injected perturbation AUC is NOT disease prediction or health-monitoring sensitivity.'
    }
    (output/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    (output/'README.md').write_text('External BIDMC retrospective research results. No event labels; see results.json. \nSource: '+SOURCE+'\nDOI: '+DATASET_DOI+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('records','file_sha256','record_disjoint_split','training_curve')},indent=2))
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--no-download',action='store_true')
    parser.add_argument('--epochs',type=int,default=25)
    parser.add_argument('--source-dir',type=Path,default=DATA_DIR)
    parser.add_argument('--output',type=Path,default=RESULTS_DIR)
    args=parser.parse_args()
    run(directory=args.source_dir,output=args.output,epochs=args.epochs,download=not args.no_download)
