# PHYSIOGRAPH v1.5: Free Render backend deployment

## What this does

The backend is an explicitly simulated, read-only demonstration. NASA OSD-575 laboratory measurements are historical and separately labeled. The CNN and statistical detector are research prototypes, not certified medical anomaly detectors or disease diagnostic tools.

## Deploy

1. Create a new GitHub repository named `physiograph` under your account. Upload the **contents** of this `PHYSIOGRAPH` directory to the repository root. The root should contain `Dockerfile`, `render.yaml`, `requirements-live-lite.txt`, `physiograph/` and `models/`.
2. Connect the GitHub repository to Render. In Render, select **New > Blueprint** and choose the repository and its `render.yaml`. Review the configuration before confirming. Select the **free** plan only; never accept an unexpected paid service.
3. The Blueprint creates one Docker web service in the Singapore region. It runs Uvicorn on the host-provided `$PORT` and enables a 10x accelerated, **fictional** telemetry demonstration. The CNN uses frozen NumPy weights, not PyTorch.
4. Wait for the deploy to report success. Open `https://YOUR-SERVICE.onrender.com/api/system/readiness`, `/api/research/overview`, and `/live` to verify the endpoints.
5. Run `python tools/render_smoke_test.py https://YOUR-SERVICE.onrender.com` from the project root. This checks model readiness, research endpoints, missing sensor disclosures, self-running simulated telemetry and anonymous-write blocking.
6. In a browser, ensure `/live` updates and WebSocket reconnect works after reload, and confirm data is clearly marked **SIMULATED LIVE**.

## Important

- Free instances have **512 MB RAM**, a limited amount of monthly instance time and a **15-minute inactivity spin-down**. A sleeping instance can take around a minute to wake up. Your results may vary. No uptime guarantee.
- All in-memory simulated telemetry resets after a free instance restarts. There is no persistent storage.
- The live endpoints have no authenticated user accounts and are strictly demonstration-only. Do not enter real identifiable health data or expose a writable ingestion key in a browser.
- `PHYSIOGRAPH_CORS_ORIGINS` should be set later to the exact Render frontend origin once known, e.g. `https://physiograph-ui.onrender.com`. Never set wildcard `*`.
- Never invent radiation, oxygen reserve, navigation or clinical-risk values when their feeds are unavailable.
- Don't push `.env` credentials. `.env.example` contains no secrets.
- If Render reports a plan upgrade or payment step, stop and review it; the free deployment must not incur charges.
