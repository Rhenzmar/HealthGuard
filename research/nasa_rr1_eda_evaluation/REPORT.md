# Real NASA ISS Environmental Data Evaluation: RR-1

Source: user-supplied, original NASA EDA RR-1 telemetry, radiation and summary CSV files. SHA-256 digests for exact archived files appear in evaluation.json.

**Telemetry:** 12,087 records from 2014-09-20T03:59:00+00:00 to 2014-11-01T03:54:00+00:00; 15 irregular intervals, with the predominant cadence of **five minutes**, not one second. First-day reference: 288 rows; held-out later observations: 11,799.

| ISS channel | Baseline median | Later samples | Below demo tier 1 | Demo tier 1 | Demo tier 2 | Demo tier 3 |
|---|---:|---:|---:|---:|---:|---:|
| cabin_temp_c | 23.3 degC | 11,799 11469 | 330 | 0 | 0 |
| cabin_humidity_percent | 35.0 % | 11,799 9288 | 2036 | 83 | 392 |
| cabin_co2_ppm | 2649.0 ppm | 11,799 5571 | 6133 | 95 | 0 |

The table contains **real ISS measurements**, but all tier definitions are **arbitrary numerical departure rules inherited from the fictional simulator**, not validated NASA operational limits. No ground-truth anomaly labels exist.

**Radiation:** 39 daily records (2014-09-21 to 2014-10-29); mean total daily dose 0.2041 mGy/day, last accumulated dose 7.96 mGy. The daily dose is kept separate from the five-minute telemetry and the 17-channel CNN input.

**17-channel CNN NASA validation: NOT PERFORMED.** The raw RR-1 files have three directly compatible engineering channels, zero physiological channels, no synchronized 17-feature 1-Hz records and no independently labeled anomalies. No values were imputed or upsampled to make the pretrained CNN run.

**Scientific interpretation:** a reproducible external real-NASA-data screening-behavior/coverage evaluation, not a medical diagnosis or full-model sensitivity, specificity, AUROC, or NASA hazard prediction evaluation.
