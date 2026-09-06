@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo.

echo ===== 导出 PyTorch 离线包（在笔记本运行，U 盘拷到席位）=====

echo.



set "PY="

where py >nul 2>&1 && set "PY=py -3"

if not defined PY where python >nul 2>&1 && set "PY=python"

if not defined PY (

  echo [X] 未找到 Python

  pause

  exit /b 1

)



set "OUT=%~dp0offline-wheels"

if not exist "%OUT%" mkdir "%OUT%"



echo 使用: %PY%

%PY% -c "import sys; print('Python', sys.version); import torch; print('torch', torch.__version__)" 2>nul

if errorlevel 1 (

  echo [X] 笔记本上 torch 未就绪，请先在本机安装成功后再导出

  pause

  exit /b 1

)



echo.

echo 正在下载 wheel 到: %OUT%

echo （约 200MB，需联网）

echo.



%PY% -m pip download torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu -d "%OUT%"

if errorlevel 1 (

  echo [X] 下载失败

  pause

  exit /b 1

)



echo.

echo [OK] 请将整个 offline-wheels 文件夹复制到席位：

echo     review-search\offline-wheels\

echo 然后在席位运行 fix-torch-offline.bat

pause

