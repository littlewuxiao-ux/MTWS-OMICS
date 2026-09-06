@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ===== 气象工作台 · 席位环境检查 =====
echo 目录: %CD%
echo.

set "OK=1"

where node >nul 2>&1
if errorlevel 1 (
  echo [X] Node.js 未安装或未加入 PATH
  set "OK=0"
) else (
  for /f "delim=" %%v in ('node -v 2^>nul') do echo [OK] Node.js %%v
)

if exist "node_modules\" (echo [OK] node_modules 存在) else (
  echo [!] node_modules 不存在，请在项目根目录执行 npm install
  set "OK=0"
)

if exist "index.html" (echo [OK] index.html) else (
  echo [X] 缺少 index.html
  set "OK=0"
)

if exist "tools\dev-server-proxy.cjs" (echo [OK] dev-server-proxy.cjs) else (
  echo [X] 缺少 tools\dev-server-proxy.cjs
  set "OK=0"
)

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"

set "REVIEW_ROLE=local"
set "REVIEW_HOST="
if exist "data\review-service-config.json" (
  for /f "usebackq delims=" %%j in (`node -e "try{const c=require('./data/review-service-config.json');console.log((c.role||'local')+'|'+(c.host||''))}catch(e){console.log('local|')}"`) do (
    for /f "tokens=1,2 delims=|" %%a in ("%%j") do (
      set "REVIEW_ROLE=%%a"
      set "REVIEW_HOST=%%b"
    )
  )
)

if /i "%REVIEW_ROLE%"=="client" (
  echo [OK] 复盘轻客户端 -> 服务机 %REVIEW_HOST%（本机无需 Python/模型）
) else if not defined PY (
  echo [X] Python 未找到
  set "OK=0"
) else (
  echo [OK] Python 命令: %PY%
  %PY% -c "import streamlit; import uvicorn; import fastapi; print('[OK] streamlit / uvicorn / fastapi')" 2>nul
  if errorlevel 1 (
    echo [!] Python 依赖未装全，请运行 review-search\install-deps.bat
    set "OK=0"
  )
)

if exist "review-search\api\server.py" (echo [OK] review-search API 代码) else (
  echo [X] 缺少 review-search\api\server.py（今日相关需要）
  set "OK=0"
)

if exist "review-search\app\main.py" (echo [OK] review-search Streamlit 代码) else (
  echo [X] 缺少 review-search\app\main.py（8501 需要）
  set "OK=0"
)

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"
if /i not "%REVIEW_ROLE%"=="client" if defined PY (
  pushd review-search 2>nul
  if not errorlevel 1 (
    %PY% -c "from tools.download_model import is_model_ready; import sys; sys.exit(0 if is_model_ready() else 1)" 2>nul
    if errorlevel 1 (
      echo [!] 语义模型未就绪：缺少 review-search\models\bge-m3\ 权重
      echo     服务机需拷贝该文件夹，或运行 review-search\install-semantic.bat
      set "OK=0"
    ) else (
      echo [OK] BGE-M3 语义模型文件
    )
    popd
  )
)

if exist "data\sf-foc-config.local.json" (
  echo [OK] FOC 配置文件存在（密钥/token）
) else (
  echo [!] 无 data\sf-foc-config.local.json，公司气象需单独配置
)

echo.
if "%OK%"=="1" (
  echo 检查通过。可双击 start.bat，浏览器打开 http://localhost:8787/index.html
) else (
  echo 请先按上方 [X] / [!] 项修复，再运行 start.bat
)
echo.
pause
