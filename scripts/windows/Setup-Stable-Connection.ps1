[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 43127,
    [switch]$Launch,
    [switch]$NoLogin
)

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $projectRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if (-not $PSBoundParameters.ContainsKey('Port') -and $env:DC_WEB_PORT) {
    $Port = [int]$env:DC_WEB_PORT
    if ($Port -lt 1024 -or $Port -gt 65535) { throw 'DC_WEB_PORT must be between 1024 and 65535.' }
}

$runtimeDir = Join-Path $projectRoot '.runtime\devtunnel'
$cli = Join-Path $runtimeDir 'devtunnel.exe'
$stateDir = Join-Path $projectRoot '.local-data'
$configPath = Join-Path $stateDir 'tunnel-config.json'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
Remove-Item -LiteralPath (Join-Path $stateDir 'tunnel-setup-error.json') -Force -ErrorAction SilentlyContinue
trap {
    $needsLogin = $_.Exception.Message -match '^TUNNEL_AUTH_REQUIRED:'
    $step = if ($needsLogin) { 'Cần đăng nhập lại GitHub cho tunnel. Bấm Thử lại kết nối và hoàn tất đăng nhập trên tab được mở.' } else { 'Không kiểm tra được tunnel đã lưu. Kiểm tra kết nối Internet rồi thử lại.' }
    $failure = @{state='error';step=$step;reason=$(if($needsLogin){'tunnel_auth_required'}else{'tunnel_unavailable'})} | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $stateDir 'tunnel-setup-error.json'), $failure, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $stateDir 'startup-progress.json'), $failure, [Text.UTF8Encoding]::new($false))
    Write-Host $step
    exit 1
}

function Assert-MicrosoftBinary([string]$Path) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') {
        throw 'The Dev Tunnels executable does not have a valid Microsoft signature. Setup stopped.'
    }
}

# Capture CLI output locally: tunnel responses can include access tokens.
function Invoke-Tunnel([string[]]$CliArgs, [switch]$NoRefresh) {
    if ($NoLogin -and $CliArgs[0] -eq 'user' -and $CliArgs[1] -eq 'login') { throw 'TUNNEL_AUTH_REQUIRED: Background recovery cannot complete interactive sign-in.' }
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        if ($CliArgs[0] -eq 'user' -and $CliArgs[1] -eq 'login' -and $env:UMI_STARTUP_PROGRESS -eq '1') {
            $loginOut = Join-Path $stateDir 'tunnel-device-login.stdout'
            $loginErr = Join-Path $stateDir 'tunnel-device-login.stderr'
            try {
                $loginProcess = Start-Process -FilePath $cli -ArgumentList @('user','login','-g','-d') -WindowStyle Hidden -RedirectStandardOutput $loginOut -RedirectStandardError $loginErr -PassThru
                $null = $loginProcess.Handle
                $deadline = [DateTime]::UtcNow.AddMinutes(5)
                while (-not $loginProcess.WaitForExit(1000)) {
                    if ([DateTime]::UtcNow -gt $deadline) { $loginProcess.Kill(); $loginProcess.WaitForExit(); throw 'TUNNEL_AUTH_REQUIRED: Tunnel login timed out. Retry the connection to sign in.' }
                    $loginText = (Get-Content -LiteralPath $loginOut,$loginErr -Raw -ErrorAction SilentlyContinue) -join "`n"
                    if ($loginText -match '\b[A-Z0-9]{4}-[A-Z0-9]{4}\b') {
                        $progress = @{ state='auth'; step='Đăng nhập GitHub để kết nối tunnel'; authUrl='https://github.com/login/device'; authCode=$Matches[0] } | ConvertTo-Json -Compress
                        [IO.File]::WriteAllText((Join-Path $stateDir 'startup-progress.json'), $progress, [Text.UTF8Encoding]::new($false))
                    }
                }
                $code = $loginProcess.ExitCode
                if ($code -ne 0) { throw 'TUNNEL_AUTH_REQUIRED: GitHub sign-in was not completed.' }
                $output = @((Get-Content -LiteralPath $loginOut -Raw), (Get-Content -LiteralPath $loginErr -Raw))
                $progress = @{ state='starting'; step='Tunnel sign-in finished. Checking connection...' } | ConvertTo-Json -Compress
                [IO.File]::WriteAllText((Join-Path $stateDir 'startup-progress.json'), $progress)
            } finally {
                if ($loginProcess) { $loginProcess.Dispose() }
                Remove-Item -LiteralPath $loginOut,$loginErr -Force -ErrorAction SilentlyContinue
            }
        } elseif ($CliArgs[0] -eq 'user' -and $CliArgs[1] -eq 'login') {
            $output = @(& $cli @CliArgs 2>&1)
            $code = $LASTEXITCODE
        } else {
            $probeId = [guid]::NewGuid().ToString('N')
            $probeOut = Join-Path $stateDir ($probeId + '.stdout')
            $probeErr = Join-Path $stateDir ($probeId + '.stderr')
            try {
                $probe = Start-Process -FilePath $cli -ArgumentList $CliArgs -WindowStyle Hidden -RedirectStandardOutput $probeOut -RedirectStandardError $probeErr -PassThru
                $null = $probe.Handle
                if (-not $probe.WaitForExit(60000)) {
                    $probe.Kill(); $probe.WaitForExit()
                    throw 'Dev Tunnels did not respond within 60 seconds. Check the network and retry startup.'
                }
                $code = $probe.ExitCode
                $output = @((Get-Content -LiteralPath $probeOut -Raw), (Get-Content -LiteralPath $probeErr -Raw))
            } finally {
                if ($probe) { $probe.Dispose() }
                Remove-Item -LiteralPath $probeOut,$probeErr -Force -ErrorAction SilentlyContinue
            }
        }
    } finally { $ErrorActionPreference = $oldPreference }
    if ($CliArgs[0] -eq 'user' -and $CliArgs[1] -eq 'login' -and $code -ne 0) { throw 'TUNNEL_AUTH_REQUIRED: GitHub sign-in was not completed.' }
    $result = [pscustomobject]@{ ExitCode = $code; Text = ($output -join "`n") }
    # Credentials can expire between any two API calls, including port update.
    # Retry only an explicit authentication rejection, once per setup run.
    if (-not $NoRefresh -and $CliArgs[0] -ne 'user' -and $code -ne 0 -and
        $result.Text -match '(?i)login token expired|authentication token expired|unauthorized|not authenticated' -and
        -not $script:tunnelLoginRefreshed) {
        $script:tunnelLoginRefreshed = $true
        Write-Host 'Refreshing the saved Dev Tunnels sign-in...'
        $login = Invoke-Tunnel -CliArgs @('user', 'login', '-g') -NoRefresh
        if ($login.ExitCode -ne 0) {
            throw 'Dev Tunnels sign-in could not be refreshed. Check the network and approve the GitHub sign-in if prompted, then reopen UmiBridge.cmd. Your saved connection is unchanged.'
        }
        return Invoke-Tunnel -CliArgs $CliArgs -NoRefresh
    }
    return $result
}

function Read-TunnelJson($Result, [string]$Operation) {
    if ($Result.ExitCode -ne 0) { throw "$Operation failed. Check your network and Dev Tunnels sign-in, then run setup again." }
    try { return $Result.Text | ConvertFrom-Json } catch { throw "$Operation returned an unexpected response. No configuration was changed." }
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $cli)) {
    Write-Host 'Downloading the official Microsoft Dev Tunnels client...'
    $download = Join-Path $runtimeDir ('devtunnel-' + [guid]::NewGuid().ToString('N') + '.exe')
    try {
        Invoke-WebRequest -Uri 'https://aka.ms/TunnelsCliDownload/win-x64' -OutFile $download -UseBasicParsing
        Assert-MicrosoftBinary $download
        Move-Item -LiteralPath $download -Destination $cli
    } finally {
        if (Test-Path -LiteralPath $download) { Remove-Item -LiteralPath $download -Force }
    }
}
Assert-MicrosoftBinary $cli

$userStatus = Invoke-Tunnel -CliArgs @('user', 'show', '--json')
if ($userStatus.ExitCode -ne 0) {
    Write-Host 'A GitHub sign-in page will open. Approve Microsoft Dev Tunnels to continue.'
    $login = Invoke-Tunnel -CliArgs @('user', 'login', '-g')
    if ($login.ExitCode -ne 0) { throw 'GitHub sign-in did not finish. Run setup again when you are ready.' }
}

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
& (Join-Path $projectRoot 'scripts\protect-local-data.ps1') -Path $stateDir
$hash = [Security.Cryptography.SHA256]::Create()
try {
    $rootBytes = [Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($projectRoot).TrimEnd('\').ToLowerInvariant())
    $tunnelId = 'umibridge-' + ([BitConverter]::ToString($hash.ComputeHash($rootBytes)).Replace('-', '').ToLowerInvariant().Substring(0, 12))
} finally { $hash.Dispose() }

if (Test-Path -LiteralPath $configPath) {
    try { $saved = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } catch { throw 'The existing tunnel-config.json is invalid. Repair it before running setup again.' }
    if ($saved.provider -eq 'devtunnel' -and $saved.tunnelId -match '^[a-zA-Z0-9][a-zA-Z0-9.-]{2,99}$') {
        $tunnelId = [string]$saved.tunnelId
        if (-not $PSBoundParameters.ContainsKey('Port') -and -not $env:DC_WEB_PORT) {
            $Port = [int]$saved.port
            if ($Port -lt 1024 -or $Port -gt 65535) { throw 'The saved tunnel port is invalid.' }
        }
    }
}

Write-Host 'Preparing the persistent UmiBridge tunnel. Your existing projects are not changed.'
$existing = Invoke-Tunnel -CliArgs @('show', $tunnelId, '--json')
# Invoke-Tunnel also handles a login token expired during later port operations.
if ($existing.ExitCode -ne 0) {
    if ($existing.Text -notmatch '(?i)not found|does not exist|404') { throw 'Could not check the project tunnel. Check your network and Dev Tunnels sign-in, then retry.' }
    $tunnelDetails = Read-TunnelJson (Invoke-Tunnel -CliArgs @('create', $tunnelId, '--allow-anonymous', '--host-header', 'unchanged', '--origin-header', 'unchanged', '--json')) 'Creating the project tunnel'
} else {
    $tunnelDetails = Read-TunnelJson $existing 'Reading the project tunnel'
}
$qualifiedId = [string]$tunnelDetails.tunnel.tunnelId
if ($qualifiedId -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]{2,99}$') { throw 'Dev Tunnels did not return a valid tunnel ID. No local configuration was changed.' }
$tunnelId = $qualifiedId

$existingPort = Invoke-Tunnel -CliArgs @('port', 'show', $tunnelId, '-p', "$Port", '--json')
if ($existingPort.ExitCode -ne 0) {
    if ($existingPort.Text -notmatch '(?i)not found|does not exist|404') { throw 'Could not check the tunnel port. No local configuration was changed.' }
    $null = Read-TunnelJson (Invoke-Tunnel -CliArgs @('port', 'create', $tunnelId, '-p', "$Port", '--protocol', 'http', '--host-header', 'unchanged', '--origin-header', 'unchanged', '--json')) 'Creating the tunnel port'
} else {
    $null = Read-TunnelJson (Invoke-Tunnel -CliArgs @('port', 'update', $tunnelId, '-p', "$Port", '--host-header', 'unchanged', '--origin-header', 'unchanged', '--json')) 'Updating the tunnel port'
}

# The launcher records the authoritative public URL reported by the host.
# A chosen tunnel ID is not necessarily the public hostname.
$config = [ordered]@{ provider = 'devtunnel'; tunnelId = $tunnelId; port = $Port }
if ($saved -and $saved.provider -eq 'devtunnel' -and $saved.tunnelId -eq $tunnelId -and [int]$saved.port -eq $Port -and $saved.publicUrl) {
    $parsed = $null
    if ([Uri]::TryCreate([string]$saved.publicUrl, [UriKind]::Absolute, [ref]$parsed) -and $parsed.Scheme -eq 'https' -and $parsed.Host.EndsWith('.devtunnels.ms') -and $parsed.Host -notmatch '-inspect\.' -and $parsed.Port -eq 443 -and $parsed.AbsolutePath -eq '/' -and -not $parsed.UserInfo -and -not $parsed.Query -and -not $parsed.Fragment) {
        $config.publicUrl = $parsed.GetLeftPart([UriPartial]::Authority)
    }
}
$temporary = Join-Path $stateDir ('tunnel-config-' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
    [IO.File]::WriteAllText($temporary, ($config | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    # File.Replace($temporary, $configPath, $null) is rejected by some
    # PowerShell/.NET combinations with "The path is not of a legal form".
    # Move-Item -Force keeps the write atomic enough for this small config and
    # works on the supported Windows runtimes.
    Move-Item -LiteralPath $temporary -Destination $configPath -Force
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}

Write-Host ''
Write-Host 'The stable connection is configured. No domain purchase is needed.' -ForegroundColor Green
Write-Host 'If UmiBridge is already running, close it with UmiBridge.cmd -Action stop and start it again with UmiBridge.cmd.'
Write-Host 'Copy the MCP URL from the dashboard and use the connection code in .local-data\CONNECT.txt to connect UmiBridge in ChatGPT once using OAuth.'
Write-Host 'Future launches reuse the same tunnel. Keep using UmiBridge.cmd for background operation and request monitoring.'
Write-Host 'Microsoft removes a tunnel after 30 days with no activity; run this setup again if it expires.'
if ($Launch) {
    & (Join-Path $projectRoot 'scripts\windows\Stop-ChatGPT.ps1')
    Start-Process -FilePath (Join-Path $projectRoot 'UmiBridge.cmd') -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
}
