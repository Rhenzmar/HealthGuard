# PHYSIOGRAPH v0.4 | Scientific evidence interface and benchmark

## Changes

1. **True sampling-day plots:** L− and R+ points are spaced by approximate mission-relative days; the shaded 3-day flight interval has no invented serum observations. This fixes the misleading evenly spaced categorical x-axis in v0.3. Applied to individual and cross-crew charts.
2. **APDRA Evidence Report:** displays current value and direction of deviation, count of preflight reference samples, leave-one-out baseline sensitivity, observed postflight trajectory category, and independent source-laboratory interval context. Does not display the ambiguous 'baseline-proximity index'.
3. **Comparison benchmark:** uses four prespecified synthetic noise/outlier scenarios, three random seeds, independent calibration/test simulations, and compares median-only screening against APDRA LOO consistency with both a fixed threshold and approximately matched false-screen targets.
4. **Reduced noise:** Streamlit plotting/data-table calls use `width="stretch"` instead of deprecated `use_container_width=True`.
5. **Tests:** 30 automated tests pass. Browser/runtime interaction has not been tested in the packaging environment.

## Running on Windows

1. Close the command window currently serving the old PHYSIOGRAPH (port 8501).
2. Extract this ZIP into a **new directory**, not on top of the v0.3 folder.
3. Double-click `PHYSIOGRAPH/START_PHYSIOGRAPH_WINDOWS.bat`.
4. In the **NASA Research Explorer** (first tab), select metabolic panel, crew `C001`, and `ALBUMIN` to verify the sampling-day chart. The latest reading should be R+194 at 4.6 g/dL, compared with a 5.0 g/dL median of three preflight samples.
5. Scroll to the `APDRA Evidence Report`, then try `Compare crew trajectories` below.

The measurements are NASA OSD-575, not continuous onboard samples. They do not establish diagnosis, fitness for duty, or a real postflight recovery outcome. APDRA's simulated benchmarking measures detection of *injected numerical shifts*, not real medical conditions. No neural-network or LLM model is included.
