@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PHYSIOGRAPH - Backend Verification
if not exist ".venv\Scripts\python.exe" goto no_python
echo [1/3] Running all tests...
".venv\Scripts\python.exe" -m pytest -q
if errorlevel 1 goto failed
echo [2/3] Running offline monitoring audit on SIMULATED data...
".venv\Scripts\python.exe" -m tools.monitoring_audit --input data/templates/measurements_template.csv --output-dir data/processed/monitoring_audit
if errorlevel 1 goto failed
echo [3/3] All backend verification checks completed.
echo Result: data\processed\monitoring_audit\audit_summary.json
echo This confirms software checks, not clinical diagnostic accuracy.
pause
exit /b 0
:no_python
echo ERROR: Run START_PHYSIOGRAPH_WINDOWS.bat once to create the Python environment.
goto failed
:failed
echo ERROR: Backend check failed. Screenshot the last lines.
pause
exit /b 1
