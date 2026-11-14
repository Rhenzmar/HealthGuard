# APDRA v0.3 | Algorithm design, tests, and first evidence

**November 14, 2026. Scientific prototype for NASA Space Apps.** Source: NASA OSD-575 Inspiration4 data, imported from the original user's source files. This is *not* a clinically validated medical device, and no diagnostic or recovery outcomes are inferred.

## Research problem

A biomarker may appear to change substantially relative to an individual preflight median even when that baseline is based on just two or three samples. Does the **exploratory screening decision** depend on which specific preflight samples are used? APDRA v0.3 explicitly tests this sensitivity. It does **not** establish whether the biological change is significant, causal, or medically important.

## Method

For each coded individual, biomarker, unit **and source**, take the `n` explicitly designated preflight (or baseline) measurements. For `n >= 2`, calculate `n` leave-one-out (LOO) baseline medians, each omitting one preflight observation. Assess each subsequent observation `y` against every LOO median `m_i`:

- For a conventional CMP measurement with nonzero `m_i`, calculate relative change `100 * abs(y-m_i)/abs(m_i)`; the **illustrative** screen is 30% by default.
- For a NULISA NPQ result, calculate the difference `y-m_i` on the log2 scale; the **illustrative** screen is an absolute difference of 1 NPQ unit, equivalent to about a twofold relative signal change. Do **not** percentage-normalize log2 NPQ.
- `Consistent screening deviation`: the heuristic threshold is met, in the same direction, under **every** LOO median.
- `Baseline-sensitive screen`: at least one LOO median yields an above-threshold result but the criterion or direction is not stable across omissions.
- `No consistent screening deviation`: none of the LOO baselines yields a threshold crossing.
- A single preflight measurement makes the baseline stability unassessable. A near-zero median makes conventional percentage screening undefined. Where available, source-laboratory intervals are reported **separately** from personal change.

For the first available postflight value `y_0` and subsequent postflight `y_t`, compare `abs(y_t-m_i)` with `abs(y_0-m_i)` for every LOO baseline. Report whether it is closer or farther for every baseline, or baseline-sensitive. This describes **sampled proximity to preflight values**, not biological recovery.

These are transparency checks. The envelope of LOO medians is **not** a confidence interval, and 2–3 observations cannot establish an individual-specific normal range.

## Data and first results

| Assay | Usable NASA numeric measurements | Nonbaseline/postflight measurements reviewed | Consistent heuristic screens | Baseline-sensitive screens | Cannot assess baseline |
|---|---:|---:|---:|---:|---:|
| CMP | 509 | 291 | 18 | 17 | 4 |
| Alamar NPQ | 5,481 | 3,248 | 109 | 363 | 0 |

Counts describe **measurements across four crew members**, not independent participants, medical events, or statistically validated biological effects. Some proteins have two preflight measurements; review criteria need additional preflight data for stronger baseline estimation. An apparent postflight difference does not prove a causal consequence of spaceflight. Source assay limitations and NPQ normalization must be retained.

### Controlled numerical injection benchmark (not a medical evaluation)

The repository's reproducible script generates **1,200 synthetic series** with three preflight points, one later observation, 10-unit Gaussian noise, 15% probability of one large preflight outlier, and an injected +45-unit shift in 600 cases (seed 1729). Both methods use a **30%** illustrative screen. No injected shift is intended to represent a disease or astronaut impairment.

| Screening rule | Synthetic sensitivity | Synthetic false-positive rate | True shifts detected / 600 | False screens / 600 no-shift cases |
|---|---:|---:|---:|---:|
| Median-only relative change | 87.33% | 1.83% | 524 | 11 |
| APDRA LOO-consistent relative change | 74.17% | 0.17% | 445 | 1 |

The LOO-consistent method reduces false screens **but also misses more injected changes** in this specific synthetic design. It is a **sensitivity–specificity tradeoff**, not proof that APDRA is clinically better. The synthetic test was designed to inspect numerical behavior and does not establish real astronaut predictive accuracy. No parametric hypothesis tests or clinical significance claims are justified from the four-astronaut dataset.

## Reproducibility

- Run `python -m pytest -q` (22 automated tests in v0.3).
- Run `python tools/benchmark_apdra.py --output research/apdra_v03_benchmark` to regenerate `report.json`, the 1,200 synthetic cases, and both NASA measurement-level evidence CSVs.
- Source data: `data/nasa/osd575_cmp_long.csv`, `data/nasa/osd575_alamar_npq_long.csv`, with importer `tools/import_osd575.py` and source documentation in `research/sources.md`.

## Essential next work

1. Validate unit/provenance and biological categories against NASA source metadata.
2. Add visualization of baseline sensitivity across crew and biomarkers.
3. Explore whether missingness and assay reliability can be explicitly modeled **without** inventing missing or in-flight observations.
4. Keep astronaut monitoring limited to measurement review and protocol references, not autonomous clinical actions.
5. Avoid deep-learning claims unless a suitable independent training population and held-out evaluation exist.
