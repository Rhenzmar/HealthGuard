# PHYSIOGRAPH v1.2 | Model Comparison + PhysioAlert Live Review

**Challenge:** NASA Space Apps 2026, Create Health Monitoring Software for Astronauts on Space Missions.

## Implemented

1. Continued from v1.1 with the same frozen PyTorch CNN autoencoder, original APDRA v0.7, original historical PhysioAlert v0.9, NASA datasets and retrospective research files. No original APDRA/PhysioAlert calculation was modified.
2. Added a **lightweight non-neural, trained statistical comparison detector**. Twenty prespecified features summarize 60 seconds of five normalized measurements. A shrunk covariance matrix is fit to 1,800 generated normal profiles; an anomaly-score threshold is fixed using 400 separate synthetic validation profiles. It requires NumPy only at inference and ships with a small `.npz` artifact.
3. Added deterministic `PhysioAlert Live Review` explanations built from the two model outputs. Outcomes are `BOTH_MODELS_FLAG`, `MODELS_DISAGREE`, `NO_MODEL_FLAG`, `CHECK_DATA_QUALITY`, or `EVIDENCE_INCOMPLETE`. The review never diagnoses disease or supplies urgency categories. It explicitly states that APDRA is not applied to continuous telemetry.
4. Every accepted telemetry packet now includes `deep_learning`, `comparison`, and `live_review` results, also included in WebSocket broadcast messages.
5. API additions: `/api/live/comparison/model`, `/api/live/comparison/{subject_id}`, `/api/live/review/{subject_id}`. The existing endpoints and standalone `/live` viewer are retained; the viewer has a new live review card.
6. The API gracefully degrades when either model is unavailable. Missing channels and irregular timestamps prevent valid scoring; packets retain the source `SIMULATED_LIVE`.
7. **145 automated tests pass**, including the unchanged original 126 and 19 additional software tests. These are *not* clinical, astronaut, or external machine-learning validations.

## Synthetic evaluation and important limitation

The new baseline uses independent pseudorandom training, calibration and held-out test streams *from the same artificial generator family*. Among 400 held-out synthetic normal episodes, **21 (5.25%)** exceeded its threshold. Injection-response counts for 7 numeric perturbations are in `models/deep_learning/statistical_baseline_evaluation.json`. These are not clinical false-positive rates or sensitivity estimates.

On a **second, distinct hand-scripted 180-sample normal replay**, the CNN gave `NO_MODEL_FLAG` on all 76 scored windows, but the statistical baseline flagged **43 of 76**. Therefore the detectors disagreed in 43 windows. On a matched deliberately exaggerated excursion replay, both flagged all 76 evaluated windows. These repeated, overlapping windows are not statistically independent and the replay is a development demonstration, not untouched external validation. We did **not** tune thresholds against this finding. It is a concrete demonstration that a synthetic-trained detector may overflag ordinary patterns under distribution shift.

**Critical takeaway:** Do not use joint flags, model agreement, or model thresholds to claim medical risk, operational urgency, or an astronaut diagnostic. The systems provide measurement-review prompts only.

## How to run on Windows

1. Extract the ZIP to a fresh folder. Python 3.11/3.12 recommended.
2. If v1.1 deep learning was not installed in that folder, run `INSTALL_DEEP_LEARNING_WINDOWS.bat` once. The statistical comparator needs no extra runtime library beyond NumPy.
3. Launch `START_LIVE_BACKEND_WINDOWS.bat`, then open `http://127.0.0.1:8000/live`.
4. In another terminal, run `RUN_LIVE_NORMAL_WINDOWS.bat` or `RUN_LIVE_REPLAY_WINDOWS.bat`. These use separate demonstration subject codes. Restart the backend before repeating the same replay subject.
5. To run tests: `RUN_BACKEND_TESTS_WINDOWS.bat` or `python -m pytest -q`.
6. To retrain the non-neural baseline (not necessary for the demo): `python -m tools.train_statistical_baseline`. Never claim such retraining improves medical validity.

## Security and source limitations

This is a **local-only unsecured development server**. Do not expose the POST ingestion API or pseudonymous histories publicly, do not store personal medical data, and do not claim real astronaut sensor integration. A publicly deployed version needs authentication, a read-only public demo mode, rate limiting, source attribution, model loading/memory checks, and a deployment review.

Historical NASA serum measurements are collected at sparse pre/postflight timepoints; they are not the continuous live 1 Hz demonstration and never train the CNN or statistical comparator.
