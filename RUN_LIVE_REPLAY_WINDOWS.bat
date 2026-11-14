@echo off
setlocal
cd /d "%~dp0"
".venv\Scripts\python.exe" -m tools.replay_live_demo --speed 10
pause
