@echo off
rem ============================================================
rem  Unified Server Launcher (no console window)
rem  MTWS + OMICS -> launcher.py via pythonw
rem  Use PowerShell Start-Process to avoid cmd/start path parsing issues.
rem ============================================================
set "ROOT=%~dp0"
set "PYW=C:\Python314\pythonw.exe"
if not exist "%PYW%" set "PYW=pythonw.exe"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$root=$env:ROOT; $pyw=$env:PYW; Start-Process -FilePath $pyw -ArgumentList @((Join-Path $root 'launcher.py')) -WorkingDirectory $root -WindowStyle Hidden"
exit /b
