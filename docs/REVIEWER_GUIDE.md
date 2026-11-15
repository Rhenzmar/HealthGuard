# HealthGuard | Reviewer Guide

**Project:** HealthGuard, NASA Space Apps Challenge 2026  
**Team:** CNHS-STE  
**Live demo:** https://physiograph-dashboard.onrender.com/  
**Project page:** https://www.spaceappschallenge.org/2026/find-a-team/cnhs-ste/?tab=project

## What to try in the demo

1. Open **Mission Dashboard**, switch between the four fictional crew members and note the **simulated** readings.
2. Open **Crew Telemetry** for time-series charts and evidence context. The five original model physiological channels and four extra scripted estimates are distinct.
3. Open **Body Explorer**. Select cardiovascular, breathing/oxygen and thermal regulation sections. Only these three have related displayed simulator measurements; other anatomical structures in the model are educational.
4. Explore **Health Routine** and **Health Library**. The library's NASA data and educational explanations are separate from the fictional live data.
5. Open **Mission Control** and **Mission HUD** to see how a simulated environment and suit interface might present contextual readings.
6. Open **Scenario Lab** as a popup. Select one of nine scripted events, start playback and watch the relevant simulated values evolve. An abnormal scenario and an ordinary normal stream are different sources.
7. Select **Take a tour** in the navigation for an eight-step guided walkthrough; optional browser text-to-speech gives longer commentary than the short on-screen labels.

### Troubleshooting

The Render backend might restart or sleep; wait for new synthetic packets after opening the app. Audio depends on browser policy, sound settings and user interaction. If an error is shown, it must not be interpreted as a silent clinical measurement or a valid model result.

## What is implemented

- Four independent fictional crew profiles and realtime-looking synthetic streams.
- A frozen five-channel 1D-CNN autoencoder with a shrinkage-covariance comparator; an additional experimental synthetic-trained 17-input CNN candidate.
- Per-crew context, quality indicators, exploratory APDRA baseline evidence and deterministic PhysioAlert training attention levels.
- Nine server-supported scripted events, three monitored Body Explorer sections, a suit HUD demonstration, gamified activities, research library and optional scripted voice interface.
- Separate historical OSD-569 and OSD-575 laboratory analysis, plus an independent RR-1 ISS environmental screening exercise.

## What the evaluation supports

- An earlier **seven-scenario** synthetic integration audit covered **four fictional subjects**, **28 event/person combinations**, and **168 API/model checkpoints**. This predates expansion to nine scenarios and should not be described as nine-scenario validation.
- Historical NASA OSD-569/575 biomarker tables contain **8,783 numeric observations**. Exploratory APDRA baseline stability reported **272 of 829** median-only flags not consistently reproduced under baseline omission (32.8%). These are **not** 272 confirmed false positives.
- ISS RR-1 environmental data were studied independently; the full 17-input CNN was **not** run or validated on genuine astronaut continuous multichannel measurements.

**Not established:** medical sensitivity/specificity, diagnoses, astronaut health-risk probabilities, real-world emergency performance, clinical benefit, flight qualification or full 17-input external NASA validation.

## Scientific evidence and reproducibility

- [Historical NASA assay methodology and results](../research/nasa_real_data_evaluation/REPORT.md)
- [ISS RR-1 environmental evaluation](../research/nasa_rr1_eda_evaluation/REPORT.md)
- [End-to-end synthetic software integration](../research/prototype_end_to_end/RESULTS_INTERPRETATION.md)
- [Architecture, source boundaries and model roles](ARCHITECTURE.md)
- [Primary data sources](../research/sources.md)
- [Local run and frontend build](../README.md#local-setup)

For reviewers who cannot access the private implementation repository, a **separate sanitized read-only presentation repository** is recommended. A ready-to-copy README and publication checklist are included in [reader-repository template](reviewer-repository/README.md).

## AI-assistance and asset disclosure

ChatGPT (OpenAI) was used as a development and research assistant. It contributed to research planning, coding, UI design, testing and text preparation; the team retains responsibility for reviewing and submitting the work. Voice announcements are deterministic scripts spoken by the browser, not a dynamically diagnosing AI clinician. Third-party anatomy and NASA dataset assets have distinct provenance/licensing conditions and should not be republished casually.

This is a fictional, nonclinical research prototype.
