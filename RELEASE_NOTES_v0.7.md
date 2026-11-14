# PHYSIOGRAPH v0.7 — Frozen-Method APDRA Validation Build

- No algorithmic changes to the v0.6 APDRA core or NASA source data.
- Adds 24-seed synthetic numerical stress tests, 2/3 preflight sample conditions, and three component-ablation methods.
- Independent calibration and held-out test data, ROC AUC, matched false-screen targets and paired seed-level confidence intervals.
- Explicit NASA observational crosscheck with correct units and denominators.
- Adds 8 deterministic known-answer tests (65 tests total).
- Includes `RUN_FINAL_APDRA_VALIDATION_WINDOWS.bat` and a detailed `FINAL_APDRA_VALIDATION_REPORT.md`.
- Adds SciPy to Python requirements for validation.
- No clinical validation, no model-based disease diagnosis and no claims of universal superiority.
