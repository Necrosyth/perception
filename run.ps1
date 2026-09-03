<#
.SYNOPSIS
    AIna Sentinel — single-command run (Windows)

.DESCRIPTION
    Windows equivalent of run.sh. Drives the Docker Compose stack and uses
    uv only as the auxiliary dependency runner for the host-side capability probe.

.PARAMETER Command
    Command to execute: up, down, logs, status, check, help

.PARAMETER Json
    When used with 'check', outputs machine-readable JSON.

.EXAMPLE
    .\run.ps1              # verify prerequisites, then build & start the stack
    .\run.ps1 up           # same as bare (explicit)
    .\run.ps1 down         # stop the stack (keeps volumes)
    .\run.ps1 logs -f      # tail stack logs
    .\run.ps1 status       # container states + service health endpoints
    .\run.ps1 check        # prerequisites + GPU probe only (no start)
    .\run.ps1 check -Json  # machine-readable probe report
    .\run.ps1 help
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('up', 'start', 'down', 'stop', 'logs', 'status', 'ps', 'check', 'verify', 'help')]
    [string]$Command = 'up',

    [switch]$Json,

    [Parameter(ValueFromRemainingArguments)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ComposeFile = Join-Path $Root 'deploy\docker-compose.yml'
$EnvFile = Join-Path $Root '.env'

# --- Colour helpers (only when attached to a terminal) ---
function Write-Status {
    param([string]$Message)
    Write-Host "[ ok ] " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[warn] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ ERR ] " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

function Write-Hdr {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

# --- Prerequisite checks ---
function Test-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Err "docker not found on PATH."
        Write-Host "  Install Docker Desktop (https://docs.docker.com/desktop/install/windows-install/), then re-run."
        exit 1
    }
    try {
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw }
    } catch {
        Write-Err "docker daemon is not running or the current user lacks permission."
        Write-Host "  Start Docker Desktop."
        exit 1
    }
    Write-Status "docker daemon reachable"
}

function Test-Compose {
    try {
        $ver = docker compose version --short 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Status "docker compose plugin present ($ver)"
            return 'docker compose'
        }
    } catch {}

    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        Write-Warn "legacy 'docker-compose' found — prefer the v2 plugin (docker compose)."
        return 'docker-compose'
    }

    Write-Err "docker compose (v2 plugin) not found."
    Write-Host "  Install the compose plugin: https://docs.docker.com/compose/install/"
    exit 1
}

function Test-Uv {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Write-Err "uv not found on PATH."
        Write-Host "  Install uv via the standalone installer:"
        Write-Host "    irm https://astral.sh/uv/install.ps1 | iex"
        exit 1
    }
    $ver = (uv --version) -replace '^uv\s+',''
    Write-Status "uv present ($ver)"
}

function Ensure-EnvFile {
    if (-not (Test-Path $EnvFile)) {
        $example = Join-Path $Root '.env.example'
        if (Test-Path $example) {
            Copy-Item $example $EnvFile
            Write-Status "created $EnvFile from .env.example (edit camera sources before going live)"
        } else {
            Write-Warn ".env.example missing — continuing with compose defaults"
        }
    } else {
        Write-Status "$EnvFile present"
    }
}

# --- GPU probe ---
function Get-GpuInfo {
    if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
        Write-Err "nvidia-smi not found — no NVIDIA driver on the host."
        Write-Host "  The perception container requests the nvidia runtime. Install the driver"
        Write-Host "  and NVIDIA Container Toolkit, or run a CPU-only deployment (not supported by this compose)."
        exit 2
    }

    $query = nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader,nounits 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "nvidia-smi failed — driver present but GPUs may be unavailable."
        exit 2
    }

    $gpuCount = 0
    $totalVram = 0
    $minCc = 99.0

    foreach ($line in $query) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line -split ',' | ForEach-Object { $_.Trim() }
        $name = $parts[0]
        [int]$mem = $parts[1]
        $driver = $parts[2]
        [double]$cc = $parts[3]

        $gpuCount++
        $totalVram += $mem
        if ($cc -lt $minCc) { $minCc = $cc }

        Write-Host "  $name | ${mem}MiB | driver $driver | CC $cc"
    }

    if ($gpuCount -eq 0) {
        Write-Err "nvidia-smi returned no GPUs."
        exit 2
    }

    [PSCustomObject]@{
        gpu_count   = $gpuCount
        total_vram  = $totalVram
        min_cc      = $minCc
    }
}

function Test-Gpu {
    $gpu = Get-GpuInfo

    Write-Status "NVIDIA GPU detected: $($gpu.gpu_count) device(s), $($gpu.total_vram) MiB VRAM total, lowest compute capability $($gpu.min_cc)"

    if ($gpu.total_vram -lt 2048) {
        Write-Err "less than 2 GiB VRAM — object detection will not fit."
        exit 2
    } elseif ($gpu.total_vram -lt 4096) {
        Write-Warn "under the recommended 4 GiB VRAM — expect P100/fallback to smaller model, or CPU."
    } else {
        Write-Status "VRAM within recommended range (>= 4 GiB)"
    }

    if ($gpu.min_cc -lt 6.0) {
        Write-Err "compute capability $($gpu.min_cc) is below the 6.0 floor for the CUDA 12 stack."
        exit 2
    }
    Write-Status "compute capability $($gpu.min_cc) >= 6.0 (CUDA 12 / ultralytics compatible)"

    # Check for nvidia docker runtime
    $dockerInfo = docker info 2>$null
    if ($dockerInfo -match 'Runtimes:.*nvidia') {
        Write-Status "docker nvidia runtime registered (NVIDIA Container Toolkit)"
    } elseif (Get-Command nvidia-container-cli -ErrorAction SilentlyContinue) {
        Write-Warn "nvidia-container-cli present but dockerd does not expose the 'nvidia' runtime."
        Write-Host "  Configure it:  nvidia-ctk runtime configure --runtime=docker && restart docker"
        exit 2
    } else {
        Write-Err "NVIDIA Container Toolkit not installed."
        Write-Host "  Install it: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
        Write-Host "  then:  nvidia-ctk runtime configure --runtime=docker && restart docker"
        exit 2
    }

    return $gpu
}

function Get-GpuJson {
    $gpu = Get-GpuInfo
    $dockerOk = 0
    try {
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $dockerOk = 1 }
    } catch {}

    @{
        gpu_count                = $gpu.gpu_count
        total_vram_mib           = $gpu.total_vram
        min_compute_capability   = $gpu.min_cc
        docker_ok                = [bool]$dockerOk
    } | ConvertTo-Json -Compress
}

# --- Actions ---
function Invoke-Check {
    if ($Json) {
        Get-GpuJson
        return
    }

    Write-Hdr "—— AIna Sentinel · prerequisites ————————————————"
    Test-Docker
    $compose = Test-Compose
    Test-Uv
    Ensure-EnvFile
    Test-Gpu | Out-Null

    $modelPath = Join-Path $Root '..\surveillance-backend\models'
    if (Test-Path $modelPath) {
        Write-Status "perception model mount found (..\surveillance-backend\models)"
    } else {
        Write-Warn "model mount ..\surveillance-backend\models not found — perception will not boot the detector."
    }

    Write-Hdr "—— all checks passed —————————————————————————————————"
}

function Invoke-Up {
    Invoke-Check
    Write-Host ""
    Write-Hdr "—— building & starting stack —————————————————————————"

    Push-Location $Root
    try {
        & docker compose -f $ComposeFile build
        if ($LASTEXITCODE -ne 0) { throw "compose build failed" }
        & docker compose -f $ComposeFile up -d
        if ($LASTEXITCODE -ne 0) { throw "compose up failed" }
    } catch {
        Write-Err "compose up failed."
        exit 3
    } finally {
        Pop-Location
    }
    Invoke-Status
}

function Invoke-Down {
    Push-Location $Root
    try {
        & docker compose -f $ComposeFile down
        if ($LASTEXITCODE -ne 0) { exit 3 }
    } finally {
        Pop-Location
    }
    Write-Status "stack stopped (volumes retained: pgdata, engine_cache)"
}

function Invoke-Logs {
    Push-Location $Root
    try {
        $args = @('compose', '-f', $ComposeFile, 'logs') + $ExtraArgs
        & docker @args
    } finally {
        Pop-Location
    }
}

function Invoke-Status {
    # Reload port/settings from .env
    if (Test-Path $EnvFile) {
        Get-Content $EnvFile | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                $key = $Matches[1].Trim()
                $val = $Matches[2].Trim()
                [Environment]::SetEnvironmentVariable($key, $val, 'Process')
            }
        }
    }

    Push-Location $Root
    try {
        & docker compose -f $ComposeFile ps
    } finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "Endpoints:"
    $apiPort = if ($env:API_PORT) { $env:API_PORT } else { '5000' }
    $dashPort = if ($env:DASHBOARD_PORT) { $env:DASHBOARD_PORT } else { '3000' }
    $go2rtcPort = if ($env:GO2RTC_PORT) { $env:GO2RTC_PORT } else { '1984' }
    $docsPort = if ($env:DOCS_PORT) { $env:DOCS_PORT } else { '3001' }
    Write-Host "  API        http://localhost:${apiPort}/health"
    Write-Host "  Dashboard  http://localhost:${dashPort}"
    Write-Host "  go2rtc     http://localhost:${go2rtcPort}/api"
    Write-Host "  Docs       http://localhost:${docsPort}"
}

function Show-Usage {
    $help = @'

  AIna Sentinel — single-command run (Windows)

  Usage:
    .\run.ps1                 verify prerequisites, then build & start the stack
    .\run.ps1 up              same as bare (explicit)
    .\run.ps1 down            stop the stack (keeps volumes)
    .\run.ps1 logs [-f]       tail stack logs
    .\run.ps1 status          container states + service health endpoints
    .\run.ps1 check           prerequisites + GPU probe only (no start)
    .\run.ps1 check -Json     machine-readable probe report
    .\run.ps1 help

'@
    Write-Host $help
}

# --- Main dispatch ---
switch ($Command) {
    { $_ -in 'help' }                 { Show-Usage }
    { $_ -in 'up', 'start' }          { Invoke-Up }
    { $_ -in 'down', 'stop' }         { Invoke-Down }
    { $_ -in 'logs' }                 { Invoke-Logs }
    { $_ -in 'status', 'ps' }         { Invoke-Status }
    { $_ -in 'check', 'verify' }      { Invoke-Check }
    default {
        Write-Err "unknown command '$Command'"
        Show-Usage
        exit 1
    }
}
