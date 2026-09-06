@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
set "WB_ROOT=%CD%"
REM 供「航空气象统一服务启动器」调用：无常驻黑框，Node 后台运行，就绪即返回

node tools\verify-duty-files.cjs
if errorlevel 1 exit /b 1

node tools\launcher-wait-ready.cjs --check
if not errorlevel 1 goto :ensure_robot

powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'tools\dev-server-proxy.cjs' -WorkingDirectory '%WB_ROOT%' -WindowStyle Hidden"
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'tools\robot-outbox-send.cjs','--watch' -WorkingDirectory '%WB_ROOT%' -WindowStyle Hidden"

node tools\launcher-wait-ready.cjs --wait 20000 300
if errorlevel 1 exit /b 1
exit /b 0

:ensure_robot
node tools\launcher-is-robot-running.cjs
if not errorlevel 1 exit /b 0

powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'tools\robot-outbox-send.cjs','--watch' -WorkingDirectory '%WB_ROOT%' -WindowStyle Hidden"
exit /b 0
