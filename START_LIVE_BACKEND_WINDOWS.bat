@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt
".venv\Scripts\python.exe" -c "import torch" >nul 2>&1
if errorlevel 1 echo [NOTE] PyTorch not installed. Run INSTALL_DEEP_LEARNING_WINDOWS.bat to activate CNN inference.
echo [LIVE VIEW] Open http://127.0.0.1:8000/live
".venv\Scripts\python.exe" -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000
pause
