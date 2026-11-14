# PHYSIOGRAPH v0.6 | Evidence-Anchored APDRA

- Added threshold-free continuous baseline-omission strength, separate from exploratory flag thresholds.
- Added **optional, externally sourced** positive-scale lognormal RCV pairwise check. Disabled by default; requires CV_I, CV_A and a traceable source. Not available for NULISA NPQ.
- Added verification queue by latest measurement, based on transparent data-quality and baseline evidence reasons, never medical urgency.
- Added descriptive time-aware postflight movement toward/away from reference with real elapsed days.
- Updated the NASA Research Explorer and individual Evidence Report to display the new outputs.
- Retained original NASA OSD-575 files, all older reports and the previous legacy screening for side-by-side comparison.
- 57 automated tests passing. The full Streamlit browser experience remains to be verified locally.
- No new numerical superiority or medical accuracy claim is supported by this update. Read `research/APDRA_v06_literature_methods_validation.md`.
