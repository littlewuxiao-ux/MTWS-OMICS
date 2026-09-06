@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   创建「气象工作台」桌面快捷方式（含自定义图标）
echo   ----------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\create-duty-desktop-shortcut.ps1"
if errorlevel 1 (
  echo.
  echo [失败] 请截图上方报错
  pause
  exit /b 1
)
echo.
pause
