"""Experimental 1D-CNN autoencoder for SIMULATED astronaut-like vital streams.

IMPORTANT: This module is NOT an astronaut health diagnostic or APDRA extension.
Training/calibration use synthetic vital-sign profiles, with no real clinical labels.
The model estimates sequence reconstruction novelty; scores are not probabilities.
The original v0.7 APDRA research module is intentionally untouched.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Any
import math

import numpy as np

from .live_telemetry import LiveSample, METRICS, SOURCE

FEATURES = tuple(METRICS)
FEATURE_SCALES = np.array([12.0, 2.0, 4.0, 0.4, 20.0], dtype=np.float32)
REFERENCE_POINTS = 45
WINDOW_POINTS = 60
PERIOD_SECONDS = 1.0
DEFAULT_CHECKPOINT = Path(__file__).resolve().parent.parent / "models" / "deep_learning" / "cnn_autoencoder.pt"


def _torch():
    try:
        import torch
        from torch import nn
        return torch, nn
    except ImportError as exc:
        raise RuntimeError("PyTorch not installed. See requirements-deep-learning.txt") from exc


def build_network():
    """A genuine trainable, compact temporal convolutional autoencoder."""
    torch, nn = _torch()
    return nn.Sequential(
        nn.Conv1d(len(FEATURES), 16, 5, padding=2), nn.ELU(),
        nn.Conv1d(16, 12, 5, stride=2, padding=2), nn.ELU(),
        nn.Conv1d(12, 8, 5, stride=2, padding=2), nn.ELU(),
        nn.Conv1d(8, 3, 1), nn.ELU(),
        nn.ConvTranspose1d(3, 12, 4, stride=2, padding=1), nn.ELU(),
        nn.ConvTranspose1d(12, 16, 4, stride=2, padding=1), nn.ELU(),
        nn.Conv1d(16, len(FEATURES), 5, padding=2),
    )


def normalize_window(window: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Normalize by FIXED external reference and predeclared physical scales.

    We do not normalize each window to its own mean: doing so can hide an
    otherwise important sustained change. No NASA relative-protein NPQ enters.
    """
    w = np.asarray(window, dtype=np.float32)
    r = np.asarray(reference, dtype=np.float32)
    if w.shape != (WINDOW_POINTS, len(FEATURES)) or r.shape != (len(FEATURES),):
        raise ValueError("Expected a 60x5 window and fixed 5-dimensional baseline")
    if not (np.isfinite(w).all() and np.isfinite(r).all()):
        raise ValueError("Nonfinite measurements cannot be scored")
    return ((w-r[None, :]) / FEATURE_SCALES[None, :]).T.copy()


class CNNAnomalyModel:
    """Load a fixed trained checkpoint for inference; never fit during monitoring."""
    def __init__(self, path: Path | str = DEFAULT_CHECKPOINT):
        torch, _ = _torch()
        self.path = Path(path)
        if not self.path.is_file():
            raise FileNotFoundError(f"Trained model not found: {self.path}")
        checkpoint = torch.load(self.path, map_location="cpu", weights_only=True)
        metadata = checkpoint["metadata"]
        if (tuple(metadata["features"]) != FEATURES
                or int(metadata["window_points"]) != WINDOW_POINTS
                or int(metadata["reference_points"]) != REFERENCE_POINTS
                or list(metadata["scales"]) != [float(x) for x in FEATURE_SCALES]):
            raise ValueError("Model checkpoint feature schema does not match live telemetry")
        self.network = build_network()
        self.network.load_state_dict(checkpoint["model_state"])
        self.network.eval()
        self.threshold = float(metadata["calibration_threshold"])
        if not math.isfinite(self.threshold) or self.threshold <= 0:
            raise ValueError("Invalid model threshold")
        self.metadata = metadata

    def score(self, window: np.ndarray, reference: np.ndarray) -> float:
        torch, _ = _torch()
        tensor = torch.from_numpy(normalize_window(window, reference)[None, :, :])
        with torch.inference_mode():
            reconstruction = self.network(tensor)
            score = torch.mean(torch.square(reconstruction - tensor)).item()
        return float(score)

    def info(self) -> dict[str, Any]:
        return {"status":"LOADED", "architecture":"1D_CNN_AUTOENCODER",
                "version":self.metadata["version"],
                "training_domain":"SYNTHETIC_NORMAL_ONLY",
                "validation_domain":"HELD_OUT_SYNTHETIC_PROFILES",
                "window_points":WINDOW_POINTS,"reference_points":REFERENCE_POINTS,
                "cadence_seconds":PERIOD_SECONDS,
                "threshold":self.threshold,
                "threshold_note":"95th percentile of held-out simulated normal validation scores; not a medical limit",
                "output_interpretation":"reconstruction novelty, not disease or health risk"}


class LiveCNNMonitor:
    """Per-subject warmup reference + rolling 60-point inference, no NASA crossover.

    Ingestion happens after LiveStore validates order, unit schema and provenance.
    Initial reference stays fixed; a disrupted window must refill before inference.
    """
    def __init__(self, model: CNNAnomalyModel | None, *, unavailable_reason: str = ""):
        self.model = model
        self.unavailable_reason = unavailable_reason
        self._lock = RLock()
        self._states: dict[str, dict[str, Any]] = {}
        self._latest: dict[str, dict[str, Any]] = {}
        self._history: dict[str, deque[dict[str, Any]]] = {}

    def model_status(self) -> dict[str, Any]:
        if self.model is None:
            return {"status":"MODEL_UNAVAILABLE", "reason":self.unavailable_reason,
                    "training_domain":"SYNTHETIC_NORMAL_ONLY", "clinical_validation":False}
        return {**self.model.info(), "clinical_validation":False}

    def latest(self, subject_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._latest.get(subject_id)

    def history(self, subject_id: str, limit: int = 120) -> list[dict[str, Any]]:
        if not 1 <= limit <= 300:
            raise ValueError("limit must be between 1 and 300")
        with self._lock:
            return list(self._history.get(subject_id, ())) [-limit:]

    @staticmethod
    def _report(status: str, subject_id: str, *, sequence: int, reason: str = "", **more):
        return {"subject_id":subject_id,"sequence":sequence,"status":status,
                "source": SOURCE, "training_domain":"SYNTHETIC_NORMAL_ONLY",
                "clinical_validation":False,
                "disclaimer":"Experimental pattern novelty only; not a medical diagnosis, risk probability or emergency alert",
                **({"reason":reason} if reason else {}), **more}

    def process(self, sample: LiveSample) -> dict[str, Any]:
        if sample.source != SOURCE:
            raise ValueError("Deep-learning monitor accepts only simulated telemetry")
        with self._lock:
            sid=sample.subject_id
            if sid not in self._states:
                self._states[sid] = {"reference_samples":[],"reference":None,
                                     "window":deque(maxlen=WINDOW_POINTS),"last_time":None}
            st=self._states[sid]
            prev = st["last_time"]
            st["last_time"] = sample.timestamp
            # Exact sampling rate required by current trained checkpoint; reject all
            # irregular intervals so no resampling or interpolated values are fabricated.
            if prev is not None and abs((sample.timestamp-prev).total_seconds()-PERIOD_SECONDS)>0.15:
                st["window"].clear()
                if st["reference"] is None:
                    st["reference_samples"].clear()
                out=self._report("IRREGULAR_CADENCE",sid,sequence=sample.sequence,
                                 reason="Expected consecutive one-second samples; rolling model window reset")
            elif set(sample.values) != set(FEATURES):
                st["window"].clear()
                if st["reference"] is None:
                    st["reference_samples"].clear()
                out=self._report("INCOMPLETE_METRICS",sid,sequence=sample.sequence,
                                 reason="All five measurements are required; no missing-value imputation")
            elif self.model is None:
                out=self._report("MODEL_UNAVAILABLE",sid,sequence=sample.sequence,
                                 reason=self.unavailable_reason)
            else:
                vector=np.array([sample.values[f] for f in FEATURES],dtype=np.float32)
                if st["reference"] is None:
                    st["reference_samples"].append(vector)
                    if len(st["reference_samples"])>=REFERENCE_POINTS:
                        st["reference"]=np.median(np.asarray(st["reference_samples"]),axis=0)
                        st["reference_samples"].clear()
                    out=self._report("BASELINE_CALIBRATING",sid,sequence=sample.sequence,
                                     progress=min(REFERENCE_POINTS,len(st["reference_samples"])) if st["reference"] is None else REFERENCE_POINTS,
                                     required=REFERENCE_POINTS,
                                     reason="No model alert until the subject-specific initial reference is collected")
                else:
                    st["window"].append(vector)
                    if len(st["window"])<WINDOW_POINTS:
                        out=self._report("WINDOW_COLLECTING",sid,sequence=sample.sequence,
                                         progress=len(st["window"]),required=WINDOW_POINTS)
                    else:
                        score=self.model.score(np.asarray(st["window"]), st["reference"])
                        is_novel=score>self.model.threshold
                        out=self._report("MODEL_FLAG" if is_novel else "NO_MODEL_FLAG",sid,
                                         sequence=sample.sequence,
                                         model_version=self.model.metadata["version"],
                                         reconstruction_error=round(score,7),
                                         calibration_threshold=round(self.model.threshold,7),
                                         flag=bool(is_novel),
                                         threshold_type="SYNTHETIC_VALIDATION_95TH_PERCENTILE",
                                         baseline_source="INITIAL_45_SIMULATED_SAMPLES",
                                         window_points=WINDOW_POINTS)
            self._latest[sid]=out
            self._history.setdefault(sid,deque(maxlen=300)).append(out)
            return out


def load_monitor(path: Path | str = DEFAULT_CHECKPOINT) -> LiveCNNMonitor:
    """Load the original frozen CNN with optional NumPy-only CPU inference.

    PHYSIOGRAPH_INFERENCE_BACKEND=numpy is intended for free CPU hosting.
    Defaults to PyTorch locally and falls back to the verified NumPy export only
    when PyTorch is missing AND the standard checkpoint was requested. Explicit
    missing/corrupt custom checkpoint paths never silently load another model.
    """
    import os
    from .numpy_inference import NumpyCNNAnomalyModel, NPZ_PATH

    selected=os.environ.get('PHYSIOGRAPH_INFERENCE_BACKEND','auto').lower()
    if selected not in ('auto','numpy','torch'):
        return LiveCNNMonitor(None, unavailable_reason='Invalid PHYSIOGRAPH_INFERENCE_BACKEND')
    if selected=='numpy':
        try:
            # Guard against loading a different model when a caller specified
            # an alternate (possibly missing) checkpoint.
            if Path(path).resolve()!=DEFAULT_CHECKPOINT.resolve():
                raise ValueError('NumPy engine only supports the frozen default checkpoint')
            return LiveCNNMonitor(NumpyCNNAnomalyModel(NPZ_PATH))
        except (FileNotFoundError, ValueError, KeyError, TypeError, OSError) as exc:
            return LiveCNNMonitor(None, unavailable_reason=str(exc))
    try:
        return LiveCNNMonitor(CNNAnomalyModel(path))
    except (RuntimeError, FileNotFoundError, ValueError, KeyError, TypeError) as exc:
        # Only a missing Torch installation may use the same checkpoint's
        # exported NumPy weights. Any other failure remains visible.
        if selected=='auto' and 'PyTorch not installed' in str(exc) and Path(path).resolve()==DEFAULT_CHECKPOINT.resolve():
            try:
                return LiveCNNMonitor(NumpyCNNAnomalyModel(NPZ_PATH))
            except (FileNotFoundError, ValueError, KeyError, TypeError, OSError):
                pass
        return LiveCNNMonitor(None, unavailable_reason=str(exc))
