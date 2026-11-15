# PhysioGraph v1.5: Backend Freeze Candidate

**Current version: v1.5.** Backend-first hackathon release for the NASA Space Apps astronaut-health-monitoring challenge. Includes frozen APDRA research analysis, two synthetic-trained live detectors, context-aware PhysioAlert, an internally generated public read-only simulation, and an OSD-575 historical-data API. **This is a research/demo prototype, not medically validated astronaut health software.**

- **Run locally (NumPy CPU, no PyTorch needed for inference):** `python -m pip install -r requirements-live-lite.txt`, then double-click `START_PUBLIC_DEMO_WINDOWS.bat` or run `python -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000`. Open `http://127.0.0.1:8000/live`.
- **Run verification:** `python -m pip install -r requirements-deep-learning.txt` for the full research environment, then `python -m pytest -q` and `python -m tools.final_backend_audit_v15`. In this release, **192/192 software tests passed**.
- **Deploy:** `Dockerfile` is configured for a lightweight **read-only fictional telemetry demo** and can run on a suitable free CPU service, subject to host limits. It doesn't require an ingest API key because the demo producer is internal.
- **Frontend wiring:** follow `FRONTEND_API_CONTRACT_v1.5.md`; detailed limitations and audit evidence are in `RELEASE_NOTES_v1.5.md`.
- **External BIDMC:** a separate 3-channel study script is provided but not yet completed on the official downloaded records. This is not validation of the deployed five-channel CNN or medical outcomes.

---

# PhysioGraph v1.4 Context-Aware Backend

Backend v1.4 adds explicit activity declarations, measurement-integrity hints, a 60-second post-activity observation state, nonclinical two-model persistence reviews, deterministic explanation text, and a protected public-ingest configuration. Existing NASA research, APDRA, synthetic-trained CNN weights and covariance thresholds are preserved. **181 software tests pass**. See `RELEASE_NOTES_v1.4.md` and `research/context_v14_audit/behavioral_audit.json`.

The internal stress scenarios are synthetic demonstrations of software behavior, **not health risk classification or diagnostic accuracy**. External BIDMC evaluation is an optional separate 3-channel research task and remains pending.

For free CPU hosting, use `Dockerfile` (NumPy inference; public ingest disabled until a private key is configured). Do not publish a secret to the browser.

---

# PhysioGraph v1.3 Computational Update

Backend-only v1.3 adds **frozen-CNN NumPy inference**, an **independent-code synthetic stress audit**, a **BIDMC three-channel external research evaluator**, and **159 passing tests**. Read `RELEASE_NOTES_v1.3.md` before interpreting any scores. Actual external BIDMC model evaluation is **pending** until the public numeric files are downloaded and the script completes.

Run `RUN_COMPUTATIONAL_AUDIT_WINDOWS.bat` for local model stress and benchmark; `RUN_EXTERNAL_VALIDATION_WINDOWS.bat` for the separate official-data experiment. The deployed five-channel CNN is still trained only on synthetic sequences.

---

# PHYSIOGRAPH

NASA Space Apps 2026: **Create Health Monitoring Software for Astronauts on Space Missions**.

Current release: **v1.4, dual-detector monitoring with context-aware verification**.

**Local quick start (Windows):** run `INSTALL_DEEP_LEARNING_WINDOWS.bat` once, then `START_LIVE_BACKEND_WINDOWS.bat`. Open `http://127.0.0.1:8000/live`. In a separate terminal run `RUN_LIVE_REPLAY_WINDOWS.bat` for an injected excursion or `RUN_LIVE_NORMAL_WINDOWS.bat` for normal simulated readings. Run `RUN_BACKEND_TESTS_WINDOWS.bat` for the full software test suite. On successive replays of the same subject, restart the backend or use a different subject ID.

**APDRA/historical research app:** run `START_PHYSIOGRAPH_WINDOWS.bat`. OSD-575 measurements are historical, discrete pre/postflight assays. They are not the simulated 1 Hz live data. APDRA v0.7 remains frozen; the original historical PhysioAlert review logic is not changed.

**Deep learning:** a 1D CNN autoencoder trained only on synthetic normal five-channel telemetry. **Comparison detector:** a shrinkage-covariance baseline trained/calibrated only on independent synthetic profiles. **PhysioAlert Live Review:** a deterministic evidence summary comparing the detectors; neither model determines clinical risk, diagnoses, or emergency status.

See `RELEASE_NOTES_v1.4.md`, `RELEASE_NOTES_v1.2.md`, `RELEASE_NOTES_v1.1.md`, `FINAL_APDRA_VALIDATION_REPORT.md` and `models/deep_learning/*evaluation.json` for methodology, limitations, training provenance, and test results.

**Do not expose anonymous writes on a public URL.** The v1.4 Dockerfile selects `PHYSIOGRAPH_PUBLIC_MODE=1` to disable unauthenticated ingestion. Optional private ingest requires `PHYSIOGRAPH_INGEST_API_KEY`; this is a prototype guard and not production access control.

---

## Use of Super Intelligence (SI) and audio disclosure

ChatGPT (OpenAI) assisted with HealthGuard's research planning, algorithm design, code generation and review, debugging, data analysis, software testing, UI design, and documentation. This included work on APDRA, the five-channel 1D-CNN autoencoder, the covariance detector, PhysioAlert, the FastAPI backend, the React frontend, and fictional scenario simulations. The team directed methodological and implementation decisions and is responsible for checking source provenance, executable behavior, evaluation claims, and submitted material. The historical NASA OSD-575 laboratory data are separate from the simulated live telemetry and synthetic model evaluations.

**Audio implementation:** HealthGuard's spoken alerts use predetermined status- and scenario-specific text rendered by the user's browser through the Web Speech API (\`SpeechSynthesisUtterance\`). Its short alert tone is synthesized programmatically with Web Audio oscillators (640 Hz and 490 Hz). The application does not use ChatGPT to generate spoken alerts dynamically, and no prerecorded AI-generated voice files are used by this implementation. Alert speech and sounds are demonstration aids, not medical advice or certified alarms.
