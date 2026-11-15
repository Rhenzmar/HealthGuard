# HealthGuard Architecture

**Status:** research prototype using a real deployed frontend and backend with **simulated continuous telemetry**, plus separate historical NASA data analysis. No connected astronaut medical or suit sensors.

## System flow

```text
 Four fictional crew profiles
             |
             v
 1-Hz physiological simulator (five original channels)
             |                       Separate fictional engineering simulator
             |                       (14 described channels, including estimated
             |                        BP, skin temperature and end-tidal CO2)
             |                                      |
             +--------------------+-----------------+
                                  |
                         Per-crew backend ingest
                                  |
                 +----------------+----------------------+
                 |                |                      |
                 v                v                      v
          Original 5-ch      17-input candidate      Engineering
          CNN + covariance   CNN, 5 physiological     delta screening
          novelty models     + 12 selected extras
                 |                |                      |
                 +----------------+----------------------+
                                  |
                    Context + quality + experimental
                       live APDRA baseline review
                                  |
                        PhysioAlert evidence / UI
                                  |
                      React/Vite HealthGuard frontend
                 Dashboard / Telemetry / Body / Routine
                 Library / Control / HUD / Scenario Lab

    HISTORICAL NASA OSD-569, OSD-575 AND ISS RR-1 RECORDS
          |                               |
          v                               v
 Retrospective laboratory APDRA     Separate environmental screen
          |                               |
          +-----------> Research and evaluation documentation
                 (not the simulated 1-Hz physiological stream)
```

## Inputs and independence

- **Five original physiological channels:** heart rate, SpO₂, respiratory rate, core temperature and heart-rate variability.
- **Four additional displayed physiological estimates:** systolic and diastolic blood pressure, peripheral skin temperature and end-tidal CO₂. These are scripted outputs, not directly measured sensor inputs.
- **Engineering subsystem:** separate cabin environment, radiation, suit reserve and related synthetic channels. Its catalog currently has **14** elements, including the four estimates above. The experimental 17-input checkpoint selects **12** of these added elements alongside the **original five**, excluding the two HUD-only suit pressure and battery fields.
- **Four fictional subjects:** source-separated streams with independent crew IDs and histories.
- **Nine interactive scenarios** in the current catalog; seven of those were covered by the documented 28-case functional audit, prior to subsequent expansion.

The phrase **17-channel CNN** describes its trained and fixed input schema, **not** nine physiological channels plus eight engineering signals and **not** a medically validated wearable suite. Do not change the model's input ordering or claim retraining without actually repeating training and validation.

## Backend

FastAPI routes in `physiograph/live_api.py` expose health/status, simulation, historical research, source metadata and selected model evidence. Normal simulated telemetry is generated internally. Public ingestion is blocked by default in the demonstration configuration. The frozen legacy models and experimental candidate run with NumPy inference for lightweight deployment.

`physiograph/physioalert_unified.py` combines separately labeled evidence. The highest training attention tier may be set by fictional engineering threshold rules; the AI novelty detectors **cannot by themselves cause CRITICAL**. These levels are only demonstration attention levels, not clinical classifications or NASA flight limits.

`physiograph/scenario_engine.py` generates server-side scripted disturbances and evaluates model outputs and scripted flags for the synthetic scenario frames. This is not a live sensor ingest or a clinical test.

## Frontend

`frontend/src/App.jsx` coordinates page navigation, independent crew selection, live WebSocket/polling updates and scenario modal state. Individual components provide the dashboard, the three-monitored-system Body Explorer, health routines, library, mission controls and suit HUD.

Audio is browser-generated: deterministic voice content via the Web Speech API and short Web Audio alert tones. Voice features may be limited by browser or device permissions. The guided tour supplies distinct explanatory narration, but it is still scripted, not a live voice assistant.

## Sources and boundaries

1. **NASA OSDR** historical biomarker records are real sparse assays with their original source IDs/units, not live telemetry.
2. **ISS RR-1** retrospective environmental data have their own cadence, so they cannot validate the whole 17-feature CNN without inventing absent physiological measurements.
3. Synthetic training scenarios and internally generated streams support an **integration/functionality demonstration**, not externally proven medical detection accuracy.
4. No connected wearable, EVA suit, hardware sensor, real-time astronaut health record, or operational NASA limit is claimed.

For details and the precise evidence tables, see [NASA assays](../research/nasa_real_data_evaluation/REPORT.md), [ISS environment](../research/nasa_rr1_eda_evaluation/REPORT.md), [integration audit](../research/prototype_end_to_end/RESULTS_INTERPRETATION.md) and [data provenance](../research/sources.md).
