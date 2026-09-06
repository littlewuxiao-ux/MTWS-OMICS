@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
REM 供「航空气象统一服务启动器」调用：停止 8787 工作台与机器人发群

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1

powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*robot-outbox-send*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

exit /b 0
