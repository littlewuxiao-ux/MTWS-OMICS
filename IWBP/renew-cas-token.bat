@echo off
cd /d "%~dp0"
echo.
echo Renew CAS token (Fengsheng QR) - production / UAT gateway
echo Target: %~dp0data\sf-foc-config.local.json
echo.
where python >nul 2>&1
if errorlevel 1 (
  where py >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Python not found. Install Python and: pip install requests pillow
    pause
    exit /b 1
  )
  py -3 tools\cas_login.py
) else (
  python tools\cas_login.py
)
if errorlevel 1 (
  echo.
  echo [FAILED] CAS login or token write failed. See messages above.
  pause
  exit /b 1
)
echo.
node tools\sf-foc-config-check.cjs
if errorlevel 1 (
  echo.
  echo [FAILED] Token not found in config after login.
  pause
  exit /b 1
)
echo.
echo [OK] Token saved. Next: node tools\sf-foc-ping.cjs
echo.
pause
