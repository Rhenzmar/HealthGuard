# PhysioGraph v1.3 | Computational Audit, External-Domain Evaluator & Light CNN Inference

**Updated on 2026-11-14. Backend/computational work only.**

## What's actually completed

1. Preserved the existing NASA OSD-575 datasets and APDRA v0.7 algorithms. No new claims of clinical effectiveness or astronaut diagnosis.
2. Ran all **159 automated tests (159 passed)** after the additions. This includes 145 earlier tests and 14 new source validation / NumPy parity tests.
3. Added an independent-code **synthetic stress simulator**. Original five-channel CNN and covariance thresholds stayed frozen, with reproducible seed 246810.
4. Exported the trained **same five-channel CNN weights** into a NumPy-only CPU forward pass, which avoids importing PyTorch for inference. Tested against original PyTorch reconstruction on 32 generated windows; maximum absolute output difference **7.152557373046875e-7**. It is not a new trained model.
5. Benchmarked CPU inference: in this container, full API + 105 ingested simulated packets used ~111.7 MiB RSS with NumPy versus ~270.7 MiB with PyTorch, with equivalent final model/review status. Hardware and deployment figures will differ. The NumPy export is ~kilobytes, but real load still includes Python/FastAPI.
6. Added separate **BIDMC three-channel evaluator** that downloads the 53 official *Numerics.csv files* (HR, RR, SpO2), makes a record-disjoint 60/20/20 split, excludes invalid and incomplete windows, trains a **separate** three-channel research CNN and covariance comparator, calibrates only on held-out recordings, and tests injected numerical perturbations on unseen recordings. This evaluator has tests but **was NOT run against the actual BIDMC files in this environment**, where direct file download was unavailable. Its real-data metrics must not be claimed until the script completes and produces `research/external_bidmc_v13/results.json`.
7. Included `requirements-live-lite.txt` for lightweight live API deployment. **The API remains a localhost-only demonstration; it has no authentication or secure public ingest endpoint.** Don't expose its write endpoint to the internet without security changes.

## Key frozen-model stress results (160 episodes per condition)

| Independent synthetic condition | CNN flag fraction | Covariance flag fraction | Models disagree |
|---|---:|---:|---:|
| Quiet-like numerical variation | 3.75% | 5.625% | 5.625% |
| Activity-like numerical variation | 100% | 100% | 0% |
| Brief sensor artifact | 100% | 100% | 0% |
| Subtle ramp | 20% | 65% | 46.25% |
| Large multi-signal shift | 100% | 100% | 0% |

These scenarios are **synthetic; no clinically labeled normals or diseases**. The activity-like result demonstrates that both flags can reflect activity context rather than danger. They are novelty, not risk levels. Subtle-ramp performance shows substantial sensitivity differences. **No thresholds were optimized using these audits.**

Reproduce: `python -m tools.audit_live_models_v13` (writes `research/live_model_v13_audit/stress_results.json`).

## Real-data external experiment (pending actual dataset run)

Source: PhysioNet BIDMC PPG and Respiration Dataset, v1.0.0, DOI 10.13026/C2208R; ODC Attribution License 1.0.

The 53 original ICU numerical traces supply measured HR, respiratory rate and SpO2 at 1 Hz. They **do not** supply the required core temperature and HRV. Therefore the five-channel v1.1-v1.2 deployed CNN **cannot be externally validated on BIDMC** as-is. Do not fabricate channels. The optional three-channel study trains a *new* architecture on BIDMC recordings. It cannot validate astronaut health anomaly detection, because BIDMC has no medical emergency event labels for this task.

Execute on an internet-connected PC with deep-learning dependencies:

`python -m tools.external_bidmc_validation`

or double-click `RUN_EXTERNAL_VALIDATION_WINDOWS.bat`. The program downloads just 53 numerics CSVs, records original file SHA-256 hashes, never fills missing data, and generates `research/external_bidmc_v13/results.json`. If a recording fails to meet quality gates, it is excluded with the count documented. Test labels are only numerical perturbations added to held-out real windows. Results show **unmodified-window novelty fraction**, **injected-perturbation flag fraction**, and **paired perturbation AUC**, never clinical false-positive/true-positive or diagnostic AUC. The original five-channel weights remain unchanged.

## Deployable CPU model (experimental)

To select the equivalent NumPy inference engine locally:

Windows PowerShell: `$env:PHYSIOGRAPH_INFERENCE_BACKEND='numpy'`

Windows cmd.exe: `set PHYSIOGRAPH_INFERENCE_BACKEND=numpy`

Run the usual `START_LIVE_BACKEND_WINDOWS.bat`. On minimal deployment, install `requirements-live-lite.txt` and run `python -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000`.

**Do not publicly deploy this demo's unauthenticated POST endpoint.** A read-only public demonstration or authenticated ingest service must be implemented before internet exposure.

## Kept for later

Visual redesign, 3D anatomy, Mars/Lunar HUD, voice alerts, Mission Control and interactive guided tour remain frontend/experience backlog. No feature is claimed complete merely because it appeared in HELIOS's demo.
