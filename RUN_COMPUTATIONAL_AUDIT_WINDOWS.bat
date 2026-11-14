@echo off
cd /d "%~dp0"
echo PhysioGraph computational audit: trained models remain unchanged.
python -m tools.audit_live_models_v13
python -m tools.benchmark_inference_v13
python -m pytest -q
pause
