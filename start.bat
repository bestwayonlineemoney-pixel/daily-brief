@echo off
title The Daily Brief
cd /d "%~dp0"
where py >nul 2>nul && (py -3 run.py & goto :end)
where python >nul 2>nul && (python run.py & goto :end)
echo Python is not installed. Get it from https://www.python.org/downloads/ (tick "Add python.exe to PATH"), then run this again.
pause
:end
