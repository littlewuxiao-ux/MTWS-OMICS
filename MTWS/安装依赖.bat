@echo off
chcp 65001 >nul
title MTWS 依赖安装

cd /d "%~dp0"

echo ========================================
echo          MTWS 依赖安装
echo ========================================
echo.
echo 将使用当前 Python 环境按顺序安装运行所需依赖。
echo 已安装的包会按指定版本升级或跳过，可重复执行。
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo 错误：未找到 python 命令。
    echo 请先安装 Python 并勾选 "Add python.exe to PATH"。
    pause
    exit /b 1
)

echo 当前 Python：
python --version
echo.

set FAILED=0

echo [0/13] 升级 pip ...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo 警告：pip 升级失败，将继续尝试安装依赖。
    echo.
)

REM 按依赖关系顺序安装：基础工具 -> Web 框架 -> 数据处理 -> 网络 -> 调度 -> 气象解析 -> GUI
echo [1/13] 安装基础工具包 ...
call :install packaging==26.2
call :install six==1.17.0
call :install typing_extensions==4.15.0

echo [2/13] 安装 Django ...
call :install asgiref==3.11.1
call :install sqlparse==0.5.5
call :install Django==6.0.4
call :install djangorestframework==3.17.1

echo [3/13] 安装时间与时区相关包 ...
call :install python-dateutil==2.9.0.post0
call :install pytz==2026.1.post1
call :install tzdata==2026.1
call :install tzlocal

echo [4/13] 安装数据处理包 ...
call :install numpy==2.4.4
call :install pandas==3.0.2

echo [5/13] 安装网络请求包 ...
call :install certifi==2026.4.22
call :install charset-normalizer==3.4.7
call :install idna==3.13
call :install urllib3==2.6.3
call :install requests==2.33.1

echo [6/13] 安装气象解析依赖 ^(avwx_custom^) ...
call :install httpcore
call :install httpx
call :install geopy
call :install xmltodict

echo [7/13] 安装日出日落计算包 ...
call :install suntime==1.3.2

echo [8/13] 安装定时任务包 ...
call :install APScheduler==3.11.1

echo [9/13] 安装图像处理包 ...
call :install Pillow==12.2.0

echo [10/13] 安装服务端 GUI 包 ...
call :install customtkinter
call :install pystray

echo [11/13] 安装可选增强包 ^(地图生成 / 机场搜索，缺失不影响主系统启动^) ...
call :install shapely
call :install scipy
call :install rapidfuzz

echo [12/13] 安装完成，正在核对关键模块 ...
python -c "import django, rest_framework, pandas, numpy, requests, PIL, suntime, apscheduler, customtkinter, pystray, httpx, geopy, xmltodict; print('关键模块导入成功')"
if errorlevel 1 (
    echo 核对失败：部分关键模块无法导入。
    set FAILED=1
) else (
    echo 核对通过。
)

echo.
echo ========================================
if "%FAILED%"=="1" (
    echo 安装过程中有失败项，请向上滚动查看红色/错误输出后重试。
) else (
    echo 全部依赖已按顺序安装完成。
)
echo ========================================
echo.
pause
exit /b %FAILED%

:install
echo.
echo --- 正在安装 %~1 ---
python -m pip install "%~1"
if errorlevel 1 (
    echo *** 安装失败：%~1 ***
    set FAILED=1
)
goto :eof
