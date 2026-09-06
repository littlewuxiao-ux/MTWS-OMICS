@echo off
cd /d "%~dp0"
echo.
echo Create desktop shortcut: Weather Workbench (Seat 2 client)
echo Connects to primary server 10.88.24.24:8787
echo Same desktop name and icon as seat 1.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\create-client-desktop-shortcut.ps1"
if errorlevel 1 (
  echo.
  echo [FAILED] See error above.
  pause
  exit /b 1
)
echo.
echo [OK] Done. Double-click desktop icon when seat 1 workbench is running.
echo.
pause
