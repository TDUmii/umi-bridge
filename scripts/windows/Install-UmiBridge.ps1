[CmdletBinding()]
param(
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'UmiBridge'),
    [switch]$SourceOnly,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -le 5) {
    $env:PSModulePath = [IO.Path]::Combine([Environment]::GetFolderPath('System'), 'WindowsPowerShell\v1.0\Modules')
}
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
$headers = @{ 'User-Agent' = 'UmiBridge-Setup'; Accept = 'application/vnd.github+json' }
$stage = Join-Path ([IO.Path]::GetTempPath()) ('UmiBridge-Setup-' + [guid]::NewGuid().ToString('N'))
$lock = $null
$changed = $false

try {
    if (Test-Path -LiteralPath (Join-Path $root '.git')) { throw 'Developer checkout detected. Installer will not overwrite it. Use the default LocalAppData installation.' }
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Installation directory cannot be a link.' }
    $state = Join-Path $root '.local-data'
    if ((Test-Path -LiteralPath $state) -and ((Get-Item -LiteralPath $state).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installation state directory cannot be a link.' }
    $marker = Join-Path $state 'installed-release.json'
    if (-not (Test-Path -LiteralPath $marker) -and @(Get-ChildItem -LiteralPath $root -Force).Count -gt 0) {
        throw 'Existing unmanaged files found. Choose an empty installation directory; existing files were kept.'
    }
    New-Item -ItemType Directory -Path $state -Force | Out-Null
    $lock = [IO.File]::Open((Join-Path $state 'update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    if (-not (Test-Path -LiteralPath $marker)) { '{"files":{},"assetId":null,"sha256":null}' | Set-Content -LiteralPath $marker -Encoding UTF8 }
    $previous = if (Test-Path -LiteralPath $marker) { Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json } else { $null }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/TDUmii/umi-bridge/releases/latest' -Headers $headers
    $asset = @($release.assets | Where-Object { $_.name -eq 'UmiBridge-Windows.zip' })
    if ($asset.Count -ne 1 -or $asset[0].digest -notmatch '^sha256:[a-fA-F0-9]{64}$') { throw 'Latest release has no verified UmiBridge-Windows.zip asset.' }
    $asset = $asset[0]
    if ($asset.browser_download_url -notmatch '^https://github\.com/TDUmii/umi-bridge/releases/download/[^/]+/UmiBridge-Windows\.zip$') { throw 'Unexpected release download source.' }
    if (-not $previous -or $previous.assetId -ne $asset.id -or $previous.sha256 -ne $asset.digest.Substring(7)) {
        New-Item -ItemType Directory -Path $stage -Force | Out-Null
        $archive = Join-Path $stage 'release.zip'
        Write-Host ('Downloading verified UmiBridge ' + $release.tag_name + '...')
        Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $archive -Headers $headers
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $asset.digest.Substring(7)) { throw 'Release SHA-256 mismatch. Installation was not changed.' }
        $source = Join-Path $stage 'source'
        # Reject traversal, links, private state and arbitrary top-level payloads before extraction.
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($archive)
        try {
            foreach ($entry in $zip.Entries) {
                $name = $entry.FullName.Replace('\', '/')
                if ($name -match '(^/|:|(^|/)\.\.?(/|$))' -or $name -notmatch '^(scripts/|extensions/|assets/|package\.json$|package-lock\.json$|UmiBridge(?:-Setup)?\.cmd$|README\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$)' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {
                    throw ('Unsupported release archive entry: ' + $name)
                }
            }
        } finally { $zip.Dispose() }
        Expand-Archive -LiteralPath $archive -DestinationPath $source
        foreach ($required in @('package.json', 'package-lock.json', 'UmiBridge.cmd', 'scripts\setup-check.mjs', 'scripts\tool-health.mjs', 'scripts\windows\Setup-Local.ps1', 'scripts\windows\Install-UmiBridge.ps1', 'scripts\vendor\desktop-tools\dist\index.js', 'scripts\vendor\desktop-tools\package.json', 'scripts\vendor\desktop-tools\vendor\telemetry-contract\package.json')) {
            if (-not (Test-Path -LiteralPath (Join-Path $source $required) -PathType Leaf)) { throw ('Release is missing ' + $required) }
        }
        $files = @{}
        foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) {
            $relative = $file.FullName.Substring($source.Length + 1)
            $files[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        }
        $oldFiles = @{}
        if ($previous) {
            foreach ($property in $previous.files.PSObject.Properties) {
                $relative = $property.Name
                if ($relative -match '(^[\\/]|:|(^|[\\/])\.\.?([\\/]|$))' -or $relative.Replace('\', '/') -notmatch '^(scripts/|extensions/|assets/|package\.json$|package-lock\.json$|UmiBridge(?:-Setup)?\.cmd$|README\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$)') { throw 'Invalid installed file manifest.' }
                $oldFiles[$relative] = $property.Value
                $path = Join-Path $root $relative
                $check = $path
                while ($check -and $check -ne $root) {
                    if ((Test-Path -LiteralPath $check) -and ((Get-Item -LiteralPath $check).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installed source contains a link; update cancelled.' }
                    $check = Split-Path -Parent $check
                }
                if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $property.Value) { throw ('Local source change found; update cancelled: ' + $relative) }
            }
        }
        foreach ($relative in $files.Keys) {
            $path = Join-Path $root $relative
            if ((Test-Path -LiteralPath $path) -and -not $oldFiles.ContainsKey($relative)) { throw ('Unmanaged file conflicts with update: ' + $relative) }
            $parent = Split-Path -Parent $path
            while ($parent -and $parent -ne $root) {
                if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installation contains a directory link; update cancelled.' }
                $parent = Split-Path -Parent $parent
            }
        }
        $stop = Join-Path $root 'scripts\windows\Stop-ChatGPT.ps1'
        $runtimeHealth = Join-Path $source 'scripts\windows\Runtime-Health.ps1'
        if (Test-Path -LiteralPath $runtimeHealth) {
            . $runtimeHealth
            $workPort = if ($env:DC_WEB_PORT) { [int]$env:DC_WEB_PORT } else { 43127 }
            if (Test-UmiWorkActive $workPort) { throw 'Có công việc đang chạy. Bản cập nhật sẽ được cài khi mở UmiBridge sau khi công việc kết thúc.' }
        }
        if (Test-Path -LiteralPath $stop) {
            $stopArgs = @()
            if ($SourceOnly) { $stopArgs += '-KeepWatchdog' }
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stop @stopArgs
            if ($LASTEXITCODE -ne 0) { throw 'Could not stop existing gateway safely.' }
        }
        $backup = Join-Path $stage 'backup'
        foreach ($relative in $oldFiles.Keys) {
            $path = Join-Path $backup $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $root $relative) -Destination $path
        }
        try {
            foreach ($relative in $files.Keys) {
                $path = Join-Path $root $relative
                New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
                Copy-Item -LiteralPath (Join-Path $source $relative) -Destination $path -Force
            }
            foreach ($relative in $oldFiles.Keys) { if (-not $files.ContainsKey($relative)) { Remove-Item -LiteralPath (Join-Path $root $relative) -Force } }
            @{ tag = $release.tag_name; assetId = $asset.id; sha256 = $asset.digest.Substring(7); files = $files } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ($marker + '.tmp') -Encoding UTF8
            Move-Item -LiteralPath ($marker + '.tmp') -Destination $marker -Force
        } catch {
            foreach ($relative in $files.Keys) { if (-not $oldFiles.ContainsKey($relative)) { Remove-Item -LiteralPath (Join-Path $root $relative) -Force -ErrorAction SilentlyContinue } }
            foreach ($relative in $oldFiles.Keys) { Copy-Item -LiteralPath (Join-Path $backup $relative) -Destination (Join-Path $root $relative) -Force }
            throw
        }
        $changed = $true
    }
    if (-not $SourceOnly) {
        $stop = Join-Path $root 'scripts\windows\Stop-ChatGPT.ps1'
        if (Test-Path -LiteralPath $stop) {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stop
            if ($LASTEXITCODE -ne 0) { throw 'Could not stop existing gateway before runtime setup.' }
        }
        $setupArgs = @('-SkipCloudflared')
        if ($NoLaunch) { $setupArgs += '-NoBrowser' }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\windows\Setup-Local.ps1') @setupArgs
        if ($LASTEXITCODE -ne 0) { throw 'Runtime setup failed. Run UmiBridge-Setup.cmd again to retry; saved settings remain intact.' }
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'UmiBridge.lnk'))
        $shortcut.TargetPath = Join-Path ([Environment]::GetFolderPath('System')) 'wscript.exe'
        $shortcut.Arguments = '//B //Nologo ' + [char]34 + (Join-Path $root 'scripts\windows\UmiBridge-Launch.vbs') + [char]34
        $shortcut.WindowStyle = 7
        $shortcut.WorkingDirectory = $root
        $shortcut.IconLocation = Join-Path $root 'scripts\windows\UmiBridge.ico'
        $shortcut.Save()
        Write-Host ('Runtime verified: ' + $root) -ForegroundColor Green
        if (-not $NoLaunch) {
            $launchStarted=[DateTime]::UtcNow
            Start-Process -FilePath (Join-Path $root 'UmiBridge.cmd') -ArgumentList '-NoUpdate' -WorkingDirectory $root -WindowStyle Hidden
            $port = if ($env:DC_WEB_PORT) { [int]$env:DC_WEB_PORT } else { 43127 }
            $expectedVersion=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw|ConvertFrom-Json).version
            $deadline=[DateTime]::UtcNow.AddMinutes(10)
            $ready=$false
            while ([DateTime]::UtcNow -lt $deadline) {
                try {
                    $page=Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/admin" -f $port) -UseBasicParsing -TimeoutSec 2
                    if ($page.Content -match ('v'+[regex]::Escape($expectedVersion))) {
                        $check=Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/admin/api/tools/check" -f $port) -TimeoutSec 5
                        $progress=Get-Content -LiteralPath (Join-Path $state 'startup-progress.json') -Raw|ConvertFrom-Json
                        if ($check.version -eq $expectedVersion -and $check.installationRoot -eq $root -and $check.critical.ready -and $progress.state -eq 'ready' -and [DateTime]$check.checkedAt -ge $launchStarted) { $ready=$true; break }
                    }
                } catch { }
                Start-Sleep -Seconds 2
            }
            if (-not $ready) { throw 'Gateway tool verification did not finish. Complete tunnel sign-in on the startup page, or review its error, then retry.' }
            Write-Host 'UmiBridge ready: gateway, dashboard and live tool checks passed.' -ForegroundColor Green
        }
    }
} catch {
    Write-Host ('Setup failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
    if (Test-Path -LiteralPath $stage) {
        $stageFull=[IO.Path]::GetFullPath($stage)
        $stagePrefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\UmiBridge-Setup-'
        if ($stageFull.StartsWith($stagePrefix,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $stageFull -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
if ($SourceOnly -and $changed) { exit 10 }
exit 0
