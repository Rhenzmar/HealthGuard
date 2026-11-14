# PHYSIOGRAPH scientific evidence review and scope (v0.5)

Prepared 14 November 2026. This evidence review anchors the project's *rationale* in previous research without misrepresenting external publications as validation of APDRA.

## Primary studies and specific relevance

1. **Garrett-Bakelman et al. (2019), "The NASA Twins Study: A multidimensional analysis of a year-long human spaceflight," *Science*, 364, eaau8650. DOI [10.1126/science.aau8650](https://doi.org/10.1126/science.aau8650).** Longitudinal measurements across a 340-day astronaut mission found multi-system alterations, with many signals returning toward preflight values after return and others persisting. **PHYSIOGRAPH relevance:** analyze *individual* temporal trajectories and avoid assuming that all biomarkers respond or return in the same way. **Limit:** one spacefaring individual and genetically matched ground control, not a population-calibrated clinical reference.

2. **"The Space Omics and Medical Atlas (SOMA) and international astronaut biobank" (2024), *Nature*, 632:1145–1154. DOI [10.1038/s41586-024-07639-y](https://doi.org/10.1038/s41586-024-07639-y).** Built a multi-mission molecular/physiological astronaut resource including Inspiration4, documenting heterogeneous responses and strong technical cross-assay differences. **Relevance:** explicitly stratify by individual, assay, and sample period. **Limit:** this work already performs multi-omics trajectory analysis; PHYSIOGRAPH does *not* invent that basic concept. Its small subset of assays should not be portrayed as a complete SOMA reanalysis.

3. **"Single-cell multi-ome and immune profiles of the Inspiration4 crew reveal conserved, cell-type, and sex-specific responses to spaceflight" (2024), *Nature Communications*, 15:4954. DOI [10.1038/s41467-024-49211-2](https://doi.org/10.1038/s41467-024-49211-2).** The study reports 18 cytokines/chemokines with postflight changes using its specific assays, statistical framework and experimental context, alongside immune pathway analyses. **Relevance:** supports investigating immune-marker time courses in Inspiration4. **Limit:** the PHYSIOGRAPH Alamar NULISA panel is a separate relative assay, and APDRA heuristic flags do not independently reproduce that paper's inferential findings.

4. **"Molecular and physiological changes in the SpaceX Inspiration4 civilian crew" (2024), *Nature*. DOI [10.1038/s41586-024-07648-x](https://doi.org/10.1038/s41586-024-07648-x).** Demonstrates longitudinal multi-omic and clinical profiling at preflight, flight, and recovery stages. **Relevance:** supports properly timestamped visualization of biomedical measurements. **Limit:** our serum panels have preflight and postflight records, not in-flight serum time series.

5. **"The Role and Limitations of the Reference Interval Within Clinical Chemistry and Its Reliability for Disease Detection" (2024), review. [Full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC10932992/).** The discussion of intra-individual variation and reference-change values explains why a population reference interval alone can be insufficient for interpreting serial results. **Relevance:** APDRA separately presents source laboratory reference ranges, personal measured baselines, and stability under omitting preflight values. **Limit:** a *clinical reference change value* requires validated within-subject biological variation and assay imprecision (CV_I and CV_A), which cannot be estimated reliably from 2–3 astronaut baseline observations. We do **not** compute or claim a valid RCV.

6. **"Are Your Laboratory Data Reproducible? The Critical Role of Imprecision from Replicate Measurements to Clinical Decision-making" (2025), *Annals of Laboratory Medicine*. DOI [10.3343/alm.2024.0569](https://doi.org/10.3343/alm.2024.0569).** Discusses analytical and preanalytical measurement variability. **Relevance:** justifies explicit data-quality warnings and withholding firm health conclusions from sparse biomarker data. **Limit:** not a validation of our screening threshold.

7. **NASA International Space Apps Challenge 2026, "Create Health Monitoring Software for Astronauts on Space Missions". [Official challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/).** Calls for software gathering health indicators and helping crew evaluate and act on health status. **Relevance:** distinct Research Explorer and Mission Health Monitor, with data rechecking rather than automatic diagnosis.

## Actual dataset provenance

NASA OSDR study **OSD-575**: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575. The source input files in development were study metadata ZIP, original submitted comprehensive metabolic panel, and transformed multiplex serum Alamar NPQ panel. Programmatically cleaned outputs bundled in the app: **509 clinical CMP measurements** and **5,481 NULISA NPQ measurements**, across four coded subjects. NULISA NPQ is on a **log2 relative signal** scale, not measured concentration. Seven study sample periods are shown, but individual assays can have missing records. Observations are before launch or after return, not a continuous health feed.

## PHYSIOGRAPH's actual evidence, separated from literature

**Empirical description:** personal baseline medians, within-assay/within-protein change, leave-one-baseline-out flag sensitivity, and measured postflight distance from baseline. These are observational; 30% clinical-unit screening and 1 log2 NPQ screening are **heuristic**, not evidence-based clinical cutoffs.

**Numerical evaluation:** v0.4 known-shift simulations with median-only versus baseline-sensitive screens under four noise regimes. Neither method wins consistently at matched false-screen targets. Artificial perturbations do not substitute for labeled disease outcomes, astronaut intervention outcomes, or analytical variance supplied by the laboratories.

**Scientific contribution we can defend:** an explainable *software framework* that exposes when sparse preflight measurements make a screening result sensitive to baseline choice, and makes selected biomarker evidence navigable in a monitoring interface. **Not established:** novel first-of-kind algorithm, true clinical anomaly recognition, proven recovery, robust improvement on real clinical outcomes, or long-duration mission efficacy.

## Prioritized remaining checks

1. Verify per-source measurement counts, missingness, units and sampling dates after every data import.
2. Preserve separation of NPQ from CMP and identical-protein/assay comparability only.
3. Show raw values, personal medians, every leave-one-out reference, explicit denominators, and uncertainties; never rebrand threshold screens as statistically significant changes.
4. Calibrate and evaluate synthetic benchmarks on disjoint scenarios; publish false-screen vs sensitivity tradeoff, not only best-case accuracy.
5. Add a rapid manual-input and review-queue demo; no unsourced crew protocols or treatments.
6. Deploy the working demo, test from a clean browser, and reserve sufficient time for submission and video.
