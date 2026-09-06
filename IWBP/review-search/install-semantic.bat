@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   启用语义搜索（BGE-M3 模型 + 向量索引）
echo   ----------------------------------------
echo   若席位无法上网：请用 U 盘从笔记本拷贝整个 models\bge-m3\ 到本目录
echo   然后再运行本脚本（会重建向量索引，约需数分钟）
echo.

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"
if not defined PY (
  echo [错误] 未找到 Python
  pause
  exit /b 1
)

%PY% tools\setup_semantic.py
if errorlevel 1 (
  echo.
  echo [失败] 见上方报错
  pause
  exit /b 1
)

echo.
echo 完成。请关闭并重新打开 start-search.bat，侧边栏应显示「语义引擎在线」
pause
