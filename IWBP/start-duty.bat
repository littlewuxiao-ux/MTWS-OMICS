@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   气象值班一键启动（工作台 + 本地机器人发群）
echo   ----------------------------------------
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js
  pause
  exit /b 1
)

echo [1/3] 检查文件是否同步正确…
node tools\verify-duty-files.cjs
if errorlevel 1 (
  echo.
  echo [停止] 请从笔记本同步以下 4 个文件后再试：
  echo   tools\dev-server-proxy.cjs
  echo   tools\robot-mention-resolver.cjs
  echo   tools\robot-outbox-send.cjs
  echo   data\robot-publish-config.json  （含 webhookUrl）
  pause
  exit /b 1
)

echo.
echo [2/3] 启动工作台…
start "" /MIN /D "%~dp0" cmd /k call start.bat
timeout /t 10 /nobreak >nul

powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:8787/api/platform/health'; if($r.StatusCode -eq 200){Write-Host '[OK] 工作台 http://localhost:8787/index.html' -ForegroundColor Green; exit 0} exit 1 } catch { Write-Host '[X] 8787 未响应 — 看「气象工作台」窗口报错'; exit 1 }"
if errorlevel 1 (
  echo 若端口占用: netstat -ano ^| findstr :8787  然后 taskkill /PID xxx /F
  pause
  exit /b 1
)

echo.
echo [3/3] 启动本地机器人发群 - 轮询间隔见 robot-publish-config.json，默认 2 分钟
echo 请确认领慧 outbox 定时任务已暂停，避免重复发群
echo 运行日志: data\robot-outbox-send.log
start "" /MIN /D "%~dp0" cmd /k call tools\robot-outbox-watch.bat

echo.
echo [OK] 启动完成。浏览器: http://localhost:8787/index.html
echo      工作台 + 小助手已在任务栏最小化，值班期间请勿关闭。
echo      本窗口 5 秒后自动关闭…
timeout /t 5 /nobreak >nul
exit /b 0
