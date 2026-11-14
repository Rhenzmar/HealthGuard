@echo off
setlocal
cd /d "%~dp0"
".venv\Scripts\python.exe" -m tools.replay_live_demo --mode normal --subject SIM_NORMAL_01 --speed 10
pause
