# PHYSIOGRAPH v1.5 | Final Hackathon Backend Freeze Candidate

**Challenge:** NASA Space Apps Challenge 2026, *Create Health Monitoring Software for Astronauts on Space Missions*.  
**Release date:** November 14, 2026.  
**Scope:** Computational software and backend/API integration. **No frontend redesign or clinical validation.**

## What is complete

1. **Frozen research system:** The v0.7 APDRA computational method remains unchanged. The historical OSD-575 data include 5,990 pre/postflight laboratory observations from four Inspiration4 crew members, across a CMP panel and a relative-protein panel. Historical laboratory measurements are never represented as live telemetry.
2. **Frozen experimental live detectors:** The trained five-channel 1D-CNN autoencoder and shrinkage-covariance comparator retain their original weights and synthetic calibration thresholds. NumPy inference avoids PyTorch in the serving container.
3. **Context-aware PhysioAlert:** Existing v1.4 declared-activity review, data-quality concerns, model disagreements, two-spaced-check persistence, and post-activity observation are preserved without converting novelty scores into disease or risk probabilities.
4. **Read-only public demonstration:** `PHYSIOGRAPH_AUTO_DEMO=1` starts an internal, repeatable *fictional* telemetry producer after server startup; the 180-packet patterns cycle through normal, declared activity, excursion with unknown activity, and sensor-like artifact. The producer uses internal function calls, not a public unauthenticated POST. Simulated timestamps progress at one second per sample, even if playback is accelerated. **All data remain labeled `SIMULATED_LIVE`.**
5. **Frontend-ready APIs:** Added read-only historical NASA research routes and explicit system-readiness, mission-source, and voice-ready explanation routes. Unimplemented suit oxygen, radiation, navigation, and Earth-delay feeds are reported as **not connected/not implemented**, never fabricated.
6. **Fail-closed write access:** By default, `PHYSIOGRAPH_PUBLIC_MODE=1` makes the public POST ingest endpoint unavailable. An optional server-only shared key can enable an authorized producer. No ingest key is needed for the internal demo. Exact CORS allowlist is opt-in; wildcard CORS is rejected. It is not a production authentication system.

## Backend interfaces

See `FRONTEND_API_CONTRACT_v1.5.md`. Core GET routes:

- `/api/system/readiness`, `/api/mission/status`
- `/api/live/health`, `/api/live/snapshot`, `/api/live/history/{subject_id}`
- `/api/live/dl/{subject_id}`, `/api/live/comparison/{subject_id}`
- `/api/live/context-review/{subject_id}`, `/api/live/context-history/{subject_id}`
- `/api/live/voice/{subject_id}` (deterministic script, **not** an LLM or generated audio)
- `/api/research/overview`, `/api/research/biomarkers`, `/api/research/measurements`, `/api/research/review`, `/api/research/method`
- `/api/live/ws` (WebSocket broadcasts labeled synthetic telemetry)

Research queries support exact `subject_id` (C001–C004), `assay` (`CMP` or `NULISA`), and optional `biomarker` filters with pagination. The frozen research-review files are served as source-linked historical results; no APDRA recalculation occurs on API queries.

## Reproducibility and observed results

- **192 of 192 software tests passed** in the release environment: 181 inherited v1.4 tests plus 11 new API and deployment-integration tests.
- **12 frozen model/APDRA/NASA artifacts** match v1.4 SHA-256 hashes. See `research/backend_v15_final_audit/v14_frozen_hashes.json` and `results.json`.
- **4 × 180 fictional telemetry packets** passed the end-to-end TestClient audit. The first 104 packets per case establish the 45-sample baseline and 60-point scoring window. The remaining 76 yield model scores. Full per-scenario results and local HTTP-test timing are in `research/backend_v15_final_audit/results.json`.
- A **real loopback Uvicorn process** in public mode started both frozen models using NumPy, began streaming internally, and rejected a valid anonymous POST with HTTP 503. Observed resident memory was approximately **111 MiB** in this single local test. See `loopback_runtime.json` for the exact observation. **This does not establish Render startup speed, uptime, costs, throughput, or reliability.**
- The `Dockerfile` defaults to one worker with `PHYSIOGRAPH_INFERENCE_BACKEND=numpy`, `PHYSIOGRAPH_PUBLIC_MODE=1`, and `PHYSIOGRAPH_AUTO_DEMO=1`.

## External BIDMC validation: still incomplete

The earlier prepared PhysioNet BIDMC 3-channel research experiment is **not completed**. Official numerical CSV downloads were blocked by network/DNS restrictions in the execution environment. `RUN_EXTERNAL_VALIDATION_WINDOWS.bat` remains available to fetch the 53 official recordings on an internet-connected Windows machine. The script uses recording-disjoint splits, not overlapping train/test recordings, and only injects **synthetic perturbations** into held-out real recordings for numerical stress testing. **It cannot establish clinical event detection** because the proposed task lacks independently adjudicated medical event labels. It **does not validate our deployed five-channel CNN**, since BIDMC HR/RR/SpO₂ numerics do not provide measured continuous temperature or HRV. We never fill these in with artificial values.

## Known constraints and commitments

- The five-signal CNN is trained **only on simulated normal telemetry**, not real astronauts. Its reconstruction scores have no medical calibration. The comparison model still produces many flags during our nominal demonstration and all activity-like cases are flagged in the v1.3 synthetic stress test; context review does not fix underlying predictive limitations.
- APDRA v0.7 provides **baseline-omission evidence stability**, not better diagnostic accuracy. The 68/195 baseline-sensitive observations are not confirmed false positives; they are repeated measurements in only four people.
- No disease classifier, triage severity certification, medical treatment recommendations, true real-time sensors, radiation dosimeters, actual suit telemetry, persistent mission records, onboard offline mission device, mission-control network, or navigation service exists in this backend.
- In-memory demo history resets when a free service sleeps or restarts. The internal demonstration resumes on the next startup. Public free hosting is not guaranteed to remain continuously online.
- The API returns numerical model outputs and deterministic explanation text; no voice synthesis or LLM is running server-side. Frontend speech can read the text later.
- `PHYSIOGRAPH_PUBLIC_MODE=1` protects the simulated ingest endpoint only. For real user or medical data, a fundamentally different privacy, security, consent, clinical governance and device-validation program would be necessary.

**Decision:** Freeze v1.5 for hackathon frontend construction. Further changes should be limited to reproducible blocking bugs. Preserve negative computational findings and the external-validation gap rather than modifying frozen thresholds to improve demonstration appearances.
