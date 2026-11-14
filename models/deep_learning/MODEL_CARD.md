# 1D-CNN autoencoder | Model card (PhysioGraph v1.1)

**Purpose:** proof-of-concept temporal novelty detection in simulated astronaut-like physiology; not a clinical device, health assessment, or astronaut mission certification.

**Training source:** `tools/train_cnn_autoencoder.py` creates fictional normal 1 Hz sequences with reproducible random number streams; 2,400 normal training episodes. No NASA, medical patient, or genuine sensor observations enter training.

**Inputs:** 60 samples x 5 normalized features (heart rate bpm, SpO2 %, respiratory rate breaths/min, body temperature °C, HRV RMSSD ms). Normalization is relative to a per-subject 45-sample median captured *before* analysis; physical scales are 12 bpm, 2 %, 4 breaths/min, 0.4°C, and 20 ms. Initial baseline must be representative. Numerical units must match exactly.

**Model:** temporal convolutional denoising autoencoder (three down/latent convolutions, two transposed convolution layers, final reconstruction convolution); bottleneck 3 channels by 15 time steps. Trained with Adam and mean-squared error, early-stopping patience six, seed 1729. Checkpoint is versioned, schema-checked, loaded via PyTorch `weights_only=True`, and excluded from the NASA APDRA computation path.

**Outputs:** mean reconstruction squared error, comparison to a 95th-percentile validation-normal threshold, `MODEL_FLAG` or `NO_MODEL_FLAG`, or abstention reason. These are **not illness probabilities**.

**Calibration:** 480 separate normal synthetic episodes; threshold chosen exclusively from calibration-normal scores. Testing: 480 further normal episodes plus seven numerically injected conditions (160 each), all from disjoint random streams/profile draws. Results are in `synthetic_evaluation.json`. Model generalization to other simulators, people, sensor devices, spaceflight physiology, or health conditions is **unknown**.

**Known limitations:** training and evaluation share generator assumptions; changes in cadence, units, wearable device, personal reference period, motion and missingness can trigger false flags or abstentions. The clear synthetic differences are unusually easy; low-amplitude drifts are less reliably detected. No external clinical validation or predictive real astronaut outcome evaluation exists. Model flag persistence during recovery can reflect its 60-second moving window.

**Reproduction:** `python -m tools.train_cnn_autoencoder` from project root (PyTorch 2.x installed), then `python -m pytest -q`. For local API demonstration: `python -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000` then `python -m tools.replay_live_demo --speed 10`.
