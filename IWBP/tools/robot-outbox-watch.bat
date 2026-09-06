@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
title 本地机器人发群小助手
echo.
echo   本地机器人发群小助手（崩溃会自动重启）
echo   日志: data\robot-outbox-send.log
echo   补发一次: node tools\robot-outbox-send.cjs --once
echo.

:loop
node tools\robot-outbox-send.cjs --watch
echo.
echo [%date% %time%] 小助手已退出，15 秒后自动重启…
echo 若反复失败：看 data\robot-outbox-send.log 或联系曹骏 40690141
timeout /t 15 /nobreak >nul
goto loop
