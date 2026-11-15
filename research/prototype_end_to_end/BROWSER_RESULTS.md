# HealthGuard Browser End-to-End Test Results

**Date:** November 15, 2026  
**Test environment:** Headless Chromium (Playwright), local Vite React UI and local FastAPI backend with actual frozen NumPy CNN checkpoints, GitHub Actions Ubuntu runner  
**Run:** https://github.com/Rhenzmar/PhysioGraph/actions/runs/43662096191

## Final result: 4 of 4 passed

| Browser acceptance scenario | Result | Verified behavior |
|---|---|---|
| Crew switching and application navigation | **PASS** | Select all four independent fictional astronauts and navigate between Mission Dashboard, Crew Telemetry, Body Explorer, Health Routine, Health Library, Mission Control and Mission HUD |
| Seven interactive scenario selections | **PASS** | All seven can be chosen in the modal; backend returns actual 17-channel pretrained-model results and current scripted alarm state; Restart re-fetches the baseline at t=0; Escape closes the modal |
| Critical voice, no beep, recovery behavior | **PASS** | Browser issues speech synthesis calls when a scripted Critical event is reached; no electronic beep is generated; recovery cancels the critical speech cycle |
| Backend outage/fallback safety | **PASS** | A simulated HTTP 503 response displays a visible error, blocks Start, and does not substitute fabricated local CNN scores |

**Total:** 4 passed, 0 failed. Chromium test suite runtime: approximately 18.6 seconds, excluding dependency installation and build.

## Bugs found and fixed

1. **Test accessibility selector mismatch.** The scenario dialog's actual accessible name is “Possible scenarios” (from its heading). Initial test selectors assumed “Choose a training scenario.” Corrected the test to match the real accessible name.
2. **Scenario Restart at t=0.** Restart cleared the current frame but did not initiate a new backend request because the elapsed time had not changed. Added an explicit scenario revision counter to force a fresh server request on Restart or when choosing the same scenario again. The final browser run verified the resulting Start button is usable.

## What the browser test actually proves

The user interface was exercised in Chromium against a real local backend and pretrained model checkpoints, not a static mockup. The seven-scenario browser test separately requests actual model results at the peak and recovery timestamps for every scenario. The end-to-end backend audit in `api_e2e_results.json` tests all **28 astronaut-scenario combinations** across six checkpoints.

**Audio limitation:** The browser test instrumented `speechSynthesis` and audio API methods. It proved the app calls speech for Critical events, does not request electronic beeps, and cancels spoken alerts when scripted inputs recover. To shorten browser testing, it mapped two UI playback ticks to actual backend-generated peak and recovery frames. It **did not** prove audibility on real speakers, voice selection/volume across operating systems, or the precise real-time five-second interval. Those remain manual device checks.

**Clinical limitation:** All continuous input is synthetic. These checks verify prototype functionality, not sensitivity, specificity, or real astronaut diagnostic performance. NASA laboratory and ISS environmental records are evaluated separately in the scientific reports.

## Reproducibility

From the repository root, install `requirements-live-lite.txt` plus `uvicorn`, install frontend dependencies and Playwright Chromium, then run:

```bash
cd frontend
npx playwright test --config=playwright.config.mjs
```

The Playwright config starts a local FastAPI service with pretrained NumPy models and a local Vite frontend. The workflow archives its test JSON, screenshots on failure, videos and traces as the GitHub Actions artifact **healthguard-e2e-chromium-browser-evidence**.

## Competition-safe one-paragraph summary

“HealthGuard completed a functional integration audit covering four simulated astronaut profiles and seven scripted anomaly scenarios, totaling 28 scenario-person combinations and 168 backend model evaluations. The actual pretrained 17-channel CNN generated model outputs in every tested scenario; scripted alerts activated at peak and cleared after recovery in all 28 combinations. Four additional Chromium browser tests verified navigation, scenario selection, voice-interface behavior and safe error handling. These results demonstrate software functionality under deliberately simulated inputs, rather than clinical detection accuracy or full NASA-data CNN validation.”
