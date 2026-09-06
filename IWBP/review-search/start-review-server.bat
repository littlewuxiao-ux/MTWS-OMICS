@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo.

echo ===== 复盘检索服务机（8501 搜索 + 8502 今日相关）=====

echo 本脚本只需在【一台】服务电脑上常开，其它席位用轻客户端连此机。

echo.



set "PY="

where py >nul 2>&1 && set "PY=py -3"

if not defined PY where python >nul 2>&1 && set "PY=python"

if not defined PY (

  echo [X] 未找到 Python

  pause

  exit /b 1

)



echo 使用 Python: %PY%

%PY% -c "import sys; print(sys.executable)"

%PY% -c "import uvicorn, streamlit" 2>nul

if errorlevel 1 (

  echo [X] 依赖未装全，请先双击 install-deps.bat

  pause

  exit /b 1

)



set "LAN_IP="

for /f "delim=" %%i in ('node "%~dp0..\tools\get-lan-ip.cjs" 2^>nul') do set "LAN_IP=%%i"

if defined LAN_IP (

  set "REVIEW_SEARCH_UI_BASE=http://%LAN_IP%:8501"

  echo.

  echo 本机局域网 IP: %LAN_IP%

  echo 其它席位配置此 IP 后只需 start.bat，无需 Python/模型

  echo   8501 复盘搜索: http://%LAN_IP%:8501

  echo   8502 今日相关: http://%LAN_IP%:8502
  echo.
  echo 本机也开工作台: 项目根目录 node tools\set-review-client.cjs 127.0.0.1

) else (

  set "REVIEW_SEARCH_UI_BASE=http://127.0.0.1:8501"

  echo.

  echo [!] 未能自动检测局域网 IP，请 ipconfig 查看后告知其它席位

)

echo.

echo 首次部署请【管理员】运行 开放防火墙复盘服务.bat

echo 按 Ctrl+C 可停止服务

echo.



for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8502" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1



start "复盘推荐API-8502" /min %PY% -m uvicorn api.server:app --host 0.0.0.0 --port 8502

timeout /t 2 /nobreak >nul



%PY% -m streamlit run app/main.py --server.address 0.0.0.0 --server.port 8501

echo.

if errorlevel 1 pause

