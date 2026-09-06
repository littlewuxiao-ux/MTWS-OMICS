@echo off
cd /d "%~dp0"
REM Run as Administrator on seat 1 (primary workbench)

echo.
echo Weather Workbench - open TCP 8787 for LAN clients (seat 2)
echo.

netsh advfirewall firewall delete rule name="Weather Workbench 8787" >nul 2>&1

netsh advfirewall firewall add rule name="Weather Workbench 8787" dir=in action=allow protocol=TCP localport=8787 profile=private,domain

if %errorlevel%==0 (
  echo [OK] Firewall rule added.
  echo      Seat 2 URL: http://10.88.24.24:8787/index.html
) else (
  echo [X] Failed. Right-click this file and Run as administrator.
)

echo.
pause
