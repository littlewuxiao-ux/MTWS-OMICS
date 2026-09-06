# Create workbench-duty.ico and desktop shortcut "气象工作台.lnk"
# Run: powershell -ExecutionPolicy Bypass -File tools\create-duty-desktop-shortcut.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Png = Join-Path $Root "assets\workbench-duty.png"
$Ico = Join-Path $Root "assets\workbench-duty.ico"
$Bat = Join-Path $Root "start-workbench-quiet.bat"
$Desktop = [Environment]::GetFolderPath("Desktop")
$LnkName = [char]0x6C14 + [char]0x8C61 + [char]0x5DE5 + [char]0x4F5C + [char]0x53F0
$Lnk = Join-Path $Desktop ($LnkName + ".lnk")

if (-not (Test-Path $Png)) {
  $Fallback = Join-Path $Root "assets\app-icon-512.png"
  if (Test-Path $Fallback) { $Png = $Fallback } else { throw "PNG icon not found: $Png" }
}
if (-not (Test-Path $Bat)) { throw "start-workbench-quiet.bat not found: $Bat" }

Add-Type -AssemblyName System.Drawing

function Convert-PngToIco([string]$pngPath, [string]$icoPath) {
  $src = [System.Drawing.Image]::FromFile($pngPath)
  try {
    $size = 256
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()

    $hIcon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $fs = [System.IO.File]::Create($icoPath)
    try {
      $icon.Save($fs)
    } finally {
      $fs.Close()
      $icon.Dispose()
      $bmp.Dispose()
    }
  } finally {
    $src.Dispose()
  }
}

Convert-PngToIco $Png $Ico
Write-Host "[OK] ICO: $Ico"

$Wsh = New-Object -ComObject WScript.Shell
$Shortcut = $Wsh.CreateShortcut($Lnk)
$Shortcut.TargetPath = $Bat
$Shortcut.WorkingDirectory = $Root
$Shortcut.IconLocation = "$Ico,0"
$Shortcut.Description = "Weather Workbench duty launcher"
$Shortcut.WindowStyle = 7
$Shortcut.Save()

Write-Host "[OK] Shortcut: $Lnk"
