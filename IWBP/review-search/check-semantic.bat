@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ===== 语义搜索诊断 =====
echo 目录: %CD%
echo.

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"
if not defined PY (
  echo [X] 未找到 Python
  pause
  exit /b 1
)
echo [OK] Python: %PY%
echo.

set "MODEL=models\bge-m3"
if not exist "%MODEL%" (
  echo [X] 缺少 %MODEL% 文件夹
  pause
  exit /b 1
)

if exist "%MODEL%\pytorch_model.bin" (
  for %%A in ("%MODEL%\pytorch_model.bin") do echo [?] pytorch_model.bin 大小: %%~zA 字节
) else (
  echo [X] 缺少 pytorch_model.bin（约 2.2GB）
)

%PY% -c "from tools.download_model import is_model_ready; import sys; sys.exit(0 if is_model_ready() else 1)"
if errorlevel 1 (
  echo [X] 模型权重不完整
  pause
  exit /b 1
)
echo [OK] 模型权重完整
echo.
echo 正在检测 torch 与语义引擎（首次约 1 分钟）…

%PY% tools\check_semantic_cli.py
if errorlevel 1 (
  echo.
  echo 若 torch 失败: 双击 fix-torch.bat
  echo 若缺依赖: 双击 install-deps.bat
  pause
  exit /b 1
)

echo.
echo 全部通过。请关闭 start-search.bat 后重新打开 8501
pause
