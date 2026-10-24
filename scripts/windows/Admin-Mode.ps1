[CmdletBinding()]
param(
    [ValidateSet('status', 'enable', 'disable', 'start', 'stop', 'update')]
    [string]$Action = 'status',
    [string]$SourceRoot,
    [string]$ExpectedSid,
    [switch]$TaskWorker,
    [switch]$ElevatedRequest,
    [switch]$ConsentBroker,
    [switch]$GatewayRequest,
    [switch]$CopyBackWorker,
    [switch]$LibraryOnly
)

# Desktop PowerShell can inherit PowerShell 7's incompatible module paths from
# a launcher. Select OS-owned Windows PowerShell modules before any autoload.
if ($PSVersionTable.PSVersion.Major -le 5) {
    $env:PSModulePath = [IO.Path]::Combine([Environment]::GetFolderPath('System'), 'WindowsPowerShell\v1.0\Modules')
}
Set-StrictMode -Version Latest

# Loading this file with -LibraryOnly never changes Windows state. Public writes
# require native Windows consent and the original account's elevated token.
# Security model: https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks

function Test-UmiAdminToken {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-UmiSid {
    param([Parameter(Mandatory = $true)][string]$Sid)
    # Local/domain user identities only. Never accept a path segment as identity.
    if ($Sid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') {
        throw 'A Windows user SID is required.'
    }
    return $Sid
}

function Get-UmiCanonicalPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -notmatch '^[A-Za-z]:\\' -or
        $Path.Contains('/') -or $Path.Substring(2).Contains(':') -or
        $Path -match '[*?"<>|\x00-\x1f]' -or $Path -match '(^|\\)\.{1,2}(\\|$)' -or
        $Path -match '(^|\\)[^\\]*[. ](\\|$)') {
        throw 'An absolute local Windows path without ambiguous segments is required.'
    }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full -match '^[A-Za-z]:$') { throw 'A drive root is not an installation directory.' }
    return $full
}

function Assert-UmiContainedPath {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Path
    )
    $canonicalRoot = Get-UmiCanonicalPath $Root
    $canonicalPath = Get-UmiCanonicalPath $Path
    if (-not $canonicalPath.StartsWith($canonicalRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The path must be strictly inside the protected installation root.'
    }
    return $canonicalPath
}

function Assert-UmiNoReparsePoint {
    param([Parameter(Mandatory = $true)][string]$Path, [switch]$Recurse)
    $canonical = Get-UmiCanonicalPath $Path
    # Check every existing ancestor as well as descendants; do not follow links.
    $cursor = $canonical
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Reparse points are forbidden in protected installation paths.'
            }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    if ($Recurse -and (Test-Path -LiteralPath $canonical)) {
        $pending = New-Object 'System.Collections.Generic.Stack[string]'
        $pending.Push($canonical)
        while ($pending.Count -gt 0) {
            $directory = $pending.Pop()
            foreach ($child in (Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)) {
                if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                    throw 'Reparse points are forbidden in protected installation contents.'
                }
                if ($child.PSIsContainer) { $pending.Push($child.FullName) }
            }
        }
    }
}

function Get-UmiProtectedLayout {
    param([Parameter(Mandatory = $true)][string]$Sid)
    $userSid = Assert-UmiSid $Sid
    # The OS location is authoritative. No caller-controlled install destination.
    $parent = Get-UmiCanonicalPath ([Environment]::GetFolderPath('CommonApplicationData'))
    $base = Join-Path $parent 'UmiBridge'
    $userRoot = Assert-UmiContainedPath $base (Join-Path $base $userSid)
    return @{
        Base = $base; Root = $userRoot; App = (Join-Path $userRoot 'app')
        Manifest = (Join-Path $userRoot 'mode.json'); TaskName = ('UmiBridge-' + $userSid)
        TaskHost = (Join-Path $userRoot 'app\scripts\windows\Admin-Host.vbs')
    }
}

function Get-UmiProtectedSddl {
    param([string]$Sid, [switch]$Task)
    if ($Task) {
        $userSid = Assert-UmiSid $Sid
        # GRGX permits inspection/start only. No write, delete, DACL or owner rights.
        return ('O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;' + $userSid + ')')
    }
    $readRule = '(A;;0x1200a9;;;AU)'
    if ($Sid) { $readRule = '(A;OICI;0x1200a9;;;' + (Assert-UmiSid $Sid) + ')' }
    # OWNER RIGHTS removes implicit WRITE_DAC when Node creates a file owned by
    # the individual account. Elevated BA/SYSTEM still retain FullControl.
    return ('O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;RC;;;OW)' + $readRule)
}

function Assert-UmiElevatedIdentity {
    param([Parameter(Mandatory = $true)][string]$ExpectedSid)
    $sid = Assert-UmiSid $ExpectedSid
    if (-not (Test-UmiAdminToken)) { throw 'A current elevated administrator token is required.' }
    if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $sid) {
        throw 'Windows authorized a different account. Persistent Admin mode requires the same signed-in administrator account; standard accounts cannot retain another account administrator token.'
    }
}

function Assert-UmiProtectedAcl {
    param([Parameter(Mandatory = $true)][string]$Path, [string]$Sid, [switch]$Descendant)
    if (-not $Descendant) { Assert-UmiNoReparsePoint $Path }
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    $allowedOwners = @('S-1-5-18', 'S-1-5-32-544')
    if ($Descendant -and $Sid) { $allowedOwners += $Sid }
    if ($owner -notin $allowedOwners -or (-not $Descendant -and -not $acl.AreAccessRulesProtected)) {
        throw 'The existing installation has an untrusted owner or inherited permissions.'
    }
    $seenSystem = $false; $seenAdmin = $false; $seenOwnerRights = $false
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        $principal = $rule.IdentityReference.Value
        if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) {
            throw 'Unexpected access rules in the protected installation.'
        }
        if ($principal -eq 'S-1-5-18') { $seenSystem = $true; continue }
        if ($principal -eq 'S-1-5-32-544') { $seenAdmin = $true; continue }
        if ($principal -eq 'S-1-3-4' -and [int]$rule.FileSystemRights -eq 0x20000) { $seenOwnerRights = $true; continue }
        if (-not $Sid -and $principal -eq 'S-1-5-11' -and ([int]$rule.FileSystemRights -band (-bnot 0x1200a9)) -eq 0 -and $rule.InheritanceFlags -eq 'None') { continue }
        if (-not $Sid -or $principal -ne (Assert-UmiSid $Sid) -or
            (([int]$rule.FileSystemRights -band (-bnot 0x1200a9)) -ne 0)) {
            throw 'An unprivileged account can modify the protected installation.'
        }
    }
    if (-not $seenSystem -or -not $seenAdmin -or -not $seenOwnerRights) { throw 'Protected administrator or owner-rights access is missing.' }
}

function Set-UmiProtectedAcl {
    param([Parameter(Mandatory = $true)][string]$Path, [string]$Sid)
    if (-not (Test-UmiAdminToken)) { throw 'Protecting an installation requires elevation.' }
    Assert-UmiNoReparsePoint $Path
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    $sddl = Get-UmiProtectedSddl -Sid $Sid
    if ($item.PSIsContainer) {
        $security = New-Object Security.AccessControl.DirectorySecurity
        $security.SetSecurityDescriptorSddlForm($sddl, ([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group))
        [IO.Directory]::SetAccessControl($item.FullName, $security)
    } else {
        $security = New-Object Security.AccessControl.FileSecurity
        $security.SetSecurityDescriptorSddlForm($sddl.Replace(';OICI;', ';;'), ([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group))
        [IO.File]::SetAccessControl($item.FullName, $security)
    }
    Assert-UmiProtectedAcl -Path $Path -Sid $Sid
}

function New-UmiProtectedDirectory {
    param([Parameter(Mandatory = $true)][string]$Path, [string]$Sid)
    if (-not (Test-UmiAdminToken)) { throw 'Creating an installation requires elevation.' }
    $canonical = Get-UmiCanonicalPath $Path
    Assert-UmiNoReparsePoint $canonical
    if (Test-Path -LiteralPath $canonical) {
        if ($Sid) {
            $layout = Get-UmiProtectedLayout $Sid
            if ($canonical.StartsWith($layout.Root + '\', [StringComparison]::OrdinalIgnoreCase)) {
                # Only descendants of the protected account root may inherit.
                # Validate every parent so DELETE_CHILD or WRITE_DAC on an
                # intermediate directory cannot replace this safe child.
                Assert-UmiProtectedAcl -Path $layout.Base
                Assert-UmiProtectedAcl -Path $layout.Root -Sid $Sid
                $cursor = $canonical
                while ($cursor -ne $layout.Root) {
                    Assert-UmiProtectedAcl -Path $cursor -Sid $Sid -Descendant
                    $cursor = [IO.Path]::GetDirectoryName($cursor)
                }
                return
            }
        }
        Assert-UmiProtectedAcl -Path $canonical -Sid $Sid
        return
    }
    $security = New-Object Security.AccessControl.DirectorySecurity
    $security.SetSecurityDescriptorSddlForm((Get-UmiProtectedSddl -Sid $Sid), ([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group))
    # Apply the DACL at creation, avoiding a user-writable interval.
    [void][IO.Directory]::CreateDirectory($canonical, $security)
    Assert-UmiProtectedAcl -Path $canonical -Sid $Sid
}

function Write-UmiAdminError {
    param([Parameter(Mandatory = $true)]$RecordError, [Parameter(Mandatory = $true)][string]$Sid)
    Assert-UmiElevatedIdentity $Sid
    $layout = Get-UmiProtectedLayout $Sid
    Assert-UmiProtectedAcl -Path $layout.Base
    $log = Assert-UmiContainedPath $layout.Base (Join-Path $layout.Base ('error-' + $Sid + '.log'))
    Assert-UmiNoReparsePoint $log
    if (Test-Path -LiteralPath $log) { Assert-UmiProtectedAcl -Path $log -Sid $Sid }
    $details = [DateTime]::UtcNow.ToString('o') + "`r`n" + $RecordError.Exception.ToString() + "`r`n" + $RecordError.ScriptStackTrace
    # The base is BA/SYSTEM writable only. The file initially inherits private
    # permissions, then receives read access for this account alone.
    if (Test-Path -LiteralPath $log) {
        $previous = [IO.File]::ReadAllText($log)
        if ($previous.Length -gt 32768) { $previous = $previous.Substring($previous.Length - 32768) }
        $details = $previous + "`r`n---`r`n" + $details
    }
    [IO.File]::WriteAllText($log, $details)
    Set-UmiProtectedAcl -Path $log -Sid $Sid
}

function Get-UmiTaskDefinitionXml {
    param(
        [Parameter(Mandatory = $true)][string]$Sid,
        [Parameter(Mandatory = $true)][string]$ProtectedApp,
        [switch]$Legacy,
        [switch]$PowerShellHost
    )
    $userSid = Assert-UmiSid $Sid
    $layout = Get-UmiProtectedLayout -Sid $userSid
    if ((Get-UmiCanonicalPath $ProtectedApp) -ne $layout.App) { throw 'The task must use its canonical protected application.' }
    $shell = Join-Path ([Environment]::GetFolderPath('System')) 'wscript.exe'
    $helper = Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1'
    $command = [Security.SecurityElement]::Escape($shell)
    $arguments = '/B /Nologo "' + $layout.TaskHost + '"'
    if ($Legacy -or $PowerShellHost) {
        $shell = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
        $windowStyle = if ($Legacy) { '' } else { '-WindowStyle Hidden ' }
        $arguments = '-NoProfile -NonInteractive ' + $windowStyle + '-ExecutionPolicy Bypass -File "' + $helper + '" -Action start -TaskWorker'
    }
    $command = [Security.SecurityElement]::Escape($shell)
    $arguments = [Security.SecurityElement]::Escape($arguments)
    $directory = [Security.SecurityElement]::Escape($layout.App)
    # No password, logon trigger, service account, SYSTEM execution or source path.
    return @"
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>UmiBridge persistent Admin mode for the authorized interactive account.</Description></RegistrationInfo>
  <Triggers />
  <Principals><Principal id="Owner"><UserId>$userSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>false</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>true</Hidden><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings>
  <Actions Context="Owner"><Exec><Command>$command</Command><Arguments>$arguments</Arguments><WorkingDirectory>$directory</WorkingDirectory></Exec></Actions>
</Task>
"@
}

function Get-UmiTaskHostContent {
    param([Parameter(Mandatory = $true)][string]$Sid)
    $layout = Get-UmiProtectedLayout $Sid
    $shell = Get-UmiPowerShell
    $helper = Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1'
    if ($shell.Contains('%') -or $helper.Contains('%')) { throw 'Windows folder names containing percent signs cannot host the administrator task.' }
    $command = ('"' + $shell + '" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $helper + '" -Action start -TaskWorker').Replace('"', '""')
    return ("Option Explicit`r`nDim launcher, result`r`nSet launcher = CreateObject(""WScript.Shell"")`r`nresult = launcher.Run(""" + $command + """, 0, True)`r`nWScript.Quit result`r`n")
}

function Write-UmiTaskHost {
    param([Parameter(Mandatory = $true)][string]$Sid)
    Assert-UmiElevatedIdentity $Sid
    $layout = Get-UmiProtectedLayout $Sid
    Assert-UmiNoReparsePoint $layout.TaskHost
    if (-not (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('System')) 'wscript.exe'))) { throw 'The Windows Script Host GUI runtime is unavailable.' }
    if (Test-Path -LiteralPath $layout.TaskHost) { Assert-UmiProtectedAcl -Path $layout.TaskHost -Sid $Sid -Descendant }
    $stage = Join-Path $layout.Root ('task-host-' + [guid]::NewGuid().ToString('N') + '.tmp')
    $backup = $stage + '.bak'
    try {
        [IO.File]::WriteAllText($stage, (Get-UmiTaskHostContent $Sid), [Text.Encoding]::Unicode)
        Set-UmiProtectedAcl -Path $stage -Sid $Sid
        if (Test-Path -LiteralPath $layout.TaskHost) { [IO.File]::Replace($stage, $layout.TaskHost, $backup) }
        else { [IO.File]::Move($stage, $layout.TaskHost) }
        Set-UmiProtectedAcl -Path $layout.TaskHost -Sid $Sid
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force }
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    }
    return (Get-FileHash -LiteralPath $layout.TaskHost -Algorithm SHA256).Hash
}

function Assert-UmiTaskHost {
    param([Parameter(Mandatory = $true)][string]$Sid)
    $layout = Get-UmiProtectedLayout $Sid
    $manifest = Get-UmiManifest $Sid
    if (-not $manifest.PSObject.Properties['taskHostHash'] -or $manifest.taskHostHash -notmatch '^[A-Fa-f0-9]{64}$') { throw 'The protected GUI task host has no authorized hash.' }
    Assert-UmiNoReparsePoint $layout.TaskHost
    Assert-UmiProtectedAcl -Path $layout.TaskHost -Sid $Sid -Descendant
    if ((Get-FileHash -LiteralPath $layout.TaskHost -Algorithm SHA256).Hash -ne $manifest.taskHostHash) { throw 'The protected GUI task host changed.' }
}

function Copy-UmiProtectedApplication {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Sid
    )
    Assert-UmiElevatedIdentity $Sid
    $sourcePath = Get-UmiCanonicalPath $Source
    Assert-UmiNoReparsePoint -Path $sourcePath
    $layout = Get-UmiProtectedLayout -Sid $Sid
    if ($sourcePath.StartsWith($layout.Base + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The source application cannot be inside the protected installation.'
    }
    if (Test-Path -LiteralPath $layout.App) { throw 'An application already exists; validated recovery is required.' }
    # Explicit runtime allowlist. Cache, diagnostics, Git data and downloaded ZIPs
    # are excluded; the Python base is required because venv home is absolute.
    $sourceVenv = Get-Content -LiteralPath (Join-Path $sourcePath '.runtime\windows-tools\pyvenv.cfg') -Raw -ErrorAction Stop
    $baseMatch = [regex]::Match($sourceVenv, '(?m)^home\s*=\s*(.+?)\s*$')
    if (-not $baseMatch.Success) { throw 'Python runtime has no relocatable home.' }
    $pythonParent = Join-Path $sourcePath '.runtime\python'
    $pythonHome = Assert-UmiContainedPath $pythonParent $baseMatch.Groups[1].Value.Trim()
    Assert-UmiNoReparsePoint -Path $pythonHome -Recurse
    $pythonRelative = $pythonHome.Substring($sourcePath.Length + 1)
    # uv also creates an unversioned junction beside the real CPython base.
    # Copy only the exact real home referenced by this venv; no alias is needed.
    $required = @('package.json', 'package-lock.json', 'scripts', 'assets', 'node_modules', '.runtime\windows-tools', '.runtime\windows-mcp-source', $pythonRelative)
    $optional = @('.runtime\devtunnel', 'local-bin', 'extensions')
    foreach ($relative in $required) {
        $itemPath = Assert-UmiContainedPath $sourcePath (Join-Path $sourcePath $relative)
        if (-not (Test-Path -LiteralPath $itemPath)) { throw "Missing required runtime component: $relative" }
        Assert-UmiNoReparsePoint -Path $itemPath -Recurse
    }
    New-UmiProtectedDirectory -Path $layout.Base
    New-UmiProtectedDirectory -Path $layout.Root -Sid $Sid
    New-UmiProtectedDirectory -Path $layout.App -Sid $Sid
    foreach ($relative in ($required + $optional)) {
        $from = Join-Path $sourcePath $relative
        if (-not (Test-Path -LiteralPath $from)) { continue }
        Assert-UmiNoReparsePoint -Path $from -Recurse
        $to = Assert-UmiContainedPath $layout.App (Join-Path $layout.App $relative)
        $parent = Split-Path -Parent $to
        if (-not (Test-Path -LiteralPath $parent)) { [void][IO.Directory]::CreateDirectory($parent) }
        Copy-Item -LiteralPath $from -Destination $to -Recurse -Force -ErrorAction Stop
    }
    # Preserve the native helper snapshot authorized by UAC, even if editable
    # source files changed while the application payload was being copied.
    $snapshot = Get-UmiCanonicalPath $PSCommandPath
    [void](Assert-UmiContainedPath $layout.Root $snapshot)
    Assert-UmiProtectedAcl -Path $snapshot -Sid $Sid -Descendant
    $snapshotHash = (Get-FileHash -LiteralPath $snapshot -Algorithm SHA256).Hash
    $protectedHelper = Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1'
    Copy-Item -LiteralPath $snapshot -Destination $protectedHelper -Force -ErrorAction Stop
    if ((Get-FileHash -LiteralPath $protectedHelper -Algorithm SHA256).Hash -ne $snapshotHash) { throw 'The authorized native helper snapshot was not preserved.' }
    $sourceNode = Join-Path $sourcePath '.runtime\node\node.exe'
    if (-not (Test-Path -LiteralPath $sourceNode)) {
        $candidate = Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
        $sourceNode = [string]$candidate.Source
    }
    Assert-UmiNoReparsePoint -Path $sourceNode
    $nodeDirectory = Join-Path $layout.App '.runtime\node'
    [void][IO.Directory]::CreateDirectory($nodeDirectory)
    Copy-Item -LiteralPath $sourceNode -Destination (Join-Path $nodeDirectory 'node.exe') -ErrorAction Stop
    $signature = Get-AuthenticodeSignature -LiteralPath (Join-Path $nodeDirectory 'node.exe') -ErrorAction Stop
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(OpenJS Foundation|Node\.js Foundation)') {
        throw 'The protected Node runtime must have a valid OpenJS/Node.js publisher signature.'
    }
    $nodeVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $nodeDirectory 'node.exe')).ProductVersion
    if ($nodeVersion -notmatch '^v?(\d+\.\d+\.\d+)' -or [version]$Matches[1] -lt [version]'22.12.0') { throw 'The protected Node runtime must be version 22.12.0 or newer.' }
    $venvConfig = Join-Path $layout.App '.runtime\windows-tools\pyvenv.cfg'
    $config = Get-Content -LiteralPath $venvConfig -Raw -ErrorAction Stop
    $homeMatch = [regex]::Match($config, '(?m)^home\s*=\s*(.+?)\s*$')
    if (-not $homeMatch.Success) { throw 'Python runtime has no relocatable home.' }
    $originalHome = Assert-UmiContainedPath (Join-Path $sourcePath '.runtime\python') $homeMatch.Groups[1].Value.Trim()
    $relocatedHome = (Join-Path $layout.App '.runtime\python') + $originalHome.Substring((Join-Path $sourcePath '.runtime\python').Length)
    $config = [regex]::Replace($config, '(?m)^home\s*=.*$', [Text.RegularExpressions.MatchEvaluator]{ param($match) 'home = ' + $relocatedHome })
    [IO.File]::WriteAllText($venvConfig, $config)
    if (-not (Test-Path -LiteralPath (Join-Path $relocatedHome 'python.exe'))) { throw 'The protected Python base runtime is missing.' }
    foreach ($pth in (Get-ChildItem -LiteralPath (Join-Path $layout.App '.runtime\windows-tools\Lib\site-packages') -Filter '*.pth' -Recurse -File)) {
        foreach ($line in (Get-Content -LiteralPath $pth.FullName)) {
            if ($line.Trim() -match '^(?:[A-Za-z]:|[/\\]|\.\.(?:[/\\]|$))') { throw 'Python contains an external search-path reference.' }
        }
    }
    # The ordinary helper grants its account FullControl. The protected copy
    # instead retains BA/SYSTEM ownership and grants the original user RX only.
    $protection = @'
param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'windows\Admin-Mode.ps1') -LibraryOnly
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
Assert-UmiElevatedIdentity $sid
$layout=Get-UmiProtectedLayout $sid
if($root -ne $layout.App -or (Get-UmiCanonicalPath $Path) -ne (Join-Path $root '.local-data')){throw 'Unexpected protected state path.'}
Set-UmiProtectedAcl -Path $Path -Sid $sid
'@
    [IO.File]::WriteAllText((Join-Path $layout.App 'scripts\protect-local-data.ps1'), $protection)
    Assert-UmiNoReparsePoint -Path $layout.Root -Recurse
    Copy-UmiPrivateState -SourceState (Join-Path $sourcePath '.local-data') -DestinationState (Join-Path $layout.App '.local-data')
    # Native normalization is bounded even for the 10,000-file Python runtime.
    Set-UmiTreeProtection -Path $layout.App -Sid $Sid
    return $layout
}

function Test-UmiEmptyCompilerTempDirectory {
    param([Parameter(Mandatory = $true)]$Item, [Parameter(Mandatory = $true)][string]$Sid)
    if (-not $Item.PSIsContainer -or $Item.Name -notmatch '^[a-z0-9]{8}$') { return $false }
    $layout = Get-UmiProtectedLayout $Sid
    $temporary = Join-Path $layout.App '.local-data\temp'
    Assert-UmiNoReparsePoint -Path $temporary
    if (-not (Test-Path -LiteralPath $temporary -PathType Container)) { return $false }
    $temporary = Get-UmiCanonicalPath (Get-Item -LiteralPath $temporary -Force -ErrorAction Stop).FullName
    if ([IO.Path]::GetDirectoryName((Get-UmiCanonicalPath $Item.FullName)) -ne $temporary) { return $false }
    Assert-UmiNoReparsePoint -Path $Item.FullName
    $acl = Get-Acl -LiteralPath $Item.FullName -ErrorAction Stop
    $sections = [Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
    # Elevated .NET CodeDom leaves an empty BA-only directory with this exact
    # protected descriptor. It grants the normal account no access at all.
    $expected = 'O:BAG:' + (Assert-UmiSid $Sid) + 'D:P(D;OI;SD;;;' + $Sid + ')(A;OICI;FA;;;BA)'
    $expectedDescriptor = New-Object Security.AccessControl.RawSecurityDescriptor($expected)
    if ($acl.GetSecurityDescriptorSddlForm($sections) -cne $expectedDescriptor.GetSddlForm($sections)) { return $false }
    return @(Get-ChildItem -LiteralPath $Item.FullName -Force -ErrorAction Stop).Count -eq 0
}

function Assert-UmiProtectedTree {
    param([Parameter(Mandatory = $true)][string]$Sid)
    $layout = Get-UmiProtectedLayout -Sid $Sid
    Assert-UmiNoReparsePoint -Path $layout.Root -Recurse
    Assert-UmiProtectedAcl -Path $layout.Base
    Assert-UmiProtectedAcl -Path $layout.Root -Sid $Sid
    foreach ($item in (Get-ChildItem -LiteralPath $layout.Root -Recurse -Force -ErrorAction Stop)) {
        if (Test-UmiEmptyCompilerTempDirectory -Item $item -Sid $Sid) { continue }
        Assert-UmiProtectedAcl -Path $item.FullName -Sid $Sid -Descendant
    }
}

function Assert-UmiTaskSecurityDescriptor {
    param([Parameter(Mandatory = $true)][string]$Sddl, [Parameter(Mandatory = $true)][string]$Sid)
    $userSid = Assert-UmiSid $Sid
    $descriptor = New-Object Security.AccessControl.RawSecurityDescriptor($Sddl)
    if ($descriptor.Owner.Value -notin @('S-1-5-18', 'S-1-5-32-544') -or
        ($descriptor.ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclProtected) -eq 0) {
        throw 'The scheduled task has an untrusted owner or inherited DACL.'
    }
    $readExecute = 0x20000000 -bor -2147483648 -bor 0x1200a9 # GR/GX or Windows mapped FR/FX
    $foundUser = $false; $foundSystem = $false; $foundAdmin = $false
    foreach ($ace in $descriptor.DiscretionaryAcl) {
        if ($ace -isnot [Security.AccessControl.CommonAce] -or
            $ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed) {
            throw 'Unexpected scheduled task access rules.'
        }
        $principal = $ace.SecurityIdentifier.Value
        if ($principal -eq 'S-1-5-18') { $foundSystem = $true; continue }
        if ($principal -eq 'S-1-5-32-544') { $foundAdmin = $true; continue }
        if ($principal -ne $userSid -or ($ace.AccessMask -band (-bnot $readExecute)) -ne 0) {
            throw 'The scheduled task grants unprivileged modification rights.'
        }
        $foundUser = $true
    }
    if (-not $foundUser -or -not $foundSystem -or -not $foundAdmin) { throw 'Required scheduled task access is missing.' }
}

function Register-UmiProtectedTask {
    param([Parameter(Mandatory = $true)][string]$Sid)
    Assert-UmiElevatedIdentity $Sid
    $manifest = Get-UmiManifest $Sid
    $manifest | Add-Member -NotePropertyName taskHostHash -NotePropertyValue (Write-UmiTaskHost $Sid) -Force
    Write-UmiManifest $manifest
    Assert-UmiProtectedTree -Sid $Sid
    $layout = Get-UmiProtectedLayout -Sid $Sid
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    $folder = $service.GetFolder('\')
    $existing = $null
    try { $existing = $folder.GetTask($layout.TaskName) }
    catch {
        if ($_.Exception.HResult -ne -2147024894) { throw }
    }
    if ($existing) { throw 'A task already exists. Explicit validated upgrade or recovery is required.' }
    $definition = $service.NewTask(0)
    $definition.XmlText = Get-UmiTaskDefinitionXml -Sid $Sid -ProtectedApp $layout.App
    # TASK_CREATE=2, TASK_LOGON_INTERACTIVE_TOKEN=3; password is always null.
    # Creation is elevated and the task receives its protected DACL atomically.
    $registered = $folder.RegisterTaskDefinition($layout.TaskName, $definition, (2 -bor 16), $Sid, $null, 3, (Get-UmiProtectedSddl -Sid $Sid -Task))
    try {
        # OWNER_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION = 1|4.
        Assert-UmiTaskSecurityDescriptor -Sddl $registered.GetSecurityDescriptor(5) -Sid $Sid
        $samePrincipal = (Resolve-UmiPrincipalSid $registered.Definition.Principal.UserId) -eq $Sid
        if (-not $samePrincipal -or
            $registered.Definition.Principal.LogonType -ne 3 -or
            $registered.Definition.Principal.RunLevel -ne 1) {
            throw ('Scheduled task principal verification failed: sameSID=' + $samePrincipal + '; logonType=' + $registered.Definition.Principal.LogonType + '; runLevel=' + $registered.Definition.Principal.RunLevel + '.')
        }
    } catch {
        $folder.DeleteTask($layout.TaskName, 0)
        throw
    }
    return $registered
}

function Get-UmiCurrentSid { return (Assert-UmiSid ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)) }

function Resolve-UmiPrincipalSid {
    param([Parameter(Mandatory = $true)][string]$UserId)
    if ($UserId -match '^S-1-') { return (Assert-UmiSid $UserId) }
    try { return (Assert-UmiSid ([Security.Principal.NTAccount]::new($UserId).Translate([Security.Principal.SecurityIdentifier]).Value)) }
    catch { throw 'The scheduled task account cannot be resolved to the authorized Windows user.' }
}

function Get-UmiProductionStateNames {
    # Keep operational identity/settings; do not elevate QA scripts, screenshots,
    # diagnostic bundles, releases, or arbitrary executable files in .local-data.
    return @('connection-secret.txt', 'oauth-state.json', 'oauth-profiles', 'tunnel-config.json', 'profile', 'tool-policy.json', 'windows-tools-disabled', 'windows-tools.toml', 'devices.json', 'skill-registry.json', 'chat-links.json', 'request-history.jsonl', 'agent-config.json', 'workflows.jsonl', 'corp-state.json')
}

function Copy-UmiPrivateState {
    param([Parameter(Mandatory = $true)][string]$SourceState, [Parameter(Mandatory = $true)][string]$DestinationState)
    Assert-UmiNoReparsePoint -Path $SourceState -Recurse
    Assert-UmiNoReparsePoint -Path $DestinationState -Recurse
    [void][IO.Directory]::CreateDirectory($DestinationState)
    foreach ($name in (Get-UmiProductionStateNames)) {
        $from = Assert-UmiContainedPath $SourceState (Join-Path $SourceState $name)
        $to = Assert-UmiContainedPath $DestinationState (Join-Path $DestinationState $name)
        if (Test-Path -LiteralPath $to) { Remove-Item -LiteralPath $to -Recurse -Force -ErrorAction Stop }
        if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination $to -Recurse -Force -ErrorAction Stop }
    }
}

function Set-UmiTreeProtection {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Sid)
    Assert-UmiElevatedIdentity $Sid
    $layout = Get-UmiProtectedLayout $Sid
    [void](Assert-UmiContainedPath $layout.Root $Path)
    Assert-UmiNoReparsePoint -Path $Path -Recurse
    Set-UmiProtectedAcl -Path $Path -Sid $Sid
    $aclTool = Join-Path ([Environment]::GetFolderPath('System')) 'icacls.exe'
    & $aclTool $Path /reset /T /Q *> $null
    if ($LASTEXITCODE -ne 0) { throw 'The protected runtime permissions could not be normalized.' }
    & $aclTool $Path /setowner '*S-1-5-32-544' /T /Q *> $null
    if ($LASTEXITCODE -ne 0) { throw 'The protected runtime ownership could not be normalized.' }
    Set-UmiProtectedAcl -Path $Path -Sid $Sid
}

function Enter-UmiModeTransaction {
    param([Parameter(Mandatory = $true)][string]$Sid, [switch]$Consent)
    $security = New-Object Security.AccessControl.MutexSecurity
    $security.SetSecurityDescriptorSddlForm('D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;' + $Sid + ')', [Security.AccessControl.AccessControlSections]::Access)
    $created = $false
    $prefix = if ($Consent) { 'Global\UmiBridge-AdminConsent-' } else { 'Global\UmiBridge-AdminMode-' }
    $mutex = New-Object Threading.Mutex($false, ($prefix + (Assert-UmiSid $Sid)), [ref]$created, $security)
    try {
        try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
        if (-not $acquired) { throw 'A Windows-authorized mode change is already in progress.' }
        return $mutex
    } catch { $mutex.Dispose(); throw }
}

function Test-UmiModePending {
    param([Parameter(Mandatory = $true)][string]$Sid)
    foreach ($prefix in @('Global\UmiBridge-AdminConsent-', 'Global\UmiBridge-AdminMode-')) {
        $mutex = $null; $acquired = $false
        try {
            $mutex = [Threading.Mutex]::OpenExisting($prefix + $Sid)
            try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
            if (-not $acquired) { return $true }
        } catch [Threading.WaitHandleCannotBeOpenedException] { }
        finally { if ($mutex) { if ($acquired) { $mutex.ReleaseMutex() }; $mutex.Dispose() } }
    }
    return $false
}

function Stop-UmiProtectedTask {
    param([Parameter(Mandatory = $true)]$Task, [Parameter(Mandatory = $true)][string]$Sid)
    $layout = Get-UmiProtectedLayout $Sid
    if (-not (Test-UmiAdminToken) -and $Task.State -eq 4) {
        throw 'Stopping the administrator task requires Windows administrator authorization to terminate its full process tree.'
    }
    if (Test-UmiAdminToken) {
        $guiHost = Join-Path ([Environment]::GetFolderPath('System')) 'wscript.exe'
        foreach ($process in (Get-CimInstance Win32_Process -Filter "Name = 'wscript.exe'" -ErrorAction Stop)) {
            if ($process.ExecutablePath -eq $guiHost -and $process.CommandLine -match ('(?i)^"?' + [regex]::Escape($guiHost) + '"?\s+/B\s+/Nologo\s+"' + [regex]::Escape($layout.TaskHost) + '"\s*$')) {
                $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -ErrorAction Stop
                if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne $Sid) { throw 'The GUI task host does not belong to the authorized Windows user.' }
                & (Join-Path ([Environment]::GetFolderPath('System')) 'taskkill.exe') /PID $process.ProcessId /T /F *> $null
                if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) { throw 'The protected GUI task process tree could not be stopped.' }
            }
        }
        $entry = Join-Path $layout.App 'scripts\run-local-web.mjs'
        $node = Join-Path $layout.App '.runtime\node\node.exe'
        # Stop the verified executable tree explicitly; task host termination
        # alone must not leave Node/tunnel children mutating OAuth state.
        foreach ($process in (Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop)) {
            if ($process.ExecutablePath -eq $node -and $process.CommandLine -match ('(?i)^"?' + [regex]::Escape($node) + '"?\s+"?' + [regex]::Escape($entry) + '"?(?:\s|$)')) {
                & (Join-Path ([Environment]::GetFolderPath('System')) 'taskkill.exe') /PID $process.ProcessId /T /F *> $null
                if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) { throw 'The protected gateway process tree could not be stopped.' }
            }
        }
    }
    if ($Task.State -eq 4) { $Task.Stop(0) }
    for ($attempt = 0; $attempt -lt 40 -and $Task.State -eq 4; $attempt++) { Start-Sleep -Milliseconds 250 }
    if ($Task.State -eq 4) { throw 'The protected gateway has not stopped. Private state was retained.' }
    if (Get-UmiRunningGateway -Root $layout.App -TrustedState) { throw 'The protected gateway is still running. Windows administrator authorization is required to stop its process tree.' }
}

function Test-UmiAdministratorAccount {
    if (Test-UmiAdminToken) { return $true }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (@($identity.Groups | Where-Object Value -eq 'S-1-5-32-544').Count) { return $true }
    try {
        return @((Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop) | Where-Object { $_.SID.Value -eq $identity.User.Value }).Count -gt 0
    } catch { return $false }
}

function Get-UmiTask {
    param([string]$Sid, [switch]$AllowMissing)
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    try { return $service.GetFolder('\').GetTask((Get-UmiProtectedLayout $Sid).TaskName) }
    catch {
        if ($AllowMissing -and ($_.Exception.HResult -eq -2147024894 -or $_.Exception.ToString() -match '80070002')) { return $null }
        throw
    }
}

function Assert-UmiTaskDefinition {
    param([Parameter(Mandatory = $true)]$Task, [Parameter(Mandatory = $true)][string]$Sid, [switch]$RequireCurrent)
    $layout = Get-UmiProtectedLayout $Sid
    [xml]$expected = Get-UmiTaskDefinitionXml -Sid $Sid -ProtectedApp $layout.App
    [xml]$legacy = Get-UmiTaskDefinitionXml -Sid $Sid -ProtectedApp $layout.App -Legacy
    [xml]$powerShell = Get-UmiTaskDefinitionXml -Sid $Sid -ProtectedApp $layout.App -PowerShellHost
    [xml]$actual = $Task.Xml
    $principals = $actual.SelectNodes('/*[local-name()="Task"]/*[local-name()="Principals"]/*[local-name()="Principal"]')
    $actions = $actual.SelectNodes('/*[local-name()="Task"]/*[local-name()="Actions"]/*')
    $triggers = $actual.SelectNodes('/*[local-name()="Task"]/*[local-name()="Triggers"]/*')
    if ($principals.Count -ne 1 -or
        (Resolve-UmiPrincipalSid $principals[0].UserId) -ne $Sid -or
        $principals[0].LogonType -ne 'InteractiveToken' -or
        $principals[0].RunLevel -ne 'HighestAvailable' -or
        $actions.Count -ne 1 -or $actions[0].LocalName -ne 'Exec' -or
        $triggers.Count -ne 0 -or
        (-not ($actual.Task.Actions.Exec.Command -eq $expected.Task.Actions.Exec.Command -and $actual.Task.Actions.Exec.Arguments -eq $expected.Task.Actions.Exec.Arguments) -and
            ($RequireCurrent -or $actual.Task.Actions.Exec.Command -ne $legacy.Task.Actions.Exec.Command -or
                ($actual.Task.Actions.Exec.Arguments -ne $legacy.Task.Actions.Exec.Arguments -and $actual.Task.Actions.Exec.Arguments -ne $powerShell.Task.Actions.Exec.Arguments))) -or
        $actual.Task.Actions.Exec.WorkingDirectory -ne $layout.App -or -not $Task.Enabled) {
        throw 'The protected scheduled task does not match the authorized application.'
    }
    Assert-UmiTaskSecurityDescriptor -Sddl $Task.GetSecurityDescriptor(5) -Sid $Sid
    if ($actual.Task.Actions.Exec.Command -eq $expected.Task.Actions.Exec.Command) { Assert-UmiTaskHost $Sid }
}

function Write-UmiManifest {
    param([Parameter(Mandatory = $true)]$Manifest)
    Assert-UmiElevatedIdentity $Manifest.sid
    $layout = Get-UmiProtectedLayout $Manifest.sid
    $temporary = Join-Path $layout.Root ('mode-' + [guid]::NewGuid().ToString('N') + '.tmp')
    [IO.File]::WriteAllText($temporary, ($Manifest | ConvertTo-Json -Depth 8))
    Set-UmiProtectedAcl -Path $temporary -Sid $Manifest.sid
    if (Test-Path -LiteralPath $layout.Manifest) {
        Assert-UmiProtectedAcl -Path $layout.Manifest -Sid $Manifest.sid
        $backup = Join-Path $layout.Root ('mode-backup-' + [guid]::NewGuid().ToString('N') + '.tmp')
        [IO.File]::Replace($temporary, $layout.Manifest, $backup)
        Remove-Item -LiteralPath $backup -Force
    } else { [IO.File]::Move($temporary, $layout.Manifest) }
}

function Get-UmiManifest {
    param([Parameter(Mandatory = $true)][string]$Sid, [switch]$AllowMissing)
    $layout = Get-UmiProtectedLayout $Sid
    if (-not (Test-Path -LiteralPath $layout.Root)) {
        if ($AllowMissing) { return $null }
        throw 'Admin mode is not installed.'
    }
    Assert-UmiProtectedAcl -Path $layout.Base
    Assert-UmiProtectedAcl -Path $layout.Root -Sid $Sid
    Assert-UmiProtectedAcl -Path $layout.Manifest -Sid $Sid
    $manifest = Get-Content -LiteralPath $layout.Manifest -Raw -ErrorAction Stop | ConvertFrom-Json
    if ($manifest.schema -ne 1 -or $manifest.sid -ne $Sid -or $manifest.phase -notin @('preparing', 'active', 'restoring') -or
        $manifest.nonce -notmatch '^[a-f0-9]{32}$' -or $manifest.helperHash -notmatch '^[A-Fa-f0-9]{64}$' -or
        [int]$manifest.port -lt 1024 -or [int]$manifest.port -gt 65535) { throw 'The protected mode manifest is invalid.' }
    $original = Get-UmiCanonicalPath $manifest.sourceRoot
    if ($original -eq $layout.Base -or $original.StartsWith($layout.Base + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'The original source location is invalid.' }
    $helper = Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1'
    Assert-UmiProtectedAcl -Path $helper -Sid $Sid -Descendant
    if ((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ne $manifest.helperHash) { throw 'The protected native helper changed.' }
    return $manifest
}

function Get-UmiRunningGateway {
    param([Parameter(Mandatory = $true)][string]$Root, [switch]$Health, [switch]$TrustedState)
    $statePath = Join-Path $Root '.local-data\web-status.json'
    if (-not (Test-Path -LiteralPath $statePath)) { return $null }
    try {
        if ($TrustedState) { Assert-UmiProtectedAcl -Path $statePath -Sid (Get-UmiCurrentSid) -Descendant }
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$state.pid) -ErrorAction Stop
        $entry = Join-Path $Root 'scripts\run-local-web.mjs'
        if (-not $process -or $process.Name -ne 'node.exe') { return $null }
        $absolute = $process.CommandLine -match ('(?i)^"?[^"\r\n]+?node\.exe"?\s+"?' + [regex]::Escape($entry) + '"?(?:\s|$)')
        $relative = $process.CommandLine -match '(?i)^"?[^"\r\n]+?node\.exe"?\s+"?(?:\.?[\\/])?scripts[\\/]run-local-web\.mjs"?(?:\s|$)'
        # Medium callers cannot inspect an elevated process's command line.
        # Only an ACL-validated protected status file can replace that evidence.
        if (-not $absolute -and -not $relative -and -not ($TrustedState -and -not $process.CommandLine)) { return $null }
        if (-not @(Get-NetTCPConnection -LocalPort ([int]$state.port) -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -eq [int]$state.pid -and $_.LocalAddress -in @('127.0.0.1', '::1') }).Count) { return $null }
        if ($Health) {
            $response = Invoke-WebRequest -Uri ('http://127.0.0.1:' + [int]$state.port + '/health') -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ne 200) { return $null }
        }
        return $state
    } catch { return $null }
}

function Get-UmiAdminModeStatus {
    param([string]$SourceRoot)
    $result = [ordered]@{ mode = 'normal'; elevated = [bool](Test-UmiAdminToken); installed = $false; capability = 'available'; running = $false; version = $null; needsUpdate = $false; pending = $false }
    if (-not (Test-UmiAdministratorAccount)) { $result.capability = 'needs-admin-account' }
    try {
        $sid = Get-UmiCurrentSid
        $result.pending = [bool](Test-UmiModePending $sid)
        $layout = Get-UmiProtectedLayout $sid
        if (-not (Test-Path -LiteralPath $layout.Root)) {
            if ($SourceRoot) { $result.running = [bool](Get-UmiRunningGateway -Root (Get-UmiCanonicalPath $SourceRoot)) }
            return $result
        }
        $result.installed = $true
        $manifest = Get-UmiManifest $sid
        $task = Get-UmiTask $sid
        Assert-UmiTaskDefinition -Task $task -Sid $sid
        if ($manifest.phase -ne 'active') { throw 'A protected mode transaction needs recovery.' }
        $result.mode = 'admin'; $result.version = $manifest.version
        $result.running = ($task.State -eq 4) -and [bool](Get-UmiRunningGateway -Root $layout.App -TrustedState)
        $packagePath = Join-Path $manifest.sourceRoot 'package.json'
        if (Test-Path -LiteralPath $packagePath) {
            $result.needsUpdate = (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version -ne $manifest.version
        }
        $sourceHelper = Join-Path $manifest.sourceRoot 'scripts\windows\Admin-Mode.ps1'
        if (Test-Path -LiteralPath $sourceHelper) {
            $result.needsUpdate = $result.needsUpdate -or (Get-FileHash -LiteralPath $sourceHelper -Algorithm SHA256).Hash -ne $manifest.helperHash
        }
        [xml]$currentDefinition = Get-UmiTaskDefinitionXml -Sid $sid -ProtectedApp $layout.App
        [xml]$registeredDefinition = $task.Xml
        $result.needsUpdate = $result.needsUpdate -or $registeredDefinition.Task.Actions.Exec.Arguments -ne $currentDefinition.Task.Actions.Exec.Arguments
    } catch { $result.mode = 'unavailable'; $result.capability = 'integrity-error' }
    return $result
}

function Remove-UmiProtectedInstallation {
    param([Parameter(Mandatory = $true)][string]$Sid)
    Assert-UmiElevatedIdentity $Sid
    $layout = Get-UmiProtectedLayout $Sid
    if (Test-Path -LiteralPath $layout.Root) {
        Assert-UmiProtectedAcl -Path $layout.Root -Sid $Sid
        Assert-UmiNoReparsePoint -Path $layout.Root -Recurse
        # This exact SID directory is derived from Windows, never caller input.
        Set-Location -LiteralPath ([Environment]::GetFolderPath('System'))
        Remove-Item -LiteralPath $layout.Root -Recurse -Force -ErrorAction Stop
    }
}

function Start-UmiMediumProcess {
    param([Parameter(Mandatory = $true)][string]$File, [Parameter(Mandatory = $true)][string]$Arguments)
    # Obtain the desktop shell's IShellDispatch2, not the caller's elevated shell.
    $shellWindows = New-Object -ComObject 'Shell.Application'
    $windowHandle = 0
    $desktop = $shellWindows.Windows().FindWindowSW(0, 0, 8, [ref]$windowHandle, 1)
    if (-not $desktop) { throw 'The original Windows desktop is unavailable. Sign in interactively and retry.' }
    $desktop.Document.Application.ShellExecute($File, $Arguments, '', 'open', 0)
}

function Get-UmiPowerShell { return (Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe') }
function ConvertTo-UmiPsLiteral { param([string]$Value) return ("'" + $Value.Replace("'", "''") + "'") }

function Request-UmiElevation {
    param([Parameter(Mandatory = $true)][string]$RequestedAction, [string]$Source)
    $sid = Get-UmiCurrentSid
    $layout = Get-UmiProtectedLayout $sid
    if ((Test-UmiAdminToken) -or ($GatewayRequest -and -not $ConsentBroker)) {
        # Explorer also detaches a medium gateway request from Node's process
        # tree, which the authorized operation must stop during migration.
        if ($ConsentBroker) { throw 'The Windows authorization broker must run with the original medium token.' }
        if (Test-Path -LiteralPath $layout.Manifest) {
            $manifest = Get-UmiManifest $sid
            $Source = $manifest.sourceRoot
            $helper = if ($RequestedAction -in @('enable', 'update')) { Join-Path $Source 'scripts\windows\Admin-Mode.ps1' } else { Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1' }
        } else {
            $Source = Get-UmiCanonicalPath $Source
            $helper = Get-UmiCanonicalPath $PSCommandPath
        }
        $Source = Get-UmiCanonicalPath $Source
        $helper = Get-UmiCanonicalPath $helper
        Start-UmiMediumProcess -File (Get-UmiPowerShell) -Arguments ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $helper + '" -Action ' + $RequestedAction + ' -SourceRoot "' + $Source + '" -ConsentBroker -ExpectedSid ' + $sid)
        for ($attempt = 0; $attempt -lt 20; $attempt++) { if (Test-UmiModePending $sid) { return $false }; Start-Sleep -Milliseconds 100 }
        throw 'The original medium Windows desktop could not open the authorization broker.'
        return $false
    }
    if (-not (Test-UmiAdministratorAccount)) { throw 'This Windows account has no administrator token. Sign in with an administrator account; authorizing a different account cannot provide persistent Admin mode for this user.' }
    $recoverPreparation = $false
    if ($RequestedAction -eq 'update') {
        $existing = Get-UmiManifest $sid
        if ($existing.phase -ne 'active') { throw 'Finish the existing mode transaction before updating the native helper.' }
        Assert-UmiTaskDefinition -Task (Get-UmiTask $sid) -Sid $sid
        $Source = $existing.sourceRoot
    }
    if ($RequestedAction -eq 'enable' -and (Test-Path -LiteralPath $layout.Manifest)) {
        $existing = Get-UmiManifest $sid
        if ($existing.phase -eq 'preparing') {
            [void](Get-UmiPreparationRecoveryTask -Manifest $existing -Sid $sid)
            $recoverPreparation = $true
            $Source = $existing.sourceRoot
        }
        elseif ($existing.phase -eq 'active' -and -not (Get-UmiRunningGateway -Root $layout.App -TrustedState)) {
            $existingTask = Get-UmiTask -Sid $sid
            Assert-UmiTaskDefinition -Task $existingTask -Sid $sid
            if ($existingTask.State -ne 4) { $recoverPreparation = $true; $Source = $existing.sourceRoot }
        }
    }
    if ($RequestedAction -eq 'update' -or ($RequestedAction -in @('enable', 'disable') -and (-not (Test-Path -LiteralPath $layout.Manifest) -or $recoverPreparation))) {
        # The encoded bootstrap is captured before UAC. It checks this exact
        # helper hash, copies it with a protected DACL, and executes only that
        # protected snapshot after consent; no source script runs elevated.
        $definitions = @('Test-UmiAdminToken', 'Assert-UmiSid', 'Get-UmiCanonicalPath', 'Assert-UmiContainedPath', 'Assert-UmiNoReparsePoint', 'Get-UmiProtectedLayout', 'Get-UmiProtectedSddl', 'Assert-UmiElevatedIdentity', 'Assert-UmiProtectedAcl', 'Set-UmiProtectedAcl', 'New-UmiProtectedDirectory', 'Write-UmiAdminError') | ForEach-Object {
            $body = ((Get-Command $_).Definition -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') }) -join "`n"
            'function ' + $_ + " {`n" + $body + "`n}"
        }
        $currentHelper = if ($RequestedAction -eq 'update') { Join-Path $Source 'scripts\windows\Admin-Mode.ps1' } else { $PSCommandPath }
        Assert-UmiNoReparsePoint -Path $currentHelper
        $hash = (Get-FileHash -LiteralPath $currentHelper -Algorithm SHA256).Hash
        $bootstrap = "`$env:PSModulePath=[IO.Path]::Combine([Environment]::GetFolderPath('System'),'WindowsPowerShell\v1.0\Modules')`n" + ($definitions -join "`n") + "`n" + @"
`$ErrorActionPreference='Stop'
Assert-UmiElevatedIdentity '$sid'
`$layout=Get-UmiProtectedLayout '$sid'
Assert-UmiNoReparsePoint $(ConvertTo-UmiPsLiteral $currentHelper)
if((Get-FileHash -LiteralPath $(ConvertTo-UmiPsLiteral $currentHelper) -Algorithm SHA256).Hash -ne '$hash'){throw 'The native helper changed during Windows authorization.'}
try {
New-UmiProtectedDirectory -Path `$layout.Base
New-UmiProtectedDirectory -Path `$layout.Root -Sid '$sid'
`$bootstrapDir=Join-Path `$layout.Root 'bootstrap'
New-UmiProtectedDirectory -Path `$bootstrapDir -Sid '$sid'
`$snapshot=Join-Path `$bootstrapDir 'Admin-Mode.ps1'
Copy-Item -LiteralPath $(ConvertTo-UmiPsLiteral $currentHelper) -Destination `$snapshot -Force -ErrorAction Stop
Set-UmiProtectedAcl -Path `$snapshot -Sid '$sid'
if((Get-FileHash -LiteralPath `$snapshot -Algorithm SHA256).Hash -ne '$hash'){throw 'The native helper snapshot changed.'}
& `$snapshot -Action $RequestedAction -SourceRoot $(ConvertTo-UmiPsLiteral $Source) -ExpectedSid '$sid' -ElevatedRequest
exit `$LASTEXITCODE
} catch {
    `$failure=`$_
    try { Write-UmiAdminError -RecordError `$failure -Sid '$sid' } catch { }
    if((Test-Path -LiteralPath `$layout.Root) -and -not (Test-Path -LiteralPath `$layout.Manifest)) {
        `$service=New-Object -ComObject 'Schedule.Service'; `$service.Connect(); `$taskExists=`$false
        try { `$null=`$service.GetFolder('\').GetTask(`$layout.TaskName); `$taskExists=`$true } catch { if(`$_.Exception.ToString() -notmatch '80070002'){throw} }
        if(-not `$taskExists){Assert-UmiProtectedAcl -Path `$layout.Root -Sid '$sid'; Assert-UmiNoReparsePoint -Path `$layout.Root -Recurse; Remove-Item -LiteralPath `$layout.Root -Recurse -Force}
    }
    throw `$failure
}
"@
        $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($bootstrap))
        $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + $encoded
    } else {
        $manifest = Get-UmiManifest $sid
        $helper = Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1'
        $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $helper + '" -Action ' + $RequestedAction + ' -ExpectedSid ' + $sid + ' -ElevatedRequest'
    }
    if ($arguments.Length -gt 30000) { throw 'The native authorization command exceeds the Windows command-line limit.' }
    $consent = Enter-UmiModeTransaction -Sid $sid -Consent
    try {
        foreach ($entry in @(Get-ChildItem Env: | Where-Object { $_.Name -match '^(COR_|CORECLR_|COMPLUS_|DOTNET_STARTUP_HOOKS$|__PSLockdownPolicy$)' })) { [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process') }
        $child = Start-Process -FilePath (Get-UmiPowerShell) -Verb RunAs -ArgumentList $arguments -WorkingDirectory ([Environment]::GetFolderPath('System')) -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop
    }
    catch {
        if (($_.Exception -is [ComponentModel.Win32Exception] -and $_.Exception.NativeErrorCode -eq 1223) -or $_.Exception.ToString() -match '1223|canceled by the user|cancelled by the user') { throw 'Windows authorization was cancelled. The current mode was retained.' }
        throw
    }
    finally { $consent.ReleaseMutex(); $consent.Dispose() }
    if ($child.ExitCode -ne 0) { throw 'The Windows-authorized operation failed. The protected mode status identifies any recovery required.' }
    return $true
}

function Stop-UmiNormalGateway {
    param([Parameter(Mandatory = $true)][string]$Root)
    $running = Get-UmiRunningGateway -Root $Root
    if (-not $running) { return $false }
    $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$running.pid) -ErrorAction Stop
    $entry = Join-Path $Root 'scripts\run-local-web.mjs'
    $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -ErrorAction Stop
    if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne (Get-UmiCurrentSid) -or
        $process.CommandLine -notmatch ('(?i)^"?[^"\r\n]+?node\.exe"?\s+"?' + [regex]::Escape($entry) + '"?(?:\s|$)')) {
        throw 'Restart the normal gateway with the current launcher before enabling Admin mode; its exact process identity could not be verified.'
    }
    & (Join-Path ([Environment]::GetFolderPath('System')) 'taskkill.exe') /PID ([int]$running.pid) /T /F *> $null
    if ($LASTEXITCODE -ne 0) { throw 'The existing normal gateway could not be stopped.' }
    return $true
}

function Initialize-UmiTaskEnvironment {
    param([Parameter(Mandatory = $true)]$Manifest)
    $layout = Get-UmiProtectedLayout $Manifest.sid
    $saved = @{}
    foreach ($name in @('USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'USERNAME', 'USERDOMAIN', 'SystemRoot', 'SystemDrive', 'WINDIR', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432')) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($value) { $saved[$name] = $value }
    }
    foreach ($entry in @(Get-ChildItem Env:)) { [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process') }
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    $system = [Environment]::GetFolderPath('System')
    $env:ProgramData = [Environment]::GetFolderPath('CommonApplicationData')
    $env:ALLUSERSPROFILE = $env:ProgramData
    $env:PATH = (Join-Path $layout.App '.runtime\node') + ';' + $system + ';' + (Split-Path -Parent (Get-UmiPowerShell)) + ';' + [Environment]::GetFolderPath('Windows')
    $env:PSModulePath = Join-Path (Split-Path -Parent (Get-UmiPowerShell)) 'Modules'
    $env:TEMP = Join-Path $layout.App '.local-data\temp'; $env:TMP = $env:TEMP
    New-UmiProtectedDirectory -Path $env:TEMP -Sid $Manifest.sid
    $env:PYTHONNOUSERSITE = '1'; $env:PYTHONSAFEPATH = '1'; $env:PYTHONDONTWRITEBYTECODE = '1'
    $env:DC_WEB_PORT = [string]$Manifest.port
    if ($Manifest.localOnly) { $env:DC_LOCAL_ONLY = '1' }
    if ($Manifest.externalUrl) { $env:DC_PUBLIC_URL = [string]$Manifest.externalUrl }
    $env:UMIBRIDGE_ADMIN_MODE = '1'
}

function Test-UmiProtectedRuntime {
    param([Parameter(Mandatory = $true)]$Manifest)
    Assert-UmiElevatedIdentity $Manifest.sid
    $layout = Get-UmiProtectedLayout $Manifest.sid
    Initialize-UmiTaskEnvironment $Manifest
    Push-Location -LiteralPath $layout.App
    try {
    $preflightLog = Join-Path $layout.App '.local-data\runtime-preflight.log'
    $node = Join-Path $layout.App '.runtime\node\node.exe'
    & $node --check (Join-Path $layout.App 'scripts\run-local-web.mjs') *> $preflightLog
    if ($LASTEXITCODE -ne 0) { throw ('The protected Node application failed its syntax check: ' + [IO.File]::ReadAllText($preflightLog)) }
    $ready = Get-Content -LiteralPath (Join-Path $layout.App '.runtime\windows-tools\umibridge-ready.json') -Raw | ConvertFrom-Json
    $lockHash = (Get-FileHash -LiteralPath (Join-Path $layout.App 'scripts\windows-tools-requirements.txt') -Algorithm SHA256).Hash
    if ($ready.package -ne 'windows-mcp' -or $ready.python -ne '3.14.7' -or $ready.lock_sha256 -ne $lockHash) { throw 'The Windows runtime does not match its reviewed dependency lock.' }
    $configuration = @{ root = $layout.App; python = $ready.python } | ConvertTo-Json -Compress
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($configuration))
    $code = "import base64,json,pathlib,sys; c=json.loads(base64.b64decode('$encoded')); r=pathlib.Path(c['root']).resolve(); assert sys.version.split()[0]==c['python']; assert pathlib.Path(sys.base_prefix).resolve().is_relative_to(r); assert pathlib.Path(sys.prefix).resolve().is_relative_to(r); sys.path.insert(0,str(r/'.runtime'/'windows-mcp-source'/'src')); import windows_mcp"
    & (Join-Path $layout.App '.runtime\windows-tools\Scripts\python.exe') -I -c $code *> $preflightLog
    if ($LASTEXITCODE -ne 0) { throw ('The protected Windows Python runtime failed relocation or import verification: ' + [IO.File]::ReadAllText($preflightLog)) }
    $gen = Join-Path $layout.App '.runtime\windows-tools\Lib\site-packages\comtypes\gen'
    if (-not (Test-Path -LiteralPath $gen)) { [void][IO.Directory]::CreateDirectory($gen) }
    if (-not $Manifest.localOnly -and -not $Manifest.externalUrl) {
        $tunnel = Join-Path $layout.App '.runtime\devtunnel\devtunnel.exe'
        $signature = Get-AuthenticodeSignature -LiteralPath $tunnel
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation(?:,|$)') { throw 'The saved tunnel runtime is not a verified Microsoft executable.' }
    }
    } finally { Pop-Location }
}

function Invoke-UmiTaskWorker {
    $sid = Get-UmiCurrentSid
    Assert-UmiElevatedIdentity $sid
    $manifest = Get-UmiManifest $sid
    $layout = Get-UmiProtectedLayout $sid
    if ((Get-UmiCanonicalPath $PSCommandPath) -ne (Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1') -or $manifest.phase -notin @('preparing', 'active')) { throw 'Only the protected authorized task can start the administrator gateway.' }
    Assert-UmiTaskDefinition -Task (Get-UmiTask $sid) -Sid $sid
    Assert-UmiProtectedTree -Sid $sid
    Initialize-UmiTaskEnvironment $manifest
    Write-UmiTaskAuthDiagnostic $manifest
    $node = Join-Path $layout.App '.runtime\node\node.exe'
    $entry = Join-Path $layout.App 'scripts\run-local-web.mjs'
    $process = Start-Process -FilePath $node -ArgumentList ('"' + $entry + '"') -WorkingDirectory $layout.App -WindowStyle Hidden -RedirectStandardOutput (Join-Path $layout.App '.local-data\server.log') -RedirectStandardError (Join-Path $layout.App '.local-data\server-error.log') -PassThru -Wait
    exit $process.ExitCode
}

function Write-UmiTaskAuthDiagnostic {
    param([Parameter(Mandatory = $true)]$Manifest)
    $layout = Get-UmiProtectedLayout $Manifest.sid
    $diagnostic = [ordered]@{
        elevated = [bool](Test-UmiAdminToken)
        sameSid = (Get-UmiCurrentSid) -eq $Manifest.sid
        userProfileMatchesOs = $env:USERPROFILE -eq [Environment]::GetFolderPath('UserProfile')
        localAppDataMatchesOs = $env:LOCALAPPDATA -eq [Environment]::GetFolderPath('LocalApplicationData')
        appDataMatchesOs = $env:APPDATA -eq [Environment]::GetFolderPath('ApplicationData')
        folderHashes = Get-UmiProfileFingerprints
        cache = @(); cliExit = $null; loginExpired = $false; timedOut = $false; diagnosticError = $false
    }
    try {
        $cacheDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'DevTunnels'
        Assert-UmiNoReparsePoint -Path $cacheDirectory
        foreach ($name in @('devtunnels-tokens', 'devtunnels-tokens-github', 'devtunnels-tokens-microsoft', 'devtunnels.json')) {
            $file = Join-Path $cacheDirectory $name
            if (Test-Path -LiteralPath $file) {
                Assert-UmiNoReparsePoint -Path $file
                $item = Get-Item -LiteralPath $file
                $diagnostic.cache += @{ name = $name; bytes = $item.Length; modifiedUtc = $item.LastWriteTimeUtc.ToString('o'); sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash }
            }
        }
        if (-not $Manifest.localOnly -and -not $Manifest.externalUrl) {
            $config = Get-Content -LiteralPath (Join-Path $layout.App '.local-data\tunnel-config.json') -Raw | ConvertFrom-Json
            if ($config.tunnelId -notmatch '^[a-z0-9][a-z0-9.-]{2,99}$') { throw 'Invalid saved tunnel identifier.' }
            $info = New-Object Diagnostics.ProcessStartInfo
            $info.FileName = Join-Path $layout.App '.runtime\devtunnel\devtunnel.exe'
            $info.Arguments = 'show ' + $config.tunnelId + ' --json'
            $info.WorkingDirectory = $layout.App
            $info.UseShellExecute = $false; $info.CreateNoWindow = $true
            $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
            $process = New-Object Diagnostics.Process
            $process.StartInfo = $info
            try {
                [void]$process.Start()
                $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
                if (-not $process.WaitForExit(10000)) { $diagnostic.timedOut = $true; $process.Kill(); $process.WaitForExit() }
                $diagnostic.cliExit = $process.ExitCode
                # Raw CLI output stays in memory and is discarded. Only these
                # two authentication result fields are written to private disk.
                $text = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
                $diagnostic.loginExpired = $text -match '(?i)(login|token).{0,40}expired|expired.{0,40}(login|token)'
            } finally { $process.Dispose() }
        }
    } catch { $diagnostic.diagnosticError = $true }
    $destination = Join-Path $layout.App '.local-data\admin-environment.json'
    Assert-UmiNoReparsePoint $destination
    [IO.File]::WriteAllText($destination, ($diagnostic | ConvertTo-Json -Depth 5))
    Set-UmiProtectedAcl -Path $destination -Sid $Manifest.sid
}

function Get-UmiProfileFingerprints {
    # Comparable between medium and scheduled high tokens without recording
    # account names or profile paths. Windows paths compare case-insensitively.
    $result = [ordered]@{}
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        foreach ($folder in @('UserProfile', 'LocalApplicationData', 'ApplicationData')) {
            $value = [Environment]::GetFolderPath($folder)
            $normalized = if ($value) { [IO.Path]::GetFullPath($value).TrimEnd('\').ToUpperInvariant() } else { '' }
            $result[$folder] = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalized)))).Replace('-', '')
        }
    } finally { $sha.Dispose() }
    return $result
}

function Start-UmiAdminGateway {
    param([Parameter(Mandatory = $true)][string]$Sid)
    $manifest = Get-UmiManifest $Sid
    $layout = Get-UmiProtectedLayout $Sid
    if ($manifest.phase -ne 'active') { throw 'The mode transaction needs recovery before starting.' }
    $task = Get-UmiTask $Sid
    Assert-UmiTaskDefinition -Task $task -Sid $Sid
    if (Get-UmiRunningGateway -Root $layout.App -Health -TrustedState) { return }
    [void]$task.Run($null)
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        $running = Get-UmiRunningGateway -Root $layout.App -Health -TrustedState
        if ($running) {
            if ($manifest.publicUrl -and $running.publicUrl -ne $manifest.publicUrl) { Stop-UmiProtectedTask -Task $task -Sid $Sid; throw 'The public URL changed. Admin mode was not accepted.' }
            if ((Get-FileHash -LiteralPath (Join-Path $layout.App '.local-data\connection-secret.txt') -Algorithm SHA256).Hash -ne $manifest.secretHash) { Stop-UmiProtectedTask -Task $task -Sid $Sid; throw 'The existing connection identity changed. Admin mode was not accepted.' }
            return
        }
        if ($attempt -gt 3 -and $task.State -ne 4) { throw 'The protected administrator gateway stopped before becoming healthy.' }
        Start-Sleep -Milliseconds 500
    }
    Stop-UmiProtectedTask -Task $task -Sid $Sid
    throw 'The protected administrator gateway did not become healthy within 60 seconds.'
}

function Start-UmiNormalLauncher {
    param([Parameter(Mandatory = $true)][string]$Root)
    Start-UmiMediumProcess -File (Get-UmiPowerShell) -Arguments ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Root 'scripts\windows\UmiBridge.ps1') + '" -Action start -NoUpdate -NoTunnelRepair')
}

function Get-UmiPreparationRecoveryTask {
    param([Parameter(Mandatory = $true)]$Manifest, [Parameter(Mandatory = $true)][string]$Sid)
    $layout = Get-UmiProtectedLayout $Sid
    if ($Manifest.sid -ne $Sid -or $Manifest.phase -ne 'preparing') { throw 'Only the original incomplete preparation can be recovered.' }
    $task = Get-UmiTask -Sid $Sid -AllowMissing
    if ($task) {
        Assert-UmiTaskDefinition -Task $task -Sid $Sid
        if ($task.State -ne 3) { throw 'Preparation recovery requires a stopped, ready administrator task.' }
    }
    if ((Get-UmiRunningGateway -Root $layout.App -TrustedState) -or -not (Get-UmiRunningGateway -Root $Manifest.sourceRoot -Health)) { throw 'Preparation recovery requires the healthy original Normal gateway and no protected gateway.' }
    foreach ($process in (Get-CimInstance Win32_Process -ErrorAction Stop)) {
        if (($process.ExecutablePath -and $process.ExecutablePath.StartsWith($layout.App + '\', [StringComparison]::OrdinalIgnoreCase)) -or
            ($process.CommandLine -and $process.CommandLine.IndexOf($layout.App + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0)) { throw 'Preparation recovery cannot remove a running protected application.' }
    }
    return $task
}

function Update-UmiAdminMode {
    param([Parameter(Mandatory = $true)][string]$Sid)
    Assert-UmiElevatedIdentity $Sid
    $manifest = Get-UmiManifest $Sid
    if ($manifest.phase -ne 'active') { throw 'Finish the existing mode transaction before updating the native helper.' }
    $layout = Get-UmiProtectedLayout $Sid
    $snapshot = Get-UmiCanonicalPath $PSCommandPath
    if ($snapshot -ne (Join-Path $layout.Root 'bootstrap\Admin-Mode.ps1')) { throw 'Updating requires a newly Windows-authorized protected helper snapshot.' }
    Assert-UmiProtectedAcl -Path $snapshot -Sid $Sid
    $task = Get-UmiTask $Sid
    Assert-UmiTaskDefinition -Task $task -Sid $Sid
    $oldXml = [string]$task.Xml
    $oldSddl = [string]$task.GetSecurityDescriptor(5)
    $oldManifest = $manifest | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    $helper = Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1'
    $nonce = [guid]::NewGuid().ToString('N')
    $stage = Join-Path $layout.Root ('helper-update-' + $nonce + '.tmp')
    $backup = Join-Path $layout.Root ('helper-backup-' + $nonce + '.ps1')
    $discard = Join-Path $layout.Root ('helper-discard-' + $nonce + '.tmp')
    $hostBackup = Join-Path $layout.Root ('host-backup-' + $nonce + '.vbs')
    $hadHost = Test-Path -LiteralPath $layout.TaskHost
    if ($hadHost) { Assert-UmiProtectedAcl -Path $layout.TaskHost -Sid $Sid -Descendant; [IO.File]::Copy($layout.TaskHost, $hostBackup); Set-UmiProtectedAcl -Path $hostBackup -Sid $Sid }
    $changed = $false; $complete = $false
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    $folder = $service.GetFolder('\')
    try {
        [IO.File]::Copy($snapshot, $stage)
        Set-UmiProtectedAcl -Path $stage -Sid $Sid
        $newHash = (Get-FileHash -LiteralPath $stage -Algorithm SHA256).Hash
        if ($newHash -ne (Get-FileHash -LiteralPath $snapshot -Algorithm SHA256).Hash) { throw 'The authorized native update snapshot changed.' }
        # Replace only the native helper. App code, runtimes, private credentials,
        # OAuth grants, tunnel identity and any running gateway stay in place.
        [IO.File]::Replace($stage, $helper, $backup)
        $changed = $true
        Set-UmiProtectedAcl -Path $helper -Sid $Sid
        $manifest.helperHash = $newHash
        $manifest | Add-Member -NotePropertyName taskHostHash -NotePropertyValue (Write-UmiTaskHost $Sid) -Force
        Write-UmiManifest $manifest
        $definition = $service.NewTask(0)
        $definition.XmlText = Get-UmiTaskDefinitionXml -Sid $Sid -ProtectedApp $layout.App
        # Update the existing identity, retain the protected DACL, and suppress
        # registration triggers. Never create a second task or save a password.
        $updated = $folder.RegisterTaskDefinition($layout.TaskName, $definition, (4 -bor 16 -bor 32), $Sid, $null, 3, (Get-UmiProtectedSddl -Sid $Sid -Task))
        Assert-UmiTaskDefinition -Task $updated -Sid $Sid -RequireCurrent
        if ($updated.Definition.Principal.LogonType -ne 3 -or $updated.Definition.Principal.RunLevel -ne 1) { throw 'The updated scheduled task has an unexpected privilege level.' }
        $complete = $true
    } catch {
        $failure = $_
        try { Write-UmiAdminError -RecordError $failure -Sid $Sid } catch { }
        if ($changed) {
            try {
                $previous = $service.NewTask(0)
                $previous.XmlText = $oldXml
                $restored = $folder.RegisterTaskDefinition($layout.TaskName, $previous, (4 -bor 16 -bor 32), $Sid, $null, 3, $oldSddl)
                Assert-UmiTaskDefinition -Task $restored -Sid $Sid
                [IO.File]::Copy($backup, $stage)
                Set-UmiProtectedAcl -Path $stage -Sid $Sid
                [IO.File]::Replace($stage, $helper, $discard)
                Set-UmiProtectedAcl -Path $helper -Sid $Sid
                if ($hadHost) {
                    [IO.File]::Copy($hostBackup, $stage)
                    Set-UmiProtectedAcl -Path $stage -Sid $Sid
                    Remove-Item -LiteralPath $discard -Force
                    [IO.File]::Replace($stage, $layout.TaskHost, $discard)
                    Set-UmiProtectedAcl -Path $layout.TaskHost -Sid $Sid
                } elseif (Test-Path -LiteralPath $layout.TaskHost) { Remove-Item -LiteralPath $layout.TaskHost -Force }
                Write-UmiManifest $oldManifest
                $complete = $true
            } catch {
                try { Write-UmiAdminError -RecordError $_ -Sid $Sid } catch { }
                # Preserve the authorized snapshots and report recovery required;
                # do not claim the old definition was restored after an I/O error.
                $manifest.phase = 'restoring'
                $manifest.helperHash = (Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash
                Write-UmiManifest $manifest
            }
        }
        throw $failure
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force }
        if (Test-Path -LiteralPath $discard) { Remove-Item -LiteralPath $discard -Force }
        if ($complete -and (Test-Path -LiteralPath $backup)) { Remove-Item -LiteralPath $backup -Force }
        if ($complete -and (Test-Path -LiteralPath $hostBackup)) { Remove-Item -LiteralPath $hostBackup -Force }
    }
}

function Enable-UmiAdminMode {
    param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Sid)
    Assert-UmiElevatedIdentity $Sid
    $sourcePath = Get-UmiCanonicalPath $Source
    $layout = Get-UmiProtectedLayout $Sid
    $normalStopped = $false; $taskCreated = $false; $prepared = $false
    if (Test-Path -LiteralPath $layout.Manifest) {
        $existing = Get-UmiManifest $Sid
        if ($existing.phase -eq 'active') {
            $task = Get-UmiTask $Sid
            Assert-UmiTaskDefinition -Task $task -Sid $Sid
            if ($task.State -ne 4 -and -not (Get-UmiRunningGateway -Root $layout.App -TrustedState)) {
                $snapshot = Get-UmiCanonicalPath $PSCommandPath
                if ($snapshot -ne (Join-Path $layout.Root 'bootstrap\Admin-Mode.ps1')) { throw 'Recovery requires a newly Windows-authorized protected helper snapshot.' }
                Assert-UmiProtectedAcl -Path $snapshot -Sid $Sid
                $helper = Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1'
                Copy-Item -LiteralPath $snapshot -Destination $helper -Force -ErrorAction Stop
                Set-UmiProtectedAcl -Path $helper -Sid $Sid
                $existing.helperHash = (Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash
                Write-UmiManifest $existing
            }
            $normal = Get-UmiRunningGateway -Root $existing.sourceRoot -Health
            $normalStopped = $false
            try {
                if ($normal) {
                    if ($task.State -eq 4 -or (Get-UmiRunningGateway -Root $layout.App -TrustedState)) { throw 'Stop the protected gateway before importing the current Normal session.' }
                    # Explicit native enable is the only import boundary. The
                    # healthy Normal session remains authoritative until stopped.
                    Test-UmiProtectedRuntime $existing
                    $normalStopped = Stop-UmiNormalGateway $existing.sourceRoot
                    Copy-UmiPrivateState -SourceState (Join-Path $existing.sourceRoot '.local-data') -DestinationState (Join-Path $layout.App '.local-data')
                    Set-UmiTreeProtection -Path (Join-Path $layout.App '.local-data') -Sid $Sid
                    $existing.port = [int]$normal.port
                    $existing.localOnly = $normal.tunnelProvider -eq 'local'
                    $existing.externalUrl = if ($normal.tunnelProvider -eq 'external') { [string]$normal.publicUrl } else { '' }
                    $existing.publicUrl = [string]$normal.publicUrl
                    $existing.secretHash = (Get-FileHash -LiteralPath (Join-Path $layout.App '.local-data\connection-secret.txt') -Algorithm SHA256).Hash
                    Write-UmiManifest $existing
                    $stale = Join-Path $layout.App '.local-data\web-status.json'
                    if (Test-Path -LiteralPath $stale) { Remove-Item -LiteralPath $stale -Force }
                }
                Start-UmiAdminGateway $Sid
            } catch {
                $failure = $_
                try { Write-UmiAdminError -RecordError $failure -Sid $Sid } catch { }
                if ($normalStopped) {
                    try { Disable-UmiAdminMode $Sid } catch { try { Write-UmiAdminError -RecordError $_ -Sid $Sid } catch { } }
                }
                throw $failure
            }
            return
        }
        if ($sourcePath -ne (Get-UmiCanonicalPath $existing.sourceRoot)) { throw 'Preparation recovery must retain the original source application.' }
        if ((Get-UmiCanonicalPath $PSCommandPath) -ne (Join-Path $layout.Root 'bootstrap\Admin-Mode.ps1')) { throw 'Preparation recovery requires a newly Windows-authorized protected helper snapshot.' }
        $recoveryTask = Get-UmiPreparationRecoveryTask -Manifest $existing -Sid $Sid
        if ($recoveryTask) {
            # Prevent a concurrent user Run() while deleting this incomplete
            # registration. Never import its stale state into the live source.
            $recoveryTask.Enabled = $false
            try {
                if ($recoveryTask.State -eq 4) { throw 'The incomplete administrator task began running; preparation was retained.' }
                foreach ($process in (Get-CimInstance Win32_Process -ErrorAction Stop)) {
                    if (($process.ExecutablePath -and $process.ExecutablePath.StartsWith($layout.App + '\', [StringComparison]::OrdinalIgnoreCase)) -or
                        ($process.CommandLine -and $process.CommandLine.IndexOf($layout.App + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0)) { throw 'The protected application began running; preparation was retained.' }
                }
                $service = New-Object -ComObject 'Schedule.Service'
                $service.Connect()
                $service.GetFolder('\').DeleteTask($layout.TaskName, 0)
            } catch { $recoveryTask.Enabled = $true; throw }
        }
        Set-Location -LiteralPath ([Environment]::GetFolderPath('System'))
        Assert-UmiNoReparsePoint -Path $layout.App -Recurse
        Remove-Item -LiteralPath $layout.App -Recurse -Force
        Remove-Item -LiteralPath $layout.Manifest -Force
    }
    if (Test-Path -LiteralPath $layout.App) {
        # No manifest and no task means preparation never reached activation.
        # Retain the protected bootstrap currently executing; discard only the
        # incomplete app payload after native authorization and path checks.
        if ((Get-UmiTask -Sid $Sid -AllowMissing) -or (Get-UmiRunningGateway -Root $layout.App -TrustedState)) { throw 'An orphaned active installation requires manual Windows administrator recovery.' }
        Assert-UmiProtectedAcl -Path $layout.Root -Sid $Sid
        Assert-UmiNoReparsePoint -Path $layout.App -Recurse
        Remove-Item -LiteralPath $layout.App -Recurse -Force
    }
    try {
        $package = Get-Content -LiteralPath (Join-Path $sourcePath 'package.json') -Raw | ConvertFrom-Json
        if ($package.name -ne 'umibridge-sakura-console') { throw 'The selected source is not UmiBridge.' }
        if (Get-UmiTask -Sid $Sid -AllowMissing) { throw 'A scheduled task with this identity already exists; it was not replaced.' }
        $normal = Get-UmiRunningGateway -Root $sourcePath
        $tunnelPath = Join-Path $sourcePath '.local-data\tunnel-config.json'
        $tunnel = if (Test-Path -LiteralPath $tunnelPath) { Get-Content -LiteralPath $tunnelPath -Raw | ConvertFrom-Json } else { $null }
        $port = if ($normal) { [int]$normal.port } elseif ($tunnel) { [int]$tunnel.port } else { 43127 }
        $local = $normal -and $normal.tunnelProvider -eq 'local'
        $external = if ($normal -and $normal.tunnelProvider -eq 'external') { [string]$normal.publicUrl } else { '' }
        if (-not $local -and -not $external -and (-not $tunnel -or $tunnel.provider -ne 'devtunnel' -or -not $tunnel.publicUrl)) { throw 'Configure a saved stable tunnel before enabling Admin mode so the existing URL and OAuth connection can be retained.' }
        [void](Copy-UmiProtectedApplication -Source $sourcePath -Sid $Sid)
        $prepared = $true
        $manifest = [ordered]@{ schema = 1; sid = $Sid; phase = 'preparing'; sourceRoot = $sourcePath; version = $package.version; nonce = [guid]::NewGuid().ToString('N'); helperHash = (Get-FileHash -LiteralPath (Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1') -Algorithm SHA256).Hash; port = $port; localOnly = [bool]$local; externalUrl = $external; publicUrl = $(if ($normal) { $normal.publicUrl } elseif ($tunnel) { $tunnel.publicUrl } else { '' }); secretHash = (Get-FileHash -LiteralPath (Join-Path $sourcePath '.local-data\connection-secret.txt') -Algorithm SHA256).Hash }
        Write-UmiManifest $manifest
        Test-UmiProtectedRuntime $manifest
        [void](Register-UmiProtectedTask $Sid)
        $manifest = Get-UmiManifest $Sid
        $taskCreated = $true
        # All preparation and task registration succeeded before normal is stopped.
        $normalStopped = Stop-UmiNormalGateway $sourcePath
        $private = Join-Path $layout.App '.local-data'
        Assert-UmiNoReparsePoint -Path $private -Recurse
        Remove-Item -LiteralPath $private -Recurse -Force
        Assert-UmiNoReparsePoint -Path (Join-Path $sourcePath '.local-data') -Recurse
        Copy-UmiPrivateState -SourceState (Join-Path $sourcePath '.local-data') -DestinationState $private
        Set-UmiTreeProtection -Path $private -Sid $Sid
        $stale = Join-Path $private 'web-status.json'
        if (Test-Path -LiteralPath $stale) { Remove-Item -LiteralPath $stale -Force }
        $manifest.phase = 'active'
        Write-UmiManifest $manifest
        Start-UmiAdminGateway $Sid
    } catch {
        $failure = $_
        try { Write-UmiAdminError -RecordError $failure -Sid $Sid } catch { }
        try {
        if ($normalStopped -and $taskCreated) {
            # The gateway may have refreshed OAuth grants during startup. Return
            # the latest protected state through the medium migration worker.
            Disable-UmiAdminMode $Sid
            throw $failure
        }
        if ($taskCreated) {
            $task = Get-UmiTask -Sid $Sid -AllowMissing
            if ($task) { Stop-UmiProtectedTask -Task $task -Sid $Sid }
            $service = New-Object -ComObject 'Schedule.Service'; $service.Connect(); $service.GetFolder('\').DeleteTask($layout.TaskName, 0)
        }
        if ($prepared -or -not (Test-Path -LiteralPath $layout.Manifest)) { Remove-UmiProtectedInstallation $Sid }
        if ($normalStopped) { Start-UmiNormalLauncher $sourcePath }
        } catch { try { Write-UmiAdminError -RecordError $_ -Sid $Sid } catch { } }
        throw $failure
    }
}

function Get-UmiStateDigest {
    param([Parameter(Mandatory = $true)][string]$Directory)
    $files = foreach ($name in (Get-UmiProductionStateNames)) {
        $itemPath = Join-Path $Directory $name
        if (-not (Test-Path -LiteralPath $itemPath)) { continue }
        $item = Get-Item -LiteralPath $itemPath -Force
        if ($item.PSIsContainer) { Get-ChildItem -LiteralPath $itemPath -Recurse -Force -File }
        else { $item }
    }
    $lines = foreach ($file in ($files | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($Directory.TrimEnd('\').Length + 1)
        $relative + ':' + (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))))).Replace('-', '') }
    finally { $sha.Dispose() }
}

function Get-UmiMigrationReceipt {
    param([Parameter(Mandatory = $true)]$Manifest)
    return (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) ('UmiBridge-migration-' + $Manifest.nonce + '.json'))
}

function Invoke-UmiCopyBackWorker {
    if (Test-UmiAdminToken) { throw 'Private state migration must run with the original medium token.' }
    $sid = Get-UmiCurrentSid
    $manifest = Get-UmiManifest $sid
    $layout = Get-UmiProtectedLayout $sid
    if ($manifest.phase -ne 'restoring') { throw 'No private state migration was authorized.' }
    $private = Join-Path $layout.App '.local-data'
    Assert-UmiNoReparsePoint -Path $private -Recurse
    $destination = Join-Path (Get-UmiCanonicalPath $manifest.sourceRoot) '.local-data'
    Assert-UmiNoReparsePoint -Path $destination -Recurse
    $backup = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) ('UmiBridge-backup-' + $manifest.nonce)
    if (Test-Path -LiteralPath $backup) { throw 'A migration backup already exists.' }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm('D:P(A;OICI;FA;;;' + $sid + ')(A;OICI;FA;;;SY)(A;OICI;RC;;;OW)', [Security.AccessControl.AccessControlSections]::Access)
    [void][IO.Directory]::CreateDirectory($backup, $acl)
    if (Test-Path -LiteralPath $destination) { Copy-UmiPrivateState -SourceState $destination -DestinationState $backup }
    else { [void][IO.Directory]::CreateDirectory($destination, $acl) }
    [IO.Directory]::SetAccessControl($destination, $acl)
    try {
        Copy-UmiPrivateState -SourceState $private -DestinationState $destination
        # Copied protected ACLs are not retained: medium-created children inherit
        # the account-private directory; remove the stale administrator PID.
        $stale = Join-Path $destination 'web-status.json'
        if (Test-Path -LiteralPath $stale) { Remove-Item -LiteralPath $stale -Force }
        $digest = Get-UmiStateDigest $destination
        if ($digest -ne $manifest.stateDigest) { throw 'The copied private state did not match the authorized snapshot.' }
        $receipt = Get-UmiMigrationReceipt $manifest
        [IO.File]::WriteAllText($receipt, (@{ nonce = $manifest.nonce; digest = $digest } | ConvertTo-Json -Compress))
        for ($attempt = 0; $attempt -lt 180; $attempt++) {
            if (-not (Test-Path -LiteralPath $layout.Manifest)) {
                Remove-Item -LiteralPath $receipt -Force -ErrorAction SilentlyContinue
                if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
                & (Get-UmiPowerShell) -NoProfile -ExecutionPolicy Bypass -File (Join-Path $manifest.sourceRoot 'scripts\windows\UmiBridge.ps1') -Action start -NoUpdate -NoTunnelRepair
                return
            }
            Start-Sleep -Milliseconds 500
        }
        throw 'Windows did not finish disabling Admin mode. The private snapshot and migration backup were retained.'
    } catch {
        if (Test-Path -LiteralPath $backup) { Copy-UmiPrivateState -SourceState $backup -DestinationState $destination }
        throw
    }
}

function Disable-UmiAdminMode {
    param([Parameter(Mandatory = $true)][string]$Sid)
    Assert-UmiElevatedIdentity $Sid
    $layout = Get-UmiProtectedLayout $Sid
    if (-not (Test-Path -LiteralPath $layout.Manifest)) {
        if ((Get-UmiTask -Sid $Sid -AllowMissing) -or (Get-UmiRunningGateway -Root $layout.App -TrustedState)) { throw 'An orphaned active installation requires manual Windows administrator recovery.' }
        Remove-UmiProtectedInstallation $Sid
        return
    }
    $manifest = Get-UmiManifest $Sid
    $task = Get-UmiTask -Sid $Sid -AllowMissing
    if ($task) { Assert-UmiTaskDefinition -Task $task -Sid $Sid; Stop-UmiProtectedTask -Task $task -Sid $Sid }
    $private = Join-Path $layout.App '.local-data'
    Assert-UmiNoReparsePoint -Path $private -Recurse
    # Freeze all private state before a medium worker receives read access.
    Set-UmiTreeProtection -Path $private -Sid $Sid
    $manifest.phase = 'restoring'; $manifest.nonce = [guid]::NewGuid().ToString('N')
    $manifest | Add-Member -NotePropertyName stateDigest -NotePropertyValue (Get-UmiStateDigest $private) -Force
    Write-UmiManifest $manifest
    $helper = Join-Path $layout.App 'scripts\windows\Admin-Mode.ps1'
    Start-UmiMediumProcess -File (Get-UmiPowerShell) -Arguments ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $helper + '" -Action disable -CopyBackWorker -ExpectedSid ' + $Sid)
    $receiptPath = Get-UmiMigrationReceipt $manifest
    $complete = $false
    for ($attempt = 0; $attempt -lt 180; $attempt++) {
        if (Test-Path -LiteralPath $receiptPath) {
            try {
                $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
                if ($receipt.nonce -eq $manifest.nonce -and $receipt.digest -eq $manifest.stateDigest) { $complete = $true; break }
            } catch { }
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $complete) { throw 'Private state migration did not finish. The protected snapshot was retained; retry disabling Admin mode.' }
    if ($task) { $service = New-Object -ComObject 'Schedule.Service'; $service.Connect(); $service.GetFolder('\').DeleteTask($layout.TaskName, 0) }
    Remove-UmiProtectedInstallation $Sid
}

function Invoke-UmiAdminMode {
    param([Parameter(Mandatory = $true)][string]$RequestedAction)
    $sid = Get-UmiCurrentSid
    if (Test-UmiAdminToken) { $env:PSModulePath = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\Modules' }
    if ($ExpectedSid -and $ExpectedSid -ne $sid) { throw 'Windows authorized a different account. The original account and mode were retained.' }
    if ($RequestedAction -eq 'status') { return (Get-UmiAdminModeStatus -SourceRoot $SourceRoot | ConvertTo-Json -Compress) }
    if ($TaskWorker) { if ($RequestedAction -ne 'start') { throw 'Invalid task worker action.' }; Invoke-UmiTaskWorker; return }
    if ($CopyBackWorker) { if ($RequestedAction -ne 'disable') { throw 'Invalid migration worker action.' }; Invoke-UmiCopyBackWorker; return }
    if ($RequestedAction -in @('enable', 'disable', 'update')) {
        if (-not $ElevatedRequest) {
            if (-not $SourceRoot) { $SourceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
            [void](Request-UmiElevation -RequestedAction $RequestedAction -Source $SourceRoot)
        } else {
            if (-not $ExpectedSid) { throw 'The original account identity is required for elevated operations.' }
            Assert-UmiElevatedIdentity $ExpectedSid
            $transaction = Enter-UmiModeTransaction $sid
            try {
                if ($RequestedAction -eq 'enable') { Enable-UmiAdminMode -Source $SourceRoot -Sid $sid }
                elseif ($RequestedAction -eq 'disable') { Disable-UmiAdminMode $sid }
                else { Update-UmiAdminMode $sid }
            } finally { $transaction.ReleaseMutex(); $transaction.Dispose() }
        }
    } elseif ($RequestedAction -eq 'start') { Start-UmiAdminGateway $sid }
    elseif ($RequestedAction -eq 'stop') {
        $manifest = Get-UmiManifest $sid
        $task = Get-UmiTask $sid
        Assert-UmiTaskDefinition -Task $task -Sid $sid
        try { Stop-UmiProtectedTask -Task $task -Sid $sid }
        catch {
            if ($ElevatedRequest) { throw }
            [void](Request-UmiElevation -RequestedAction 'stop')
        }
    }
    return (Get-UmiAdminModeStatus -SourceRoot $SourceRoot | ConvertTo-Json -Compress)
}

if (-not $LibraryOnly) {
    try {
        Invoke-UmiAdminMode -RequestedAction $Action
    }
    catch {
        try { if (Test-UmiAdminToken) { Write-UmiAdminError -RecordError $_ -Sid (Get-UmiCurrentSid) } } catch { }
        [Console]::Error.WriteLine($_.Exception.Message)
        if ($_.Exception.Message -like 'Windows authorization was cancelled.*') { exit 1223 }
        exit 1
    }
}
