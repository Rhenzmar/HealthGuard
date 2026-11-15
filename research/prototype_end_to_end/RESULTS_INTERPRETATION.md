# HealthGuard End-to-End Prototype Evaluation

## Objective

Verify the integrated HealthGuard software pipeline across **four independent fictional astronaut profiles** and **seven synthetic training scenarios**, from generating 17-channel simulated telemetry to computing actual pretrained CNN reconstruction errors, compiling model evidence, displaying scripted alerts and clearing the scripted triggers when readings recover.

**Evaluation date:** November 15, 2026.
**Domain:** Nonclinical software functional tests using synthetic data. NASA historical laboratory and ISS EDA measurements are **not** used as inputs for this evaluation.

## Test matrix

The seven tested events are oxygenation decline, high-exertion response, thermal instability, sensor-signal anomaly, cabin CO₂ buildup, cabin pressure loss and radiation-rate surge.

Each event was evaluated independently for fictional crew members SIM_CREW_01, SIM_CREW_02, SIM_CREW_03, and SIM_CREW_04. Six checkpoints were assessed per event-person combination: 0, 14, 22, 35, 50 and 64 seconds.

## Audited findings

| Verification endpoint | Observed result |
|---|---:|
| Fictional crew members | 4 |
| Scripted events | 7 |
| Event-person combinations | **28** |
| Combined HTTP/model evaluations | **168/168** |
| Contract assertions failing | **0** |
| Pretrained 17-channel CNN loaded and scored the scenario input | **168/168** |
| Scripted alerts active at injected disturbance peak | **28/28** |
| Scripted alarms cleared after the programmed recovery | **28/28** |
| 17-channel CNN novelty flags at the injected peak | **28/28** |
| 17-channel CNN novelty flags still active at final recovery checkpoint | **28/28** |
| Median API evaluation duration, local GitHub runner | 5.75 milliseconds |
| Sampled 95th-percentile API evaluation duration, local GitHub runner | 8.1 milliseconds |

At the peak disturbance the unified PhysioAlert training attention was **CHECK in 4/28**, **WARNING in 12/28**, and **CRITICAL in 12/28** combinations. The sensor-inconsistency scenario received CHECK because measurement integrity was questioned, the four physiological scenario types generated WARNING under model agreement, and the three simulated engineering events generated CRITICAL under demonstration thresholds.

The CNN novelty signal remaining flagged at t=64 is **not a failure of the scripted alarm to reset**. The model scores rolling windows that still include previous abnormal readings. The scripted alarm evaluates current simulated thresholds and cleared in every case. The dashboard must retain this distinction.

## Scientific interpretation

The figures show **internal software integration and detection of strongly injected synthetic disturbances**. All seven disturbances are authored by the project generator, and the four crew profiles are fictional. Therefore, 28/28 positive model flags must not be presented as sensitivity, specificity, diagnostic performance, or independent external validation. No real human measurements or known clinical outcomes were evaluated in this end-to-end software test.

The real NASA evaluation is reported separately in `research/nasa_real_data_evaluation` (historical laboratory biomarker screening) and `research/nasa_rr1_eda_evaluation` (ISS environmental screening). Neither constitutes a genuine full-input validation of the 17-channel CNN.

## Reproducibility

```bash
python -m tools.e2e_prototype_audit --mode inprocess
```

The exact observation-by-observation results, including model novelty scores, unified status, scripted alarm states and per-checkpoint processing timings, are in `api_e2e_results.json`. The per-crew/experiment summary table is in `API_RESULTS.md`.

The browser layer is tested separately with the Chromium Playwright suite in `frontend/e2e/prototype.spec.mjs`. Browser speech tests instrument calls to the SpeechSynthesis interface but do not establish audible playback on a physical speaker; that requires a manual device check. The product's current approved interface uses repeated spoken Critical guidance, not electronic beeps.

## Suggested competition-ready description

“HealthGuard underwent a 28-case end-to-end integration audit covering four independently simulated astronaut profiles and seven scripted physiological or spacecraft events. Across 168 model/API evaluations, all source and schema checks passed; the pretrained 17-channel CNN flagged the injected disturbance at peak in all 28 cases. Scripted training alarms activated and subsequently cleared in all 28 cases. These outcomes verify prototype integration on synthetic scenarios, rather than real astronaut diagnostic accuracy.”
