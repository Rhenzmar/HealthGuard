# APDRA v0.4 | Evidence reporting, time-axis audit and controlled comparison

**Date:** November 14, 2026. **Status:** computational research prototype, not a clinical monitoring system or cleared medical device.

## Study question

Can an evidence-sensitivity check make biomarker screening decisions more transparent when an individual has only 2–3 baseline samples? What is the sensitivity–false-screen tradeoff against conventional screening under different known synthetic numerical perturbations?

**Important:** Neither APDRA nor a median-only threshold establishes physiological risk or a statistically significant spaceflight effect. The algorithm's distinctive implemented component is leave-one-baseline-out (LOO) sensitivity and the descriptive reliability/recovery review, **not** a trained AI model or a new clinically validated classifier.

## Measurements and NASA data

The same authentic NASA OSD-575 Inspiration4 tables from v0.3 remain unchanged: 509 nonmissing metabolic CMP measurements covering 19 markers, plus 5,481 log2 normalized NPQ values from the transformed Alamar assay covering 203 proteins, distributed across four coded crew. NPQ data are relative signals. The research methods do not pool or sum incomparable biomarkers. Sampling includes preflight and postflight observations, **not** in-flight serum measurements.

For display, the chart now uses numeric mission-relative time (approximate day 0 = launch, day 3 = return), with explicit L− and R+ labels. This corrects the v0.3 category-axis spacing: for instance, L−92 and L−44 differ by 48 days, and R+82 to R+194 differ by 112 days. A shaded 0–3-day flight window makes clear that no serum observations are being invented there. Crew comparisons use the same numeric time axis.

## APDRA algorithm

For a single person and the *same* biomarker and unit, let the observed preflight values be \(b_1,\dots,b_n\). Define the personal reference \(m=\mathrm{median}(b_i)\). For \(n\geq2\), leave out each preflight value in turn and compute \(m_{-i}=\mathrm{median}(b_j:j\ne i)\). For a later value \(y\), calculate deviations against every LOO reference:

- Clinical-unit assays: \(D_i=100|y-m_{-i}|/|m_{-i}|\) where the denominator is nonzero.
- Log2 NPQ assays: \(D_i=|y-m_{-i}|\), with a log2 difference of one corresponding to an approximate twofold difference of the **relative** protein signal. Do not take percent changes of NPQ values.
- Heuristic consistency: the screen is called consistent only when the selected numerical threshold is crossed in the same direction under **every** LOO reference; if the result changes under omission, the label is baseline-sensitive.
- For postflight trajectories, compare the latest sample's distance to each LOO reference against the first sampled postflight value. Describe all-LOO closer, all-LOO farther, or sensitive/unchanged. **Do not call this confirmed biological recovery**.
- The original metabolic panel's laboratory intervals are shown *separately* from the individual's observed baseline. Source laboratory intervals are not established astronaut-specific fitness thresholds.

The LOO range is **not a confidence interval**, and the algorithm does not estimate clinical probability of health conditions.

## Fairer numerical evaluation (new in v0.4)

The accompanying `tools/benchmark_apdra_v04.py` creates synthetic cohorts with exactly three baseline values and one later numerical value. Half the synthetic cases have a known injected ±45-unit change; the remaining cases have no injected change. Four scenarios were fixed before evaluation:

| Scenario | Baseline/follow-up Gaussian SD | Probability of a ±50-unit baseline outlier |
|---|---:|---:|
| Low noise | 5 / 5 | 0% |
| Moderate noise | 10 / 10 | 0% |
| Baseline outliers | 10 / 10 | 15% |
| High noise | 20 / 20 | 10% |

For each scenario and seed (1729, 1730, 1731), 3,000 synthetic cases calibrate the thresholds, and an independent 3,000 cases are evaluated. Results compare:

1. **Fixed 30% screen** for both median-only and LOO-consistent rules. This tests a common operating point, exposing APDRA's conservatism.
2. **Calibrated 5% null-screen target**: each rule gets a separate threshold based *only* on its calibration cohort's known no-shift cases. The thresholds are then held fixed on the untouched synthetic test cohort. Matching estimated false-screen targets provides a more informative comparison than claiming a reduction in false alerts alone.

### Detection at matched approximate 5% false-screen targets

| Synthetic scenario | Median-only shift detection | LOO-consistent shift detection | Median false-screen rate | APDRA false-screen rate |
|---|---:|---:|---:|---:|
| Low noise | 100.0% | 100.0% | 6.16% | 5.49% |
| Moderate noise | 95.42% | 96.09% | 6.18% | 5.58% |
| Baseline outliers | 95.38% | 93.26% | 5.31% | 5.13% |
| High noise | 39.29% | 45.73% | 4.87% | 4.49% |

The above are means over three seeds. They are **not sensitivity or specificity estimates for actual astronaut medical conditions**; the label is solely an injected numerical shift. None of these performance differences has been established as a clinically meaningful or robust general advantage.

At a common fixed 30% threshold, the conservative APDRA rule produces fewer false-screened synthetic cases *and* detects fewer injected shifts in each tested scenario. The earlier v0.3 benchmark reported only this kind of unequal operating-point tradeoff; v0.4 makes it more explicit by also showing calibrated comparisons.

All evaluation rows and exact scenario statistics are reproducible in `research/apdra_v04_benchmark/`, with `synthetic_runs.csv`, `synthetic_summary.csv`, and `report.json`.

## Interpretation and project implications

The results **do not demonstrate that APDRA is universally more accurate than a median-only rule**. Its defensible contribution is transparent sensitivity analysis and source-aware presentation, particularly for biomarkers with very sparse preflight references. It is not new biological science by itself. The limited four-person NASA dataset does not provide clinical ground truth for validating risk, fitness, disease, or actual recovery.

Further work needed before strong claims: independent datasets with known clinical outcomes (if available and ethically usable), multiple source assay controls, prespecified clinically appropriate reference rules, cross-individual reproducibility, and assessment by qualified space medicine specialists.

## Reproduce locally

```bat
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe tools\benchmark_apdra_v04.py
```

The 30 automated tests cover earlier model behavior, imported NASA data integrity, the new evidence report, correctly spaced NASA timeline plot, crew-trace separation, numerical score properties, and benchmark reproducibility. The Streamlit browser runtime has not been tested in the build environment; the user should verify it in a local Windows browser.
