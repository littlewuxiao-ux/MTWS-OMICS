@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   复盘搜索（独立全套：推荐 API + 检索界面）
echo   ----------------------------------------
echo   若已运行工作台 start.bat，通常只需 start-search.bat 打开 :8501
echo   本脚本适用于未开工作台、或需局域网访问（见 start_lan.bat）时
echo.
echo   搜索界面: http://localhost:8501
echo   推荐接口: http://localhost:8502/api/recommend
echo.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8502" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
start "复盘推荐API" /min python -m uvicorn api.server:app --host 127.0.0.1 --port 8502
python -m streamlit run app/main.py --server.address 127.0.0.1 --server.port 8501
