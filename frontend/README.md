# HealthGuard Frontend

The **HealthGuard** interface is a React/Vite application for a **fictional astronaut health-monitoring and mission-support demonstration**. The main project overview is in [../README.md](../README.md).

[Try the deployed app](https://physiograph-dashboard.onrender.com/) · [Reviewer guide](../docs/REVIEWER_GUIDE.md)

## Sections

The current navigation includes Mission Dashboard, Crew Telemetry, Body Explorer (**three monitored body systems**), Health Routine, Health Library, Mission Control, Mission HUD and a **Scenario Lab** popup. A replayable eight-step guided tutorial provides explanatory narration through optional browser text-to-speech.

Four fictional astronauts have independent simulated streams. The dashboard includes five original physiological signals, four *separately scripted* physiological estimates and engineering simulator data. The experimental **17-input CNN** is a **5+12** input model; those 12 additional inputs are selected scripted engineering/estimate channels, not 12 more physical sensors.

Scripted events are fictional, nonclinical and do not represent NASA operational limits. The full Scenario Lab catalog has **nine** event types. Normal simulation, explicit scripted events, and historical NASA research data are not interchangeable.

## Run locally

Requires Node.js 22 (recommended) and the FastAPI backend.

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local` if you need an API on a different origin:

```dotenv
VITE_PHYSIOGRAPH_API_BASE=http://127.0.0.1:8000
```

Start the backend from the repository root:

```bash
python -m pip install -r requirements-live-lite.txt
python -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000
```

Allow the exact Vite origin with `PHYSIOGRAPH_CORS_ORIGINS=http://localhost:5173` on the backend. These `PHYSIOGRAPH_*` names are **retained API configuration identifiers**. Renaming the displayed product or GitHub repository does not automatically rename backend environment variables.

## Quality checks

```bash
cd frontend
npm test
npm run build
```

`npm run build` already runs the client tests before creating `dist/`. The project also includes a separately configured Playwright end-to-end suite. Historical browser test reports describe **the specific software version and date tested**, not a guarantee that every later UI change has been manually retested.

## Hosting

The active Render static site is [physiograph-dashboard.onrender.com](https://physiograph-dashboard.onrender.com/). Its current build command is `cd frontend && npm install --no-audit --no-fund && npm run build`, with publish directory `frontend/dist`. The frontend's public build variable is `VITE_PHYSIOGRAPH_API_BASE`; it must contain **only a public API origin, never a secret**.

**Audio:** Critical-event voice and guided-tour narration use `SpeechSynthesisUtterance` in the browser. A brief procedural alarm tone uses Web Audio. Browser autoplay policies and device settings can prevent sound until the user interacts with the page. These are demonstration alerts, not certified alarms.

**Science and data provenance:** See [architecture](../docs/ARCHITECTURE.md), [reviewer guide](../docs/REVIEWER_GUIDE.md) and [research reports](../research/). Neither the displayed simulated readings nor model pattern flags constitute clinical diagnostics, real astronaut measurements or flight-ready telemetry.
