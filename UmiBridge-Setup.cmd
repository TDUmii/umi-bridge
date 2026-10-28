@echo off
setlocal
title UmiBridge Setup
set "UMIBRIDGE_SETUP_FILE=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$text=[IO.File]::ReadAllText($env:UMIBRIDGE_SETUP_FILE); & ([scriptblock]::Create(($text -split '(?m)^# POWERSHELL-START\r?$',2)[1]))"
set "UMIBRIDGE_SETUP_EXIT=%ERRORLEVEL%"
if not "%UMIBRIDGE_SETUP_EXIT%"=="0" pause
exit /b %UMIBRIDGE_SETUP_EXIT%
# POWERSHELL-START
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -le 5) {
    $env:PSModulePath = [IO.Path]::Combine([Environment]::GetFolderPath('System'), 'WindowsPowerShell\v1.0\Modules')
}
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$stage = Join-Path ([IO.Path]::GetTempPath()) ('UmiBridge-Bootstrap-' + [guid]::NewGuid().ToString('N'))
try {
    $headers = @{ 'User-Agent' = 'UmiBridge-Setup'; Accept = 'application/vnd.github+json' }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/TDUmii/umi-bridge/releases/latest' -Headers $headers
    $assets = @($release.assets | Where-Object { $_.name -eq 'Install-UmiBridge.ps1' })
    if ($assets.Count -ne 1 -or $assets[0].digest -notmatch '^sha256:[a-fA-F0-9]{64}$') { throw 'Latest release has no verified installer asset.' }
    $asset = $assets[0]
    if ($asset.browser_download_url -notmatch '^https://github\.com/TDUmii/umi-bridge/releases/download/[^/]+/Install-UmiBridge\.ps1$') { throw 'Unexpected installer download source.' }
    New-Item -ItemType Directory -Path $stage | Out-Null
    $installer = Join-Path $stage 'Install-UmiBridge.ps1'
    Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $installer -Headers $headers
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $asset.digest.Substring(7)) { throw 'Installer SHA-256 mismatch.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
    if ($LASTEXITCODE -ne 0) { throw 'Installation did not finish. Run this file again to retry.' }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
finally {
    if (Test-Path -LiteralPath $stage) {
        $stageFull=[IO.Path]::GetFullPath($stage)
        $stagePrefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\UmiBridge-Bootstrap-'
        if ($stageFull.StartsWith($stagePrefix,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $stageFull -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
