"""NumPy-only inference for the separately trained 17-channel CNN candidate.

No neural-network weights are fit during inference. The checkpoint export is
made by the training workflow, with CPU Torch/NumPy reconstruction parity
checked before the export can be committed. Existing five-channel inference
and historical NASA biomarker screening remain separate.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from threading import RLock
from collections import deque

import numpy as np

from .numpy_inference import conv1d,conv_transpose1d,elu
from .candidate_17ch import SCHEMA, VERSION, schema_digest, load_schema
from .engineering_sim import ENGINEERING_SOURCE, SIGNALS, engineering_snapshot
from .live_telemetry import METRICS, SOURCE

DEFAULT_EXPORT=Path(__file__).resolve().parent.parent / 'models/deep_learning/candidate_17ch/model_numpy.npz'
LAYER_KEYS=(
    'phys_encoder.0','phys_encoder.2','phys_encoder.4',
    'eng_encoder.0','eng_encoder.2','eng_encoder.4',
    'fusion.0','expand.0',
    'phys_decoder.0','phys_decoder.2','phys_decoder.4',
    'eng_decoder.0','eng_decoder.2','eng_decoder.4',
)

class Numpy17Candidate:
    def __init__(self,path:Path|str=DEFAULT_EXPORT):
        self.path=Path(path)
        schema=load_schema()
        self.feature_order=tuple(schema['feature_order'])
        self.scales=np.asarray([f['normalization_scale'] for f in schema['features']],dtype=np.float32)
        with np.load(self.path,allow_pickle=False) as obj:
            self.metadata=json.loads(str(obj['metadata_json']))
            self.layers={key:(np.asarray(obj[key+'.weight'],dtype=np.float32),
                              np.asarray(obj[key+'.bias'],dtype=np.float32))
                         for key in LAYER_KEYS}
        metadata=self.metadata
        if (metadata['version']!=VERSION
            or metadata['feature_order']!=list(self.feature_order)
            or metadata['schema_sha256']!=schema_digest()
            or metadata['training_domain']!='FULLY_SYNTHETIC_NORMAL_ONLY'
            or metadata.get('deployment_status')!='CANDIDATE_NOT_ACTIVATED'):
            raise ValueError('17-channel export provenance, schema or model version mismatch')
        self.threshold=float(metadata['calibration_threshold'])
        if not np.isfinite(self.threshold) or self.threshold<=0:
            raise ValueError('Invalid calibration threshold')
        self._validate_layers()

    def _validate_layers(self):
        shapes={
            'phys_encoder.0':(16,9,5),'phys_encoder.2':(12,16,5),
            'phys_encoder.4':(6,12,5),'eng_encoder.0':(12,8,5),
            'eng_encoder.2':(10,12,5),'eng_encoder.4':(6,10,5),
            'fusion.0':(8,12,1),'expand.0':(12,8,1),
            'phys_decoder.0':(6,12,4),'phys_decoder.2':(12,16,4),
            'phys_decoder.4':(9,16,5),
            'eng_decoder.0':(6,10,4),'eng_decoder.2':(10,12,4),
            'eng_decoder.4':(8,12,5)}
        for name,shape in shapes.items():
            w,b=self.layers[name]
            output=shape[1] if name.endswith(('.0','.2')) and '_decoder' in name else shape[0]
            if w.shape!=shape or b.shape!=(output,) or not np.isfinite(w).all() or not np.isfinite(b).all():
                raise ValueError(f'Bad exported weight shape or numerical values for {name}')

    def reconstruct(self, normalized:np.ndarray)->np.ndarray:
        x=np.asarray(normalized,dtype=np.float32)
        if x.shape!=(17,60) or not np.isfinite(x).all():
            raise ValueError('Expected finite 17x60 normalized input')
        a=x[:9]
        b=x[9:]
        for prefix in ('phys_encoder.0','phys_encoder.2','phys_encoder.4'):
            w,bias=self.layers[prefix]
            a=elu(conv1d(a,w,bias,stride=2 if prefix.endswith(('.2','.4')) else 1,padding=2))
        for prefix in ('eng_encoder.0','eng_encoder.2','eng_encoder.4'):
            w,bias=self.layers[prefix]
            b=elu(conv1d(b,w,bias,stride=2 if prefix.endswith(('.2','.4')) else 1,padding=2))
        z=np.concatenate((a,b),axis=0)
        for prefix in ('fusion.0','expand.0'):
            w,bias=self.layers[prefix]
            z=elu(conv1d(z,w,bias))
        outputs=[]
        for branch,hidden in [('phys_decoder',z[:6]),('eng_decoder',z[6:])]:
            for idx in (0,2):
                w,bias=self.layers[f'{branch}.{idx}']
                hidden=elu(conv_transpose1d(hidden,w,bias,stride=2,padding=1))
            w,bias=self.layers[f'{branch}.4']
            outputs.append(conv1d(hidden,w,bias,padding=2))
        output=np.concatenate(outputs,axis=0)
        if output.shape!=(17,60):
            raise ValueError('Unexpected 17-channel reconstruction shape')
        return output

    def score(self, window:np.ndarray, reference:np.ndarray)->dict:
        w=np.asarray(window,dtype=np.float32)
        r=np.asarray(reference,dtype=np.float32)
        if w.shape!=(60,17) or r.shape!=(17,) or not np.isfinite(w).all() or not np.isfinite(r).all():
            raise ValueError('Expected a finite 60x17 window and fixed 17-channel reference')
        normalized=((w-r[None,:])/self.scales[None,:]).T.copy()
        reconstructed=self.reconstruct(normalized)
        per_channel=np.square(normalized-reconstructed).mean(axis=1)
        return {
            'overall':float(per_channel.mean()),
            'physiological':float(per_channel[:9].mean()),
            'engineering':float(per_channel[9:].mean()),
            'per_channel':{self.feature_order[i]:float(error)
                           for i,error in enumerate(per_channel)}
        }

    def info(self)->dict:
        return {
            'status':'LOADED','version':self.metadata['version'],
            'architecture':'TWO_BRANCH_17_CHANNEL_1D_CNN_AUTOENCODER',
            'source_domain':'SYNTHETIC_NORMAL_ONLY',
            'calibration_threshold':self.threshold,
            'synthetic_validation_only':True,
            'clinical_validation':False,
            'inference_engine':'NUMPY_CPU',
            'deployment_role':'PARALLEL_CANDIDATE_NOT_CLINICAL_TRIAGE',
        }


class Live17CandidateMonitor:
    """Parallel candidate. Never changes original PhysioAlert decision."""
    def __init__(self,model:Numpy17Candidate|None,reason:str=''):
        self.model=model
        self.reason=reason
        self._states={}
        self._latest={}
        self._lock=RLock()

    def model_status(self)->dict:
        if self.model is None:
            return {'status':'MODEL_UNAVAILABLE','reason':self.reason,
                    'role':'PARALLEL_SYNTHETIC_CANDIDATE','clinical_validation':False}
        return self.model.info()

    def latest(self,subject_id:str)->dict|None:
        with self._lock:
            return self._latest.get(subject_id)

    def process(self,sample)->dict:
        sid=sample.subject_id
        with self._lock:
            state=self._states.setdefault(sid,{'reference_samples':[],
                   'reference':None,'window':deque(maxlen=60),'last_time':None})
            report={'subject_id':sid,'sequence':sample.sequence,
                    'source':'FULLY_SYNTHETIC_17_CHANNELS',
                    'model_role':'PARALLEL_CANDIDATE_NOT_CLINICAL_TRIAGE',
                    'NASA_laboratory_data_used':False,
                    'clinical_validation':False}
            try:
                if sample.source!=SOURCE:
                    raise ValueError('Only fictional simulated telemetry allowed')
                if set(sample.values)!=set(METRICS):
                    raise ValueError('Five physiological values required')
                eng=engineering_snapshot(sid,sample.sequence)
                if eng['source']!=ENGINEERING_SOURCE or set(eng['values'])!=set(SIGNALS):
                    raise ValueError('Engineering source mismatch')
                vals={**sample.values,**eng['values']}
                x=np.asarray([vals[k] for k in load_schema()['feature_order']],dtype=np.float32)
                if not np.isfinite(x).all():
                    raise ValueError('Nonfinite 17-channel signal')
                previous=state['last_time']
                state['last_time']=sample.timestamp
                if previous is not None and abs((sample.timestamp-previous).total_seconds()-1.0)>.15:
                    state['window'].clear()
                    if state['reference'] is None:
                        state['reference_samples'].clear()
                    report.update(status='IRREGULAR_CADENCE',reason='One-second packets required, window reset')
                elif self.model is None:
                    report.update(status='MODEL_UNAVAILABLE',reason=self.reason)
                elif state['reference'] is None:
                    state['reference_samples'].append(x)
                    if len(state['reference_samples'])>=45:
                        state['reference']=np.median(np.stack(state['reference_samples']),axis=0)
                        state['reference_samples'].clear()
                    report.update(status='BASELINE_CALIBRATING',progress=45 if state['reference'] is not None
                                  else len(state['reference_samples']),required=45)
                else:
                    state['window'].append(x)
                    if len(state['window'])<60:
                        report.update(status='WINDOW_COLLECTING',progress=len(state['window']),required=60)
                    else:
                        scored=self.model.score(np.stack(state['window']),state['reference'])
                        ranking=sorted(scored['per_channel'],key=scored['per_channel'].get,reverse=True)[:5]
                        report.update(
                            status='MODEL_FLAG' if scored['overall']>self.model.threshold else 'NO_MODEL_FLAG',
                            model_version=self.model.metadata['version'],
                            reconstruction_error=round(scored['overall'],7),
                            physiological_error=round(scored['physiological'],7),
                            engineering_error=round(scored['engineering'],7),
                            threshold=round(self.model.threshold,7),
                            flag=bool(scored['overall']>self.model.threshold),
                            largest_reconstruction_errors=[{'channel':k,'error':round(scored['per_channel'][k],7)}
                                                           for k in ranking],
                            warning='Synthetic-domain novelty, not a diagnosis or validated operational risk',
                        )
            except Exception as exc:
                report.update(status='MODEL_INPUT_REJECTED',reason=type(exc).__name__)
            self._latest[sid]=report
            return report

def load_candidate_monitor(path:Path|str=DEFAULT_EXPORT)->Live17CandidateMonitor:
    try:
        return Live17CandidateMonitor(Numpy17Candidate(path))
    except (FileNotFoundError,KeyError,ValueError,OSError,TypeError) as exc:
        return Live17CandidateMonitor(None,str(exc))
