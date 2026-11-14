# PhysioGraph v1.5 | Frontend API Contract

The frontend should use the same backend base URL where possible. For split-site hosting, set `PHYSIOGRAPH_CORS_ORIGINS` to the exact frontend origin (for example `https://my-frontend.onrender.com`). Do not put ingest keys in client-side code. Use HTTPS/WSS in public deployments.

## Recommended data flow

**Initial load:** `GET /api/system/readiness` to confirm model state and limitations; `GET /api/live/snapshot` to discover fictional crew IDs; `GET /api/research/overview` for real historical counts. Never combine these as if they were measurements from one time series.

**Live updates:** connect to `WS /api/live/ws` using the corresponding `wss://` public scheme. The first event is `{"type":"snapshot","data":{...}}`; subsequent `{"type":"telemetry","packet":{...},"deep_learning":{...},"comparison":{...},"live_review":{...},"context_review":{...}}` events are explicitly `SIMULATED_LIVE`. WebSocket heartbeats occur during inactivity. You can poll `GET /api/live/snapshot` as fallback.

**Review details:** `GET /api/live/context-review/SIM_CREW_01`, `GET /api/live/context-history/SIM_CREW_01?limit=20`, `GET /api/live/voice/SIM_CREW_01`. The `voice` endpoint returns text only. It does **not** produce an audio file or an AI-generated diagnosis.

**Historical NASA browser:** `GET /api/research/biomarkers?assay=CMP` or `?assay=NULISA`, then `GET /api/research/measurements?subject_id=C001&assay=CMP&biomarker=GLUCOSE&limit=200`. Source units, timepoint labels, assay names, phases, and sample IDs must be displayed without alteration. Preflight/postflight points are discrete, not 1-Hz live readings. `GET /api/research/review?subject_id=C001&assay=CMP` yields frozen retrospective evidence-review rows. There is **no health-risk probability or diagnosis**.

**Mission HUD:** `GET /api/mission/status` reports currently unavailable streams as `NOT_CONNECTED` or `NOT_IMPLEMENTED` with `value: null`. The frontend must not present invented suit oxygen, radiation dose, Mars navigation or Earth-delay values as measured readings. Such a feature may be built later as a visibly labeled mission simulator.

## Endpoint summary

| Endpoint | Use | Provenance |
|---|---|---|
| `GET /api/system/readiness` | Models loaded, validation state and mode | Backend status |
| `GET /api/live/health` | Live API health and anonymous ingest policy | Backend status |
| `GET /api/live/snapshot` | Latest fictional samples, pseudonymous IDs | Simulated |
| `GET /api/live/history/{id}?limit=150` | Live historical points for charts | Simulated |
| `GET /api/live/dl/{id}` | Frozen CNN score and threshold/status | Synthetic-trained model |
| `GET /api/live/comparison/{id}` | Frozen covariance score and threshold/status | Synthetic-trained model |
| `GET /api/live/context-review/{id}` | Context and quality-aware review | Deterministic heuristic |
| `GET /api/live/voice/{id}` | Short template explanation text | Deterministic template |
| `GET /api/research/overview` | NASA historical counts and phases | OSD-575 |
| `GET /api/research/measurements` | Filtered original research measurements | OSD-575 |
| `GET /api/research/review` | Frozen APDRA review rows | OSD-575 derived |
| `GET /api/research/method` | Algorithm scope and cautious result | Research summary |
| `GET /api/mission/status` | Connected/missing mission-data feed states | Metadata |
| `WS /api/live/ws` | Live demo broadcast stream | Simulated |

## Controls and labels required in frontend

- Mark fictional vital signs **SIMULATED LIVE** prominently.
- Mark OSD-575 as **HISTORICAL NASA LAB DATA**, with subject code, assay, timepoint, unit and citation.
- Call novelty scores **model flags**, not disease predictions, warning severity or health-risk percentages.
- Mark data quality and activity-state assumptions (such as `SIMULATOR_DECLARED`). A declared rest state is not objectively verified.
- Do not interpret `NO_MODEL_FLAG` as proof of health or `RETURN_TO_UNFLAGGED_PATTERN` as a medically confirmed recovery.
- Show `NOT_CONNECTED` for missing suit and environment data, not placeholder measurements.

## Deployment testing checklist

1. In a local browser, open `/live` after starting the backend with `PHYSIOGRAPH_AUTO_DEMO=1`; synthetic data should appear without an external replay script.
2. Open `/api/system/readiness` and check `models_loaded=true` and `clinical_validation=false`.
3. Open `/api/research/overview`, confirm 5,990 historical observations and four crew IDs.
4. Verify a valid anonymous `POST /api/live/ingest` is rejected in public mode unless the server has a private ingest key.
5. Verify auto-demo works after a fresh process restart. Free services may sleep after inactivity; this behavior must be accepted and tested on the actual host.
6. Test WebSocket reconnect and distinguish real timestamp, simulated sample timestamp, and rendering time.
