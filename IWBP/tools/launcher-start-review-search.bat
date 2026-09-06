@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
set "WB_ROOT=%CD%"
set "RS_LOG=%WB_ROOT%\review-search\data\review-search-streamlit.log"
REM 隐藏后台启动 Streamlit :8501

if not exist "%WB_ROOT%\review-search\app\main.py" (
  echo [X] 缺少 review-search\app\main.py
  exit /b 1
)

node "%WB_ROOT%\tools\launcher-wait-review-ready.cjs" --check
if not errorlevel 1 exit /b 0

powershell -NoProfile -ExecutionPolicy Bypass -File "%WB_ROOT%\tools\launcher-start-review-search.ps1" -Root "%WB_ROOT%"
if errorlevel 1 (
  echo [X] 启动失败，见上方报错
  exit /b 1
)

node "%WB_ROOT%\tools\launcher-wait-review-ready.cjs" --wait-app 120000 500
if errorlevel 1 (
  echo [X] 8501 页面未就绪（超时 2 分钟），请查看 %RS_LOG%
  exit /b 1
)
exit /b 0
