@echo off
rem Starts The Daily Brief quietly every time Windows starts (run this once).
cd /d "%~dp0"
set "S=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DailyBrief.vbs"
> "%S%" echo Set sh = CreateObject("WScript.Shell")
>> "%S%" echo sh.CurrentDirectory = "%~dp0"
>> "%S%" echo sh.Run "cmd /c py -3 run.py --no-browser || python run.py --no-browser", 0, False
echo Done. The Daily Brief will start by itself when Windows starts.
echo To stop that, delete: %S%
pause
