# PHYSIOGRAPH: First verified NASA OSD-575 dataset audit

**Source:** NASA Open Science Data Repository (OSDR), study OSD-575, Inspiration4, https://osdr.nasa.gov/bio/repo/data/studies/OSD-575.

**Downloaded source files:**
- `OSD-575_metadata_OSD-575-ISA.zip`, containing 28 serum-sample metadata records.
- `LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv`, original submitted clinical metabolic-panel data.
- `LSDS-8_Multiplex_serum.immune.AlamarPanel_TRANSFORMED.csv`, transformed Alamar NULISAseq multiplex inflammation/protein assay.

**Verified coverage:** Four coded crew members (C001–C004), preflight L−92, L−44, L−3 and postflight R+1, R+45, R+82, R+194. These are **not** continuous in-flight records. The 28 serum metadata sample identifiers are confirmed; individual assays need not cover every metadata sample.

- **CMP metabolic panel:** 531 source rows, 19 distinct analytes. 22 rows have missing/non-numeric (`NA`) results; the exported long table retains **509 numeric measurements**. Measurement units and original source-laboratory reference intervals are retained. There is one structurally absent source row relative to a fully rectangular 4 × 7 × 19 grid, which is not fabricated.
- **Alamar NULISAseq:** 27 actual sample rows × 203 protein targets = **5,481 numeric NPQ values**, including four exact-zero values. One metadata-listed sample (`C003_serum_L-44`) is absent from this specific assay file. The original file also contains 203 `percent_normalized_value` columns, which have deliberately not been mixed with NPQ measurements in this export.

## Essential interpretation rules

1. **NPQ is a normalized log2 relative protein signal**, not an absolute serum concentration. A within-protein difference ΔNPQ approximately corresponds to a relative signal fold change of `2 ** ΔNPQ`. The percent difference between NPQ values themselves is scientifically inappropriate. Never compare absolute NPQ levels of different proteins.
2. CMP measurements retain their original assay-specific units, e.g. mg/dL, mmol/L, g/dL and U/L. Results with `NA` are missing, not zero; no imputation was applied. Reference intervals are source laboratory values, not spaceflight-approved monitoring thresholds.
3. Preflight baselines can have only 2–3 points per person and biomarker. Personalized differences, screening criteria and apparent recovery are **exploratory**. No established disease risk, medical fitness, causal spaceflight effect, or postflight recovery status can be inferred.
4. Four NPQ measurements are exactly zero. These are retained and tagged for detectability / limit-of-detection review, not silently converted to missing values.
5. The two assays and their measurement scales must not be pooled into a combined numerical health score.

## One illustrative biochemical pattern

The Alamar file measures IL6 (interleukin-6) in log2 NPQ units. At R+1 compared with each crew member's own preflight median, the descriptive differences are:

| Crew code | Baseline sample count | R+1 ΔNPQ | Approximate fold change of relative signal |
|---|---:|---:|---:|
| C001 | 3 | +0.549 | 1.46× |
| C002 | 3 | +0.070 | 1.05× |
| C003 | 2 | +0.087 | 1.06× |
| C004 | 3 | +0.761 | 1.69× |

These differing trajectories are valuable for visualization but too sparse for a reliable clinical or causal conclusion. No claim of statistical significance is made.

## APDRA algorithm status

Version 0.2 computes personalized preflight medians, deviations, robust-z descriptors where feasible, source reference-interval comparisons for CMP, and within-protein log2 NPQ differences / approximate relative fold change. The screening cutoffs are research heuristics, not medical thresholds. No neural network has been trained or validated on OSD-575.

## Known data uncertainties and next steps

- Obtain the **CMP transformed** file if useful for standardized cross-assay import, and other immune/cardiovascular transformed panels where public; do not block current development on this.
- Review source assay QC and detectability metadata before treating every Alamar target as confidently measured.
- Conduct a prespecified, leave-one-crew-out or within-individual stability analysis only if a sound benchmark can be defined given four crew members. Do not use thousands of correlated proteins or timepoints to imply hundreds of independent astronaut observations.
- Build the mission monitor around responsibly entered repeated measurements, not a claim that OSD-575 itself demonstrates continuous space-mission monitoring.
