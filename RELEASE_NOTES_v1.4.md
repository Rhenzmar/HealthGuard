# PHYSIOGRAPH v1.4 | Context-Aware Review and Backend Freeze Candidate

**Challenge:** NASA Space Apps 2026, *Create Health Monitoring Software for Astronauts on Space Missions*.

**Release scope:** computational/backend extension of v1.3, with a reproducible, synthetic-only verification audit. The historical OSD-575 data, frozen APDRA logic, trained 5-channel CNN, NumPy export, and covariance detector are unchanged.

## What changed

1. **Explicit activity context (not inferred):** live packets may supply `context: {"activity_state": "REST" | "ACTIVE" | "UNKNOWN", "basis": "SIMULATOR_DECLARED" | "OPERATOR_DECLARED"}`. No context means `UNKNOWN`, never assumed rest. Input provenance remains `SIMULATED_LIVE`. All declarations are unverified; they are not automatically produced by wearable or NASA measurements.
2. **Source-aware quality review:** checks exact sample cadence, missing channels, an all-five-channel frozen stream pattern, abrupt steps, and spike-rebound patterns that might contaminate a 60-second model input. Flags mean **verify measurement**, not **artifact confirmed**. No interpolation, sensor substitution, or fabricated numbers.
3. **Spaced review checkpoints:** two flags at least 15 seconds apart are required before a persistent-pattern review at declared rest. **Overlapping 60-second windows remain dependent**, so this is an engineering debounce heuristic, not independent statistical evidence or a medical safety threshold.
4. **Activity-aware decision:** activity-like variation is annotated rather than automatically labeled as clinical danger. For 60 seconds after declared activity, residual flags receive `POST_ACTIVITY_OBSERVATION`; model scores remain intact and accessible.
5. **Separate contextual PhysioAlert assessment:** available as `context_review` on POST `/api/live/ingest` and WebSocket messages, via GET `/api/live/context-review/{subject_id}`, and as a short deterministic text response suitable for later voice synthesis. The original raw `deep_learning`, `comparison`, `live_review`, and APDRA analysis remain exposed.
6. **Public-ingest guard:** `PHYSIOGRAPH_PUBLIC_MODE=1` disables anonymous POST ingestion. If `PHYSIOGRAPH_INGEST_API_KEY` is set, use the `X-PhysioGraph-Ingest-Key` header. Without a configured key, the public endpoint is read-only for telemetry ingestion. Default local mode remains suitable for 127.0.0.1 development only.
7. **Additional scenarios:** replay tool now supports `--mode activity` and `--mode artifact` as well as `normal` and `excursion`. All are fictional.

## API quick reference

| API endpoint | Purpose |
| --- | --- |
| `GET /api/live/health` | Model availability, context module and public-ingest setting |
| `GET /api/live/context/config` | Context schema and provenance warnings |
| `POST /api/live/ingest` | Timestamped synthetic packet; model + comparator + source checks + contextual review |
| `GET /api/live/context-review/{subject_id}` | Latest contextual review |
| `GET /api/live/context-history/{subject_id}?limit=10` | Bounded chronological review history |
| `WS /api/live/ws` | Live packet with raw model scores and contextual review |

The `context_review` response includes `activity_state`, `activity_basis`, `quality.issues`, both raw detector statuses, evidence scores and thresholds, the deterministic voice-ready sentence, review interval, and explicit limitations.

## Results: four 180-packet simulated replays

Reproduce with `python -m tools.audit_context_v14` and inspect `research/context_v14_audit/behavioral_audit.json`.

| Scenario | Simulated scored windows | Raw comparison | Contextual result |
| --- | ---: | --- | --- |
| Normal | 76 | CNN no flags in 76; covariance flags in 43 | 43 detector-disagreement reviews; 33 no-pattern flags |
| Activity | 76 | Both models flag all 76 | 58 activity-context reviews; 18 post-activity observations; zero persistent-rest reviews |
| Sensor-like artifact | 76 | Both flag 60; disagree on 4 | 61 windows get measurement-quality review; 4 disagreement reviews |
| Excursion with unknown activity | 76 | Both flag all 76 | All 76 require context confirmation rather than a health-risk designation |

Each replay requires the 45-sample baseline and 60-sample window first: 104 packets are warm-up or window collection, so 76 are scorable. These results are internal synthetic **workflow behavior**, not estimates of medical precision or safety. Repeated rolling windows are strongly dependent and the scripted scenarios are not clinically adjudicated.

## Exact limitations

- **No astronaut or clinical external predictive validation** for deployed 5-channel CNN. All 5-channel model training and thresholds remain synthetic. No disease detection or emergency classification is established.
- **APDRA is separate:** the historical molecular/clinical assay analysis should not be described as operating on the 1-Hz synthetic telemetry stream.
- **Context declaration is unverified:** actual exercise sensing, medical record integration, and physiological ground-truth labels are not implemented.
- **BIDMC external research:** `RUN_EXTERNAL_VALIDATION_WINDOWS.bat` runs a separate 3-channel ICU experiment (HR/RR/SpO2). It cannot validate the 5-channel deployed model and still requires the official CSV downloads on an internet-connected machine. The script reports injected perturbations, not clinical event labels.
- **Public API:** administrative control, persistent records, multi-instance scaling, user authentication, rate limiting, TLS termination and clinical governance are outside this hackathon prototype. Public ingest uses a shared-secret guard; for a public judge demo, run only a read-only presentation or protect its producer.
- **Numerical thresholds in the quality/context module** are engineering design choices not validated against astronaut physiological outcomes.

## Windows execution

1. Extract the ZIP to a new folder. Python 3.11+ recommended.
2. Run `INSTALL_DEEP_LEARNING_WINDOWS.bat` if starting fresh (PyTorch) **or** `pip install -r requirements-live-lite.txt` for lighter NumPy-only CPU serving.
3. In Command Prompt, optionally run `set PHYSIOGRAPH_INFERENCE_BACKEND=numpy` for free-hosting-style CPU inference.
4. Start `START_LIVE_BACKEND_WINDOWS.bat`; run `RUN_LIVE_NORMAL_WINDOWS.bat`, `RUN_LIVE_REPLAY_WINDOWS.bat`, or `python -m tools.replay_live_demo --mode activity --speed 20` in a second terminal.
5. Inspect `http://127.0.0.1:8000/docs` and `GET /api/live/context-review/SIM_CREW_01`. The original web viewer is unchanged in this backend-focused release.
6. Run `RUN_BACKEND_TESTS_WINDOWS.bat` or `python -m pytest -q`; use `RUN_CONTEXT_AUDIT_WINDOWS.bat` to recreate the 4-scenario numerical workflow audit.

For protected public mode: set `PHYSIOGRAPH_PUBLIC_MODE=1` and `PHYSIOGRAPH_INGEST_API_KEY=<long random key>` as hosting environment variables; pass the key in the header only from a trusted producer. Never embed the key in frontend browser code or a public repository.

**Freeze target:** keep this v1.4 computational/backend implementation fixed for frontend development unless reproducible integration bugs require correction.
