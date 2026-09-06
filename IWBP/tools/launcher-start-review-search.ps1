# Hidden-start Streamlit :8501 (single merged log via cmd redirect)
param(
  [Parameter(Mandatory = $true)][string]$Root
)

$ErrorActionPreference = "Stop"
$RsRoot = Join-Path $Root "review-search"
$LogDir = Join-Path $RsRoot "data"
$Log = Join-Path $LogDir "review-search-streamlit.log"

if (-not (Test-Path (Join-Path $RsRoot "app\main.py"))) {
  throw "Missing review-search\app\main.py"
}

$pyExe = $null
$pyPrefix = @()
if (Get-Command py -ErrorAction SilentlyContinue) {
  $pyExe = "py"
  $pyPrefix = @("-3")
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  $pyExe = "python"
} else {
  throw "Python not found. Run review-search\install-deps.bat"
}

try {
  & $pyExe @pyPrefix -c "import streamlit" | Out-Null
} catch {
  throw "streamlit not installed. Run review-search\install-deps.bat"
}

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}
Add-Content -Path $Log -Value ("[{0}] streamlit starting" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))

$stArgs = @(
  "-m", "streamlit", "run", "app/main.py",
  "--server.address", "127.0.0.1",
  "--server.port", "8501",
  "--server.headless", "true",
  "--browser.gatherUsageStats", "false"
)
$stCmd = ($stArgs | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }) -join " "
$inner = 'cd /d "' + $RsRoot + '" && ' + $pyExe
if ($pyPrefix.Count) { $inner += " " + ($pyPrefix -join " ") }
$inner += " " + $stCmd + ' >> "' + $Log + '" 2>&1'

Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $inner) -WindowStyle Hidden
