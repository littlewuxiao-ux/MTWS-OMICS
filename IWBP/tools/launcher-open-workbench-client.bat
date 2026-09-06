@echo off
cd /d "%~dp0\.."
node tools\open-workbench-client.cjs
exit /b %ERRORLEVEL%
