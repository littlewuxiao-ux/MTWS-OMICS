# Seat 2 client: desktop shortcut (same name + icon as seat 1 primary launcher)
# Run: powershell -ExecutionPolicy Bypass -File tools\create-client-desktop-shortcut.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Png = Join-Path $Root "assets\workbench-duty.png"
$Ico = Join-Path $Root "assets\workbench-duty.ico"
$Bat = Join-Path $Root "seat2-open-workbench.bat"
$Desktop = [Environment]::GetFolderPath("Desktop")
$LnkName = [char]0x6C14 + [char]0x8C61 + [char]0x5DE5 + [char]0x4F5C + [char]0x53F0
$Lnk = Join-Path $Desktop ($LnkName + ".lnk")
$Convert = Join-Path $Root "tools\convert-png-to-ico.ps1"

if (-not (Test-Path $Png)) {
  $Fallback = Join-Path $Root "assets\app-icon-512.png"
  if (Test-Path $Fallback) { $Png = $Fallback } else { throw "PNG icon not found: $Png" }
}
if (-not (Test-Path $Bat)) { throw "start-workbench-client-quiet.bat not found: $Bat" }
if (-not (Test-Path $Convert)) { throw "convert-png-to-ico.ps1 not found: $Convert" }

& $Convert -PngPath $Png -IcoPath $Ico
Write-Host "[OK] ICO: $Ico"

$Wsh = New-Object -ComObject WScript.Shell
$Shortcut = $Wsh.CreateShortcut($Lnk)
$Shortcut.TargetPath = $Bat
$Shortcut.WorkingDirectory = $Root
$Shortcut.IconLocation = "$Ico,0"
$Shortcut.Description = "Seat 2 client -> primary workbench 10.88.24.24:8787"
$Shortcut.WindowStyle = 7
$Shortcut.Save()

Write-Host "[OK] Shortcut: $Lnk"
Write-Host "     (Same label and icon as seat 1; opens browser on primary server)"
