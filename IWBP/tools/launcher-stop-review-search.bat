@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
REM 停止复盘搜索 Streamlit（8501）

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8501" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1

powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*streamlit*app/main.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*streamlit*8501*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

exit /b 0
