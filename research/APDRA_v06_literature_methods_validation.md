# APDRA v0.6: Literature-grounded improvements and validation audit

**November 14, 2026 | NASA Space Apps PHYSIOGRAPH**

## Scope and findings

PHYSIOGRAPH uses NASA OSD-575 Inspiration4 serum measurements from four crew members. The metabolic assay and the Alamar protein assay have different units and cannot be pooled directly. All interpretations are **research descriptions of available measurements**, not diagnoses, individual medical decisions, or evidence of spaceflight causality.

The principal finding to carry into the demonstration is **baseline fragility**, not improved clinical sensitivity. Sparse personal preflight reference sets change how exploratory screens behave. Evidence labels remain dependent on chosen thresholds and measurement context. The v0.4/v0.5 synthetic test results were **mixed**, with no consistent superiority over a median-only screen across noise and outlier scenarios. No new astronaut clinical validation has been performed in v0.6.

## Relevant prior studies and what we derived from them

1. **Garrett-Bakelman et al., Science, 2019.** *The NASA Twins Study: A multidimensional analysis of a year-long human spaceflight.* DOI: https://doi.org/10.1126/science.aau8650. Reports diverse, longitudinal astronaut physiological and molecular responses. **Use:** motivates longitudinal within-person analysis, not an automated diagnosis.
2. **Mason et al., Nature, 2024.** *The Space Omics and Medical Atlas (SOMA) and international astronaut biobank.* https://doi.org/10.1038/s41586-024-07639-y. Describes mission-specific and crew-specific biological responses, recovery-profile analysis, and substantial cross-assay differences. **Use:** separate assay scales, display true sampling times, describe return toward baseline without claiming a general recovery model.
3. **Molecular and physiological changes in the SpaceX Inspiration4 civilian crew, Nature, 2024.** https://doi.org/10.1038/s41586-024-07648-x. Reports preflight and postflight biological measurements. **Use:** authentic mission context; the current OSD-575 files are sparse serum timepoints, not continuous onboard monitoring.
4. **Analytical performance specifications based on biological variation data: considerations, strengths and limitations, CCLM, 2024.** https://pubmed.ncbi.nlm.nih.gov/38501489/. Valid biological variation estimates are required to set appropriate analytical performance criteria. **Use:** never infer biomarker-specific variation from only two or three astronaut baselines.
5. **A New Concept for Reference Change Values—Regression to the Population Mean, Clinical Chemistry, 2024.** https://doi.org/10.1093/clinchem/hvae067. Reference-change interpretation is sensitive to starting concentration and regression to mean. **Use:** optional and clearly sourced reference-change calculations, not an automatic clinical flag.
6. **A Parametric Empirical Bayes Approach to Personalized Reference Intervals and Reference Change Values, Clinical Chemistry, 2025.** https://doi.org/10.1093/clinchem/hvaf092. Personalized intervals from sparse samples can be improved with suitable population-informed empirical Bayes parameters. **Use:** identifies a principled *future* direction. **Not implemented** because four Inspiration4 astronauts do not establish a reliable external population distribution for all assays.

These papers justify the general scientific question and selected techniques. They **do not validate APDRA itself** or establish algorithmic novelty.

## Implemented changes

### A. Threshold-free observed baseline robustness

For personal preflight readings `b1,...,bn`, define leave-one-out reference centers `m_-i = median(b excluding bi)`. For the later measurement `x`:

- Concentration-scale observation: `d_i = 100*|x - m_-i| / |m_-i|` only if every center is nonzero.
- Relative log2 NPQ signal: `d_i = |x - m_-i|` log2 NPQ units.
- Report the minimum/maximum observed leave-one-out deviation; if the direction of `x - m_-i` changes across omissions, report a minimum directional deviation of zero.

This removes dependence on an arbitrary cutoff for the *magnitude description*. It **does not establish statistical uncertainty**: the observed leave-one-out range is not a confidence interval, posterior interval, or expected biological variance.

### B. Evidence-sourced Reference Change Value (RCV) check, OFF by default

Only for strictly positive-scale biomarkers, only with appropriate, user-entered and traceably sourced `CV_I` and `CV_A` (both percentages), the module calculates two-sided lognormal change bounds:

`h = z_(1-alpha/2) * sqrt(2) * sqrt( ln(1+CV_I^2) + ln(1+CV_A^2) )`

`RCV_lower = 100 * (exp(-h) - 1)`, `RCV_upper = 100 * (exp(h) - 1)`.

The follow-up is compared **separately to each available preflight reading**, then the module reports whether directions agree or are baseline-dependent. This is deliberately not a formal change test against a well-estimated personalized mean. Assumptions include compatible positive-scale measurements, a lognormal variation model, externally appropriate CVs, and comparable laboratory conditions. It is not automatically applicable to NPQ, and no external CV data are bundled for the NASA assays. Multiple baseline comparisons and repeated timepoints are not adjusted for multiplicity and should not be interpreted as independent evidence of medical abnormality. No medical threshold is supplied by the software.

### C. Explicit record-verification queue

For each astronaut/biomarker/assay, the latest available later reading is placed into a **nonclinical** table using deterministic reasons:

- outside a **provided** source laboratory interval;
- insufficient baseline information;
- baseline-sensitive exploratory screen;
- consistent exploratory deviation;
- no current exploratory verification prompt.

A 2–3-reading baseline is disclosed as context for every record, not converted into a medical urgency score. The queue does not direct treatment or diagnose disease.

### D. Time-aware change in proximity to preflight reference

Using the actual elapsed postflight days between the first and last available samples, the module computes the median across baseline omissions of `(|first_post - m_-i| - |last_post - m_-i|) * 30/elapsed_days`. The output is signed **change in absolute distance per 30 days**, not a fitted biological recovery velocity, half-life, or physiological prognosis. It refuses to compute a rate with fewer than two postflight observations or nonpositive/unknown time spans.

## Reproducible checks

- 57 automated tests pass for the application modules, including 23 new v0.6 safety/known-answer checks. (Counts should be recalculated after future edits.)
- Two NASA assays were loaded and passed the pipeline. Detailed counts and threshold sensitivity are exported in `research/APDRA_v06_audit.json`, and CSV verification queues are provided for both panels.
- A **full browser smoke test remains pending on the Windows machine**. This Python environment does not have Streamlit installed; automated unit tests and static compilation do not substitute for browser testing.
- Existing simulation-based detection comparisons remain mixed. v0.6 has not demonstrated an improvement in clinical sensitivity, specificity, or any health outcome. It improves transparency and supports a conditional use of a published method when appropriate external inputs exist.

## Nonnegotiable limitations

With only four astronauts and sparse serum samples, neither a generalized medical risk predictor nor a validated biological recovery curve can be inferred. An increase or decrease relative to preflight is not necessarily harmful. No medical actions should be recommended without approved mission-specific protocols and qualified review. User-entered medical readings may be sensitive; avoid sending identifiable records to external language-model APIs.
