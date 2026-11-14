# PHYSIOGRAPH | APDRA v0.7 Final Algorithm Validation

**Project:** PHYSIOGRAPH, NASA Space Apps Challenge 2026  
**Analysis date:** November 14, 2026  
**Status:** Final retrospective *computational methods audit*, not clinical validation, statistical confirmation of spaceflight effects, or astronaut-health risk certification.

## Executive decision

**Freeze APDRA's current core rules for the submission.** The method has demonstrable value as a *baseline-robustness disclosure and evidence-review layer*, but **it has not shown general accuracy superiority** over conventional personal-median screening. No further threshold or architecture tuning should be done in pursuit of a favorable numerical headline. Keep its RCV check optional and unavailable without valid externally sourced biological/analytical variation parameters. Retain its recovery descriptions as descriptive only.

### What can responsibly be claimed

1. Using the NASA OSD-575 records, the conventional median-only heuristic flagged **195** postflight observations across two distinct assays. **68 of the 195 (34.87%)** did not remain consistently flagged when each observed preflight sample was omitted in turn. These are repeated *measurement-level* comparisons in **four astronauts**, not 195 independent medical cases or 68 false-positive diagnoses.
2. APDRA's leave-one-out consistency layer makes *the dependence of a flag on the specific preflight observations* visible. This is a computational property illustrated in authentic NASA records, not proof that the changed flags correspond to truth.
3. Under synthetic numerical stress tests with **24 independent seeds per condition**, the conservative APDRA rule has **mixed** detection performance versus median-only screening at comparable false-screen rates. Effects depend on noise, baseline count, and outliers.
4. The optional Reference Change Value method follows published clinical chemistry principles but is **not evaluated on these NASA assays** because suitable matched CVi/CVa inputs were not supplied. The trajectories have no independent clinical recovery labels.

## Audited software and experimental design

**Frozen software source:** PHYSIOGRAPH v0.6 code, unmodified APDRA core. New v0.7 files add only independent validation, tests and reports. All **65 tests pass** (57 existing + 8 new validation tests). These are unit/known-answer tests, not medical evaluations.

We compared *three prespecified-by-script numerical scores* on paired simulated cases:

- **Median-only:** absolute deviation from the full preflight median, scaled by its magnitude.
- **LOO-any ablation:** largest deviation obtained by omitting one preflight reading. This reveals why a more permissive interpretation can be unreliable.
- **LOO-consistent (APDRA core):** smallest leave-one-out deviation magnitude if *every* leave-one-out reference gives the same direction, zero otherwise. This corresponds to APDRA's conservative stable-screen requirement.

Synthetic starting reference value is 100 arbitrary units. For half of cases, a change of +45 or -45 units was injected, with sign randomized. The other half had no injected change. Two or three preflight samples were used, matching the sparse-sampling challenge. Four unchanged configurations from prior v0.5 validation: low Gaussian noise; moderate Gaussian noise; baseline noise with 15% outlier contamination; and high noise with 10% outlier contamination. These conditions were selected during earlier project development and remain **post hoc / exploratory**, not preregistered.

For each of **24 random seeds** (1729–1752), **2 baseline counts**, and **4 noise configurations**, an independent **3,000-case calibration dataset** and a distinct **3,000-case held-out evaluation dataset** were generated. Calibration used only synthetic no-change cases to select a per-method threshold approximating **5% false-screen rate**. The test labels did not influence threshold selection. Each of the three rules was evaluated on the exact same held-out cases per seed and condition, including ROC AUC, empirical test false-screen rate, and injected-change detection rate.

Reported 95% intervals are Student-*t* intervals over 24 **seed-level paired differences**; they estimate repeatability across independent simulations under this specific generator. They **do not** estimate uncertainty of disease diagnosis, astronaut-population performance, or biological response.

## Key results: APDRA LOO-consistent minus median-only

| Preflight readings | Condition | Detection improvement (percentage points) | 95% seed-level CI (pp) | AUC change |
|---:|---|---:|---|---:|
| 2 | Low noise | 0.00 | 0.00 to 0.00 | ≈0 |
| 2 | Moderate noise | **−2.19** | −2.43 to −1.95 | −0.0044 |
| 2 | Baseline outliers | **+6.54** | +5.58 to +7.49 | −0.0116 |
| 2 | High noise | **+3.71** | +2.71 to +4.70 | −0.0117 |
| 3 | Low noise | 0.00 | 0.00 to 0.00 | ≈0 |
| 3 | Moderate noise | **+0.81** | +0.63 to +0.98 | +0.0018 |
| 3 | Baseline outliers | **−2.12** | −2.38 to −1.87 | −0.0090 |
| 3 | High noise | **+5.12** | +4.42 to +5.82 | +0.0078 |

**Interpretation:** In two-baseline outlier cases, APDRA gets more injected changes past its individually calibrated 5% screening threshold even though its overall ROC AUC is lower than median-only. A single threshold advantage does **not** imply global ranking superiority. In three-baseline outlier cases, APDRA loses. The same method is therefore not universally best.

### Component ablation

The LOO-any rule can magnify apparent deviations due to one unusual reference sample. In the **two-baseline/outlier** setting, its average held-out detection rate at a matched ~5% false-screen rate was **8.54%**, versus **86.50%** for LOO-consistent APDRA and **79.96%** for median-only screening. In the *three-baseline/high-noise* setting, corresponding rates were **31.51%**, **46.84%**, and **41.72%**. This demonstrates that requiring consistency is essential to how **this particular sparse-baseline stress-test design** behaves. It does **not** prove it is clinically superior for real laboratory data.

For the full 24-run-per-condition rates, empirical false-screen rates, ROC AUCs and confidence intervals, use the accompanying machine-readable CSVs. We deliberately do not pool across noise regimes; their relative prevalence in astronaut data is unknown. Multiple scenario comparisons were exploratory; intervals are not corrected for multiple comparisons.

## Authentic NASA observational crosscheck

Source: [NASA OSD-575: SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575), version 3, DOI [10.26030/mc5d-p710](https://doi.org/10.26030/mc5d-p710). The mission involved four astronauts, with sparse pre- and postflight samples. The metabolic CMP source provides conventional laboratory concentration units; Alamar NULISA NPQ values are log2-normalized *relative* protein signals. They are **not** interchangeable, and no ratio of the raw NPQ values is interpreted as a percentage.

| NASA assay | Usable records | Postflight measurements | Median-only flags | Median flags that failed full LOO consistency | Percent of median flags unstable |
|---|---:|---:|---:|---:|---:|
| CMP: 19 analytes | 509 | 291 | 25 | 7 | 28.0% |
| Alamar: 203 proteins | 5,481 | 3,248 | 170 | 61 | 35.9% |
| **Total** | **5,990** | **3,539** | **195** | **68** | **34.9%** |

At the current heuristic 30% CMP and 1-log2-NPQ thresholds, APDRA's native stability classifications across all postflight measurements were: CMP **18 consistent**, **17 baseline-sensitive**, **252 no consistent screen**, **4 insufficient baseline**; NPQ **109 consistent**, **363 baseline-sensitive**, **2,776 no consistent screen**. Baseline-sensitive count is **not** identical to unstable *median-flagged* count: a measurement can be baseline-sensitive despite the median-only rule *not* flagging it.

The CMP threshold is researcher-configurable. A prior v0.6 sensitivity audit showed the CMP consistent-screen count changing from **30 at 20%** to **18 at 30%** to **6 at 40%**. This is direct evidence that a single universal cutoff cannot be presented as a clinically defined boundary. We use 30% only to reproduce the established exploratory analysis, *not* because it was clinically optimized.

**Unit of biological replication:** four crew members. Thousands of timepoint/biomarker records cannot be treated as thousands of independent astronauts. No ground-truth pathology or recovery outcome labels are present, so the observational data **do not** validate sensitivity/specificity, comparative biological truth, causal effects, or medical benefit.

## What was not demonstrably validated

- **Biological recovery:** A trajectory closer to preflight median is descriptive; no validated recovery or health outcome labels are available. Multiple postflight timepoints and true elapsed-day spacing improve graph accuracy, not health prediction.
- **Reference Change Value:** Current implementation requires traceable CVi and CVa values and suitable positive concentration scales. We did **not** use generic numbers for the NASA assays, nor apply the concentration-scale RCV formula to log2-NPQ values.
- **Cross-astronaut predictive accuracy:** Only four individuals, different baseline counts and panels. No external prospective astronaut sample validates the algorithm. No model was trained or tuned using astronaut health outcomes.
- **Clinical care:** The measurement-review queue provides data-quality or measurement-verification reasons, not an authorized medical protocol, diagnosis, emergency alert or treatment recommendation.

## Literature basis, precisely scoped

1. [NASA OSD-575 study](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575), DOI 10.26030/mc5d-p710: source of the actual assay data and sample context.
2. [Models to estimate biological variation components and interpretation of serial results: strengths and limitations](https://pmc.ncbi.nlm.nih.gov/articles/PMC10270238/): explains prerequisites and limitations of CVi/CVa-based reference-change interpretation, supporting APDRA's opt-in design without validating our screening thresholds.
3. [Estimating Reference Change Values Using Routine Patient Data: A Novel Pathology Database Approach](https://academic.oup.com/clinchem/article/71/2/307/7874401), *Clinical Chemistry* (2025): shows real-world limitations of conventional CV-based RCV calculation, supporting explicit lab-context caveats.
4. [The Space Omics and Medical Atlas (SOMA) and international astronaut biobank](https://doi.org/10.1038/s41586-024-07639-y), *Nature* (2024): motivates longitudinal individual and multisystem assessment; does not validate this algorithm.

## Reproducibility and freeze

1. Install Python dependencies listed in `requirements.txt` (includes `scipy` for ROC AUC and confidence-interval calculations).
2. Run `python -m pytest -q` at project root. Expected result: **65 passed** for this release.
3. Run `python -m tools.final_apdra_validation`, or double-click `RUN_FINAL_APDRA_VALIDATION_WINDOWS.bat` after the Windows environment has been created.
4. Find files under `research/apdra_v07_final_validation/`:
   - `all_independent_runs.csv`: every seed/method/scenario evaluation.
   - `summary_with_seed_ci95.csv`: method means and intervals.
   - `paired_differences_ci95.csv`: within-seed differences and intervals.
   - `nasa_crosscheck.json`: real-data descriptive counts and source checks.
   - `run_metadata.json`: simulation assumptions and configurations.

**Submission-safe claim:** “PHYSIOGRAPH's APDRA adds a leave-one-baseline-out evidence-stability analysis to individual astronaut biomarker monitoring. On sparse NASA Inspiration4 samples, roughly one-third of conventional median-flagged observations were not consistent under omission of a single reference measurement. Synthetic experiments demonstrate both benefits and tradeoffs of the conservative screening rule; no clinical or astronaut-specific accuracy superiority is claimed.”

**Decision: Freeze APDRA for v0.7.** Fix bugs if independently discovered, but do not optimize methods or thresholds against these exploratory results. Focus next on source-aware explanation and a clear scientific interface, not more algorithm branches.
