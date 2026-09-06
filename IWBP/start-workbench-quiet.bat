@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   气象值班一键启动（无黑框 · 8787 + 机器人发群）
echo   ----------------------------------------
call tools\launcher-start-workbench.bat
if errorlevel 1 (
  echo.
  echo [停止] 启动失败，请看上方报错（多为文件未同步或 webhook 未配置）
  pause
  exit /b 1
)
call tools\launcher-open-workbench.bat
echo.
echo [OK] 工作台已在浏览器打开，小助手在后台运行。
echo      停止请运行: tools\launcher-stop-workbench.bat
exit /b 0
