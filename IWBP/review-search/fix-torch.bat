@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo.

echo ===== PyTorch / 语义引擎修复（席位专用）=====

echo.



set "PY="

where py >nul 2>&1 && set "PY=py -3"

if not defined PY where python >nul 2>&1 && set "PY=python"

if not defined PY (

  echo [X] 未找到 Python

  pause

  exit /b 1

)



echo 当前 Python:

%PY% -c "import sys; print(sys.executable); print('version', sys.version)"

echo.



echo [1/4] 测试 import torch …

%PY% -c "import torch; print('[OK] torch', torch.__version__)" 2>nul

if not errorlevel 1 goto torch_ok



echo [X] torch 无法加载（WinError 1114 / c10.dll 常见）

echo.

echo --- 请先确认已安装 VC++ 运行库（多数席位缺这个）---

echo 下载并安装 x64 版（需管理员）:

echo   https://aka.ms/vs/17/release/vc_redist.x64.exe

echo 安装完成后按任意键继续本脚本…

pause

echo.



echo [2/4] 重装 CPU 版 PyTorch 最新版 …

%PY% -m pip install --upgrade pip

%PY% -m pip uninstall -y torch torchvision torchaudio 2>nul

%PY% -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

if errorlevel 1 (

  echo [X] 在线安装失败，请确认席位能访问外网

  pause

  exit /b 1

)



%PY% -c "import torch; print('[OK] torch', torch.__version__)" 2>nul

if not errorlevel 1 goto torch_ok



echo.

echo [3/4] 最新版仍失败，尝试降级 torch 2.8.0（已知可缓解 1114）…

%PY% -m pip uninstall -y torch torchvision torchaudio 2>nul

%PY% -m pip install torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu

if errorlevel 1 (

  echo [X] 降级安装失败

  goto torch_fail

)



%PY% -c "import torch; print('[OK] torch', torch.__version__)" 2>nul

if not errorlevel 1 goto torch_ok



:torch_fail

echo.

echo [4/4] 仍失败。建议按顺序尝试:

echo   A. 重启电脑后再运行本脚本（VC++ 安装后常需重启）

echo   B. 安装与笔记本相同 Python 3.14: https://www.python.org/downloads/

echo      安装时勾选 Add to PATH，然后重新运行 install-deps.bat

echo   C. 笔记本运行 export-torch-wheels.bat，席位运行 fix-torch-offline.bat

echo      （仅当 Python 大版本一致时有效）

pause

exit /b 1



:torch_ok

echo.

echo 测试 sentence_transformers …

%PY% -c "from sentence_transformers import SentenceTransformer; print('[OK] sentence_transformers')" 2>nul

if errorlevel 1 (

  echo 正在补装 sentence-transformers …

  %PY% -m pip install sentence-transformers

)



echo.

echo 完成。请运行 check-semantic.bat 验证，通过后重启 start-search.bat

pause

