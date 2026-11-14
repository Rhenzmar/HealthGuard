@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  set "PY=.venv\Scripts\python.exe"
) else (
  set "PY=python"
)
echo PHYSIOGRAPH v1.5: final SOFTWARE verification (not medical validation).
"%PY%" -m pytest -q
if errorlevel 1 goto failed
"%PY%" -m tools.final_backend_audit_v15
if errorlevel 1 goto failed
echo PASS: research\backend_v15_final_audit\results.json
pause
exit /b 0
:failed
echo FAIL: See error above. Install requirements and inspect environment.
pause
exit /b 1
