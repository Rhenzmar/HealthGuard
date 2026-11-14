@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PHYSIOGRAPH - Astronaut Health Research Prototype
if not exist ".venv\Scripts\python.exe" goto setup
:packages
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m streamlit run app.py --server.headless false
if errorlevel 1 goto failed
goto done
:setup
where py >nul 2>nul
if errorlevel 1 goto no_python
py -3 -m venv .venv
if errorlevel 1 goto failed
goto packages
:no_python
echo ERROR: Python not found. Install Python 3.11 or 3.12.
goto failed
:failed
echo Error occurred. Take a screenshot of the error shown above.
pause
exit /b 1
:done
echo PHYSIOGRAPH stopped.
pause
exit /b 0
