@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo.

echo ===== 离线安装 PyTorch（席位无外网时用）=====

echo.



set "PY="

where py >nul 2>&1 && set "PY=py -3"

if not defined PY where python >nul 2>&1 && set "PY=python"

if not defined PY (

  echo [X] 未找到 Python

  pause

  exit /b 1

)



set "WHEELS=%~dp0offline-wheels"

if not exist "%WHEELS%\*.whl" (

  echo [X] 缺少 offline-wheels\*.whl

  echo     请在笔记本运行 export-torch-wheels.bat，U 盘拷贝 offline-wheels 文件夹到此目录

  pause

  exit /b 1

)



echo 使用: %PY%

%PY% -m pip uninstall -y torch torchvision torchaudio 2>nul

%PY% -m pip install --no-index --find-links "%WHEELS%" torch torchvision torchaudio

if errorlevel 1 (

  echo [X] 离线安装失败（Python 版本可能与笔记本不一致）

  echo     笔记本 Python 3.14 / 席位 Python 3.12 时 wheel 不通用，请改用 fix-torch.bat 或安装 Python 3.14

  pause

  exit /b 1

)



%PY% -c "import torch; print('[OK] torch', torch.__version__)"

if errorlevel 1 (

  echo [X] 安装后仍无法 import torch，请安装 VC++ 2015-2022 x64 后重试

  pause

  exit /b 1

)



echo.

echo 完成。请运行 check-semantic.bat 验证

pause

