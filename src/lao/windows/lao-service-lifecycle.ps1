#Requires -Version 5.1
<#
  Explicit lifecycle controller for an already-prepared LAO WinSW service
  plan. The default action is Validate and performs no system mutation.
  Install/Uninstall require administrator rights and never touch DevSpace or
  Ollama services. LAO state is backed up and preserved on uninstall.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ServicePlanDir,
  [ValidateSet('Validate','Install','Uninstall')][string]$Action = 'Validate',
  [switch]$StartAfterInstall,
  [switch]$ConfirmAutomaticStart,
  [string]$DashboardTokenFile,
  [string]$DevSpaceTokenFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'Windows-only service lifecycle'
}

function Canonical([string]$Path) {
  return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}
function Get-Sha256([string]$Path) {
  $sha256 = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($Path)
  try {
    return [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $stream.Dispose(); $sha256.Dispose()
  }
}
function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Write-History([string]$Operation,[string]$Result,[string]$BackupPath) {
  $root = Join-Path $env:ProgramData 'LAODevSpace'
  [IO.Directory]::CreateDirectory($root) | Out-Null
  $record = [ordered]@{
    at=(Get-Date).ToUniversalTime().ToString('o'); operation=$Operation
    result=$Result; service='LAODevSpace'; backup=$BackupPath
  }
  Add-Content -LiteralPath (Join-Path $root 'install-history.jsonl') `
    -Value ($record | ConvertTo-Json -Compress) -Encoding UTF8
}
function Backup-State([string]$StateDir) {
  if (-not (Test-Path -LiteralPath $StateDir -PathType Container)) { return $null }
  $files = @(Get-ChildItem -LiteralPath $StateDir -File -ErrorAction Stop | Where-Object {
    $_.Name -like 'lao.sqlite*' -or $_.Name -eq 'selected-model.json'
  })
  if ($files.Count -eq 0) { return $null }
  $root = Join-Path $env:ProgramData 'LAODevSpace\backups'
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff')
  $target = Join-Path $root $stamp
  [IO.Directory]::CreateDirectory($target) | Out-Null
  foreach ($file in $files) { Copy-Item -LiteralPath $file.FullName -Destination $target -Force }
  return $target
}
function Grant-LocalServiceState([string]$StateDir) {
  [IO.Directory]::CreateDirectory($StateDir) | Out-Null
  $acl = Get-Acl -LiteralPath $StateDir
  $before = $acl.Sddl
  $sid = New-Object Security.Principal.SecurityIdentifier('S-1-5-19')
  $rule = New-Object Security.AccessControl.FileSystemAccessRule(
    $sid,
    [Security.AccessControl.FileSystemRights]::Modify,
    ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
    [Security.AccessControl.PropagationFlags]::None,
    [Security.AccessControl.AccessControlType]::Allow)
  $acl.SetAccessRule($rule)
  Set-Acl -LiteralPath $StateDir -AclObject $acl
  return $before
}
function Grant-LocalServiceRead([string]$Path) {
  $acl = Get-Acl -LiteralPath $Path
  $before = $acl.Sddl
  $sid = New-Object Security.Principal.SecurityIdentifier('S-1-5-19')
  $rule = New-Object Security.AccessControl.FileSystemAccessRule(
    $sid,
    ([Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Synchronize),
    ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
    [Security.AccessControl.PropagationFlags]::None,
    [Security.AccessControl.AccessControlType]::Allow)
  $acl.SetAccessRule($rule)
  Set-Acl -LiteralPath $Path -AclObject $acl
  return $before
}
function Restore-Acl([string]$StateDir,[string]$Sddl) {
  if (-not $Sddl -or -not (Test-Path -LiteralPath $StateDir -PathType Container)) { return }
  $acl = Get-Acl -LiteralPath $StateDir
  $acl.SetSecurityDescriptorSddlForm($Sddl)
  Set-Acl -LiteralPath $StateDir -AclObject $acl
}
function Get-InstallReceiptPath {
  return Join-Path $env:ProgramData 'LAODevSpace\install-receipt.json'
}
function Write-InstallReceipt([string]$StateAcl,[string]$ReleaseAcl,[string]$PlanAcl) {
  $root = Join-Path $env:ProgramData 'LAODevSpace'
  [IO.Directory]::CreateDirectory($root) | Out-Null
  $path = Get-InstallReceiptPath
  if (Test-Path -LiteralPath $path) { throw 'LAO install receipt already exists' }
  $record = [ordered]@{
    schemaVersion=1; service='LAODevSpace'; installedAt=(Get-Date).ToUniversalTime().ToString('o')
    releaseDir=$release; servicePlanDir=$planDir; stateDir=$stateDir
    stateAclSddl=$StateAcl; releaseAclSddl=$ReleaseAcl; planAclSddl=$PlanAcl
  }
  [IO.File]::WriteAllText($path,($record | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  return $path
}
function Read-InstallReceipt {
  $path = Get-InstallReceiptPath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  $item = Get-Item -LiteralPath $path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -gt 32768) {
    throw 'Invalid LAO install receipt'
  }
  $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($record.schemaVersion -ne 1 -or $record.service -ne 'LAODevSpace' -or
      (Canonical ([string]$record.releaseDir)) -ine $release -or
      (Canonical ([string]$record.servicePlanDir)) -ine $planDir -or
      (Canonical ([string]$record.stateDir)) -ine $stateDir) {
    throw 'LAO install receipt does not match this service plan'
  }
  return $record
}
function Test-RegularSecretFile([string]$Path,[int]$MaxBytes) {
  if (-not $Path -or -not [IO.Path]::IsPathRooted($Path) -or
      -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      $item.Length -lt 1 -or $item.Length -gt $MaxBytes) { return $false }
  return $true
}
function Validate-DashboardSecret([string]$Path) {
  if (-not (Test-RegularSecretFile $Path 1024)) { throw 'Dashboard token file is invalid' }
  $value = [IO.File]::ReadAllText($Path).Trim()
  if ($value -cnotmatch '^[\x21-\x7e]{32,256}$') { throw 'Dashboard token file is invalid' }
}
function Validate-DevSpaceSecret([string]$Path) {
  if (-not (Test-RegularSecretFile $Path 2048)) { throw 'DevSpace credential file is invalid' }
  $value = [IO.File]::ReadAllText($Path).Trim()
  if ($value -cmatch '^[A-Za-z0-9_-]{32,128}$') { return }
  try { $json = $value | ConvertFrom-Json -ErrorAction Stop } catch { throw 'DevSpace credential file is invalid' }
  $expires = [double]0
  if ([string]$json.accessToken -cnotmatch '^[A-Za-z0-9_-]{32,128}$' -or
      [string]$json.refreshToken -cnotmatch '^[A-Za-z0-9_-]{32,128}$' -or
      [string]$json.clientId -cnotmatch '^devspace-[a-fA-F0-9-]{36}$' -or
      -not [double]::TryParse([string]$json.expiresAt, [ref]$expires)) {
    throw 'DevSpace credential file is invalid'
  }
}
function New-ServiceSecrets([string]$DashboardSource,[string]$DevSpaceSource) {
  Validate-DashboardSecret $DashboardSource
  Validate-DevSpaceSecret $DevSpaceSource
  $secretDir = Join-Path $env:ProgramData 'LAODevSpace\secrets'
  $dashboardTarget = Join-Path $secretDir 'dashboard-token.txt'
  $devspaceTarget = Join-Path $secretDir 'devspace-mcp-token.txt'
  if ((Test-Path -LiteralPath $dashboardTarget) -or (Test-Path -LiteralPath $devspaceTarget)) {
    throw 'Service secret target already exists; refusing overwrite'
  }
  [IO.Directory]::CreateDirectory($secretDir) | Out-Null
  try {
    $security = New-Object Security.AccessControl.DirectorySecurity
    $security.SetAccessRuleProtection($true,$false)
    foreach ($entry in @(
      @('S-1-5-18',[Security.AccessControl.FileSystemRights]::FullControl),
      @('S-1-5-32-544',[Security.AccessControl.FileSystemRights]::FullControl),
      @('S-1-5-19',[Security.AccessControl.FileSystemRights]::Modify)
    )) {
      $sid = New-Object Security.Principal.SecurityIdentifier($entry[0])
      $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        $sid,$entry[1],
        ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow)
      [void]$security.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $secretDir -AclObject $security
    [IO.File]::Copy((Canonical $DashboardSource),$dashboardTarget,$false)
    [IO.File]::Copy((Canonical $DevSpaceSource),$devspaceTarget,$false)
  } catch {
    foreach ($target in @($dashboardTarget,$devspaceTarget)) {
      try { if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force } } catch {}
    }
    try {
      if ((Test-Path -LiteralPath $secretDir -PathType Container) -and
          @(Get-ChildItem -LiteralPath $secretDir -Force).Count -eq 0) {
        Remove-Item -LiteralPath $secretDir -Force
      }
    } catch {}
    throw
  }
  return $secretDir
}
function Remove-ServiceSecrets {
  $secretDir = Join-Path $env:ProgramData 'LAODevSpace\secrets'
  foreach ($name in @('dashboard-token.txt','devspace-mcp-token.txt')) {
    $path = Join-Path $secretDir $name
    if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force }
  }
  if ((Test-Path -LiteralPath $secretDir -PathType Container) -and
      @(Get-ChildItem -LiteralPath $secretDir -Force).Count -eq 0) {
    Remove-Item -LiteralPath $secretDir -Force
  }
}

if (-not [IO.Path]::IsPathRooted($ServicePlanDir)) {
  throw 'ServicePlanDir must be absolute'
}
$planDir = Canonical $ServicePlanDir
$receiptPath = Join-Path $planDir 'SERVICE_PLAN.json'
$wrapper = Join-Path $planDir 'LAODevSpaceService.exe'
$config = Join-Path $planDir 'LAODevSpaceService.xml'
if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $wrapper -PathType Leaf) -or
    -not (Test-Path -LiteralPath $config -PathType Leaf)) {
  throw 'Incomplete LAO service plan'
}
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if ($receipt.kind -ne 'lao-windows-service-plan' -or
    $receipt.serviceId -ne 'LAODevSpace' -or
    $receipt.serviceAccount -ne 'NT AUTHORITY\LocalService' -or
    $receipt.winSW_SHA256 -cnotmatch '^[a-f0-9]{64}$' -or
    $receipt.configSHA256 -cnotmatch '^[a-f0-9]{64}$') {
  throw 'Invalid LAO service plan receipt'
}
if ((Get-Sha256 $wrapper) -cne [string]$receipt.winSW_SHA256 -or
    (Get-Sha256 $config) -cne [string]$receipt.configSHA256) {
  throw 'Service plan hash verification failed'
}
if ((Canonical ([string]$receipt.wrapperFile)) -ine (Canonical $wrapper) -or
    (Canonical ([string]$receipt.configFile)) -ine (Canonical $config)) {
  throw 'Service plan paths do not match the prepared files'
}
$release = Canonical ([string]$receipt.releaseDir)
$node = Canonical ([string]$receipt.nodeExe)
$verifier = Join-Path $release 'src\lao\release-verify.mjs'
if (-not (Test-Path -LiteralPath $release -PathType Container) -or
    -not (Test-Path -LiteralPath $node -PathType Leaf) -or
    -not (Test-Path -LiteralPath $verifier -PathType Leaf)) {
  throw 'Prepared release or verifier is unavailable'
}
& $node $verifier --dir $release 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Release integrity verification failed' }
[xml]$xml = Get-Content -LiteralPath $config -Raw
$service = $xml.service
$serviceEnv = @{}
foreach ($item in @($service.env)) { $serviceEnv[[string]$item.name] = [string]$item.value }
if ($service.id -ne 'LAODevSpace' -or
    $service.serviceaccount.username -ne 'NT AUTHORITY\LocalService' -or
    $serviceEnv['DEVSPACE_LAO_STATE_DIR'] -ne '%ProgramData%\LAODevSpace\state' -or
    $serviceEnv['DEVSPACE_LAO_PORT'] -ne '7877' -or
    $serviceEnv['LAO_DASHBOARD_TOKEN_FILE'] -ne '%ProgramData%\LAODevSpace\secrets\dashboard-token.txt' -or
    $serviceEnv['LAO_DEVSPACE_MCP_TOKEN_FILE'] -ne '%ProgramData%\LAODevSpace\secrets\devspace-mcp-token.txt' -or
    $serviceEnv['LAO_RESTART_SUPERVISED'] -ne '1' -or
    $service.startmode -notin @('Manual','Automatic')) {
  throw 'Service XML violates the LAO service contract'
}
$auto = $service.startmode -eq 'Automatic'
$delayedNode = $service.SelectSingleNode('delayedAutoStart')
$delayed = $null -ne $delayedNode -and [string]$delayedNode.InnerText -eq 'true'
if ($auto -ne [bool]$receipt.autostartEnabled -or
    $delayed -ne [bool]$receipt.delayedAutoStart) {
  throw 'Service XML start mode differs from the signed preparation receipt'
}
$credentialsValidated = $false
if (($DashboardTokenFile -and -not $DevSpaceTokenFile) -or
    ($DevSpaceTokenFile -and -not $DashboardTokenFile)) {
  throw 'DashboardTokenFile and DevSpaceTokenFile must be supplied together'
}
if ($DashboardTokenFile -and $DevSpaceTokenFile) {
  Validate-DashboardSecret $DashboardTokenFile
  Validate-DevSpaceSecret $DevSpaceTokenFile
  $credentialsValidated = $true
}
if ($Action -eq 'Validate') {
  [pscustomobject]@{
    valid=$true; action='Validate'; service='LAODevSpace'
    startMode=[string]$service.startmode; delayedAutoStart=$delayed
    serviceAccount='NT AUTHORITY\LocalService'; mutated=$false
    credentialsValidated=$credentialsValidated
  } | ConvertTo-Json -Compress
  exit 0
}
if (-not (Test-Administrator)) { throw 'Administrator rights are required for service changes' }
if ($Action -eq 'Install' -and $auto -and -not $ConfirmAutomaticStart) {
  throw 'Automatic boot requires -ConfirmAutomaticStart'
}
if (-not $env:ProgramData) { throw 'ProgramData is unavailable' }
$stateDir = Canonical (Join-Path $env:ProgramData 'LAODevSpace\state')
$backup = $null
$previousAcl = $null
$previousReleaseAcl = $null
$previousPlanAcl = $null

if ($Action -eq 'Install') {
  if (-not $DashboardTokenFile -or -not $DevSpaceTokenFile) {
    throw 'Install requires DashboardTokenFile and DevSpaceTokenFile'
  }
  if (Get-Service -Name 'LAODevSpace' -ErrorAction SilentlyContinue) {
    throw 'LAODevSpace service already exists; uninstall it before reinstalling'
  }
  $backup = Backup-State $stateDir
  $secretDir = $null
  $installReceipt = $null
  try {
    $previousAcl = Grant-LocalServiceState $stateDir
    $previousReleaseAcl = Grant-LocalServiceRead $release
    $previousPlanAcl = Grant-LocalServiceRead $planDir
    $secretDir = New-ServiceSecrets $DashboardTokenFile $DevSpaceTokenFile
    & $wrapper install 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Get-Service -Name 'LAODevSpace' -ErrorAction SilentlyContinue)) {
      throw 'WinSW did not install the LAODevSpace service'
    }
    if ($StartAfterInstall) {
      & $wrapper start 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'WinSW could not start the LAODevSpace service' }
      $deadline=(Get-Date).AddSeconds(25)
      $healthy=$false
      do {
        try {
          $live=Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:7877/health/live' `
            -TimeoutSec 2 -MaximumRedirection 0 -ErrorAction Stop
          if ($live.live -eq $true) { $healthy=$true; break }
        } catch {}
        Start-Sleep -Milliseconds 500
      } while ((Get-Date) -lt $deadline)
      if (-not $healthy) { throw 'Installed LAO service did not pass /health/live' }
    }
    $installReceipt = Write-InstallReceipt $previousAcl $previousReleaseAcl $previousPlanAcl
    Write-History 'Install' 'success' $backup
    [pscustomobject]@{installed=$true;started=[bool]$StartAfterInstall;backup=$backup;
      statePreserved=$true;installReceipt=$installReceipt} | ConvertTo-Json -Compress
  } catch {
    try { if (Get-Service -Name 'LAODevSpace' -ErrorAction SilentlyContinue) { & $wrapper uninstall 2>&1 | Out-Null } } catch {}
    try { if ($installReceipt -and (Test-Path -LiteralPath $installReceipt)) { Remove-Item -LiteralPath $installReceipt -Force } } catch {}
    try { if ($secretDir) { Remove-ServiceSecrets } } catch {}
    try { Restore-Acl $stateDir $previousAcl } catch {}
    try { Restore-Acl $release $previousReleaseAcl } catch {}
    try { Restore-Acl $planDir $previousPlanAcl } catch {}
    Write-History 'Install' 'rolled_back' $backup
    throw
  }
  exit 0
}

$backup = Backup-State $stateDir
$existing = Get-Service -Name 'LAODevSpace' -ErrorAction SilentlyContinue
$installedReceipt = Read-InstallReceipt
if ($existing -and -not $installedReceipt) {
  throw 'Installed LAO service has no matching lifecycle receipt; manual recovery required'
}
if ($existing) {
  if ($existing.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
    & $wrapper stop 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'WinSW could not stop the LAODevSpace service' }
  }
  & $wrapper uninstall 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'WinSW could not uninstall the LAODevSpace service' }
}
if (Get-Service -Name 'LAODevSpace' -ErrorAction SilentlyContinue) {
  throw 'LAODevSpace service still exists after uninstall'
}
Remove-ServiceSecrets
if ($installedReceipt) {
  Restore-Acl $stateDir ([string]$installedReceipt.stateAclSddl)
  Restore-Acl $release ([string]$installedReceipt.releaseAclSddl)
  Restore-Acl $planDir ([string]$installedReceipt.planAclSddl)
  Remove-Item -LiteralPath (Get-InstallReceiptPath) -Force
}
Write-History 'Uninstall' 'success' $backup
[pscustomobject]@{installed=$false;serviceRemoved=$true;backup=$backup;statePreserved=$true} | ConvertTo-Json -Compress
