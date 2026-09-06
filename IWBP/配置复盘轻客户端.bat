@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo.

echo ===== 配置复盘轻客户端 =====

echo 本机只做工作台，Python/模型/语义引擎均在【服务机】上运行。

echo.



where node >nul 2>&1

if errorlevel 1 (

  echo [X] 需要 Node.js（与工作台相同）

  pause

  exit /b 1

)



set "IP="

set /p IP=请输入复盘服务机 IP（运行 start-review-server.bat 那台）: 

if not defined IP (

  echo [X] 未输入 IP

  pause

  exit /b 1

)



node tools\set-review-client.cjs %IP%

if errorlevel 1 (

  pause

  exit /b 1

)



echo.

echo 下一步: 双击 start.bat 打开工作台即可（无需 install-deps / 模型）

pause

