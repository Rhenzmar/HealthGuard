# HealthGuard 28-case end-to-end prototype integration audit

**Data domain:** fictional 17-channel scenario streams; pretrained CNN inference, separate scripted alert and PhysioAlert attention.
**Interpretation:** engineering functionality. Not NASA/clinical accuracy, diagnostic sensitivity or medical risk.

- **Matrix:** 28 = 7 scenarios × 4 fictional astronauts.
- **HTTP API checks:** 168/168 at [0, 14, 22, 35, 50, 64] fictional seconds.
- **Scripted alerts at peak:** 28/28.
- **Scripted alerts cleared after recovery:** 28/28.
- **Pretrained 17-channel CNN flags at peak:** 28/28. This is not clinical sensitivity.
- **CNN flags persisting in the final rolling window:** 28/28.
- **Unified PhysioAlert attention at peak:** {'WARNING': 12, 'CHECK': 4, 'CRITICAL': 12}.
- **Model weights loaded:** 17ch=True, 5ch=True, covariance=True.
- **API processing latency:** median 5.75 ms; sampled p95 8.1 ms (inprocess).
- **Contract failures:** 0.

| Crew | Scenario | Peak scripted alert | Final scripted recovery | Peak 17ch CNN novelty flag | Peak unified training level | CNN flag at completion |
|---|---|---|---|---|---|---|
| SIM_CREW_01 | oxygenation | True | False | True | WARNING | True |
| SIM_CREW_01 | exertion | True | False | True | WARNING | True |
| SIM_CREW_01 | thermal | True | False | True | WARNING | True |
| SIM_CREW_01 | sensor | True | False | True | CHECK | True |
| SIM_CREW_01 | co2 | True | False | True | CRITICAL | True |
| SIM_CREW_01 | cabin_leak | True | False | True | CRITICAL | True |
| SIM_CREW_01 | radiation | True | False | True | CRITICAL | True |
| SIM_CREW_02 | oxygenation | True | False | True | WARNING | True |
| SIM_CREW_02 | exertion | True | False | True | WARNING | True |
| SIM_CREW_02 | thermal | True | False | True | WARNING | True |
| SIM_CREW_02 | sensor | True | False | True | CHECK | True |
| SIM_CREW_02 | co2 | True | False | True | CRITICAL | True |
| SIM_CREW_02 | cabin_leak | True | False | True | CRITICAL | True |
| SIM_CREW_02 | radiation | True | False | True | CRITICAL | True |
| SIM_CREW_03 | oxygenation | True | False | True | WARNING | True |
| SIM_CREW_03 | exertion | True | False | True | WARNING | True |
| SIM_CREW_03 | thermal | True | False | True | WARNING | True |
| SIM_CREW_03 | sensor | True | False | True | CHECK | True |
| SIM_CREW_03 | co2 | True | False | True | CRITICAL | True |
| SIM_CREW_03 | cabin_leak | True | False | True | CRITICAL | True |
| SIM_CREW_03 | radiation | True | False | True | CRITICAL | True |
| SIM_CREW_04 | oxygenation | True | False | True | WARNING | True |
| SIM_CREW_04 | exertion | True | False | True | WARNING | True |
| SIM_CREW_04 | thermal | True | False | True | WARNING | True |
| SIM_CREW_04 | sensor | True | False | True | CHECK | True |
| SIM_CREW_04 | co2 | True | False | True | CRITICAL | True |
| SIM_CREW_04 | cabin_leak | True | False | True | CRITICAL | True |
| SIM_CREW_04 | radiation | True | False | True | CRITICAL | True |

## Limitations
- This is engineering verification of fictional scenario inputs, not clinical anomaly-detection sensitivity.
- The 17-channel model flags are frozen-model novelty output, not predefined scenario status or medical severity.
- The scripted alarm is designed to clear when the trigger subsides; the rolling CNN can retain earlier anomalous measurements.
- The four crew profiles are synthetic, correlated within scenario, and not independent patients.
- API processing time measured on execution environment, not a guaranteed production response-time SLA.
- Speaker hardware and audible playback are assessed separately with browser instrumentation rather than this API audit.
