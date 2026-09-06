# Create review-search-icon.ico and desktop shortcut
# Run: powershell -ExecutionPolicy Bypass -File tools\create-review-search-desktop-shortcut.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Png = Join-Path $Root "assets\review-search-icon.png"
$Ico = Join-Path $Root "assets\review-search-icon.ico"
$Bat = Join-Path $Root "start-review-search-quiet.bat"
$Desktop = [Environment]::GetFolderPath("Desktop")
$LnkName = [char]0x590D + [char]0x76D8 + [char]0x641C + [char]0x7D22
$Lnk = Join-Path $Desktop ($LnkName + ".lnk")
$Convert = Join-Path $Root "tools\convert-png-to-ico.ps1"
$OldIco = Join-Path $Root "assets\review-search-duty.ico"

if (-not (Test-Path $Png)) { throw "PNG not found (must sync assets\review-search-icon.png): $Png" }
if (-not (Test-Path $Bat)) { throw "start-review-search-quiet.bat not found: $Bat" }
if (-not (Test-Path $Convert)) { throw "convert-png-to-ico.ps1 not found: $Convert" }

$pngInfo = Get-Item $Png
Write-Host ("[i] PNG: " + $pngInfo.FullName + " (" + $pngInfo.Length + " bytes)")

if (Test-Path $OldIco) { Remove-Item $OldIco -Force; Write-Host "[i] Removed old review-search-duty.ico" }
if (Test-Path $Ico) { Remove-Item $Ico -Force }

& $Convert -PngPath $Png -IcoPath $Ico
if (-not (Test-Path $Ico)) { throw "ICO generation failed" }

if (Test-Path $Lnk) { Remove-Item $Lnk -Force }

$Wsh = New-Object -ComObject WScript.Shell
$Shortcut = $Wsh.CreateShortcut($Lnk)
$Shortcut.TargetPath = $Bat
$Shortcut.WorkingDirectory = $Root
$Shortcut.IconLocation = ($Ico + ",0")
$Shortcut.Description = "Aviation weather case review search (Streamlit :8501)"
$Shortcut.WindowStyle = 1
$Shortcut.Save()

Write-Host "[OK] ICO: $Ico"
Write-Host "[OK] Shortcut: $Lnk"
Write-Host "[i] If icon still looks old: delete desktop shortcut, re-run this script, then sign out/in or reboot once."
