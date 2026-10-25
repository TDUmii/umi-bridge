import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const helper = fileURLToPath(new URL('../scripts/windows/Admin-Mode.ps1', import.meta.url));
const psQuote = value => `'${value.replaceAll("'", "''")}'`;
const windows = process.platform === 'win32';
function run(script) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true,
  });
}

test('Admin mode helper parses without executing privileged actions', { skip: !windows }, () => {
  const result = run(`$tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile(${psQuote(helper)},[ref]$tokens,[ref]$errors); if($errors.Count){$errors | Out-String | Write-Error; exit 1}`);
  assert.equal(result.status, 0, result.stderr);
});

test('Admin mode validators reject paths outside installation and ambiguous identities', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
function Reject([scriptblock]$body) { try { & $body; throw 'ACCEPTED' } catch { if($_.Exception.Message -eq 'ACCEPTED'){throw} } }
$root='C:\\ProgramData\\UmiBridge\\S-1-5-21-1-2-3-1001'
[void](Assert-UmiSid 'S-1-5-21-1-2-3-1001')
Reject { Assert-UmiSid '..\\Administrator' }
Reject { Get-UmiCanonicalPath '\\\\server\\share\\app' }
Reject { Get-UmiCanonicalPath 'C:\\app\\..\\Windows' }
Reject { Get-UmiCanonicalPath 'C:\\app\\secret:stream' }
Reject { Get-UmiCanonicalPath 'C:\\app.\\child' }
Reject { Assert-UmiContainedPath $root ($root + '-other\\app') }
Reject { Assert-UmiContainedPath $root $root }
[void](Assert-UmiContainedPath $root ($root + '\\app'))
'validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated/);
});

test('status is sanitized and internal elevation requests require an original identity', { skip: !windows }, () => {
  const status = run(`& ${psQuote(helper)} -Action status`);
  assert.equal(status.status, 0, status.stderr);
  const value = JSON.parse(status.stdout.trim());
  assert.deepEqual(Object.keys(value).sort(), ['capability', 'elevated', 'installed', 'mode', 'needsUpdate', 'pending', 'running', 'version']);
  assert.ok(['normal', 'admin', 'unavailable'].includes(value.mode));
  assert.ok(['available', 'needs-admin-account', 'integrity-error'].includes(value.capability));
  for (const action of ['enable', 'disable', 'update']) {
    const result = run(`& ${psQuote(helper)} -Action ${action} -ElevatedRequest`);
    assert.equal(result.status, 1, `${action}: ${result.stdout}`);
    assert.match(result.stderr, /original account identity is required/);
  }
});

test('native UAC command snapshots the helper and fits the Windows limit without launching UAC', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
function Test-UmiAdminToken { return $false }
function Test-UmiAdministratorAccount { return $true }
function Test-Path { param($LiteralPath) return $false }
function Enter-UmiModeTransaction { return [pscustomobject]@{} | Add-Member ScriptMethod ReleaseMutex {} -PassThru | Add-Member ScriptMethod Dispose {} -PassThru }
function Start-Process { param($FilePath,$Verb,$ArgumentList,[switch]$Wait,[switch]$PassThru,$ErrorAction)
  if($Verb -ne 'RunAs'){throw 'Native RunAs was omitted'}
  if($ArgumentList.Length -gt 30000){throw 'Windows command line too long'}
  $encoded=($ArgumentList -split ' ')[-1]
  $payload=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded))
  $tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseInput($payload,[ref]$tokens,[ref]$errors)
  if($errors.Count){throw ($errors | Out-String)}
  if(-not $payload.Contains('Get-FileHash') -or -not $payload.Contains('Set-UmiProtectedAcl') -or -not $payload.Contains('-ElevatedRequest')){throw 'Missing protected snapshot validation'}
  return [pscustomobject]@{ExitCode=0}
}
[void](Request-UmiElevation -RequestedAction enable -Source 'C:\\UmiBridge-source')
'uac-contract-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /uac-contract-validated/);
});

test('gateway consent leaves the gateway process tree through Explorer before requesting UAC', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
$GatewayRequest=$true
function Test-UmiAdminToken { return $false }
function Test-Path { param($LiteralPath) return $false }
function Test-UmiModePending { return $true }
function Start-Process { throw 'Gateway directly launched the authorization child' }
function Start-UmiMediumProcess { param($File,$Arguments)
  if($File -ne (Get-UmiPowerShell)){throw 'Unexpected broker executable'}
  if(-not $Arguments.Contains('-ConsentBroker -ExpectedSid ') -or -not $Arguments.Contains('-SourceRoot "C:\\original source"')){throw 'Broker lost original identity or source'}
  if($Arguments.Contains('-GatewayRequest')){throw 'Gateway broker would recurse'}
  $script:brokerStarted=$true
}
[void](Request-UmiElevation -RequestedAction enable -Source 'C:\\original source')
if(-not $brokerStarted){throw 'Explorer broker was omitted'}
'gateway-broker-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gateway-broker-validated/);
});

test('preparation recovery accepts only original healthy source and a validated stopped task', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
$sid=Get-UmiCurrentSid
$layout=Get-UmiProtectedLayout $sid
$manifest=[pscustomobject]@{sid=$sid;phase='preparing';sourceRoot='C:\\original source'}
$script:fixtureTask=[pscustomobject]@{State=3}
$script:sourceHealthy=$true;$script:protectedRunning=$false;$script:fixtureProcesses=@();$script:taskValidated=$false
function Get-UmiTask { return $script:fixtureTask }
function Assert-UmiTaskDefinition { $script:taskValidated=$true }
function Get-UmiRunningGateway { param($Root,[switch]$Health,[switch]$TrustedState)
  if($Health -and $script:sourceHealthy){return [pscustomobject]@{pid=123}}
  if($TrustedState -and $script:protectedRunning){return [pscustomobject]@{pid=456}}
  return $null
}
function Get-CimInstance { return $script:fixtureProcesses }
function Reject([scriptblock]$body) {try{& $body;throw 'ACCEPTED'}catch{if($_.Exception.Message -eq 'ACCEPTED'){throw}}}
$accepted=Get-UmiPreparationRecoveryTask -Manifest $manifest -Sid $sid
if(-not $taskValidated -or $accepted -ne $fixtureTask){throw 'Ready task was not validated'}
$fixtureTask.State=4;Reject {Get-UmiPreparationRecoveryTask $manifest $sid};$fixtureTask.State=3
$script:sourceHealthy=$false;Reject {Get-UmiPreparationRecoveryTask $manifest $sid};$script:sourceHealthy=$true
$script:protectedRunning=$true;Reject {Get-UmiPreparationRecoveryTask $manifest $sid};$script:protectedRunning=$false
$script:fixtureProcesses=@([pscustomobject]@{ExecutablePath=(Join-Path $layout.App '.runtime\\node\\node.exe');CommandLine=$null})
Reject {Get-UmiPreparationRecoveryTask $manifest $sid}
$script:fixtureProcesses=@([pscustomobject]@{ExecutablePath=(Get-UmiPowerShell);CommandLine=('powershell -File "'+(Join-Path $layout.App 'scripts\\windows\\Admin-Mode.ps1')+'" -TaskWorker')})
Reject {Get-UmiPreparationRecoveryTask $manifest $sid}
$script:fixtureProcesses=@();$manifest.phase='active';Reject {Get-UmiPreparationRecoveryTask $manifest $sid}
'preparation-recovery-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preparation-recovery-validated/);
});

test('prepared task uses protected paths and a password-free same-user principal', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
$sid='S-1-5-21-1-2-3-1001'
$layout=Get-UmiProtectedLayout $sid
[xml]$task=Get-UmiTaskDefinitionXml -Sid $sid -ProtectedApp $layout.App
$principal=$task.Task.Principals.Principal
if($principal.UserId -ne $sid -or $principal.LogonType -ne 'InteractiveToken' -or $principal.RunLevel -ne 'HighestAvailable'){throw 'Unexpected task principal'}
if($task.Task.Triggers.ChildNodes.Count -ne 0){throw 'Unexpected automatic trigger'}
if($task.Task.Actions.Exec.WorkingDirectory -ne $layout.App){throw 'Unexpected task directory'}
if(-not $task.Task.Actions.Exec.Arguments.Contains($layout.App)){throw 'Task references no protected helper'}
if(-not $task.Task.Actions.Exec.Command.EndsWith('wscript.exe') -or -not $task.Task.Actions.Exec.Arguments.StartsWith('/B /Nologo ')){throw 'Task does not use the GUI host'}
$hostContent=Get-UmiTaskHostContent $sid
if(-not $hostContent.Contains('-WindowStyle Hidden ') -or -not $hostContent.Contains(', 0, True)') -or -not $hostContent.Contains('WScript.Quit result')){throw 'The protected GUI host does not hide and wait for PowerShell'}
Assert-UmiTaskSecurityDescriptor -Sid $sid -Sddl (Get-UmiProtectedSddl -Sid $sid -Task)
Assert-UmiTaskSecurityDescriptor -Sid $sid -Sddl ('O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x1200a9;;;' + $sid + ')')
$unsafe='O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;GA;;;' + $sid + ')'
try { Assert-UmiTaskSecurityDescriptor -Sid $sid -Sddl $unsafe; throw 'ACCEPTED' } catch { if($_.Exception.Message -eq 'ACCEPTED'){throw} }
'task-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /task-validated/);
});

test('filesystem policy restricts implicit owner rights and keeps base access non-inheriting', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
$sid='S-1-5-21-1-2-3-1001'
$security=New-Object Security.AccessControl.DirectorySecurity
$security.SetSecurityDescriptorSddlForm((Get-UmiProtectedSddl -Sid $sid))
$rules=@($security.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
$owner=@($rules | Where-Object {$_.IdentityReference.Value -eq 'S-1-3-4'})
if($owner.Count -ne 1 -or [int]$owner[0].FileSystemRights -ne 0x20000){throw 'Owner WRITE_DAC was not restricted'}
$user=@($rules | Where-Object {$_.IdentityReference.Value -eq $sid})
if($user.Count -ne 1 -or ([int]$user[0].FileSystemRights -band (-bnot 0x1200a9))){throw 'User can modify protected data'}
$base=New-Object Security.AccessControl.DirectorySecurity
$base.SetSecurityDescriptorSddlForm((Get-UmiProtectedSddl))
$public=@($base.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object {$_.IdentityReference.Value -eq 'S-1-5-11'})
if($public.Count -ne 1 -or $public[0].InheritanceFlags -ne 'None'){throw 'Base inspection leaks into private descendants'}
'acl-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /acl-validated/);
});

test('native helper rejects a different Windows account before any mutation or consent', { skip: !windows }, () => {
  const result = run(`& ${psQuote(helper)} -Action enable -ElevatedRequest -ExpectedSid S-1-5-21-1-2-3-1001`);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /different account/);
});

test('Task Scheduler account names normalize to the same SID without relaxing principal checks', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$sid=$identity.User.Value
if((Resolve-UmiPrincipalSid $identity.Name) -ne $sid -or (Resolve-UmiPrincipalSid $sid) -ne $sid){throw 'Scheduled account normalization changed identity'}
$layout=Get-UmiProtectedLayout $sid
[xml]$xml=Get-UmiTaskDefinitionXml -Sid $sid -ProtectedApp $layout.App
$xml.Task.Principals.Principal.UserId=$identity.Name
$task=[pscustomobject]@{Xml=$xml.OuterXml; Enabled=$true; Sddl=(Get-UmiProtectedSddl -Sid $sid -Task)}
$task | Add-Member ScriptMethod GetSecurityDescriptor {param($flags) return $this.Sddl}
function Assert-UmiTaskHost {}
Assert-UmiTaskDefinition -Task $task -Sid $sid
[xml]$legacy=Get-UmiTaskDefinitionXml -Sid $sid -ProtectedApp $layout.App -Legacy
$task.Xml=$legacy.OuterXml
Assert-UmiTaskDefinition -Task $task -Sid $sid
try{Assert-UmiTaskDefinition -Task $task -Sid $sid -RequireCurrent; throw 'ACCEPTED'}catch{if($_.Exception.Message -eq 'ACCEPTED'){throw}}
[xml]$previous=Get-UmiTaskDefinitionXml -Sid $sid -ProtectedApp $layout.App -PowerShellHost
$task.Xml=$previous.OuterXml
Assert-UmiTaskDefinition -Task $task -Sid $sid
try{Assert-UmiTaskDefinition -Task $task -Sid $sid -RequireCurrent; throw 'ACCEPTED'}catch{if($_.Exception.Message -eq 'ACCEPTED'){throw}}
$xml.Task.Principals.Principal.RunLevel='LeastPrivilege'
$task.Xml=$xml.OuterXml
try{Assert-UmiTaskDefinition -Task $task -Sid $sid; throw 'ACCEPTED'}catch{if($_.Exception.Message -eq 'ACCEPTED'){throw}}
'principal-normalization-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /principal-normalization-validated/);
});

test('Windows PowerShell entry repairs an inherited PowerShell 7 module path before autoload', { skip: !windows }, () => {
  const result = run(`$env:PSModulePath='C:\\incompatible-pwsh7-modules'
. ${psQuote(helper)} -LibraryOnly
$trusted=[IO.Path]::Combine([Environment]::GetFolderPath('System'),'WindowsPowerShell\\v1.0\\Modules')
if($env:PSModulePath -ne $trusted){throw 'Windows PowerShell module path is not trusted'}
[void](Get-Command Get-Acl -ErrorAction Stop)
[void](Get-Command Get-AuthenticodeSignature -ErrorAction Stop)
[void](Get-Acl -LiteralPath ${psQuote(helper)} -ErrorAction Stop)
'desktop-module-autoload-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /desktop-module-autoload-validated/);
});

test('profile diagnostics expose deterministic comparable hashes without profile paths', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
$first=Get-UmiProfileFingerprints | ConvertTo-Json -Compress
$second=Get-UmiProfileFingerprints | ConvertTo-Json -Compress
if($first -ne $second){throw 'Profile fingerprints are unstable'}
$first`);
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout.trim());
  assert.deepEqual(Object.keys(value).sort(), ['ApplicationData', 'LocalApplicationData', 'UserProfile']);
  for (const hash of Object.values(value)) assert.match(hash, /^[A-F0-9]{64}$/);
});

test('Normal and Admin state migration preserves workflow and Corp bytes and includes both in the state digest', { skip: !windows }, () => {
  const result = run(`$ErrorActionPreference='Stop'
. ${psQuote(helper)} -LibraryOnly
$temporaryRoot=[IO.Path]::GetTempPath().TrimEnd('\\')
$directory=Join-Path $temporaryRoot ('UmiBridge-workflow-migration-'+[guid]::NewGuid().ToString('N'))
$normal=Join-Path $directory 'normal'
$admin=Join-Path $directory 'admin'
[void][IO.Directory]::CreateDirectory($normal)
[void][IO.Directory]::CreateDirectory($admin)
try {
  $journal=Join-Path $normal 'workflows.jsonl'
  $utf8=New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($journal, ('{"kind":"workflow_snapshot","workflow":{"workflow_id":"wf-migration","status":"waiting","job_id":"job-kept","version":3}}'+[Environment]::NewLine), $utf8)
  [IO.File]::WriteAllText((Join-Path $normal 'workflows.jsonl.lock'),'transient lock')
  $corp=Join-Path $normal 'corp-state.json'
  [IO.File]::WriteAllText($corp,'{"schema":1,"enabled":true,"runs":[{"status":"limit_wait","resetAt":1800000000000}]}',$utf8)
  [IO.File]::WriteAllText((Join-Path $normal 'arena-state.json'),'{"schema":1,"enabled":false,"arenas":[]}',$utf8)
  [IO.File]::WriteAllText((Join-Path $normal 'token-history.jsonl'),'{"id":"history","usage":{"inputTokens":10,"outputTokens":20}}',$utf8)
  $qa=Join-Path $normal 'qa'
  [void][IO.Directory]::CreateDirectory($qa)
  [IO.File]::WriteAllText((Join-Path $qa 'diagnostic.ps1'),'QA must not be migrated')
  $originalBytes=[Convert]::ToBase64String([IO.File]::ReadAllBytes($journal))
  Copy-UmiPrivateState -SourceState $normal -DestinationState $admin
  $adminJournal=Join-Path $admin 'workflows.jsonl'
  if(-not [IO.File]::Exists($adminJournal)){throw 'Workflow journal was omitted from Normal-to-Admin migration'}
  if([Convert]::ToBase64String([IO.File]::ReadAllBytes($adminJournal)) -ne $originalBytes){throw 'Migration changed journal bytes'}
  $adminCorp=Join-Path $admin 'corp-state.json'
  if([IO.File]::ReadAllText($adminCorp) -ne [IO.File]::ReadAllText($corp)){throw 'Migration changed Corp state'}
  foreach($name in @('arena-state.json','token-history.jsonl')){if([IO.File]::ReadAllText((Join-Path $normal $name)) -ne [IO.File]::ReadAllText((Join-Path $admin $name))){throw 'Migration changed Arena or token archive state'}}
  if((Test-Path -LiteralPath (Join-Path $admin 'workflows.jsonl.lock')) -or (Test-Path -LiteralPath (Join-Path $admin 'qa'))){throw 'Migration copied transient lock or QA files'}
  $normalDigest=Get-UmiStateDigest $normal
  $adminDigest=Get-UmiStateDigest $admin
  if($normalDigest -ne $adminDigest){throw 'Migrated operational state digest differs'}
  [IO.File]::AppendAllText($adminJournal, ('{"kind":"workflow_event","workflow_id":"wf-migration","type":"updated","payload":{"status":"done"}}'+[Environment]::NewLine), $utf8)
  $updatedDigest=Get-UmiStateDigest $admin
  if($updatedDigest -eq $adminDigest){throw 'State digest ignored a workflow journal change'}
  [IO.File]::WriteAllText($adminCorp,'{"schema":1,"enabled":false,"runs":[]}',$utf8)
  if((Get-UmiStateDigest $admin) -eq $updatedDigest){throw 'State digest ignored a Corp change'}
  $updatedDigest=Get-UmiStateDigest $admin
  $updatedBytes=[Convert]::ToBase64String([IO.File]::ReadAllBytes($adminJournal))
  Copy-UmiPrivateState -SourceState $admin -DestinationState $normal
  if([Convert]::ToBase64String([IO.File]::ReadAllBytes($journal)) -ne $updatedBytes){throw 'Admin-to-Normal migration lost the updated journal'}
  if([IO.File]::ReadAllText($corp) -ne [IO.File]::ReadAllText($adminCorp)){throw 'Admin-to-Normal migration lost Corp state'}
  if((Get-UmiStateDigest $normal) -ne $updatedDigest){throw 'Round-trip state digest omitted workflow data'}
  'workflow-state-migration-validated'
} finally {
  if(-not $directory.StartsWith($temporaryRoot+'\\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe test cleanup path'}
  if([IO.Directory]::Exists($directory)){[IO.Directory]::Delete($directory,$true)}
}`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /workflow-state-migration-validated/);
});

test('protected task rebuilds shared profile variables from Windows rather than inherited environment', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
function New-UmiProtectedDirectory { param($Path,$Sid) }
$env:ProgramData='C:\\untrusted-program-data'
$env:ALLUSERSPROFILE='C:\\untrusted-profile'
$manifest=[pscustomobject]@{sid=(Get-UmiCurrentSid);port=43127;localOnly=$true;externalUrl=''}
Initialize-UmiTaskEnvironment $manifest
$expected=[Environment]::GetFolderPath('CommonApplicationData')
if($env:ProgramData -ne $expected -or $env:ALLUSERSPROFILE -ne $expected){throw 'Task inherited an untrusted shared profile path'}
'shared-profile-environment-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /shared-profile-environment-validated/);
});

test('installed updates require a newly captured native bootstrap and retain the original source authority', { skip: !windows }, () => {
  const source = fileURLToPath(new URL('../', import.meta.url));
  const result = run(`. ${psQuote(helper)} -LibraryOnly
function Test-UmiAdminToken { return $false }
function Test-UmiAdministratorAccount { return $true }
function Get-UmiManifest { return [pscustomobject]@{phase='active';sourceRoot=${psQuote(source)}} }
function Get-UmiTask { return [pscustomobject]@{State=3} }
function Assert-UmiTaskDefinition {}
function Enter-UmiModeTransaction { return [pscustomobject]@{} | Add-Member ScriptMethod ReleaseMutex {} -PassThru | Add-Member ScriptMethod Dispose {} -PassThru }
function Start-Process { param($FilePath,$Verb,$ArgumentList,[switch]$Wait,[switch]$PassThru,$ErrorAction)
  if($Verb -ne 'RunAs'){throw 'Update bypassed native authorization'}
  if(-not $ArgumentList.Contains('-EncodedCommand ')){throw 'Update executes a file directly after authorization'}
  $payload=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String(($ArgumentList -split ' ')[-1]))
  if(-not $payload.Contains('-Action update') -or -not $payload.Contains('Get-FileHash') -or -not $payload.Contains(${psQuote(helper)})){throw 'Update omitted the source snapshot trust anchor'}
  return [pscustomobject]@{ExitCode=0}
}
[void](Request-UmiElevation -RequestedAction update -Source 'C:\\caller-cannot-override-source')
'native-update-snapshot-validated'`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /native-update-snapshot-validated/);
});

test('OWNER RIGHTS prevents a medium file owner from granting write access and needs no audit privilege', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
if(Test-UmiAdminToken){'elevated-skip'; exit 0}
$directory=Join-Path ([IO.Path]::GetTempPath()) ('UmiBridge-owner-test-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($directory)
$file=Join-Path $directory 'owner.txt'
try {
  [IO.File]::WriteAllText($file,'readable')
  $sid=Get-UmiCurrentSid
  $security=New-Object Security.AccessControl.FileSecurity
  $security.SetSecurityDescriptorSddlForm(('O:'+$sid+'G:'+$sid+'D:P(A;;0x1200a9;;;'+$sid+')(A;;RC;;;OW)(A;;FA;;;SY)(A;;FA;;;BA)'),([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group))
  [IO.File]::SetAccessControl($file,$security)
  if([IO.File]::ReadAllText($file) -ne 'readable'){throw 'User read access was lost'}
  $changed=[IO.File]::GetAccessControl($file)
  $changed.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','Allow'))
  $denied=$false
  try {[IO.File]::SetAccessControl($file,$changed)} catch [UnauthorizedAccessException] {$denied=$true} catch [Management.Automation.MethodInvocationException] {if($_.Exception.InnerException -is [UnauthorizedAccessException]){$denied=$true}else{throw}}
  if(-not $denied){throw 'The medium file owner regained WRITE_DAC'}
  'owner-rights-validated'
} finally {
  if([IO.File]::Exists($file)){[IO.File]::Delete($file)}
  if([IO.Directory]::Exists($directory)){[IO.Directory]::Delete($directory)}
}`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /owner-rights-validated|elevated-skip/);
});

test('existing protected descendants accept safe native inherited ACLs only through trusted parents', { skip: !windows }, () => {
  const result = run(`. ${psQuote(helper)} -LibraryOnly
$sid=Get-UmiCurrentSid
$directory=Join-Path ([IO.Path]::GetTempPath()) ('UmiBridge-inherited-test-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $directory 'account'
$app=Join-Path $root 'app'
$state=Join-Path $app '.local-data'
$temporary=Join-Path $state 'temp'
[void][IO.Directory]::CreateDirectory($state)
try {
  # Keep this test's parent deletable by its medium owner. Only its child
  # inherits the same RX/OWNER RIGHTS policy as the real protected runtime.
  $parent=New-Object Security.AccessControl.DirectorySecurity
  $parent.SetSecurityDescriptorSddlForm(('D:P(A;;FA;;;'+$sid+')(A;OICI;0x1200a9;;;'+$sid+')(A;OICI;RC;;;OW)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)'),[Security.AccessControl.AccessControlSections]::Access)
  [IO.Directory]::SetAccessControl($state,$parent)
  [void][IO.Directory]::CreateDirectory($temporary)
  if(([IO.Directory]::GetAccessControl($temporary)).AreAccessRulesProtected){throw 'The native fixture did not inherit its ACL'}
  $trusted=New-Object Security.AccessControl.DirectorySecurity
  $trusted.SetSecurityDescriptorSddlForm((Get-UmiProtectedSddl -Sid $sid))
  $trustedBase=New-Object Security.AccessControl.DirectorySecurity
  $trustedBase.SetSecurityDescriptorSddlForm((Get-UmiProtectedSddl))
  # A medium test cannot assign BA ownership. Mock only already-validated
  # authority ancestors; read and validate the descendant's real native ACL.
  function Test-UmiAdminToken { return $true }
  function Get-UmiProtectedLayout { param($Sid) return @{Base=$directory;Root=$root} }
  function Get-Acl { param($LiteralPath,$ErrorAction)
    if($LiteralPath -eq $directory){return $trustedBase}
    if($LiteralPath -in @($root,$app,$state)){return $trusted}
    return [IO.Directory]::GetAccessControl($LiteralPath)
  }
  New-UmiProtectedDirectory -Path $temporary -Sid $sid
  $outside=Join-Path $directory 'outside'
  [void][IO.Directory]::CreateDirectory($outside)
  try{New-UmiProtectedDirectory -Path $outside -Sid $sid;throw 'ACCEPTED'}catch{if($_.Exception.Message -eq 'ACCEPTED'){throw}}
  'inherited-descendant-validated'
} finally {
  if([IO.Directory]::Exists($temporary)){[IO.Directory]::Delete($temporary)}
  if([IO.Directory]::Exists($directory)){[IO.Directory]::Delete($directory,$true)}
}`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /inherited-descendant-validated/);
});

test('only an empty immediate compiler TEMP directory can use the exact native BA-only descriptor', { skip: !windows }, () => {
  const result = run(`$ErrorActionPreference='Stop'
. ${psQuote(helper)} -LibraryOnly
$sid=Get-UmiCurrentSid
$directory=Join-Path ([IO.Path]::GetTempPath()) ('UmiBridge-compiler-acl-test-'+[guid]::NewGuid().ToString('N'))
$app=Join-Path $directory 'app'
$temporary=Join-Path $app '.local-data\\temp'
$candidate=Join-Path $temporary 'ff3ufg1r'
$outside=Join-Path $app 'scripts\\ff3ufg1r'
$junction=Join-Path $temporary 'linked01'
[void][IO.Directory]::CreateDirectory($outside)
try {
  # The medium fixture cannot assign BA ownership. Only descriptor reads are
  # synthetic; path, empty-directory, file and reparse checks use real files.
  $expected='O:BAG:'+$sid+'D:P(D;OI;SD;;;'+$sid+')(A;OICI;FA;;;BA)'
  function Get-UmiProtectedLayout { return @{App=$app} }
  function Get-Acl { return $script:compilerAcl }
  function Select-Descriptor([string]$Sddl){$script:compilerAcl=New-Object Security.AccessControl.DirectorySecurity;$script:compilerAcl.SetSecurityDescriptorSddlForm($Sddl)}
  Select-Descriptor $expected
  # Tree verification runs before task TEMP initialization. An unrelated
  # eight-character directory must still go through normal ACL validation.
  if(Test-Path -LiteralPath $temporary){throw 'Absent TEMP fixture unexpectedly exists'}
  if(Test-UmiEmptyCompilerTempDirectory (Get-Item -LiteralPath $outside) $sid){throw 'Ordinary directory was exempted while TEMP is absent'}
  [void][IO.Directory]::CreateDirectory($candidate)
  $item=Get-Item -LiteralPath $candidate
  if(-not (Test-UmiEmptyCompilerTempDirectory $item $sid)){throw 'Exact empty native compiler directory was rejected'}
  # Windows serializes the built-in Administrator's RID-500 SID as LA. Both
  # spellings must preserve the same exact owner/group/ACEs and flags.
  $administratorSid=$sid -replace '-\\d+$','-500'
  Select-Descriptor ($expected.Replace($sid,$administratorSid))
  if(-not (Test-UmiEmptyCompilerTempDirectory $item $administratorSid)){throw 'Equivalent built-in Administrator SDDL alias was rejected'}
  Select-Descriptor $expected
  # Hosted Windows runners can supply an 8.3 TEMP path while Get-Item returns
  # the long path. Exercise that representation when NTFS exposes an alias.
  $originalApp=$app
  $fileSystem=New-Object -ComObject Scripting.FileSystemObject
  $app=$fileSystem.GetFolder($app).ShortPath
  if(-not (Test-UmiEmptyCompilerTempDirectory $item $sid)){throw 'Equivalent native short TEMP parent was rejected'}
  $app=$originalApp
  try{Assert-UmiProtectedAcl -Path $candidate -Sid $sid -Descendant;throw 'ACCEPTED'}catch{if($_.Exception.Message -eq 'ACCEPTED'){throw}}
  if(Test-UmiEmptyCompilerTempDirectory (Get-Item -LiteralPath $outside) $sid){throw 'Exception escaped TEMP'}
  $longName=Join-Path $temporary 'unexpected-directory'
  [void][IO.Directory]::CreateDirectory($longName)
  if(Test-UmiEmptyCompilerTempDirectory (Get-Item -LiteralPath $longName) $sid){throw 'Noncompiler name was accepted'}
  foreach($invalid in @(
    $expected.Replace('O:BA','O:'+$sid),
    $expected.Replace('D:P','D:'),
    $expected.Replace('(D;OI;SD;','(D;OICI;SD;'),
    $expected.Replace('(A;OICI;FA;;;BA)','(A;OICI;FR;;;BA)'),
    ($expected+'(A;;FA;;;SY)'),
    ($expected+'(A;;FA;;;'+$sid+')')
  )) {
    Select-Descriptor $invalid
    if(Test-UmiEmptyCompilerTempDirectory $item $sid){throw 'Unexpected compiler ACL was accepted'}
  }
  Select-Descriptor $expected
  $child=Join-Path $candidate 'retained.dll'
  [IO.File]::WriteAllText($child,'must not be ignored')
  if(Test-UmiEmptyCompilerTempDirectory $item $sid){throw 'A nonempty compiler directory was exempted'}
  [IO.File]::Delete($child)
  $plainFile=Join-Path $temporary 'plain001'
  [IO.File]::WriteAllText($plainFile,'file')
  if(Test-UmiEmptyCompilerTempDirectory (Get-Item -LiteralPath $plainFile) $sid){throw 'A file was exempted'}
  [void](New-Item -ItemType Junction -Path $junction -Value $outside)
  try{[void](Test-UmiEmptyCompilerTempDirectory (Get-Item -LiteralPath $junction) $sid);throw 'ACCEPTED'}catch{if($_.Exception.Message -eq 'ACCEPTED'){throw}}
  'native-compiler-acl-validated'
} finally {
  if([IO.Directory]::Exists($junction)){[IO.Directory]::Delete($junction)}
  if([IO.Directory]::Exists($directory)){[IO.Directory]::Delete($directory,$true)}
}`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /native-compiler-acl-validated/);
});
