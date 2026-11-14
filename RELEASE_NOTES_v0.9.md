# PHYSIOGRAPH v0.9 | Backend Integration, PhysioAlert & Verification Workflow

**Purpose:** Complete the research-prototype monitoring backend and connect it to the existing v0.8 app without changing the established APDRA screening calculations.

## Implemented

1. `physiograph/physioalert.py`: Evidence-labeled findings for the most recent reading per subject/biomarker/unit/source. Distinguishes insufficient personal reference, baseline-sensitive exploratory screens, consistent exploratory deviations, and measurements outside explicitly supplied laboratory intervals. Notes when later readings move farther from the reference. Uses stable hashed alert IDs and no numerical disease-risk score.
2. `physiograph/monitoring.py`: Validates data and runs unchanged APDRA, stability analysis, PhysioAlert, and review-state attachment through one call. Assays from different `source` values are scored separately, avoiding accidental pooling of baselines.
3. `physiograph/quality.py`: Blocks invalid dates, mixed date and mission-relative timepoint formats, reference measurements recorded after follow-up observations, invalid source intervals, and incompatible units (the latter through the existing input normalizer). The dates must be correct before baseline/recovery comparisons.
4. `physiograph/workflow.py`: In-session, auditable review-status transitions, with timestamped pseudonymous actor codes, stable observation IDs, and explicit JSON export/import. No hidden server database, automatic clinical intervention, or medical urgency labels.
5. Streamlit Astronaut Monitor: Connects these features through **PhysioAlert evidence** and **Verification workflow** tabs, alongside existing APDRA and trajectory graphs. The NASA research tab also uses the new latest-reading evidence presentation, without changing original scientific results.
6. Privacy improvement: user-uploaded personal measurements no longer pass through global Streamlit data caches. NASA public research tables remain cached.
7. `tools/monitoring_audit.py`: Offline command-line research-demo audit producing APDRA, evidence, PhysioAlert and a JSON summary. `RUN_BACKEND_TESTS_WINDOWS.bat` runs tests and the simulated-data smoke test.
8. Serial user-entered `monitoring` observations now receive time-ordered trajectory descriptions. This small bug fix does not affect the original Inspiration4 `postflight` results or the APDRA screening algorithm.

## Verified

- **92 automated tests passed** (71 carried forward plus 21 new regression / integration checks).
- Demonstration monitoring CSV: 8 readings, 2 latest biomarker observations, 1 exploratory review finding, 1 unflagged observation.
- Actual NASA tables run through the backend without errors: 509 CMP measurement rows and 5,481 NPQ protein measurement rows. Review counts are **latest-observation** counts and are not the same as the research finding of 68/195 **measurement-level** baseline-sensitive conventional flags.
- The existing scientific regression test still reproduces **68 of 195 (34.9%)** using fixed original research settings. No new clinical effectiveness claim.
- Source compiles as Python. Browser-level Streamlit validation remains to be completed on Windows. Streamlit was not installed in the build environment.

## Safety and scope

- **Not medical software, not a diagnostic system, not treatment guidance.** Abnormal screening patterns are not diseases. Absence of an alert is not proof that someone is healthy. An outside-source-interval reading must be reviewed with its assay and individual applicability; the app supplies no NASA-approved medical action thresholds.
- Mission Health Monitor supports demonstration/pseudonymous and user-entered measurements; do not put identifiable health records in a public Streamlit demo.
- Review actions stay in the Streamlit session; JSON export and import allow manual continuity. No encrypted persistent database or user authentication. **Do not deploy for real patient/astronaut medical use.**
- Do not label the 4 Inspiration4 crew members as a statistically representative astronaut cohort.
- NPQ is log₂ relative signal, *not* a concentration or percent change.

## Windows quick start

1. Extract the ZIP to a new directory (do not overwrite the prior build while it is running).
2. Double-click `START_PHYSIOGRAPH_WINDOWS.bat` and open `http://localhost:8501`.
3. Open `03 / Astronaut monitor + PhysioAlert`, select **Simulated demonstration**, and inspect two latest readings. Confirm one review prompt and one unflagged record.
4. Open **Verification workflow**, record **Recheck requested**, then **Measurement verified**. Export the JSON, clear the log, import the JSON and confirm the restored state.
5. In **Research Explorer**, verify the actual NASA data and previous 34.9% research result.
6. Optional: double-click `RUN_BACKEND_TESTS_WINDOWS.bat` for automated checks.
