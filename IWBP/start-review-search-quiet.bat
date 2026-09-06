@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   复盘搜索一键启动（无黑框 · Streamlit :8501）
echo   ----------------------------------------
echo   首次打开约需 10～30 秒完成页面初始化…
call tools\launcher-start-review-search.bat
if errorlevel 1 (
  echo.
  echo [停止] 启动失败，请查看 review-search\data\review-search-streamlit.log
  pause
  exit /b 1
)
call tools\launcher-open-review-search.bat
echo.
echo [OK] 复盘搜索已在浏览器打开，Streamlit 在后台运行。
echo      停止请运行: tools\launcher-stop-review-search.bat
echo      日志: review-search\data\review-search-streamlit.log
exit /b 0
