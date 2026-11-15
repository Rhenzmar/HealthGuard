# HealthGuard

**AI-assisted astronaut health monitoring and mission-support research prototype**  
NASA Space Apps Challenge 2026 · *Create Health Monitoring Software for Astronauts on Space Missions*

[Live interactive demo](https://physiograph-dashboard.onrender.com/) · [Project page](https://www.spaceappschallenge.org/2026/find-a-team/cnhs-ste/?tab=project) · [Reviewer guide](docs/REVIEWER_GUIDE.md) · [Architecture](docs/ARCHITECTURE.md)

> **Research demonstration, not operational healthcare.** All continually updating crew, spacesuit, and mission readings in the app are **fictional simulations**. HealthGuard is not connected to astronaut sensors, is not a medical device, and has not been validated to diagnose disease, predict health outcomes, or determine mission safety.

## What HealthGuard does

HealthGuard combines simulated physiological and spacecraft telemetry, an experimental anomaly-screening pipeline, context checks, and explainable alert **demonstrations** in an interactive web application. Users can switch among four fictional crew members, view changing signals, explore anatomy, and run scripted abnormal-condition scenarios. Separate research views present **historical NASA records** without portraying them as a live feed.

### Explore the app

| Section | Purpose |
| --- | --- |
| **Mission Dashboard** | Crew overview, live-simulation summaries and PhysioAlert review |
| **Crew Telemetry** | Trend charts and current simulated physiological/engineering values |
| **Body Explorer** | Interactive anatomical reference for **three monitored systems**: cardiovascular, breathing/oxygen, and thermal regulation |
| **Health Routine** | Check-ins, health-learning activities, and gamified tasks |
| **Health Library** | Space-health context and explicitly labeled historical NASA evidence |
| **Mission Control** | Simulated mission environment, engineering readings, and crew context |
| **Mission HUD** | Prototype Moon/Mars suit-display interface, not a connected operational HUD |
| **Scenario Lab** | Popup with **nine scripted events**, controls and nonclinical alerts |
| **Guided tour** | Eight-step walkthrough with optional browser voice narration |

The interface also includes four selectable fictional crew portraits, accessibility-oriented voice controls, a short critical training tone, and selectable ambient workspace backgrounds.

## How the data work

HealthGuard deliberately keeps distinct sources separate:

| Source | Role | Important boundary |
| --- | --- | --- |
| **Five-channel physiological simulator** | Heart rate, SpO₂, breathing rate, core temperature and HRV for the original novelty pipeline | Not measured from a person |
| **Engineering/estimate simulator** | Fictional cabin, radiation, suit, and additional physiological estimates | Four extra displayed physiological estimates are **not** additional direct sensors |
| **Experimental 17-input CNN candidate** | Numerical novelty screening over **5 physiological + 12 selected simulated engineering/estimate inputs** | Synthetic-trained, fixed input order; not externally validated on real 17-channel astronaut streams |
| **Historical NASA OSDR datasets** | Sparse Inspiration4 laboratory assays and separate ISS environmental research | **Not** part of the fictional 1 Hz crew feed |

Some HUD-only engineering values are outside the fixed 17-input model. The app's nine displayed physiological readings comprise five original simulator channels plus four separately scripted estimates. Do not equate the number of displayed readings with the CNN input partition.

## Analysis and alert logic

1. Accept source-labeled, per-crew simulated data.
2. Apply the frozen **five-channel 1D-CNN autoencoder** and an independent shrinkage-covariance comparator to their respective simulated input.
3. Score an **experimental 17-input CNN candidate** on its defined synthetic 5+12 feature schema.
4. Consider declared activity, quality concerns, model agreement, and experimental live baseline checks.
5. Present **PhysioAlert attention levels**: OPTIMAL, CHECK, WARNING, or CRITICAL. These are demonstration labels. CRITICAL is only escalated by predefined fictional engineering deviations, **not** by a validated clinical-risk prediction.

**APDRA:** An earlier frozen baseline-stability analysis was evaluated retrospectively on real pre/postflight NASA laboratory records. The current simulated live APDRA component is experimental and distinct from that historical study. Neither should be described as a clinical diagnostic test.

## Evaluation: what was actually demonstrated

- **Functional synthetic integration:** seven audited scripted events × four fictional crew profiles = **28 combinations** and **168 backend/model checkpoint evaluations**. The deployed scenario catalog later expanded to nine; the 28-case report does **not** validate the two additional scenarios.
- **NASA retrospective laboratory analysis:** 8,783 numerical measurements across OSD-569/OSD-575 assay tables, compared using exploratory screening and APDRA reference-stability rules. Of 829 median-only screening flags, 272 were not consistently retained under baseline omission (**32.8%**, not a false-positive rate).
- **Separate ISS RR-1 environmental evaluation:** a three-channel historical data screen, not 17-input CNN validation.

See [software integration results](research/prototype_end_to_end/RESULTS_INTERPRETATION.md), [real NASA assay evaluation](research/nasa_real_data_evaluation/REPORT.md), and [ISS environmental evaluation](research/nasa_rr1_eda_evaluation/REPORT.md). None establishes medical sensitivity, specificity, independent astronaut anomaly detection accuracy, or flight readiness.

## Local setup

**Backend** (Python 3.11 recommended):

```bash
python -m pip install -r requirements-live-lite.txt
python -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000
```

**Frontend** (Node.js 22 recommended), in a second terminal:

```bash
cd frontend
npm install
# Set VITE_PHYSIOGRAPH_API_BASE=http://127.0.0.1:8000 in frontend/.env.local
npm run dev
```

For split-origin local usage, configure the backend's **exact** CORS origin, e.g. `PHYSIOGRAPH_CORS_ORIGINS=http://localhost:5173`, before launching it. The `PHYSIOGRAPH_*` environment variables and `physiograph/` Python package remain legacy **internal compatibility identifiers**; the product is named **HealthGuard**.

**Checks:**

```bash
cd frontend && npm run build
# From repository root, with backend test dependencies installed:
python -m pytest -q tests/test_engineering_sim.py tests/test_physioalert_unified.py tests/test_scenario_engine.py
```

For the broader backend environment and audits, consult [backend release notes](RELEASE_NOTES_v1.5.md), [deployment notes](DEPLOY_ON_RENDER.md), and [current reviewer guide](docs/REVIEWER_GUIDE.md).

## Repository layout

- `frontend/` — React/Vite user interface, guided tour, anatomy, HUD and browser-side tests
- `physiograph/` — FastAPI services, simulators, model inference, research routes and PhysioAlert
- `models/` — retained experimental model artifacts and metadata
- `data/` — source-labeled historical and synthetic datasets
- `research/` — methods, evaluations, provenance and audit outputs
- `tests/`, `tools/` — backend tests and reproducibility scripts
- `docs/` — current architecture, reviewer guide and archived documentation

The root `README.md` is the current product overview. The historical `RELEASE_NOTES_v*.md` files and archived v1.5 README document earlier development milestones, **not** current product status.

## Credits, sources and AI assistance

HealthGuard was developed by **CNHS-STE** for NASA Space Apps 2026. NASA data are used as historical research inputs with their original provenance; NASA does not endorse or validate this prototype. Data references and methods are documented in [research sources](research/sources.md) and the linked evaluation reports.

The team used **ChatGPT (OpenAI)** as an AI-assisted collaborator for research planning, software design and implementation, code review, testing, documentation and demonstration preparation. The team remains responsible for the accuracy and interpretation of its work. Spoken alerts and tour narration use **predetermined scripts and browser text-to-speech**, not a dynamically conversing medical AI.

The interactive anatomical components include third-party content with separate licenses; see the app's attribution and upstream dependencies. **No repository-wide open-source license is currently granted by this README.** Do not assume every bundled dataset or third-party asset is redistributable without its applicable terms.
