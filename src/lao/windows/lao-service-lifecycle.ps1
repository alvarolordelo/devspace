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
  [switch]$ConfirmAutomaticStart
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
function Restore-Acl([string]$StateDir,[string]$Sddl) {
  if (-not $Sddl -or -not (Test-Path -LiteralPath $StateDir -PathType Container)) { return }
  $acl = Get-Acl -LiteralPath $StateDir
  $acl.SetSecurityDescriptorSddlForm($Sddl)
  Set-Acl -LiteralPath $StateDir -AclObject $acl
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
if ($service.id -ne 'LAODevSpace' -or
    $service.serviceaccount.username -ne 'NT AUTHORITY\LocalService' -or
    $service.env.name -notcontains 'DEVSPACE_LAO_STATE_DIR' -or
    $service.env.name -notcontains 'DEVSPACE_LAO_PORT' -or
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
if ($Action -eq 'Validate') {
  [pscustomobject]@{
    valid=$true; action='Validate'; service='LAODevSpace'
    startMode=[string]$service.startmode; delayedAutoStart=$delayed
    serviceAccount='NT AUTHORITY\LocalService'; mutated=$false
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

if ($Action -eq 'Install') {
  if (Get-Service -Name 'LAODevSpace' -ErrorAction SilentlyContinue) {
    throw 'LAODevSpace service already exists; uninstall it before reinstalling'
  }
  $backup = Backup-State $stateDir
  try {
    $previousAcl = Grant-LocalServiceState $stateDir
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
    Write-History 'Install' 'success' $backup
    [pscustomobject]@{installed=$true;started=[bool]$StartAfterInstall;backup=$backup;statePreserved=$true} | ConvertTo-Json -Compress
  } catch {
    try { if (Get-Service -Name 'LAODevSpace' -ErrorAction SilentlyContinue) { & $wrapper uninstall 2>&1 | Out-Null } } catch {}
    try { Restore-Acl $stateDir $previousAcl } catch {}
    Write-History 'Install' 'rolled_back' $backup
    throw
  }
  exit 0
}

$backup = Backup-State $stateDir
$existing = Get-Service -Name 'LAODevSpace' -ErrorAction SilentlyContinue
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
Write-History 'Uninstall' 'success' $backup
[pscustomobject]@{installed=$false;serviceRemoved=$true;backup=$backup;statePreserved=$true} | ConvertTo-Json -Compress
