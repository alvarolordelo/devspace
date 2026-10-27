@echo off
rem Manual-only tray launcher. Right-click the existing tray icon and exit before relaunching.
start "LAO DevSpace" /min powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0launch-lao-monitor.ps1"
