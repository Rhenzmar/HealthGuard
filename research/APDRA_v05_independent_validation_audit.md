# PHYSIOGRAPH | APDRA v0.5 independent validation audit

**Date:** November 14, 2026. **Status:** additional exploratory software and numerical validation, **NOT** a clinical validation. Performed on the exact v0.5 project sources and preprocessed NASA OSD-575 CSV files.

## Executive finding

APDRA is useful as a **baseline sensitivity / evidence-adequacy annotation layer**, not demonstrated as a more accurate medical or physiological change detector. Its advantage depends on sample count, noise, and the operational metric. No general superiority claim is justified. The scientific value is in making ambiguity explicit when only 2–3 preflight measurements are available.

## Software integrity

`python -m pytest -q` produced **34 passed** after these exploratory audit scripts were added. Automated tests check software behavior and data formats; passing tests do **not** establish health-related performance.

## What real NASA data do and do not show

Four coded Inspiration4 crew, two assays:

| Panel | Distinct biomarkers | Usable records | Non-preflight measurements | Consistent APDRA screens | Baseline-sensitive screens | Insufficient baseline |
|---|---:|---:|---:|---:|---:|---:|
| Metabolic CMP | 19 | 509 | 291 | 18 | 17 | 4 |
| Alamar log₂ NPQ proteins | 203 | 5,481 | 3,248 | 109 | 363 | 0 |
| **Combined** | 222 | 5,990 | 3,539 | 127 | 380 | 4 |

At the current *exploratory* 30% metabolic / 1-log₂-NPQ thresholds, conventional personal-median screening flags **25 CMP + 170 NPQ = 195** postflight measurements, of which **7 CMP + 61 NPQ = 68 (34.9%)** are not **consistently** flagged when one baseline observation is omitted. APDRA marks **127** as consistently screened across all omissions and classifies **380** postflight measurements as baseline-sensitive. Of those 380, most were **not** flagged by the median-only rule. This makes APDRA useful for *disclosing decision dependence on the reference measurements*, **not** for declaring 380 abnormalities or increasing the number of medical alerts to 507. The same biomarkers recur over time within four people; the 3,539 measurements are **not statistically independent subjects**.

The immune panel provides three preflight baseline samples for 609 person-protein combinations and two for 203 person-protein combinations. A 3-point baseline does not estimate clinically reliable inter-occasion variation.

## Prior v0.4 numerical simulation (three baseline samples)

Known artificial ±45-unit changes, four simulated noise/outlier regimes, independent 3,000-case calibration and 3,000-case test sets, three seeds. Both rules were calibrated to approximately 5% false screens within each scenario.

| Noise condition | Conventional median detection | APDRA detection |
|---|---:|---:|
| Low noise | 100.0% | 100.0% |
| Moderate noise | 95.42% | 96.09% |
| Baseline outliers | 95.38% | 93.26% |
| High noise | 39.29% | 45.73% |

APDRA ties in low noise, marginally improves moderate noise, loses under outliers, and improves under high noise. No overall clinical or general statistical advantage established. These percentages reflect detecting injected numerical changes, **not disease, treatment needs, or actual spaceflight adaptation**.

## Additional v0.5 robustness audit: two vs three baseline samples

The attached script runs **12 independent seeds per noise scenario**, with independent 3,000-case calibration and 3,000-case test cohorts **for each seed**, and also estimates threshold-independent ROC AUC. There are **two baseline-count conditions**, 2 and 3, using the same 45-unit artificial shift. Thresholds are independently calibrated to the same nominal 5% false-screen target in each scenario and baseline-count condition, without test-set label access. This audit was created after reviewing the v0.4 results and is **exploratory, not preregistered**.

| Baseline n | Synthetic condition | Median detection | APDRA detection | Median AUC | APDRA AUC |
|---|---|---:|---:|---:|---:|
| 2 | Low noise | 100.00% | 100.00% | 1.0000 | 1.0000 |
| 2 | Moderate noise | 95.14% | 92.86% | 0.9896 | 0.9850 |
| 2 | Baseline outliers | 79.71% | 86.60% | 0.9497 | 0.9379 |
| 2 | High noise | 36.67% | 41.33% | 0.8039 | 0.7935 |
| 3 | Low noise | 100.00% | 100.00% | 1.0000 | 1.0000 |
| 3 | Moderate noise | 96.14% | 96.83% | 0.9914 | 0.9929 |
| 3 | Baseline outliers | 95.23% | 93.01% | 0.9886 | 0.9803 |
| 3 | High noise | 41.46% | 46.52% | 0.8226 | 0.8313 |

Note that APDRA sometimes has **higher detection at a single calibrated cutoff yet lower full-range AUC**, as with n=2 outliers. This reinforces that results depend on the operating point. Per-scenario false-screen rates average roughly 4.7%–5.4%; see `summary.csv` for exact values. These experiments do not cover physiological assay variability, biological variation, multiple correlated biomarkers, assay batch effects, or real adverse-health outcomes.

## Major methodological limits

1. The default **30% threshold** for CMP and **1-log₂ NPQ** threshold for protein signals are research heuristics, not analyte-specific clinical decision thresholds. There is no evidence that one percentage applies equally to sodium, albumin, creatinine, etc.
2. Clinical chemistry literature uses **Reference Change Values (RCV)**, incorporating within-person biological variation and laboratory analytical imprecision, when suitable validated CVi/CVa estimates exist. The dataset does not establish those parameters for all analytes. **Do not compute or display a clinical RCV without defensible external CVi/CVa data and assay matching**.
3. The personal baseline has only 2–3 measurements. The leave-one-out spread is *not* a confidence interval, while the algorithm's descriptive “closer to baseline” signal is *not* evidence of clinical recovery.
4. Thousands of highly correlated biomarker observations come from only **four astronauts**, so performance on these observations cannot establish cross-astronaut generalizability.
5. The synthetic simulator has a universal numerical baseline near 100 and injected changes of ±45, independent Gaussian errors with occasional artificial baseline outliers. It is a software stress test, not a biomarker-realistic model of immune or metabolic adaptation.

## Published scientific basis

- *The Role and Limitations of the Reference Interval Within Clinical Chemistry and Its Reliability for Disease Detection* (2024): https://pmc.ncbi.nlm.nih.gov/articles/PMC10932992/ . Establishes the importance of biological variability, personal setpoints and RCV alongside population intervals.
- Sandberg et al., *Biological variation: recent development and future challenges* (2023): https://doi.org/10.1515/cclm-2022-1255 . Explains within-person and between-person variation, plus the need for robust externally validated estimates.
- *Current and emerging concepts in biological and analytical variation applied in clinical practice* (2020): https://pmc.ncbi.nlm.nih.gov/articles/PMC7694803/ . Provides the standard RCV formulation and limitations.

These studies **motivate** APDRA's uncertainty-aware presentation; they **do not** validate APDRA itself.

## Recommended competition-science claim

> In NASA Inspiration4 biomarker records, about one-third of measurements flagged by a simple personal-median heuristic were not consistently flagged under leave-one-baseline-out reference checks. APDRA makes that sensitivity visible, while preserving lab interval context and descriptive postflight trajectories. Controlled simulations show scenario-dependent tradeoffs rather than universal improvements in detection.

## Highest-value next improvement

Add an interpretable three-lane evidence report: (1) stable exploratory deviation, (2) baseline-sensitive / collect additional reference measurements, (3) no consistent screen or inadequate data. Display analyte-specific source intervals independently where available. Offer RCV calculation **only when matched, documented biological variation and analytical variation parameters exist**. Separate research screening from medical alerts; use published clinical procedures only where actually available. Validate numerical threshold robustness by varying the exploratory cutoff and showing the induced classification changes, not by selecting favorable thresholds.

The final competition framing should be **transparent evidence quality under sparse baselines**, not medical diagnosis, confirmed spaceflight-induced biomarker changes, or superiority in every detection setting.
