<#
.SYNOPSIS
  Start CardioLens locally with one command.

.DESCRIPTION
  First run: creates the Python environment and installs the backend requirements,
  then builds the dashboard if it has not been built yet. Every run: serves the API
  and the dashboard on http://127.0.0.1:<Port> and opens it in the default browser.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start.ps1
  powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Port 8080 -Rebuild
#>
param(
  [int]$Port = 8000,
  [switch]$NoBrowser,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venv = Join-Path $backend ".venv"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $python)) {
  Write-Host "Creating the Python environment (first run, a few minutes)..." -ForegroundColor Cyan
  if (Get-Command py -ErrorAction SilentlyContinue) { & py -3.12 -m venv $venv } else { & python -m venv $venv }
  & $python -m pip install --upgrade pip
  & $python -m pip install -r (Join-Path $backend "requirements.txt")
}

if ($Rebuild -or -not (Test-Path (Join-Path $frontend "dist\index.html"))) {
  Write-Host "Building the dashboard..." -ForegroundColor Cyan
  Push-Location $frontend
  try {
    if (-not (Test-Path "node_modules")) { npm ci }
    npm run build
  } finally {
    Pop-Location
  }
}

$url = "http://127.0.0.1:$Port"
if (-not $NoBrowser) {
  # Open the browser as soon as the API answers.
  Start-Job -ArgumentList $url -ScriptBlock {
    param($u)
    for ($i = 0; $i -lt 90; $i++) {
      try {
        Invoke-WebRequest "$u/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Start-Process $u
        break
      } catch {
        Start-Sleep -Seconds 1
      }
    }
  } | Out-Null
}

Write-Host "CardioLens is starting on $url  (Ctrl+C to stop)" -ForegroundColor Green
Push-Location $backend
try {
  & $python -m uvicorn cardiolens.api.main:app --host 127.0.0.1 --port $Port
} finally {
  Pop-Location
}
