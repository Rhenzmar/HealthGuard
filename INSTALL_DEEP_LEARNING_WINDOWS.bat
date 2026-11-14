@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PHYSIOGRAPH - Install Deep Learning
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -m pip install -r requirements-deep-learning.txt
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -c "from physiograph.deep_learning import CNNAnomalyModel; print(CNNAnomalyModel().info())"
if errorlevel 1 goto failed
echo CNN checkpoint installed and loaded. You may start the live backend.
pause
exit /b 0
:failed
echo Installation or checkpoint load failed. Check Python version, connection and available disk space.
pause
exit /b 1
