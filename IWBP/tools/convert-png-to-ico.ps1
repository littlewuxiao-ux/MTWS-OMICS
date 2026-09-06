# PNG -> ICO（席位兼容：默认生成 256 单尺寸，稳定不糊）
param(
  [Parameter(Mandatory = $true)][string]$PngPath,
  [Parameter(Mandatory = $true)][string]$IcoPath,
  [switch]$MultiSize
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $PngPath)) { throw "PNG not found: $PngPath" }

if (Test-Path $IcoPath) { Remove-Item $IcoPath -Force }

Add-Type -AssemblyName System.Drawing

function Save-LegacyIco([string]$pngPath, [string]$icoPath) {
  $src = [System.Drawing.Image]::FromFile($pngPath)
  try {
    $size = 256
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()

    $hIcon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $fs = [System.IO.File]::Create($icoPath)
    try { $icon.Save($fs) } finally { $fs.Close(); $icon.Dispose(); $bmp.Dispose() }
  } finally {
    $src.Dispose()
  }
}

function Save-MultiSizePngIco([string]$pngPath, [string]$icoPath) {
  $src = [System.Drawing.Image]::FromFile($pngPath)
  $sizeList = @(16, 32, 48, 256)
  $pngChunks = New-Object System.Collections.Generic.List[Object]
  try {
    foreach ($s in $sizeList) {
      $bmp = New-Object System.Drawing.Bitmap $s, $s
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.DrawImage($src, 0, 0, $s, $s)
      $g.Dispose()
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $pngChunks.Add([PSCustomObject]@{ Size = $s; Bytes = $ms.ToArray() })
      $ms.Dispose(); $bmp.Dispose()
    }
  } finally { $src.Dispose() }

  $count = $pngChunks.Count
  $offset = 6 + (16 * $count)
  $fs = [System.IO.File]::Create($icoPath)
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$count)
  foreach ($chunk in $pngChunks) {
    $s = [int]$chunk.Size
    $data = [byte[]]$chunk.Bytes
    $dim = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $bw.Write($dim); $bw.Write($dim)
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]0); $bw.Write([UInt16]0)
    $bw.Write([UInt32]$data.Length); $bw.Write([UInt32]$offset)
    $offset += $data.Length
  }
  foreach ($chunk in $pngChunks) { $bw.Write([byte[]]$chunk.Bytes) }
  $bw.Close(); $fs.Close()
}

if ($MultiSize) { Save-MultiSizePngIco $PngPath $IcoPath } else { Save-LegacyIco $PngPath $IcoPath }

$info = Get-Item $IcoPath
Write-Host ("[OK] ICO " + $info.Length + " bytes -> " + $IcoPath)
