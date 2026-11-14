# PHYSIOGRAPH v0.8 | Research-to-Monitoring Demonstration

## What changed

- Redesigned Streamlit home page with a dark, mission-control-inspired layout and real NASA OSD-575 data as the first thing visitors see.
- A **conditional, reproducible** headline: 68 of 195 median-screen-positive postflight *measurement records* (34.9%) are not consistently flagged under APDRA leave-one-baseline-out checks. This figure is fixed at **30% for CMP** and **1.0 NPQ log₂ unit** for the Alamar panel. It is **not** the prevalence of health problems, an accuracy statistic, or an independent astronaut-level finding.
- Separate dashboard views: `01 / Discoveries`, `02 / Research Explorer`, `03 / Astronaut Monitor`, and `04 / Methods & Evidence`.
- Cross-crew and cross-assay **observation-level** counts with denominators, and an interactive baseline-stability heatmap. The heatmap is organized by biomarker and crew, at an actual chosen sampling timepoint. Missing cells are not called normal.
- For each selected crew member and biomarker, a direct table compares the conventional median-based flag with APDRA's stricter *consistent across omissions* designation on the same later samples.
- Plotly charts use **true mission-relative day spacing**, not evenly spaced categorical labels; within-person NPQ comparisons are in ΔNPQ, not percentage of raw log₂ numbers.
- Included the separate monitoring workspace for user-entered, uploaded or clearly simulated records, with a nonclinical verification queue, plus a research provenance view.
- Reused and **did not modify** the frozen APDRA v0.7 algorithm or its final simulation benchmark, preserving reproducibility.

## Scientific findings that can be shown

NASA OSD-575 combined OSD-575 datasets, **postflight sample measurements**, not unique astronauts or disease events:

| Assay | Later records | Median-only heuristic flags | Median flags not consistent under baseline omission | APDRA consistent screens | APDRA baseline-sensitive screens |
|---|---:|---:|---:|---:|---:|
| Metabolic (CMP; 30% screen) | 291 | 25 | 7 | 18 | 17 |
| Alamar protein NPQ (1 log₂ unit) | 3,248 | 170 | 61 | 109 | 363 |
| Total | 3,539 | 195 | 68 | 127 | 380 |

The **68** is a subset of the **195 median-screen positives**. The **380** counts *all* baseline-sensitive readings under LOO analysis, including readings **not** initially flagged by the median rule, so these are different denominators/questions. The numbers should not be combined into a single medical risk score.

The dataset has four crew members, 19 metabolic analytes, and 203 Alamar protein targets. NPQ is normalized log₂ relative protein signal, **not** a concentration. Samples are mainly preflight/postflight, **not continuous onboard monitoring**. The app's exploratory thresholds are not clinically validated.

## Validation and packaging

- Added six new software regression tests in `tests/test_discovery_v08.py`, including the direct 25/7 and 170/61 real-NASA crosschecks, assay separation, crew denominators, and NPQ units. The complete suite passes **71 tests**.
- All Python application files pass `py_compile`.
- The UI could **not** be run in a browser in this execution environment because Streamlit was not installed and package installation was blocked by network/DNS. The user should test on Windows after extracting the ZIP.
- No LLM or external health-data transmission was added.

## Run on Windows

1. Close any old PHYSIOGRAPH Streamlit terminal window to release port 8501.
2. Download and extract the v0.8 ZIP as a separate `PHYSIOGRAPH` folder, not into a previous source folder.
3. Double-click `START_PHYSIOGRAPH_WINDOWS.bat`.
4. If the page does not open, visit `http://localhost:8501` while the terminal is running.
5. Explore **Discoveries** for the 34.9% headline and other crew findings, then **Research Explorer** to inspect the underlying measurements, and **Astronaut Monitor** for user inputs.
6. To verify the numbers, run `.venv\Scripts\python.exe -m pytest -q` from the extracted project folder.

**Do not claim diagnostic validation, general accuracy superiority, spaceflight causality, or deployed medical advice.**
