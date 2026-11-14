# PhysioGraph v1.0 | Simulated live telemetry ingestion

## What was built

- `physiograph/live_telemetry.py`: strict telemetry parser and bounded in-memory per-crew buffer. Packet timepoints must be timezone-aware, strictly increasing, and labeled `SIMULATED_LIVE`. Five metrics have explicit units and broad physical-plausibility input checks. Out-of-order/duplicate packets are rejected.
- `physiograph/live_api.py`: local-only FastAPI service with `/api/live/health`, `/api/live/metrics`, `/api/live/snapshot`, `/api/live/history/{subject_id}`, `/api/live/ingest` (POST), and `/api/live/ws` (WebSocket). `/docs` has auto-generated API documentation.
- `tools/replay_live_demo.py`: deterministic fictional crew-vitals trajectory with a planted excursion followed by recovery. Nothing is inferred clinically, and the excursion is **not** a disease ground truth.
- `tests/test_v10_live_telemetry.py`: 20 new parsing, provenance, ordering, bounded-buffer, API and WebSocket tests. Total suite: **112 passing** (92 v0.9 + 20 v1.0).
- Windows launchers for API and replay.

## Scientific separation

- **Real NASA** OSD-575 CMP/NPQ data stay in `data/nasa/`; all APDRA/PhysioAlert code and published findings are unchanged.
- **Fictional simulated live** data are never sent through APDRA in v1.0, and the API returns `analysis_status=NOT_EVALUATED`. High-frequency waveform and biomarker concentration records have different time scales, units, reference baselines, and scientific validity constraints. Their outputs must not be combined into a single risk score.
- The API does **not** contain an Isolation Forest, a deep neural network, medical condition detection, or a genuine device connection yet. These are future work. It does not report *normal/healthy* statuses.
- No user authentication, rate limiting, encrypted clinical storage, or safety review. **Run on `127.0.0.1` only.** It must not be exposed as an open public ingestion endpoint. Its internal in-memory data are lost on restart.

## Try it locally

1. Unzip and in one terminal run `python -m pip install -r requirements.txt` then `python -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000`.
2. Open http://127.0.0.1:8000/docs and http://127.0.0.1:8000/api/live/snapshot .
3. In another terminal run `python -m tools.replay_live_demo --speed 10`.
4. Reload `/api/live/snapshot` to see the latest packet, or connect a WebSocket viewer to `ws://127.0.0.1:8000/api/live/ws`.
5. Run `python -m pytest -q`; all v0.9 regression tests should continue to pass.
6. The original Streamlit app remains available through `START_PHYSIOGRAPH_WINDOWS.bat`. Live API and Streamlit are separate services in v1.0.

## Next implementation

Calibrate and validate a lightweight experimental anomaly detector using an appropriate time-series data source. Only after reliable non-medical anomaly evaluation is ready should it be joined to PhysioAlert, with source-aware, uncertainty-labeled messaging. Finally connect to React (or a Streamlit Live Demo page) and implement a real-time visualization.
