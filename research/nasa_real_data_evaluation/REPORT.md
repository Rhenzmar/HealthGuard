# HealthGuard | Real NASA retrospective biomarker evaluation

**Dataset:** NASA Open Science Data Repository OSD-569 (CBC, version 4) and OSD-575 (CMP, Eve immune, Eve cardiovascular, Alamar NPQ, version 3). All five transformed source files are SHA-256 matched to the originals in NASA-managed S3. This is a **real-observation evaluation**, not a simulation, classification benchmark, or test of the separately trained 17-channel CNN.

**Study cohort:** Four Inspiration4 astronauts, pseudonymized as C001–C004. Repeated assay measurements from one participant do not constitute independent people or independent health outcomes.

## Inputs and source quality

| Panel | Marker types | Numeric NASA measurements | Missing |
| --- | ---: | ---: | ---: |
| Complete blood count (OSD-569) | 20 | 553 | 7 |
| Comprehensive metabolic panel (OSD-575) | 19 | 509 | 23 |
| Eve immune proteins (OSD-575) | 71 | 1,988 | 0 |
| Eve cardiovascular proteins (OSD-575) | 9 | 252 | 0 |
| Alamar relative protein NPQ (OSD-575) | 203 | 5,481 | 0 |
| **Total** | **322** | **8,783** | **30** |

All 20 observations of the OSD-569 C003 L-92 CBC sample remain preserved in the original imported table and carry source-quality flags; **19 numeric values** from that sample were excluded from methodological screens, and **one value was missing**. No missing values are imputed and no sample IDs are assigned to fictional crew members. The transformed hemoglobin percent header was corrected to g/dL using the submitted NASA assay source. The NPQ assay is already log2-scaled and must not be treated as a concentration or converted to percentage.

## Frozen screening methods

- **Median-only reference:** A postflight observation is screened when it differs by at least 30% from its individual's preflight median for concentration-like measurements, or by at least 1.0 unit for Alamar NPQ.
- **APDRA leave-one-out stability:** Omits each preflight reference in turn and checks that the same threshold is crossed in the same direction for *every* remaining reference median. At least two reference measurements are required; zero-valued reference centers for percent metrics abstain.
- All comparisons use *only actual NASA preflight measurements* to build the baseline. Thresholds were already fixed by the earlier experimental method; no hyperparameters were fit, tuned or recalibrated on these NASA files.

## Retrospective NASA postflight results

| NASA assay | Assessable postflight observations | Median-only flags | Consistent APDRA flags | Median flags not consistently supported |
| --- | ---: | ---: | ---: | ---: |
| CBC | 315 | 47 | 28 | 19 |
| CMP | 287 | 25 | 18 | 7 |
| Eve immune | 1,136 | 537 | 367 | 170 |
| Eve cardiovascular | 144 | 50 | 35 | 15 |
| Alamar NPQ | 3,248 | 170 | 109 | 61 |
| **Total** | **5,130** | **829** | **557** | **272** |

Of 829 median-only flags, **272 (32.8%)** were not consistently reproduced under baseline omission. Some baseline-sensitive results are not median-only flags; they should not be conflated. The original frozen two-panel audit is reproduced: CMP had 25 median flags with seven unstable, and Alamar had 170 with 61 unstable, for 68/195 (34.9%) across those two panels.

## Real-data preflight holdout evaluation

For each preflight sample, omit it completely from its own baseline, then compare it to the *remaining actual preflight samples*, without synthetic inserts. A second leave-one-out screening of that reduced reference shows how the frozen methods behave within the observed preflight period. Cases lacking at least two remaining preflight observations abstain.

| NASA assay | Assessable withheld preflight observations | Median-only screens | Consistent APDRA screens |
| --- | ---: | ---: | ---: |
| CBC | 174 | 24 | 11 |
| CMP | 216 | 11 | 6 |
| Eve immune | 852 | 409 | 221 |
| Eve cardiovascular | 108 | 70 | 35 |
| Alamar NPQ | 1,827 | 223 | 113 |
| **Total** | **3,177** | **737** | **386** |

APDRA screened 386/3,177 (12.1%) of assessable preflight holdouts, compared with 737/3,177 (23.2%) for median-only. **These are NOT false-positive rates.** Withheld preflight observations are not known to be physiologically unchanged, and the preflight data are sparse. Each measurement is evaluated within a participant and assay; repeated observations are dependent.

## What the NASA evaluation supports

This demonstrates on authentic NASA preflight/postflight laboratory records that the APDRA method discloses baseline instability that simple median-only screening does not expose. It also shows that even preflight samples can trigger these heuristic screens. The result supports using APDRA to communicate uncertainty and prompt verification, not an assertion of diagnostic accuracy or improved health outcome detection.

## What this evaluation cannot support

- **No disease labels or adjudicated abnormality ground truth:** Sensitivity, specificity, positive predictive value, AUROC, or medical benefit cannot be estimated.
- **No 17-channel NASA CNN validation:** OSD-569/OSD-575 are sparse blood assays, not synchronized one-second physiological and engineering signals. The existing 17-channel CNN was trained and tested on synthetic continuous inputs only.
- **No causal spaceflight or population claim:** Four individuals and many correlated markers cannot establish a generalizable astronaut response.
- **No fully prospective validation or clinically defined thresholds:** The 30% and 1.0 NPQ rules are exploratory numerical heuristics, not NASA medical limits.

## Reproducibility

The full observation-level evidence is in `observation_level_evidence.csv`, and the machine-readable aggregate results are in `evaluation.json`. Execute:

```bash
python -m pytest -q tests/test_nasa_real_data_evaluation.py
python -m tools.evaluate_nasa_real_biomarkers
```

The evaluator checks SHA-256 checksums for every normalized NASA panel, retains original source SHA-256 provenance, rejects unknown cohort/sample formats, and never generates synthetic measurements or trains the CNN. The historical APDRA comparison is frozen for repeatability.

**Sources:**
- [NASA OSD-569 (CBC)](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569)
- [NASA OSD-575 (serum and immune assays)](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575)
- Original object paths and SHA-256 hashes: `data/nasa/verified/verified_manifest.json`.
