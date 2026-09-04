@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0OMICS"
echo [1/3] 检查 Python...
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py") else (set "PY=python")
%PY% --version || (echo 未找到 Python 3.10+，请先安装 Python 并勾选 Add to PATH。 & pause & exit /b 1)
echo [2/3] 安装 OMICS 依赖...
%PY% -m pip install --upgrade pip
%PY% -m pip install flask waitress pandas openpyxl requests python-dateutil customtkinter pystray pillow
if errorlevel 1 (echo 依赖安装失败，请检查网络或代理设置。 & pause & exit /b 1)
echo [3/3] 验证项目导入...
set "PYTHONPATH=%CD%;%CD%\backend;%PYTHONPATH%"
%PY% -c "from backend.logic.exporter import process_stats_and_save; import flask,pandas,openpyxl,requests,customtkinter,pystray,PIL; print('OMICS 环境正常')"
if errorlevel 1 (echo 导入验证失败，请把本窗口中的完整错误发给我。 & pause & exit /b 1)
echo 配置完成。双击 MTWS+OMICS.bat 启动系统。
pause
