@echo off
cd /d "%~dp0"

if not exist "data\workbench-service-config.json" (
  echo [!] Missing data\workbench-service-config.json
  echo     Copy data\workbench-service-config.client.example.json to that name.
  pause
  exit /b 1
)

echo Seat 2 client - connecting to primary workbench...
node tools\open-workbench-client.cjs --check
if errorlevel 1 (
  echo.
  echo Ensure seat 1 is running start-workbench-quiet.bat
  pause
  exit /b 1
)

node tools\open-workbench-client.cjs
echo.
echo Bookmark: http://10.88.24.24:8787/index.html
pause
exit /b 0
