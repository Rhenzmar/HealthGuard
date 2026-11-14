@echo off
setlocal
cd /d "%~dp0"
".venv\Scripts\python.exe" -m tools.train_cnn_autoencoder
if errorlevel 1 echo Training failed; existing checkpoint may be unchanged.
pause
