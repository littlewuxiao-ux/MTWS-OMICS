@echo off
cd /d "%~dp0"
REM Run as Administrator on the duty seat PC to allow LAN access to the unified entry.

echo.
echo Open TCP 8000 for LAN clients (MTWS / OMICS / IWBP via Nginx)
echo.

netsh advfirewall firewall delete rule name="MTWS-OMICS-IWBP 8000" >nul 2>&1
netsh advfirewall firewall add rule name="MTWS-OMICS-IWBP 8000" dir=in action=allow protocol=TCP localport=8000 profile=private,domain

if %errorlevel%==0 (
  echo [OK] Firewall rule added.
  echo      LAN URLs:
  echo        http://本机局域网IP:8000/mtws/
  echo        http://本机局域网IP:8000/omics/
  echo        http://本机局域网IP:8000/iwbp/
) else (
  echo [X] Failed. Right-click this file and Run as administrator.
)

echo.
pause
