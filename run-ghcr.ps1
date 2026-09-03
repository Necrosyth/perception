<#
.SYNOPSIS
    AIna Sentinel — run the prebuilt GHCR image stack on Windows (no build needed)

.DESCRIPTION
    Fetches the published AIna Sentinel images from ghcr.io and runs them with
    Docker Compose. CPU-safe out of the box (works on a plain Windows / Docker
    Desktop machine with no NVIDIA GPU). Only prerequisite: Docker with the
    Compose v2 plugin.

.PARAMETER Command
    up, down, logs, status, check, help  (default: up)

.PARAMETER Gpu
    Add the NVIDIA runtime overlay (only if your machine has a GPU + NVIDIA
    Container Toolkit, e.g. WSL2 GPU passthrough).

.PARAMETER Version
    Image tag to pull (default: v0.1.0-alpha).

.EXAMPLE
    .\run-ghcr.ps1             # pull images and start the stack (CPU)
    .\run-ghcr.ps1 up
    .\run-ghcr.ps1 up -Gpu     # start with NVIDIA GPU acceleration
    .\run-ghcr.ps1 status      # container states + endpoints
    .\run-ghcr.ps1 down
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('up', 'down', 'logs', 'status', 'check', 'help')]
    [string]$Command = 'up',

    [switch]$Gpu,

    [string]$Version = 'v0.1.0-alpha'
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Compose = Join-Path $Root 'deploy\docker-compose.ghcr.yml'
$GpuCompose = Join-Path $Root 'deploy\docker-compose.ghcr.gpu.yml'

# --- Compose command builder -----------------------------------------------
function Get-ComposeArgs {
    param([string[]]$Extra)
    $env:AINA_VERSION = $Version
    $files = @('compose', '-f', $Compose)
    if ($Gpu) { $files += '-f', $GpuCompose }
    $files += $Extra
    , $files
}

function Test-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
        exit 1
    }
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker daemon not running — start Docker Desktop."
        exit 1
    }
}

# --- Actions ---------------------------------------------------------------
function Invoke-Up {
    Test-Docker
    Write-Host "==> pulling & starting AIna Sentinel ($Version)" -ForegroundColor Cyan
    Push-Location $Root
    try {
        $args = @(Get-ComposeArgs @('up', '-d'))
        & docker @args
        if ($LASTEXITCODE -ne 0) { throw 'compose up failed' }
    } finally { Pop-Location }
    Invoke-Status
}

function Invoke-Down {
    Test-Docker
    Push-Location $Root
    try {
        $args = @(Get-ComposeArgs @('down'))
        & docker @args
    } finally { Pop-Location }
    Write-Host "[ ok ] stack stopped (volumes retained)" -ForegroundColor Green
}

function Invoke-Logs {
    Test-Docker
    Push-Location $Root
    try {
        $args = @(Get-ComposeArgs @('logs')) + ($args)
        & docker @args
    } finally { Pop-Location }
}

function Invoke-Status {
    Test-Docker
    Push-Location $Root
    try {
        $args = @(Get-ComposeArgs @('ps'))
        & docker @args
    } finally { Pop-Location }

    $apiPort = if ($env:API_PORT) { $env:API_PORT } else { '5000' }
    $dashPort = if ($env:DASHBOARD_PORT) { $env:DASHBOARD_PORT } else { '3000' }
    $docsPort = if ($env:DOCS_PORT) { $env:DOCS_PORT } else { '3001' }
    Write-Host ""
    Write-Host "Endpoints:"
    Write-Host "  API        http://localhost:${apiPort}/health"
    Write-Host "  Dashboard  http://localhost:${dashPort}"
    Write-Host "  Docs       http://localhost:${docsPort}"
}

function Show-Usage {
    @'

  AIna Sentinel — prebuilt GHCR stack (Windows)

  Usage:
    .\run-ghcr.ps1                pull images + start the stack (CPU)
    .\run-ghcr.ps1 up -Gpu        start with NVIDIA acceleration (needs toolkit)
    .\run-ghcr.ps1 down           stop
    .\run-ghcr.ps1 status         container states + endpoints
    .\run-ghcr.ps1 logs           tail logs
    .\run-ghcr.ps1 -Version <tag> pick another image tag

'@
}

switch ($Command) {
    'help'   { Show-Usage }
    'up'     { Invoke-Up }
    'down'   { Invoke-Down }
    'logs'   { Invoke-Logs }
    'status' { Invoke-Status }
    'check'  { Test-Docker; Write-Host "[ ok ] docker + compose ready" -ForegroundColor Green }
}
