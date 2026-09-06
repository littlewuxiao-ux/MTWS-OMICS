@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   重启本地机器人发群小助手
echo   ----------------------------------------
echo   1. 请在任务栏找到并关闭旧的「本地机器人发群小助手」窗口
echo   2. 然后按任意键启动新窗口
echo.
pause >nul
start "" /MIN /D "%~dp0" cmd /k call tools\robot-outbox-watch.bat
echo 已启动。若仍有待发未发，可再运行: node tools\robot-outbox-send.cjs --once
timeout /t 5 /nobreak >nul
