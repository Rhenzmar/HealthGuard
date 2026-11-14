@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  set "PY=.venv\Scripts\python.exe"
) else (
  set "PY=python"
)
echo OPTIONAL: Separate 3-channel BIDMC numerical research test.
echo Data come from ICU recordings, not astronauts. No clinical event labels are evaluated.
echo Requires internet, PyTorch and the full research requirements.
"%PY%" -m tools.external_bidmc_validation
if errorlevel 1 goto failed
echo Complete: research\external_bidmc_v13\results.json
pause
exit /b 0
:failed
echo External research could not complete. Check the errors, dependencies or official network access.
pause
exit /b 1
