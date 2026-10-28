[CmdletBinding()]
param(
    [ValidateSet('start','stop','pair','agent','repair','admin','normal')][string]$Action = 'start',
    [string]$Hub,
    [string]$Name,
    [switch]$NoUpdate,
    [switch]$NoTunnelRepair,
    [switch]$LocalOnly,
    [switch]$TemporaryTunnel,
    [switch]$Monitor,
    [switch]$NoDashboard,
    [switch]$KeepWatchdog,
    [switch]$CheckOnly,
    [switch]$Recovery
)

if ($PSVersionTable.PSVersion.Major -le 5) {
    $env:PSModulePath = [IO.Path]::Combine([Environment]::GetFolderPath('System'), 'WindowsPowerShell\v1.0\Modules')
}
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = $projectRoot
Set-Location -LiteralPath $root
$stateDir = Join-Path $root '.local-data'
$logPath = Join-Path $stateDir 'launcher-error.log'
$statusPath = Join-Path $stateDir 'web-status.json'
$port = 43127
if ($env:DC_WEB_PORT) { $port = [int]$env:DC_WEB_PORT }
$adminHelper = Join-Path $root 'scripts\windows\Admin-Mode.ps1'
$protectedRoot = Join-Path (Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'UmiBridge') ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
$protectedState = Join-Path $protectedRoot 'app\.local-data'

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
. (Join-Path $PSScriptRoot 'Runtime-Health.ps1')

function Write-LauncherLog([string]$Message) {
    $stamp = (Get-Date).ToString('s')
    Add-Content -LiteralPath $logPath -Value "$stamp $Message" -Encoding utf8
}

function Write-StartupProgress([string]$Step, [string]$State = 'starting', [string]$Reason = '') {
    $progressFile = Join-Path $root '.local-data\startup-progress.json'
    $json = @{ state = $State; step = $Step; reason = $Reason } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($progressFile, $json, [Text.UTF8Encoding]::new($false))
    Write-Host $Step
}

function Get-UsableNode {
    $minimum = [version]'22.12.0'
    $local = Join-Path $root '.runtime\node\node.exe'
    $candidates = @()
    if (Test-Path -LiteralPath $local) { $candidates += $local }
    $system = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($system) { $candidates += $system.Source }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        try {
            $raw = (& $candidate --version 2>$null | Select-Object -First 1).ToString().Trim()
            if ($raw -match '^v(?<version>\d+\.\d+\.\d+)' -and ([version]$Matches.version -ge $minimum)) {
                return $candidate
            }
        } catch { }
    }
    return $null
}

function Get-TunnelConfig {
    $path = Join-Path $stateDir 'tunnel-config.json'
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try { $config = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json } catch { throw 'tunnel-config.json is unreadable. Run stable tunnel setup again.' }
    if ($config.provider -ne 'devtunnel' -or $config.tunnelId -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]{2,99}$' -or [int]$config.port -ne $port) {
        throw 'tunnel-config.json does not match the current port. Run stable tunnel setup again.'
    }
    return $config
}

function Get-RunningStatus {
    if (-not (Test-Path -LiteralPath $statusPath)) { return $null }
    try {
        $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        Get-Process -Id ([int]$status.pid) -ErrorAction Stop | Out-Null
        $health = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/health" -f $port) -UseBasicParsing -TimeoutSec 2
        if ($health.StatusCode -eq 200) { return $status }
    } catch { }
    return $null
}

function Assert-BridgeReady {
    Write-Host 'Checking gateway and dashboard before closing startup...'
    $health = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/health" -f $port) -UseBasicParsing -TimeoutSec 5
    $page = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/admin" -f $port) -UseBasicParsing -TimeoutSec 5
    if ($health.StatusCode -ne 200 -or $page.StatusCode -ne 200) { throw 'Gateway or dashboard is not ready.' }
    # Starting/recovering the gateway never probes the desktop. Full probes are opt-in.
    if (-not $CheckOnly) { return }
    Write-StartupProgress 'Đang kiểm tra công cụ tệp, terminal và Windows trên gateway...'
    for ($repairAttempt = 0; $repairAttempt -lt 2; $repairAttempt++) {
        $check = $null
        try { $check = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/admin/api/tools/check" -f $port) -Method Post -Headers @{'X-DC-Admin-Action'='1'} -ContentType 'application/json' -Body '{"repair":true}' -TimeoutSec 180 }
        catch { Write-LauncherLog 'TOOL_CHECK_FAILED gateway tool probe did not finish' }
        $expectedRoot = if ($script:stateDir -eq $protectedState) { Join-Path $protectedRoot 'app' } else { $root }
        if ($check -and $check.installationRoot -ne $expectedRoot) { throw 'This port belongs to another UmiBridge installation. Stop that instance before starting this one.' }
        if ($check.critical.ready) {
            Write-StartupProgress ("Đã kiểm tra {0} phép thử; {1} phép thử đã tự khôi phục. Đang mở dashboard..." -f $check.summary.passed, $check.summary.recovered)
            return
        }
        if ($repairAttempt -or $script:stateDir -eq $protectedState) { throw 'Công cụ vẫn chưa sẵn sàng sau kiểm tra. Xem Bộ công cụ để biết thành phần lỗi.' }
        if (Test-UmiWorkActive $port) { throw 'Cần sửa runtime, nhưng có nhiệm vụ đang chạy. Chờ công việc kết thúc rồi bấm Repair.' }
        Write-StartupProgress 'Đang tự sửa runtime công cụ và kiểm tra lại một lần...'
        Stop-Bridge
        Invoke-PowerShellScript (Join-Path $root 'scripts\windows\Setup-Local.ps1') @('-SkipCloudflared','-NoBrowser','-Repair')
        $repairStartArgs = @('-NoDashboard')
        if ($LocalOnly) { $repairStartArgs += '-LocalOnly' }
        Invoke-PowerShellScript (Join-Path $root 'scripts\windows\Start-UmiBridge.ps1') $repairStartArgs
    }
}

function Watch-Requests {
    $lastRequestId = $null
    $lastState = $null
    $hasSeenHistory = $false
    Write-Host ''
    Write-Host 'Monitoring gateway requests. Press Ctrl+C to stop watching.' -ForegroundColor Cyan
    Write-Host 'The gateway stays in the background; use UmiBridge.cmd -Action stop when you want to stop it.' -ForegroundColor DarkGray
    while ($true) {
        # Monitoring reads data only; OS/task authority is checked by the native
        # helper before any privileged startup. Follow mode switches without
        # replacing the user's one visible monitoring window.
        $watchAdmin = $false
        try {
            $watchManifest = Get-Content -LiteralPath (Join-Path $protectedRoot 'mode.json') -Raw -ErrorAction Stop | ConvertFrom-Json
            $watchAdmin = $watchManifest.phase -eq 'active'
        } catch { }
        $watchState = if ($watchAdmin) { $protectedState } else { Join-Path $root '.local-data' }
        $script:stateDir = $watchState
        $script:statusPath = Join-Path $watchState 'web-status.json'
        $historyPath = Join-Path $watchState 'request-history.jsonl'
        $running = Get-RunningStatus
        $state = if ($running) { 'online' } else { 'offline' }
        if ($state -ne $lastState) {
            if ($running) {
                $provider = if ($running.tunnelProvider) { [string]$running.tunnelProvider } else { 'local' }
                Write-Host ("[{0}] gateway online ({1})" -f (Get-Date).ToString('HH:mm:ss'), $provider) -ForegroundColor Green
            } else {
                Write-Host ("[{0}] gateway offline; waiting for it to return" -f (Get-Date).ToString('HH:mm:ss')) -ForegroundColor Yellow
            }
            $lastState = $state
        }
        if (Test-Path -LiteralPath $historyPath) {
            try {
                $line = Get-Content -LiteralPath $historyPath -Tail 1 -ErrorAction Stop
                if ($line) {
                    $entry = $line | ConvertFrom-Json
                    if ($entry.id -and $entry.id -ne $lastRequestId) {
                        $status = if ($entry.status) { [string]$entry.status } else { 'unknown' }
                        $tool = if ($entry.toolName) { [string]$entry.toolName } else { 'request' }
                        $time = (Get-Date).ToString('HH:mm:ss')
                        try { $time = ([datetime]$entry.timestamp).ToLocalTime().ToString('HH:mm:ss') } catch { }
                        $kind = if ($hasSeenHistory) { 'request' } else { 'last' }
                        Write-Host ("[{0}] {1} {2} - {3}" -f $time, $kind, $tool, $status) -ForegroundColor White
                        $lastRequestId = [string]$entry.id
                        $hasSeenHistory = $true
                    }
                }
            } catch { }
        }
        Start-Sleep -Seconds 2
    }
}

function Invoke-PowerShellScript([string]$Path, [string[]]$Arguments = @(), [switch]$Quiet) {
    if ($Recovery -and [IO.Path]::GetFileName($Path) -eq 'Setup-Stable-Connection.ps1') { $Arguments += '-NoLogin' }
    if ($Quiet) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments *> $null }
    else { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments }
    if ($LASTEXITCODE -ne 0) {
        $scriptName = [IO.Path]::GetFileName($Path)
        if ($scriptName -eq 'Start-UmiBridge.ps1') {
            $failure = Get-Content -LiteralPath (Join-Path $stateDir 'server-error.log') -Raw -ErrorAction SilentlyContinue
            if ($failure -match 'TUNNEL_AUTH_REQUIRED') { throw 'TUNNEL_AUTH_REQUIRED: Phiên đăng nhập tunnel đã hết hạn hoặc bị từ chối. Bấm Thử lại kết nối và hoàn tất đăng nhập GitHub nếu được yêu cầu.' }
            if ($failure -match 'Tunnel exited|tunnel did not return a URL') { throw 'TUNNEL_START_FAILED: Chưa kết nối được máy chủ tunnel. Kiểm tra Internet rồi bấm Thử lại kết nối. URL và khóa kết nối đã được giữ nguyên.' }
        }
        if ($scriptName -eq 'Setup-Stable-Connection.ps1') {
            try { $setupFailure = Get-Content -LiteralPath (Join-Path $stateDir 'tunnel-setup-error.json') -Raw | ConvertFrom-Json } catch { $setupFailure = $null }
            if ($setupFailure.reason -eq 'tunnel_auth_required') { throw ('TUNNEL_AUTH_REQUIRED: ' + $setupFailure.step) }
            throw 'TUNNEL_SETUP_FAILED: Không kiểm tra được kết nối tunnel đã lưu. Kiểm tra Internet rồi bấm Thử lại kết nối.'
        }
        throw "Script failed: $scriptName."
    }
}

function Stop-Bridge {
    $stop = Join-Path $root 'scripts\windows\Stop-ChatGPT.ps1'
    if (Test-Path -LiteralPath $stop) {
        $stopArgs = @()
        if ($Action -eq 'start' -or $KeepWatchdog) { $stopArgs += '-KeepWatchdog' }
        Invoke-PowerShellScript $stop $stopArgs
    }
}

function Test-DevTunnelLogin([string]$Cli, $Config) {
    if (-not (Test-Path -LiteralPath $Cli)) { return $false }
    # `user show` can remain successful after the access token has expired.
    # Probe the configured tunnel API instead so the launcher can repair the
    # login before falling back to a temporary URL.
    try {
        & $Cli show ([string]$Config.tunnelId) --json *> $null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Test-DevTunnelPort([string]$Cli, $Config) {
    if (-not $Config.port) { return $false }
    try {
        & $Cli port show ([string]$Config.tunnelId) -p ([string]$Config.port) --json *> $null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Update-Source {
    if ($NoUpdate) { return $false }
    if (Test-Path -LiteralPath (Join-Path $root '.local-data\installed-release.json')) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\windows\Install-UmiBridge.ps1') -InstallDirectory $root -SourceOnly | Out-Host
        if ($LASTEXITCODE -eq 10) { return $true }
        if ($LASTEXITCODE -ne 0) { Write-Host 'Release update did not complete; continuing with the installed source.' }
        return $false
    }
    if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) { return $false }
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if (-not $git) { Write-Host 'Git is not available; skipping source update.'; return $false }
    try {
        $branch = (& $git.Source branch --show-current 2>$null | Select-Object -First 1).ToString().Trim()
        if (-not $branch) { Write-Host 'Detached HEAD; skipping automatic source update.'; return $false }
        $dirty = (& $git.Source status --porcelain --untracked-files=all 2>$null | Out-String).Trim()
        if ($dirty) { Write-Host 'Local source changes found; keeping them and skipping update.'; return $false }
        & $git.Source fetch --all --prune --quiet 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Host 'Git fetch failed; continuing with the local source.'; return $false }
        $upstream = (& $git.Source rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null | Select-Object -First 1).ToString().Trim()
        if (-not $upstream) { return $false }
        $behindText = (& $git.Source rev-list --count ("HEAD.." + $upstream) 2>$null | Select-Object -First 1).ToString().Trim()
        $behind = 0
        if ([int]::TryParse($behindText, [ref]$behind) -and $behind -gt 0) {
            Write-Host ("Updating {0} commit from {1}..." -f $behind, $upstream)
            & $git.Source pull --ff-only --quiet 2>$null
            if ($LASTEXITCODE -ne 0) { throw 'Git fast-forward failed.' }
            Write-Host 'Source updated.' -ForegroundColor Green
            return $true
        }
    } catch {
        Write-LauncherLog ('UPDATE_SKIPPED ' + $_.Exception.Message)
        Write-Host 'Automatic update did not complete; keeping the local source.'
    }
    return $false
}

function Test-ProjectRuntime {
    $node = Get-UsableNode
    $sdk = Test-Path -LiteralPath (Join-Path $root 'node_modules\@modelcontextprotocol\sdk\package.json')
    $tokenizer = Test-Path -LiteralPath (Join-Path $root 'node_modules\js-tiktoken\package.json')
    if (-not $node -or -not $sdk -or -not $tokenizer) { Write-LauncherLog 'RUNTIME_MISSING node/sdk/tokenizer'; return $false }
    foreach ($dependency in @('@umibridge\desktop-tools', '@desktop-commander\telemetry-contract', 'exceljs', 'md-to-pdf', 'pizzip')) {
        if (-not (Test-Path -LiteralPath (Join-Path $root ('node_modules\' + $dependency + '\package.json')))) {
            Write-LauncherLog 'RUNTIME_MISSING bundled desktop dependencies'; return $false
        }
    }
    $windowsPython = Join-Path $root '.runtime\windows-tools\Scripts\python.exe'
    $windowsManifest = Join-Path $root '.runtime\windows-tools\umibridge-ready.json'
    if (-not (Test-Path -LiteralPath $windowsPython) -or -not (Test-Path -LiteralPath $windowsManifest)) { Write-LauncherLog 'RUNTIME_MISSING windows-tools'; return $false }
    try {
        $installed = Get-Content -LiteralPath $windowsManifest -Raw | ConvertFrom-Json
        $lockHash = (Get-FileHash -LiteralPath (Join-Path $root 'scripts\windows-tools-requirements.txt') -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($installed.version -ne '0.8.8' -or $installed.lock_sha256 -ne $lockHash -or $installed.source_commit -ne 'e28abb5c6934cb3427190bdb970e02644c915ae3') { Write-LauncherLog 'RUNTIME_MISMATCH windows-tools manifest'; return $false }
        if (-not (Test-Path -LiteralPath (Join-Path $root '.runtime\windows-mcp-source\src\windows_mcp\__main__.py'))) { Write-LauncherLog 'RUNTIME_MISSING windows-mcp source'; return $false }
    } catch { Write-LauncherLog ('RUNTIME_CHECK_FAILED ' + $_.Exception.Message); return $false }
    $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) { Write-LauncherLog 'RUNTIME_MISSING npm.cmd'; return $false }
    $env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
    $preflightLog = Join-Path $stateDir 'launcher-preflight.log'
    & $npm run build --silent *> $preflightLog
    if ($LASTEXITCODE -ne 0) { Write-LauncherLog 'RUNTIME_BUILD_FAILED see launcher-preflight.log'; return $false }
    # Syntax-only checks cannot detect missing packages after a ZIP update.
    & $node --input-type=module -e "await import('./scripts/local-web-gateway.mjs')" *>> $preflightLog
    if ($LASTEXITCODE -ne 0) { Write-LauncherLog 'RUNTIME_IMPORT_FAILED see launcher-preflight.log' }
    return $LASTEXITCODE -eq 0
}

try {
    Write-StartupProgress 'Đang kiểm tra quyền và chế độ chạy Windows...'
    if ($Action -eq 'stop' -and -not $KeepWatchdog) { [IO.File]::WriteAllText((Join-Path $stateDir 'launcher-stop'), [DateTime]::UtcNow.ToString('o')) }
    if ($Action -in @('admin', 'normal')) {
        $requestedMode = if ($Action -eq 'admin') { 'enable' } else { 'disable' }
        Invoke-PowerShellScript $adminHelper @('-Action', $requestedMode, '-SourceRoot', $root)
        if ($Action -eq 'normal') { exit 0 }
        $Action = 'start'
    }
    $modeOutput = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $adminHelper -Action status -SourceRoot $root
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify Windows privilege mode. Your saved connection has not been changed.' }
    $privilegeMode = $modeOutput | ConvertFrom-Json
    if ($privilegeMode.capability -eq 'integrity-error') { throw 'The protected Admin installation failed verification. Reauthorize Admin mode before starting it.' }
    if ($CheckOnly) {
        if ($privilegeMode.installed) { $script:stateDir = $protectedState; $script:statusPath = Join-Path $stateDir 'web-status.json' }
        Assert-BridgeReady
        Write-StartupProgress 'Gateway và công cụ đã kiểm tra xong, sẵn sàng làm việc.' 'ready'
        exit 0
    }
    if ($privilegeMode.installed) {
        if ($Action -eq 'stop') {
            Invoke-PowerShellScript $adminHelper @('-Action', 'stop', '-SourceRoot', $root)
            exit 0
        }
        if ($Action -ne 'start' -or $LocalOnly -or $TemporaryTunnel) {
            throw 'Switch to Normal mode with UmiBridge.cmd -Action normal before changing the protected connection or device mode.'
        }
        Write-Host 'UmiBridge Sakura Console - Administrator' -ForegroundColor Cyan
        Invoke-PowerShellScript $adminHelper @('-Action', 'start', '-SourceRoot', $root)
        Write-Host 'Using the authorized protected installation; URL and OAuth are preserved.' -ForegroundColor Green
        if ($privilegeMode.needsUpdate) { Write-Host 'A source update is available. Switch to Normal and authorize Admin again to update its protected copy.' -ForegroundColor Yellow }
        $script:stateDir = $protectedState
        $script:statusPath = Join-Path $stateDir 'web-status.json'
        Assert-BridgeReady
        Write-StartupProgress 'Gateway và dashboard đã sẵn sàng.' 'ready'
        if (-not $NoDashboard) { Start-Process ("http://127.0.0.1:{0}/admin" -f $port) }
        if ($Monitor) { Watch-Requests }
        exit 0
    }
    if ($Action -ne 'start') {
        switch ($Action) {
            'stop' { Stop-Bridge }
            'repair' { Invoke-PowerShellScript (Join-Path $root 'scripts\windows\Setup-Stable-Connection.ps1') }
            'pair' {
                $pairArgs = @()
                if ($Hub) { $pairArgs += @('-Hub', $Hub) }
                if ($Name) { $pairArgs += @('-Name', $Name) }
                Invoke-PowerShellScript (Join-Path $root 'scripts\windows\Pair-Agent.ps1') $pairArgs
            }
            'agent' { Invoke-PowerShellScript (Join-Path $root 'scripts\windows\UmiBridge-Agent.ps1') }
        }
        exit 0
    }
    if ((Test-Path -LiteralPath (Join-Path $stateDir 'agent-config.json')) -and -not (Test-Path -LiteralPath (Join-Path $stateDir 'tunnel-config.json')) -and -not $env:DC_PUBLIC_URL) {
        Invoke-PowerShellScript (Join-Path $root 'scripts\windows\UmiBridge-Agent.ps1')
        exit 0
    }
    Write-Host 'UmiBridge Sakura Console - one-click start' -ForegroundColor Cyan
    Write-StartupProgress 'Đang kiểm tra bản cập nhật...'
    $workActive = Test-UmiWorkActive $port
    $updated = $false
    if ($workActive) { Write-StartupProgress 'Có công việc đang chạy. Giữ phiên hiện tại và kiểm tra công cụ, cập nhật sau.' }
    else { $updated = Update-Source }
    Write-StartupProgress 'Đang kiểm tra runtime và dependency...'
    $stable = Get-TunnelConfig
    $cloudflared = Test-Path -LiteralPath (Join-Path $root 'local-bin\cloudflared.exe')
    $externalUrl = -not [string]::IsNullOrWhiteSpace($env:DC_PUBLIC_URL)
    $needsTunnelBinary = $TemporaryTunnel -and -not $LocalOnly -and -not $externalUrl -and -not $cloudflared

    $runtimeReady = Test-ProjectRuntime
    if ($updated -or -not $runtimeReady -or $needsTunnelBinary) {
        if ($workActive) { throw 'Có công việc đang chạy. Chờ nhiệm vụ kết thúc trước khi sửa runtime.' }
        if (Get-RunningStatus) { Stop-Bridge }
        Write-Host 'Checking or repairing the runtime and dependencies...'
        Write-StartupProgress 'Đang cài hoặc sửa runtime. Bước này có thể mất vài phút...'
        $setup = Join-Path $root 'scripts\windows\Setup-Local.ps1'
        $setupArgs = @()
        if (Get-NetTCPConnection -LocalPort ($port+1) -State Listen -ErrorAction SilentlyContinue) { $setupArgs += '-NoBrowser' }
        if (-not $TemporaryTunnel -or $stable -or $externalUrl -or $LocalOnly) { $setupArgs += '-SkipCloudflared' }
        Invoke-PowerShellScript $setup $setupArgs
        $stable = Get-TunnelConfig
        $runtimeReady = Test-ProjectRuntime
    }
    if (-not $runtimeReady) { throw 'UmiBridge build still fails after runtime repair.' }

    if (-not $LocalOnly -and -not $externalUrl -and -not $TemporaryTunnel -and -not $stable) {
        Write-StartupProgress 'Đang đăng ký tunnel. Hoàn tất đăng nhập trên tab được mở...'
        Write-Host 'Setting up your reusable connection once...'
        Invoke-PowerShellScript (Join-Path $root 'scripts\windows\Setup-Stable-Connection.ps1')
        $stable = Get-TunnelConfig
        if (-not $stable) { throw 'The reusable connection could not be saved. Your existing keys were not changed.' }
    }
    # A temporary URL is an explicit advanced choice, never an automatic fallback.
    $fallbackTunnel = [bool]$TemporaryTunnel
    if (-not $LocalOnly -and -not $externalUrl -and -not $NoTunnelRepair -and -not $TemporaryTunnel -and $stable) {
        Write-StartupProgress 'Đang kiểm tra kết nối tunnel đã lưu...'
        $devtunnel = Join-Path $root '.runtime\devtunnel\devtunnel.exe'
        if (Test-DevTunnelLogin $devtunnel $stable) {
            if (Test-DevTunnelPort $devtunnel $stable) {
                Write-Host 'Reusing the saved persistent tunnel and host.'
            } else {
                try {
                    Write-Host 'Checking or repairing the persistent tunnel and host...'
                    Invoke-PowerShellScript (Join-Path $root 'scripts\windows\Setup-Stable-Connection.ps1') -Quiet
                    $stable = Get-TunnelConfig
                } catch {
                    Write-LauncherLog ('STABLE_TUNNEL_FAILED ' + $_.Exception.Message)
                    if ($_.Exception.Message -match '^TUNNEL_AUTH_REQUIRED:') { throw }
                    throw 'Persistent connection repair failed. The saved URL and keys have been kept. Check the network and reopen UmiBridge.cmd; a temporary link was not created.'
                }
            }
        } else {
            try {
                Write-Host 'Refreshing the persistent tunnel login...'
                Invoke-PowerShellScript (Join-Path $root 'scripts\windows\Setup-Stable-Connection.ps1') -Quiet
                $stable = Get-TunnelConfig
            } catch {
                Write-LauncherLog ('STABLE_TUNNEL_LOGIN_UNAVAILABLE ' + $_.Exception.Message)
                if ($_.Exception.Message -match '^TUNNEL_AUTH_REQUIRED:') { throw }
                throw 'Persistent tunnel sign-in could not be refreshed. The saved URL and keys have been kept. Reopen UmiBridge.cmd to retry; a temporary link was not created.'
            }
        }
    }

    $running = Get-RunningStatus
    $mustRestart = $updated
    if ($running) {
        if ($LocalOnly -and $running.tunnelProvider -ne 'local') { $mustRestart = $true }
        elseif ($fallbackTunnel -and $running.tunnelProvider -eq 'devtunnel') { $mustRestart = $true }
        elseif (-not $LocalOnly -and $stable -and -not $fallbackTunnel -and $running.tunnelProvider -ne 'devtunnel') { $mustRestart = $true }
        elseif (-not $LocalOnly -and -not $stable -and $running.tunnelProvider -eq 'local') { $mustRestart = $true }
        elseif ($stable -and -not $fallbackTunnel -and $running.publicUrl -and $stable.publicUrl -and $running.publicUrl -ne $stable.publicUrl) { $mustRestart = $true }
    }
    if ($mustRestart) {
        if (Test-UmiWorkActive $port) { throw 'Có nhiệm vụ đang chạy. Giữ kết nối hiện tại đến khi nhiệm vụ kết thúc.' }
        Write-Host 'Restarting the gateway with the current source and connection...'
        Stop-Bridge
    }

    Write-StartupProgress 'Đang mở gateway và kết nối HTTPS...'
    $start = Join-Path $root 'scripts\windows\Start-UmiBridge.ps1'
    $startArgs = @()
    if ($NoDashboard) { $startArgs += '-NoDashboard' }
    if ($LocalOnly) { $startArgs += '-LocalOnly' }
    $previousDisableSavedTunnel = $env:DC_DISABLE_SAVED_TUNNEL
    try {
        if ($fallbackTunnel) { $env:DC_DISABLE_SAVED_TUNNEL = '1' }
        try {
            Invoke-PowerShellScript $start $startArgs
        } catch {
            $failure = Get-Content -LiteralPath (Join-Path $stateDir 'server-error.log') -Raw -ErrorAction SilentlyContinue
            if (-not $LocalOnly -and -not $NoTunnelRepair -and -not $externalUrl -and -not $fallbackTunnel -and $stable -and $failure -match 'Tunnel exited \(|TUNNEL_AUTH_REQUIRED') {
                Write-Host 'The saved tunnel could not host this session. Repairing it once without changing the URL or keys...' -ForegroundColor Yellow
                Invoke-PowerShellScript (Join-Path $root 'scripts\windows\Setup-Stable-Connection.ps1') -Quiet
                Invoke-PowerShellScript $start $startArgs
            } else { throw }
        }
    } finally {
        $env:DC_DISABLE_SAVED_TUNNEL = $previousDisableSavedTunnel
    }

    Write-Host ''
    Assert-BridgeReady
    Write-StartupProgress 'Gateway và dashboard đã sẵn sàng.' 'ready'
    Write-Host 'UmiBridge is ready.' -ForegroundColor Green
    Write-Host ("Dashboard: http://127.0.0.1:{0}/admin" -f $port)
    Write-Host 'ChatGPT uses this gateway; there is no provider mode to choose.'
    Write-Host 'The gateway runs in the background. Use the UmiBridge tray icon to open, restart or exit.'
    if ($Monitor) { Watch-Requests }
} catch {
    $message = $_.Exception.Message
    Write-LauncherLog ('ERROR ' + $message)
    $reason = if ($message -match '^TUNNEL_AUTH_REQUIRED:') { 'tunnel_auth_required' } elseif ($message -match '^TUNNEL_') { 'tunnel_unavailable' } else { 'startup_failed' }
    Write-StartupProgress $message 'error' $reason
    Write-Host ('UmiBridge could not start: ' + $message) -ForegroundColor Red
    exit 1
}
