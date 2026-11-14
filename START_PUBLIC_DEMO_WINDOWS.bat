@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PHYSIOGRAPH_INFERENCE_BACKEND=numpy"
set "PHYSIOGRAPH_PUBLIC_MODE=1"
set "PHYSIOGRAPH_AUTO_DEMO=1"
set "PHYSIOGRAPH_AUTO_DEMO_SPEED=10"
if exist ".venv\Scripts\python.exe" (
  set "PY=.venv\Scripts\python.exe"
) else (
  set "PY=python"
)
echo PHYSIOGRAPH v1.5: read-only, synthetic auto-demo. No astronaut sensors attached.
echo Open http://127.0.0.1:8000/live after the server starts.
"%PY%" -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000 --workers 1
if errorlevel 1 echo ERROR: Install dependencies with python -m pip install -r requirements-live-lite.txt
pause
