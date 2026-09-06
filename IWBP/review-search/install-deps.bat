@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   安装复盘搜索 Python 依赖
echo   ----------------------------------------
echo.

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"
if not defined PY (
  echo [错误] 未找到 Python，请先安装 Python 3.10+
  pause
  exit /b 1
)

echo 使用: %PY%
%PY% -m pip install --upgrade pip
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [错误] 安装失败，请截图上方报错
  pause
  exit /b 1
)

echo.
echo 安装完成。可双击 start-search.bat 启动 8501
echo 工作台 start.bat 的「今日相关」也需要这些依赖（8502 API）
pause
