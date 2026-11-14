# PhysioGraph | Mission Console v0.2

The v0.2 redesign replaces the introductory marketing layout with a live, compact mission operations cockpit. It uses horizontal navigation, five selectable signal cards, a crew pod, waveform inspector, PhysioAlert evidence review, event log, and direct NASA research entry. The backend API and all scientific boundaries are unchanged.

The application is a research simulation, not a medical device or clinical diagnosis tool. Simulated telemetry is distinct from the historical NASA OSD-575 data, and the models do not provide clinical risk estimates.

# PhysioGraph frontend v0.1

A React/Vite research demonstration dashboard for the existing PhysioGraph v1.5 backend.

## Views

- Overview: fictional simulated live telemetry, five physiological metrics, CNN/covariance outputs, evidence review, and optional browser speech of backend-provided deterministic explanation text.
- NASA Research: source-labeled NASA OSD-575 discrete lab draws, biomarker and crew filters, and frozen APDRA review rows.
- Mission Systems: honest status of unconnected spacesuit and environment sensors.
- Method & evidence: what has been implemented, trained, and validated, and what has not.
- Guided tour accessible from sidebar.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Vite reads `VITE_PHYSIOGRAPH_API_BASE` from `.env.local` (see `.env.example`). The default points to the deployed Render API. For local split-site use, run the backend with `PHYSIOGRAPH_CORS_ORIGINS=http://localhost:5173` (or the actual Vite origin). The WebSocket uses HTTPS -> WSS automatically. 

Run pure client tests using `npm test`, and build with `npm run build`.

## Render static site

- Repository: `https://github.com/Rhenzmar/PhysioGraph`
- Branch: `main`
- Build command: `cd frontend && npm ci && npm run build` (or `npm install` if lockfile not yet committed)
- Publish directory: `frontend/dist`
- Build-time public variable: `VITE_PHYSIOGRAPH_API_BASE=https://physiograph-api-lurx.onrender.com`
- After creation, add the exact static site HTTPS origin to backend `PHYSIOGRAPH_CORS_ORIGINS` (no trailing slash). This is required for browser REST calls across Render subdomains. The backend deliberately rejects wildcard CORS origins.

The frontend never contains an ingest API key. Research and mission endpoints are read-only.

## Scientific guardrails

The simulated vital signals are synthetic and not astronaut measurements. CNN and covariance flags are experimental numerical novelty comparisons trained on synthetic normal data. Real NASA OSD-575 observations are *historical pre/postflight assays*, not continuous live readings. APDRA is a frozen retrospective lab screening-stability research method, not a clinical classifier. Mission HUD feed values that are not connected remain null / absent.