@echo off
cd /d "%~dp0"

if not exist "data\workbench-service-config.json" (
  echo [ERROR] Missing data\workbench-service-config.json
  echo Copy data\workbench-service-config.client.example.json to that name.
  pause
  exit /b 1
)

node tools\open-workbench-client.cjs --check >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Cannot reach primary workbench at 10.88.24.24:8787
  echo Start seat 1 with start-workbench-quiet.bat first.
  node tools\open-workbench-client.cjs --check
  pause
  exit /b 1
)

node tools\open-workbench-client.cjs
exit /b 0
