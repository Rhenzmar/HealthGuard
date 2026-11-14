# HealthGuard 17-channel candidate: two-branch CNN autoencoder

**Status:** Experimental candidate for synthetic novelty screening, with a parallel read-only API output. The original five-channel CNN, baseline comparator and contextual PhysioAlert decision remain intact. This candidate must **not** be described as medically validated, NASA-trained, or capable of autonomous emergency diagnosis.

## Architecture and feature specification

Two 1D convolutional encoding branches jointly reconstruct 60 seconds of normalized signals. One branch receives **nine physiological/physiological-estimate channels** (the original five plus simulated systolic and diastolic blood-pressure estimates, peripheral temperature and EtCO₂). The other receives **eight engineering channels** (cabin CO₂, O₂ fraction, pressure, temperature, humidity, radiation rate, accumulated illustrative dose and suit oxygen reserve). The branches fuse through a compact temporal latent representation and decode separately. The complete ordered schema and units are in `data/synthetic_17ch/biomarker_schema.json`.

Each subject must supply 45 consecutive one-second samples for a fixed initial baseline, followed by a 60-second rolling analysis window. The model uses physical scaling declared in the schema and does not renormalize each window to itself. Full-window evaluation begins after 105 valid consecutive samples. Incomplete or irregular data are rejected rather than imputed.

## Data and provenance

Training and calibration use the generator in `tools/generate_17ch_dataset.py`. The generator produces fictional physiological and spacecraft signals with declared numerical assumptions. Training is normal-only. The split design uses separate synthetic identities for normal training, calibration and tests, with seven artificial disturbance scenarios appearing in test episodes only.

**No NASA astronaut time-series measurements, medical patient outcomes, or real spacecraft sensor readings were used to fit the 17-channel weights.** The verified OSD-569 and OSD-575 data are real, discrete laboratory records and are processed in a separate historical biomarker-screening module. They cannot directly fill the 17 required synchronized one-second inputs.

## Candidate v2 synthetic results

Version `candidate-17ch-two-branch-v2` uses seed 1729, 320 synthetic normal training episodes, 96 normal calibration episodes, and held-out synthetic evaluation on 96 normal plus 168 injected-event episodes. The 95th percentile calibration threshold is **0.0264081** reconstruction MSE. Normal synthetic test flag fraction was **4/96 (4.17%)**, and all 168 deliberately large injected-event episodes exceeded that threshold. The recorded synthetic ROC-AUC is 1.000. These events are easy, explicitly programmed disturbances and this result is **not medical accuracy, mission risk assessment, or external validation**.

An additional fictional four-crew replay check reported **0/304 normal rolling windows flagged** for v2. The first candidate flagged 103/304 (33.9%), motivating a broadening of the normal synthetic generator; therefore this four-crew replay has been used during development and is **not an independent holdout**. Long-duration real astronaut measurements and clinical validation remain unavailable.

## Training, evaluation and model selection

The training script is `tools/train_17ch_candidate.py` and evaluation details are in `evaluation.json`. The training pipeline uses deterministic seed 1729, AdamW, denoising mean squared error, separate branch losses, early stopping and a fixed 95th percentile calibration-normal reconstruction threshold. The primary result is a reconstruction novelty score, **not a probability of disease, adverse event or medical severity**.

The NumPy inference implementation in `physiograph/candidate_17ch_numpy.py` is checked against the original PyTorch network. The exact difference and tested input examples are documented in `numpy_parity_report.json`.

An **additional development compatibility test** in `runtime_compatibility_report.json` replays HealthGuard's four fictional demo astronauts under normal and excursion settings. Because the first candidate triggered many false flags on the demo normal streams, the synthetic normal training distribution was broadened. Subsequent replay results are development checks, not independent external clinical validation. The candidate is **not suitable for replacing PhysioAlert** if its normal-replay flag burden remains high.

## Deployment and interfaces

The original frozen five-channel model remains the model used by existing contextual PhysioAlert reviews. The candidate is accessible through `/api/live/candidate17/{subject_id}`, is attached under `candidate_17ch` in `/api/live/multisystem/{subject_id}`, and is included in the server's health model information. It is reported as separate experimental evidence and **does not silently change the main four-level training alert or operational crew guidance**.

## Explicit limitations

- Synthetic train/test data share generator assumptions, so ROC-AUC can be optimistically high.
- Cabin conditions and radiation are engineered inputs, not measured physiological biomarkers.
- The dashboard's four-level Optimal/Check/Warning/Critical statuses are scenario-training labels, not a validated mapping from model error to clinical risk.
- Repeated synthetic rolling windows are correlated; a window-level flag fraction is not a per-person clinical false-positive rate.
- NASA laboratory comparisons remain sparse, retrospective, and unsuitable for 1 Hz streaming reconstruction.
- Absence of a model flag is not evidence that an astronaut is healthy.
