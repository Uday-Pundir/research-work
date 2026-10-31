@echo off
set SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ActivityTracker.lnk
if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo [REMOVED] Activity Tracker has been removed from Windows Startup.
) else (
    echo [INFO] Activity Tracker was not found in Windows Startup.
)
pause

