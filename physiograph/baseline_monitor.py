"""Lightweight unsupervised comparison baseline for simulated telemetry only.

A shrunk-covariance novelty detector is deliberately easier to reproduce than
another neural model. It is fit to independent synthetic normal episodes and
calibrated on other synthetic normal episodes. No clinical interpretation.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path
from threading import RLock
from typing import Any
import math

import numpy as np

from .deep_learning import FEATURES, FEATURE_SCALES, REFERENCE_POINTS, WINDOW_POINTS, PERIOD_SECONDS, normalize_window
from .live_telemetry import LiveSample, SOURCE

DEFAULT_BASELINE = Path(__file__).resolve().parent.parent / 'models' / 'deep_learning' / 'statistical_baseline.npz'


def summarize_window(normalized: np.ndarray) -> np.ndarray:
    """20 predeclared shape/level features; input channels x time."""
    a = np.asarray(normalized, dtype=np.float64)
    if a.shape != (len(FEATURES), WINDOW_POINTS) or not np.isfinite(a).all():
        raise ValueError('Expected finite 5 x 60 normalized matrix')
    return np.concatenate([a.mean(axis=1), a.std(axis=1),
                           np.max(np.abs(a), axis=1),
                           a[:, -10:].mean(axis=1)-a[:, :10].mean(axis=1)])


class StatisticalBaselineModel:
    def __init__(self, path: str | Path = DEFAULT_BASELINE):
        self.path = Path(path)
        with np.load(self.path, allow_pickle=False) as z:
            self.mean = np.array(z['mean'], dtype=np.float64)
            self.precision = np.array(z['precision'], dtype=np.float64)
            self.threshold = float(z['threshold'])
            self.schema = tuple(str(x) for x in z['features'])
            self.version = str(z['version'])
        if (self.mean.shape != (20,) or self.precision.shape != (20, 20)
                or self.schema != FEATURES or not np.isfinite(self.mean).all()
                or not np.isfinite(self.precision).all()
                or not np.isfinite(self.threshold) or self.threshold <= 0):
            raise ValueError('Invalid statistical novelty artifact')

    def score(self, normalized: np.ndarray) -> float:
        delta=summarize_window(normalized)-self.mean
        return float(delta @ self.precision @ delta / len(delta))

    def info(self) -> dict[str, Any]:
        return {'status':'LOADED','architecture':'SHRUNK_COVARIANCE_NOVELTY',
                'version':self.version,'calibration_threshold':self.threshold,
                'training_domain':'SYNTHETIC_NORMAL_ONLY','clinical_validation':False,
                'description':'Independent non-neural comparison baseline; not a disease classifier'}


class LiveStatisticalMonitor:
    """Separate per-subject reference, so one simulated crew member cannot mix with another."""
    def __init__(self, model: StatisticalBaselineModel | None, unavailable_reason: str=''):
        self.model=model
        self.unavailable_reason=unavailable_reason
        self._states: dict[str,dict] = {}
        self._latest: dict[str,dict] = {}
        self._history: dict[str,deque] = {}
        self._lock=RLock()

    def model_status(self):
        return self.model.info() if self.model else {'status':'MODEL_UNAVAILABLE','reason':self.unavailable_reason,'clinical_validation':False}

    def latest(self, sid: str):
        with self._lock: return self._latest.get(sid)

    def history(self, sid: str, limit=120):
        if not 1 <= limit <= 300: raise ValueError('limit must be 1-300')
        with self._lock: return list(self._history.get(sid,()))[-limit:]

    def process(self, sample: LiveSample) -> dict:
        if sample.source != SOURCE: raise ValueError('Only simulated data may be scored')
        with self._lock:
            sid=sample.subject_id
            st=self._states.setdefault(sid,{'last':None,'reference_samples':[], 'reference':None,'window':deque(maxlen=WINDOW_POINTS)})
            last=st['last'];st['last']=sample.timestamp
            result={'subject_id':sid,'sequence':sample.sequence,'source':SOURCE,
                    'clinical_validation':False,'training_domain':'SYNTHETIC_NORMAL_ONLY',
                    'model':'SHRUNK_COVARIANCE_NOVELTY',
                    'disclaimer':'Research-only pattern novelty; no medical diagnosis or emergency status'}
            if last is not None and abs((sample.timestamp-last).total_seconds()-PERIOD_SECONDS)>0.15:
                st['window'].clear()
                if st['reference'] is None: st['reference_samples'].clear()
                result.update(status='IRREGULAR_CADENCE',reason='Reset after irregular sampling interval')
            elif set(sample.values)!=set(FEATURES):
                st['window'].clear()
                if st['reference'] is None: st['reference_samples'].clear()
                result.update(status='INCOMPLETE_METRICS',reason='All five metrics are required; no imputation')
            elif self.model is None:
                result.update(status='MODEL_UNAVAILABLE',reason=self.unavailable_reason)
            else:
                v=np.array([sample.values[f] for f in FEATURES],dtype=np.float32)
                if st['reference'] is None:
                    st['reference_samples'].append(v)
                    count=len(st['reference_samples'])
                    if count>=REFERENCE_POINTS:
                        st['reference']=np.median(np.asarray(st['reference_samples']),axis=0)
                        st['reference_samples'].clear()
                    result.update(status='BASELINE_CALIBRATING',progress=count,required=REFERENCE_POINTS)
                else:
                    st['window'].append(v)
                    if len(st['window'])<WINDOW_POINTS:
                        result.update(status='WINDOW_COLLECTING',progress=len(st['window']),required=WINDOW_POINTS)
                    else:
                        normalized=normalize_window(np.asarray(st['window']),st['reference'])
                        score=self.model.score(normalized)
                        flagged=score>self.model.threshold
                        result.update(status='MODEL_FLAG' if flagged else 'NO_MODEL_FLAG',
                                      flag=bool(flagged),novelty_score=round(score,7),
                                      calibration_threshold=round(self.model.threshold,7),
                                      threshold_type='SYNTHETIC_VALIDATION_95TH_PERCENTILE',
                                      baseline_source='INITIAL_45_SIMULATED_SAMPLES',
                                      window_points=WINDOW_POINTS)
            self._latest[sid]=result
            self._history.setdefault(sid,deque(maxlen=300)).append(result)
            return result


def load_baseline(path: str | Path=DEFAULT_BASELINE):
    try: return LiveStatisticalMonitor(StatisticalBaselineModel(path))
    except (FileNotFoundError, ValueError, KeyError, TypeError) as exc:
        return LiveStatisticalMonitor(None, str(exc))
