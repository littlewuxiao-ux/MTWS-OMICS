@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   创建「复盘搜索」桌面快捷方式（含自定义图标）
echo   ----------------------------------------
echo   重要: 必须先同步 assets\review-search-icon.png 到本机！
echo         不要只拷旧版 review-search-duty.ico
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\create-review-search-desktop-shortcut.ps1"
if errorlevel 1 (
  echo.
  echo [失败] 请截图上方报错
  pause
  exit /b 1
)
echo.
echo 说明: 图标源文件 assets\review-search-icon.png
echo       若桌面图标仍不对: 删掉旧快捷方式后重跑本脚本
echo.
pause
