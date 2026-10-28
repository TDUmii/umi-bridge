# Shared by the launcher and installer. A responding gateway must be reconciled
# before its files or processes are replaced; an unavailable gateway has no live API.
function Test-UmiWorkActive([int]$Port = 43127) {
    try { $null = Invoke-RestMethod -Uri ("http://127.0.0.1:$Port/health") -TimeoutSec 2 }
    catch { return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0 }
    try {
        foreach ($channel in @('corp', 'arena')) {
            $state = Invoke-RestMethod -Uri ("http://127.0.0.1:$Port/admin/api/$channel") -TimeoutSec 5
            if (@($state.bootstraps | Where-Object { $_.status -eq 'running' }).Count) { return $true }
            $runs = if ($channel -eq 'corp') { $state.runs } else { $state.arenas }
            foreach ($run in $runs) {
                if ($run.status -eq 'running') { return $true }
                if (@($run.steps | Where-Object { $_.status -in @('dispatching','running','waiting') }).Count) { return $true }
            }
        }
        return $false
    } catch { return $true }
}
