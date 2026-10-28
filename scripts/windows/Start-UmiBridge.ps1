[CmdletBinding()]
param([switch]$LocalOnly, [switch]$NoDashboard)

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = $projectRoot
$stateDir = Join-Path $root '.local-data'
$statusPath = Join-Path $stateDir 'web-status.json'
$port = 43127
if ($env:DC_WEB_PORT) { $port = [int]$env:DC_WEB_PORT }
$dashboard = "http://127.0.0.1:$port/admin"
$gatewayProcess = $null
$startupLock = $null

function Test-Dashboard {
    try {
        $response = Invoke-WebRequest -Uri $dashboard -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch { return $false }
}

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
# Serialize first launch and reconnect. A bound frontend can still return 503
# while the tunnel/backend starts; that must not start a competing gateway.
for ($lockAttempt = 0; $lockAttempt -lt 90; $lockAttempt++) {
    try {
        $startupLock = [IO.File]::Open((Join-Path $stateDir 'gateway-start.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
        break
    } catch [IO.IOException] { Start-Sleep -Seconds 1 }
}
if (-not $startupLock) { throw 'Another UmiBridge startup is still running. Retry shortly.' }
try {
if (Test-Dashboard) {
    $running = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
    $retiredCredentials = (Test-Path -LiteralPath (Join-Path $stateDir 'gemini-pairing-secret.txt')) -or (Test-Path -LiteralPath (Join-Path $stateDir 'GEMINI-CONNECT.txt'))
    if ($retiredCredentials -or (([bool]$LocalOnly) -ne ($running.tunnelProvider -eq 'local'))) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\windows\Stop-ChatGPT.ps1') -KeepWatchdog
        if ($LASTEXITCODE -ne 0) { throw 'Could not switch UmiBridge connection mode.' }
    }
}

if (-not (Test-Dashboard)) {
    $entry = Join-Path $root 'scripts\run-local-web.mjs'
    $entryPattern = '(?i)^"?[^"\r\n]+?node\.exe"?\s+"?' + [regex]::Escape($entry) + '"?(?:\s|$)'
    $existing = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match $entryPattern })
    if ($existing.Count) {
        Write-Host 'Waiting for the existing gateway to finish starting...'
        for ($readyAttempt = 0; $readyAttempt -lt 90; $readyAttempt++) {
            if (Test-Dashboard) { if (-not $NoDashboard) { Start-Process $dashboard }; exit 0 }
            if (-not (Get-Process -Id $existing[0].ProcessId -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Seconds 1
        }
        if (Get-Process -Id $existing[0].ProcessId -ErrorAction SilentlyContinue) { throw 'The existing gateway is not ready. Use Restart from the UmiBridge tray icon.' }
    }
    $node = Join-Path $root '.runtime\node\node.exe'
    if (-not (Test-Path -LiteralPath $node)) {
        $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($systemNode) { $node = $systemNode.Source }
    }
    if (-not (Test-Path -LiteralPath $node)) { throw 'Node.js was not found. Double-click UmiBridge.cmd first.' }
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    $stdout = Join-Path $stateDir 'server.log'
    $stderr = Join-Path $stateDir 'server-error.log'
    $previousLocalMode = $env:DC_LOCAL_ONLY
    try {
        if ($LocalOnly) { $env:DC_LOCAL_ONLY = '1' } else { $env:DC_LOCAL_ONLY = $null }
        Write-Host 'Starting the hidden gateway and connecting HTTPS...'
        $gatewayProcess = Start-Process -FilePath $node -ArgumentList @('"' + (Join-Path $root 'scripts\run-local-web.mjs') + '"') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    } finally { $env:DC_LOCAL_ONLY = $previousLocalMode }
}

for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if (Test-Dashboard) { if (-not $NoDashboard) { Start-Process $dashboard }; exit 0 }
    if ($gatewayProcess) {
        $gatewayProcess.Refresh()
        if ($gatewayProcess.HasExited) {
            $failure = Get-Content -LiteralPath (Join-Path $stateDir 'server-error.log') -Raw -ErrorAction SilentlyContinue
            if ($failure -match 'TUNNEL_AUTH_REQUIRED') { throw 'TUNNEL_AUTH_REQUIRED: The saved tunnel sign-in was rejected. Retry the connection and complete GitHub sign-in.' }
            if ($failure -match 'Tunnel exited \(') { throw 'TUNNEL_START_FAILED: The HTTPS tunnel stopped before the gateway became ready.' }
            throw 'The gateway process stopped during startup. Check .local-data\server-error.log; no connection keys have been changed.'
        }
    }
    Start-Sleep -Seconds 1
}
throw 'UmiBridge did not start within 60 seconds. Open .local-data\server-error.log for details.'
} finally { if ($startupLock) { $startupLock.Dispose() } }
