[CmdletBinding()]
param(
    [switch]$Launch,
    [switch]$SkipCloudflared
)

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $projectRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$minimumNodeVersion = [version]'22.12.0'
$runtimeRoot = Join-Path $projectRoot '.runtime'
$localNodeRoot = Join-Path $runtimeRoot 'node'
$localNode = Join-Path $localNodeRoot 'node.exe'

function Get-NodeVersion([string]$Executable) {
    if (-not $Executable -or -not (Test-Path -LiteralPath $Executable)) { return $null }
    try {
        $raw = (& $Executable --version 2>$null | Select-Object -First 1).ToString().Trim()
        if ($raw -match '^v(?<version>\d+\.\d+\.\d+)') { return [version]$Matches.version }
    } catch { }
    return $null
}

function Find-UsableNode {
    $candidates = @()
    if (Test-Path -LiteralPath $localNode) { $candidates += $localNode }
    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($systemNode) { $candidates += $systemNode.Source }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        $version = Get-NodeVersion $candidate
        if ($version -and $version -ge $minimumNodeVersion) {
            return [pscustomobject]@{ Path = $candidate; Version = $version; Local = ($candidate -eq $localNode) }
        }
    }
    return $null
}

function Install-PortableNode {
    Write-Host 'Node.js 22.12+ was not found. Downloading the latest official Windows x64 LTS runtime...'
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -Headers @{ 'User-Agent' = 'UmiBridge-Sakura-Console' }
    $release = $index |
        Where-Object { $_.lts -and ([version]($_.version.TrimStart('v'))) -ge $minimumNodeVersion } |
        Sort-Object { [version]($_.version.TrimStart('v')) } -Descending |
        Select-Object -First 1
    if (-not $release) { throw 'Could not find a compatible official Node.js LTS release.' }

    $version = $release.version
    $baseUrl = "https://nodejs.org/dist/$version/"
    $zipName = "node-$version-win-x64.zip"
    $downloadRoot = Join-Path $runtimeRoot 'downloads'
    $zipPath = Join-Path $downloadRoot $zipName
    $stage = Join-Path $runtimeRoot ('staging-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

    $hashText = (Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + 'SHASUMS256.txt') -Headers @{ 'User-Agent' = 'UmiBridge-Sakura-Console' }).Content
    $hashLine = $hashText -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape($zipName))\s*$" } | Select-Object -First 1
    if (-not $hashLine -or $hashLine -notmatch '^(?<hash>[0-9a-fA-F]{64})\s+') { throw "No SHA-256 entry found for $zipName." }
    $expectedHash = $Matches.hash.ToLowerInvariant()

    Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + $zipName) -OutFile $zipPath -Headers @{ 'User-Agent' = 'UmiBridge-Sakura-Console' }
    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue; throw 'Node.js checksum mismatch.' }

    try {
        Expand-Archive -LiteralPath $zipPath -DestinationPath $stage -Force
        $extracted = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1
        if (-not $extracted -or -not (Test-Path -LiteralPath (Join-Path $extracted.FullName 'node.exe'))) { throw 'Node.js archive has an unexpected layout.' }
        if (Test-Path -LiteralPath $localNodeRoot) { Remove-Item -LiteralPath $localNodeRoot -Recurse -Force }
        Move-Item -LiteralPath $extracted.FullName -Destination $localNodeRoot
        @{ version = $version; sha256 = $actualHash; source = ($baseUrl + $zipName) } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'node-version.json') -Encoding utf8
    } finally {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    }
    return [pscustomobject]@{ Path = $localNode; Version = [version]$version.TrimStart('v'); Local = $true }
}

$node = Find-UsableNode
if (-not $node) { $node = Install-PortableNode }
$nodeExe = $node.Path
$env:PATH = (Split-Path -Parent $nodeExe) + ';' + $env:PATH
$npmExe = Join-Path (Split-Path -Parent $nodeExe) 'npm.cmd'
if (-not (Test-Path -LiteralPath $npmExe)) { throw "npm.cmd is missing next to $nodeExe." }
Write-Host ("Using Node.js {0} ({1})" -f $node.Version, $(if ($node.Local) { 'portable local runtime' } else { 'system runtime' }))

& $npmExe ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $npmExe run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'scripts\windows\Setup-Windows-Tools.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Windows tools installation failed. Reopen UmiBridge.cmd to retry.' }

if (-not $SkipCloudflared) {
    Write-Host 'Downloading the latest verified Cloudflare Quick Tunnel binary...'
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest' -Headers @{ 'User-Agent' = 'UmiBridge-Sakura-Console' }
    $asset = $release.assets | Where-Object { $_.name -eq 'cloudflared-windows-amd64.exe' }
    if (-not $asset -or -not $asset.digest.StartsWith('sha256:')) { throw 'No verified Windows x64 cloudflared release found.' }
    $localBin = Join-Path $projectRoot 'local-bin'
    New-Item -ItemType Directory -Path $localBin -Force | Out-Null
    $download = Join-Path $localBin 'cloudflared-download.exe'
    Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $download -Headers @{ 'User-Agent' = 'UmiBridge-Sakura-Console' }
    $sha256 = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($asset.digest -ne "sha256:$sha256") { Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue; throw 'Cloudflared checksum mismatch.' }
    Move-Item -LiteralPath $download -Destination (Join-Path $localBin 'cloudflared.exe') -Force
    @{ version = $release.tag_name; sha256 = $sha256; source = $asset.browser_download_url } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $localBin 'cloudflared-version.json') -Encoding utf8
}

Write-Host ''
Write-Host 'UmiBridge is installed and ready.' -ForegroundColor Green
Write-Host 'Double-click UmiBridge.cmd whenever you want to start it.'
Write-Host 'After the first OAuth connection, use UmiBridge.cmd to run in the background, monitor requests and open the dashboard.'

if ($Launch) {
    $startFile = Join-Path $projectRoot 'UmiBridge.cmd'
    Start-Process -FilePath $startFile -WorkingDirectory $projectRoot | Out-Null
    $port = 43127
    if ($env:DC_WEB_PORT) { $port = [int]$env:DC_WEB_PORT }
    $dashboard = "http://127.0.0.1:$port/admin"
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-WebRequest -Uri $dashboard -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { Start-Process $dashboard; break }
        } catch { }
    }
}
