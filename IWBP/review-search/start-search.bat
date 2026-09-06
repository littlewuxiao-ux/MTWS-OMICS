@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   复盘检索界面（Streamlit · 带 cmd 窗口，调试用）
echo   日常席位请用项目根目录 start-review-search-quiet.bat（无黑框）
echo   ----------------------------------------
echo   地址: http://localhost:8501
echo.

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"
if not defined PY (
  echo [错误] 未找到 Python。请安装 Python 3.10+ 并勾选 Add python.exe to PATH
  echo 安装后在本目录运行 install-deps.bat
  pause
  exit /b 1
)

if not exist "app\main.py" (
  echo [错误] 缺少 app\main.py，请确认 review-search 文件夹已完整同步
  pause
  exit /b 1
)

echo 使用 Python: %PY%
%PY% -c "import sys; print('路径:', sys.executable)"
%PY% -c "import streamlit" 2>nul
if errorlevel 1 (
  echo [错误] 未安装 streamlit 等依赖
  echo 请先运行 install-deps.bat
  echo 或手动执行:
  echo   %PY% -m pip install -r requirements.txt
  pause
  exit /b 1
)

echo 正在启动，请勿关闭本窗口…
echo.
%PY% -m streamlit run app/main.py --server.address 127.0.0.1 --server.port 8501
echo.
if errorlevel 1 (
  echo [错误] Streamlit 启动失败，见上方红色报错
  pause
  exit /b 1
)
