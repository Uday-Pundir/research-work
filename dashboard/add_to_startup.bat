@echo off
set SCRIPT_DIR=%~dp0
set TARGET=%SCRIPT_DIR%start_dashboard.vbs
set SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ActivityTracker.lnk

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

if exist "%SHORTCUT%" (
    echo [SUCCESS] Activity Tracker will now start automatically whenever you turn on or log in to your computer!
) else (
    echo [ERROR] Failed to create startup shortcut.
)
pause

