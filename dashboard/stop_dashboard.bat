@echo off
echo Stopping Activity Tracker Dashboard on port 8050...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r ":8050.*LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)
echo Dashboard stopped.
timeout /t 2 >nul

