@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PHYSIOGRAPH - Final APDRA Validation
if not exist ".venv\Scripts\python.exe" goto need_setup
echo [1/3] Installing/checking validation dependencies...
".venv\Scripts\python.exe" -m pip --disable-pip-version-check install -r requirements.txt
if errorlevel 1 goto failed
echo [2/3] Testing PHYSIOGRAPH...
".venv\Scripts\python.exe" -m pytest -q
if errorlevel 1 goto failed
echo [3/3] Running held-out synthetic benchmark and NASA observational crosscheck...
".venv\Scripts\python.exe" -m tools.final_apdra_validation
if errorlevel 1 goto failed
echo.
echo Results: research\apdra_v07_final_validation\
echo Open FINAL_APDRA_VALIDATION_REPORT.md for interpretation.
pause
exit /b 0
:need_setup
echo ERROR: Run START_PHYSIOGRAPH_WINDOWS.bat first to set up Python.
goto failed
:failed
echo.
echo Validation could not finish. Review the error above.
pause
exit /b 1
