@echo off

chcp 65001 >nul

cd /d "%~dp0\.."

echo.

node tools\sf-foc-ping-flight.cjs

echo.

pause

