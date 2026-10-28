[CmdletBinding()]
param(
    [ValidateSet('start','stop','pair','agent','repair','admin','normal')][string]$Action = 'start',
    [string]$Hub,
    [string]$Name,
    [switch]$NoUpdate,
    [switch]$NoTunnelRepair,
    [switch]$LocalOnly,
    [switch]$TemporaryTunnel,
    [switch]$Monitor
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -le 5) {
    $env:PSModulePath = [IO.Path]::Combine([Environment]::GetFolderPath('System'), 'WindowsPowerShell\v1.0\Modules')
}
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$launcher = Join-Path $PSScriptRoot 'UmiBridge.ps1'
$stateDir = Join-Path $root '.local-data'
[void][IO.Directory]::CreateDirectory($stateDir)
$stopPath = Join-Path $stateDir 'launcher-stop'
$trayState = Join-Path $stateDir 'tray-status.json'
$shell = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
$port = 43127
if ($env:DC_WEB_PORT) { $port = [int]$env:DC_WEB_PORT }
$dashboard = "http://127.0.0.1:$port/admin"
$forward = @{}
foreach ($key in $PSBoundParameters.Keys) { if ($key -ne 'Monitor') { $forward[$key] = $PSBoundParameters[$key] } }
if ($Action -ne 'start' -or $Monitor) {
    if ($Monitor) { $forward['Monitor'] = $true }
    & $launcher @forward
    exit $LASTEXITCODE
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$hash = [Security.Cryptography.SHA256]::Create()
try { $identity = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant())))).Replace('-', '').Substring(0, 24) }
finally { $hash.Dispose() }
$mutex = New-Object Threading.Mutex($false, ('Local\UmiBridge-Tray-' + $identity))
$acquired = $false
try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired) {
    $mutex.Dispose()
    $target = "http://127.0.0.1:$($port + 1)/"
    try { if ((Invoke-WebRequest -Uri $dashboard -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { $target = $dashboard } } catch { }
    Start-Process $target
    exit 0
}

. (Join-Path $PSScriptRoot 'Admin-Mode.ps1') -LibraryOnly
$sid = Get-UmiCurrentSid
$protected = Get-UmiProtectedLayout $sid
$worker = $null
$workerStarted = [DateTime]::MinValue
$attempts = New-Object 'System.Collections.Generic.List[datetime]'
$offlineSince = $null
$lastMessage = ''
$exiting = $false
$dashboardOpened = $false
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 5000
$icon = New-Object Windows.Forms.NotifyIcon
$menu = New-Object Windows.Forms.ContextMenuStrip
$trayIcon = New-Object Drawing.Icon((Join-Path $PSScriptRoot 'UmiBridge.ico'))
$icon.Icon = $trayIcon
$icon.Text = 'UmiBridge - starting'
$icon.ContextMenuStrip = $menu
$icon.Visible = $true
$context = New-Object Windows.Forms.ApplicationContext

function Set-TrayStatus([string]$Message, [bool]$Healthy = $false, [switch]$Notify) {
    $icon.Text = ('UmiBridge - ' + $Message).Substring(0, [Math]::Min(63, 12 + $Message.Length))
    [IO.File]::WriteAllText($trayState, (@{ pid = $PID; healthy = $Healthy; status = $Message; retries = $attempts.Count; updatedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress))
    if ($Notify -and $Message -ne $script:lastMessage) {
        $icon.ShowBalloonTip(5000, 'UmiBridge', $Message, [Windows.Forms.ToolTipIcon]::Info)
    }
    $script:lastMessage = $Message
}

function Start-TrayWorker([switch]$Restart, [switch]$Initial, [switch]$StopOnly) {
    if ($script:worker -and -not $script:worker.HasExited) { return }
    $quotedLauncher = "'" + $launcher.Replace("'", "''") + "'"
    $command = '$env:UMI_STARTUP_PROGRESS = "1"; '
    if ($Restart -or $StopOnly) {
        $command += "& $quotedLauncher -Action stop -KeepWatchdog; if (`$LASTEXITCODE -ne 0) { exit 1 }; "
    }
    if (-not $StopOnly) {
        $command += "& $quotedLauncher -Action start -NoDashboard"
        if (-not $Initial -or $NoUpdate) { $command += ' -NoUpdate' }
        if (-not $Initial -or $NoTunnelRepair) { $command += ' -NoTunnelRepair' }
        if ($LocalOnly) { $command += ' -LocalOnly' }
        if ($TemporaryTunnel) { $command += ' -TemporaryTunnel' }
        $command += '; exit $LASTEXITCODE'
    }
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $shell
    $startInfo.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ' + $encoded
    $startInfo.WorkingDirectory = $root
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $script:worker = [Diagnostics.Process]::Start($startInfo)
    $script:workerStarted = [DateTime]::UtcNow
}

function Open-StartupPage {
    [IO.File]::WriteAllText((Join-Path $stateDir 'startup-progress.json'), '{"state":"starting","step":"Preparing UmiBridge..."}')
    $node = Join-Path $root '.runtime\node\node.exe'
    if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
    if (-not $node) { return }
    $pageUrl = "http://127.0.0.1:$($port + 1)/"
    Start-Process -FilePath $node -ArgumentList @('"' + (Join-Path $root 'scripts\startup-page.mjs') + '"') -WorkingDirectory $root -WindowStyle Hidden | Out-Null
    for ($wait = 0; $wait -lt 20; $wait++) {
        try {
            if ((Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200) {
                Start-Process $pageUrl
                $script:dashboardOpened = $true
                return
            }
        } catch { }
        Start-Sleep -Milliseconds 100
    }
}

function Test-TrayHealth {
    try {
        $health = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/health" -f $port) -UseBasicParsing -TimeoutSec 2
        $page = Invoke-WebRequest -Uri $dashboard -UseBasicParsing -TimeoutSec 2
        return $health.StatusCode -eq 200 -and $page.StatusCode -eq 200
    } catch { return $false }
}

[void]$menu.Items.Add('Open Dashboard', $null, { Start-Process $dashboard })
[void]$menu.Items.Add('System Map', $null, { Start-Process ("http://127.0.0.1:{0}/admin/system-map" -f $port) })
[void]$menu.Items.Add('Restart', $null, {
    try {
        if (Test-UmiModePending $sid) { Set-TrayStatus 'Waiting for Windows authorization' -Notify; return }
        if ($script:worker -and -not $script:worker.HasExited) { Set-TrayStatus 'Operation still running' -Notify; return }
        $attempts.Clear(); $script:offlineSince = $null
        Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
        Open-StartupPage
        Start-TrayWorker -Restart
        Set-TrayStatus 'Restarting' -Notify
    } catch { Set-TrayStatus 'Restart failed. See launcher-error.log' -Notify }
})
[void]$menu.Items.Add('Exit', $null, {
    try {
        if (Test-UmiModePending $sid) { Set-TrayStatus 'Finish Windows authorization before Exit' -Notify; return }
        if ($script:worker -and -not $script:worker.HasExited) { Set-TrayStatus 'Operation still running. Retry Exit shortly' -Notify; return }
        # Stop first; cancellation of an administrator UAC prompt retains tray ownership.
        $script:exiting = $true
        Start-TrayWorker -StopOnly
        Set-TrayStatus 'Stopping' -Notify
    } catch { $script:exiting = $false; Set-TrayStatus 'Stop failed. Gateway retained' -Notify }
})
$icon.Add_DoubleClick({ Start-Process $dashboard })
$timer.Add_Tick({
    try {
        if (Test-Path -LiteralPath $stopPath) { $context.ExitThread(); return }
        $now = [DateTime]::UtcNow
        if ($script:worker) {
            $script:worker.Refresh()
            if (-not $script:worker.HasExited) {
                if (($now - $script:workerStarted).TotalMinutes -ge 5) { Set-TrayStatus 'Startup taking too long. See launcher-error.log' -Notify }
                return
            }
            $exitCode = $script:worker.ExitCode
            $script:worker.Dispose(); $script:worker = $null
            if ($script:exiting) {
                if ($exitCode -eq 0) { [IO.File]::WriteAllText($stopPath, $now.ToString('o')); $context.ExitThread(); return }
                $script:exiting = $false; Set-TrayStatus 'Stop cancelled or failed. Gateway retained' -Notify
            }
            elseif ($exitCode -ne 0 -and -not (Test-TrayHealth)) {
                [IO.File]::WriteAllText((Join-Path $stateDir 'startup-progress.json'), '{"state":"error","step":"Startup failed. See .local-data/launcher-error.log and retry Restart."}')
                Set-TrayStatus 'Startup failed. See launcher-error.log' -Notify
            }
        }
        if (Test-UmiModePending $sid) { $script:offlineSince = $null; Set-TrayStatus 'Waiting for Windows authorization'; return }
        if (Test-TrayHealth) {
            $script:offlineSince = $null; Set-TrayStatus 'Online' $true
            if (-not $script:dashboardOpened) { $script:dashboardOpened = $true; Start-Process $dashboard }
            return
        }
        if (-not $script:offlineSince) { $script:offlineSince = $now }
        if (($now - $script:offlineSince).TotalSeconds -lt 15) { Set-TrayStatus 'Connection interrupted'; return }
        # Three restarts per ten minutes. Never rotate URLs or credentials here.
        while ($attempts.Count -gt 0 -and ($now - $attempts[0]).TotalMinutes -ge 10) { $attempts.RemoveAt(0) }
        if ($attempts.Count -ge 3) { Set-TrayStatus 'Offline. Retry using Restart' -Notify; return }
        $attempts.Add($now); $script:offlineSince = $now
        Start-TrayWorker -Restart
        Set-TrayStatus ('Recovering connection (' + $attempts.Count + '/3)') -Notify
    } catch {
        Add-Content -LiteralPath (Join-Path $stateDir 'launcher-error.log') -Value ([DateTime]::UtcNow.ToString('o') + ' TRAY ' + $_.Exception.Message)
        Set-TrayStatus 'Error. See launcher-error.log' -Notify
    }
})

try {
    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
    Open-StartupPage
    Start-TrayWorker -Initial
    Set-TrayStatus 'Checking startup - see startup window' -Notify
    $timer.Start()
    [Windows.Forms.Application]::Run($context)
} finally {
    $timer.Stop(); $timer.Dispose()
    $icon.Visible = $false; $icon.Dispose(); $trayIcon.Dispose(); $menu.Dispose(); $context.Dispose()
    Remove-Item -LiteralPath $trayState -Force -ErrorAction SilentlyContinue
    if ($acquired) { $mutex.ReleaseMutex() }; $mutex.Dispose()
}
