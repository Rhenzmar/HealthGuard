# HealthGuard completion checklist — 15 November 2026 (Asia/Manila)

## Milestones
- **12:00 PM:** Backend and dataset work frozen after quality checks and exact documented limitations.
- **7:00 PM:** Frontend frozen after multi-crew scenario and navigation smoke tests.
- Do not claim either milestone met until deployed service and manual checks have been verified.

## Backend features and acceptance criteria
- [x] Four fictional physiological streams with separate subject IDs, histories and contextual reviews.
- [x] Five core simulated channels preserved for the frozen physiological novelty models.
- [x] Twelve new independent deterministic engineering illustration channels (not fed into the five-channel model), including BP estimates, end-tidal CO2, cabin atmosphere, radiation and suit reserve.
- [x] Historical NASA OSD-575 research explorer: 19 CMP and 203 NULISA biomarker types; no interpolation or links to fictional crew.
- [x] OSD-569 CBC **provisional mirror import**: 20 measurement types, 28 source sample rows, one reported bad sample quarantined; preserves units and sample metadata. Source still needs independent checksum/authentication directly against NASA.
- [x] Read-only engineering API and CBC quality endpoint with explicit source labels.
- [x] Isolated public demo ingest lockdown.
- [x] GitHub CI created for backend source tests and frontend build.
- [ ] Independently download official NASA OSD-569 original and compare content hashes or a documented canonical-data check. If not available, retain 'unverified public mirror' labeling.
- [ ] Review all input guardrails and verify API load and WebSocket updates after the final deploy.
- [ ] Conduct external/clinical validation before claiming any diagnostic, medical emergency or autonomous treatment capability. Not required for a nonclinical software demo but must remain explicitly unvalidated.

## Frontend features and acceptance criteria
- [x] Crew selection controls individual simulator data sources and visual profile.
- [x] Seven scripted training scenarios including oxygenation, exercise, thermal, sensor artifacts, CO2 scrubber failure, cabin leak, radiation incident.
- [x] Four script intensity levels: Optimal, Check, Warning and Critical (not clinical classification).
- [x] Affected values evolve, change color, and show guidance; audio is best effort and browser-permission dependent.
- [x] Dashboard can browse real historical OSD-575 records and provisionally mirrored OSD-569 CBC values separately.
- [x] Explicitly simulated twelve-channel engineering cards are shown in dashboard, Mission Control, and HUD.
- [x] Body Explorer and HUD use selected astronaut identity instead of hardcoding Crew 01.
- [ ] Verify Body Explorer 3D rendering and selection on desktop/mobile browsers.
- [ ] Verify all four crew buttons, seven scenarios, scenario reset/recovery, audio toggle and manual speech.
- [ ] Verify status colors and charts for both physiological and engineering channels at every scenario stage.
- [ ] Verify the app remains usable when the backend is cold-starting/offline.
- [ ] Record reproducible demonstration with evidence of each data-source type and no fabricated NASA telemetry.

## Data-source and scientific distinctions
1. NASA OSD-575 chemistry and NULISA data are discrete historical samples from four pseudonymous human participants C001–C004, not today's astronaut readings.
2. OSD-569 CBC originates from a public third-party mirror of a NASA-labeled table; one reported malformed row is excluded and original-file authentication is pending.
3. NASA cardiovascular/vision and SANS reference pages provide background context, not connected live blood-flow, fundus imaging or neuro-ocular sensors.
4. The 5-channel physiological simulator and 12-channel engineering illustration stream are separate synthetic sources.
5. The four-tier alert labels describe a scripted training scenario; the frozen CNN/other numeric pattern detectors must not be relabeled as validated clinical triage.
6. All crew names and Artemis IV scenario assignments are fictional.

## Demo smoke test
1. Refresh dashboard and wait for four independent simulated crew subjects.
2. Switch Elena → Marcus → Aisha → Daniel: names and numerical readings must track correct subject IDs.
3. Open CBC and CMP historical panel, select C001–C004, inspect units and timepoint labels.
4. Start CO2 failure, wait through onset, peak, recovery; verify airflow-relevant physiology and cabin CO2 move without mislabeling NASA data.
5. Start pressure leak and radiation event; verify environmental numbers, four-level colors, and training-only guidance.
6. Open Body Explorer, Mission Control and HUD; verify astronaut identity and data-provenance disclosures.
7. Run GitHub Actions workflow and confirm both jobs pass; check both Render services live.
8. Record demo, screenshots, and limitations.
