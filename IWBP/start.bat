@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   Weather Workbench V2
echo   ----------------------------------------
echo   Browser: http://localhost:8787/index.html
echo   Review:  review-search\start-search.bat
echo.

where node >nul 2>&1
if errorlevel 1 goto :no_node

if not exist "tools\dev-server-proxy.cjs" goto :no_proxy

findstr /C:"METAR" "tools\dev-server-proxy.cjs" >nul 2>&1
if errorlevel 1 goto :bad_proxy

if exist "tools\diagnose-start.cjs" (
  node tools\diagnose-start.cjs >nul 2>&1
  if errorlevel 1 goto :bad_tools
)

if not exist "node_modules\" goto :do_npm
goto :after_npm

:do_npm
echo First run: npm install ...
call npm install
if errorlevel 1 goto :npm_fail

:after_npm
if not exist "review-search\api\server.py" (
  echo [WARN] review-search\api\server.py missing. Today-related may be unavailable.
  echo.
)

call npm start
echo.
if errorlevel 1 pause
goto :eof

:no_node
echo [ERROR] Node.js not found. Install Node.js LTS and retry.
pause
exit /b 1

:no_proxy
echo [ERROR] Missing tools\dev-server-proxy.cjs. Sync the full project.
pause
exit /b 1

:bad_proxy
echo [ERROR] tools\dev-server-proxy.cjs looks wrong. Re-copy from laptop.
pause
exit /b 1

:bad_tools
echo [ERROR] tools\ folder has wrong files. Re-copy entire tools\ from laptop.
node tools\diagnose-start.cjs
pause
exit /b 1

:npm_fail
echo [ERROR] npm install failed.
pause
exit /b 1
