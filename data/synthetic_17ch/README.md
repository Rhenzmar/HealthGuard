# HealthGuard 17-channel candidate dataset

This directory contains the **schema** for a reproducible, fully synthetic 17-channel anomaly detection experiment. It does **not** contain authentic astronaut telemetry. The existing frozen 5-channel CNN and its weights remain unchanged.

## Generate the data

Run from the repository root:

```bash
python -m pip install "numpy>=1.26,<3"
python -m tools.generate_17ch_dataset
python -m pytest -q tests/test_17ch_dataset.py
```

Generation creates `data/synthetic_17ch/generated/` with compressed NumPy arrays, a detailed split manifest, provenance, and a dataset report. These binary datasets are deliberately not committed to the public repository. The small generator and schema are checked in, making the data reproducible on any supported system.

## Dataset structure

- 17 channels in **exact schema order**, sampled at 1 Hz.
- 105 total seconds per episode: the first 45 are a fixed personal baseline; the next 60 are the prospective analysis window. No analysis-window mean normalization is allowed.
- Normal-only training: 320 episodes drawn from **12 synthetic subject profiles**.
- Calibration: 96 normal episodes from **4 different synthetic subject profiles**.
- Normal test: 96 normal episodes from **4 different synthetic test profiles**.
- Artificial test: 24 episodes for each of seven scenarios, all using test-only profiles, for **168 additional synthetic test episodes**.
- Total: **680 episodes**, of which 320 are for training, 96 for calibration, and 264 for held-out testing. Default seed **1729**.
- Arrays `X` have shape `(N,17,60)`, with accompanying `reference`, `labels`, `episode_ids`, `profile_ids`, `feature_names`, and `cadence_hz`.

The seven artificial scenarios are oxygenation decline, exertion, thermal disturbance, signal artifact, cabin CO₂ accumulation, cabin pressure loss, and radiation-rate surge. No scenario is a diagnosed disease or a clinically validated event label.

## Data provenance

The **five original physiological channels** are generated with fictional trends. Four new channels are fictional physiological estimates (systolic blood pressure, diastolic blood pressure, peripheral temperature, end-tidal CO₂). Eight are environmental, radiation, or suit signals. These fields do not represent 17 measured physiological biomarkers.

All channels are synthetic and share a declared mathematical generator. Related signals such as blood pressure and heart rate may move together in an artificial scenario, but **those relationships are engineering demonstration assumptions**, not observed NASA physiological coupling. The accumulated-dose feature is calculated from generated dose rate.

The following sources are intentionally **not substituted into the 17-channel tensor**:

- [PhysioNet BIDMC PPG and Respiration Dataset](https://physionet.org/content/bidmc/1.0.0/), DOI 10.13026/C2208R, provides an independent possible source of HR/RESP/SpO₂ numerical recordings, not all 17 channels. The repository already has a separate `tools/external_bidmc_validation.py` workflow to download those records and test the overlapping 3-channel domain. Its downloads remain outside this training generator and are not bundled here.
- [NASA OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) has discrete historical chemistry and protein samples, not a synchronized continuous 17-channel time series.
- [NASA OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) contains historical CBC observations. The repository's third-party CBC mirror still requires official-source authentication; it is excluded from this synthetic model dataset.

## Training constraints

Use only `train.npz` to fit a normal-pattern autoencoder. Use `calibration.npz` only to calibrate its reconstruction score. Keep `test_normal.npz` and `test_*.npz` untouched for final synthetic evaluation. Prefer the planned multi-branch architecture: channels 0–8 are physiological / estimated physiology; channels 9–16 are engineering / environmental. Save both model parameters and exact feature metadata before deployment. Do **not** train the new model directly into the old 5-channel checkpoint.

## Limitations

All anomaly labels are artificial and created by this generator. Splitting by synthetic subject is necessary but insufficient for independent clinical validation because all partitions are drawn from the same generative assumptions. A high score on these events would demonstrate software handling of scripted changes only, not detection of medical emergencies or real spacecraft hazards. Source-specific reference ranges cannot be converted into medical emergency thresholds by this synthetic generator.
