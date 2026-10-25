[CmdletBinding()]
param([switch]$KeepWatchdog)

if ($PSVersionTable.PSVersion.Major -le 5) {
    $env:PSModulePath = [IO.Path]::Combine([Environment]::GetFolderPath('System'), 'WindowsPowerShell\v1.0\Modules')
}
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$statePath = Join-Path $projectRoot '.local-data\web-status.json'
if (-not $KeepWatchdog) {
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $statePath))
    [IO.File]::WriteAllText((Join-Path $projectRoot '.local-data\launcher-stop'), [DateTime]::UtcNow.ToString('o'))
}
$state = $null
if (Test-Path -LiteralPath $statePath) { $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
$expectedPath = Join-Path $projectRoot 'scripts\run-local-web.mjs'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$absolutePattern = '(?i)^"?[^"\r\n]+?node\.exe"?\s+"?' + [regex]::Escape($expectedPath) + '"?(?:\s|$)'
$processes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop | Where-Object {
    $_.CommandLine -match $absolutePattern -or ($state -and $_.ProcessId -eq [int]$state.pid)
})
foreach ($process in $processes) {
    $targetPid = [int]$process.ProcessId
    $commandLine = [string]$process.CommandLine
    $absoluteMatch = $commandLine -match $absolutePattern
    # Older launchers may start Node using "scripts/run-local-web.mjs" relative to this project.
    # Accept that form ONLY if this exact process also owns the recorded loopback listener.
    $relativeMatch = $commandLine -match '(?i)(?:^|\s)"?(?:\.?[\\/])?scripts[\\/]run-local-web\.mjs"?(?:\s|$)'
    $portOwner = $false
    if ($state) {
        $portOwner = @(Get-NetTCPConnection -LocalPort ([int]$state.port) -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -eq $targetPid -and $_.LocalAddress -in @('127.0.0.1', '::1') }).Count -gt 0
    }
    $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -ErrorAction Stop

    if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne $sid -or -not ($absoluteMatch -or ($relativeMatch -and $portOwner))) {
        throw "Saved PID $targetPid does not match this UmiBridge instance. Nothing was stopped."
    }

    Write-Host "Stopping UmiBridge (PID $targetPid)..."
    & taskkill.exe /PID $targetPid /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not stop UmiBridge (PID $targetPid)."
    }
}

Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
Write-Host 'UmiBridge stopped. You can now run UmiBridge.cmd.'
