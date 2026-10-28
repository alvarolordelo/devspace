#Requires -Version 5.1
<#
  OFFLINE PLAN ONLY: no sc.exe, schtasks, installation, service start,
  autostart, registry, credentials or modifications to DevSpace.
  A future authorized operator may install the pinned WinSW wrapper from
  the separately prepared directory under a least-privilege account.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ReleaseDir,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [Parameter(Mandatory=$true)][string]$WinSWExe,
  [Parameter(Mandatory=$true)][string]$WinSWSha256,
  [Parameter(Mandatory=$true)][string]$NodeExe,
  [ValidateSet('Manual','Automatic')][string]$StartMode = 'Manual',
  [switch]$DelayedAutoStart
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'Windows-only service preparation'
}
function Canonical([string]$path) {
  return [IO.Path]::GetFullPath($path).TrimEnd('\')
}
$release = Canonical $ReleaseDir
$target = Canonical $OutputDir
$wrapper = Canonical $WinSWExe
$node = Canonical $NodeExe
if (-not [IO.Path]::IsPathRooted($ReleaseDir) -or
    -not [IO.Path]::IsPathRooted($OutputDir) -or
    -not [IO.Path]::IsPathRooted($WinSWExe) -or
    -not [IO.Path]::IsPathRooted($NodeExe)) {
  throw 'All input locations must be absolute paths'
}
if (-not (Test-Path -LiteralPath $release -PathType Container) -or
    -not (Test-Path -LiteralPath $wrapper -PathType Leaf) -or
    -not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw 'Missing release candidate, WinSW binary or Node executable'
}
if ($target.Equals($release, [StringComparison]::OrdinalIgnoreCase) -or
    $target.StartsWith($release + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $release.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Service plan must be outside the portable candidate directory'
}
if (Test-Path -LiteralPath $target) {
  throw 'Service plan output already exists; refusing overwrite'
}
if ($WinSWSha256 -cnotmatch '^[a-fA-F0-9]{64}$') {
  throw 'WinSW must be pinned by an exact SHA-256 digest'
}
if ($DelayedAutoStart -and $StartMode -ne 'Automatic') {
  throw 'DelayedAutoStart requires StartMode Automatic'
}
$wrapperInfo = Get-Item -LiteralPath $wrapper
if ($wrapperInfo.Extension -ine '.exe' -or $wrapperInfo.Length -lt 1 -or
    $wrapperInfo.Length -gt 20971520) {
  throw 'Invalid WinSW executable'
}
function Get-Sha256([string]$Path) {
  # Hash with .NET directly. Some locked-down Windows runners do not expose
  # Get-FileHash even though SHA-256 is available.
  $sha256 = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($Path)
  try {
    return [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $sha256.Dispose()
  }
}
$wrapperHash = Get-Sha256 $wrapper
if ($wrapperHash -ine $WinSWSha256) {
  throw 'WinSW SHA-256 mismatch'
}
$manifestPath = Join-Path $release 'RELEASE_MANIFEST.json'
$verifierPath = Join-Path $release 'src\lao\release-verify.mjs'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $verifierPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $release 'bin\devspace-laod.js') -PathType Leaf)) {
  throw 'Release candidate lacks manifest, verifier or daemon launcher'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.kind -notin @('lao-devspace-portable-candidate', 'lao-devspace-standalone-candidate') -or
    $manifest.installed -ne $false -or $manifest.serviceInstalled -ne $false) {
  throw 'Only an uninstalled, verified portable or standalone candidate may be staged'
}
# For standalone candidates, the service MUST use the same embedded, hash-
# verified Node executable; an outside Node path could bypass its runtime
# provenance and ABI claims. Portable candidates retain the explicit input.
if ($manifest.kind -eq 'lao-devspace-standalone-candidate' -and
    -not $node.Equals((Canonical (Join-Path $release 'runtime\node.exe')),
      [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Standalone service must use the embedded runtime/node.exe'
}
$verified = & $node $verifierPath --dir $release 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Portable package integrity verification failed' }
$hostNode = & $node -e 'console.log(JSON.stringify({platform:process.platform,arch:process.arch,abi:process.versions.modules}))'
if ($LASTEXITCODE -ne 0) { throw 'Node runtime check failed' }
$runtime = $hostNode | ConvertFrom-Json
if ($runtime.platform -ne 'win32' -or $runtime.platform -ne $manifest.runtime.platform -or
    $runtime.arch -ne $manifest.runtime.arch -or
    $runtime.abi -ne $manifest.runtime.nodeAbi) {
  throw 'Windows Node runtime architecture/ABI differs from candidate'
}
Push-Location -LiteralPath $release
try {
  & $node -e "const Db=require('./node_modules/better-sqlite3');const db=new Db(':memory:');db.prepare('select 1').get();db.close()" 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Packaged native SQLite smoke failed' }
} finally {
  Pop-Location
}
function Xml([string]$value) {
  return [Security.SecurityElement]::Escape($value)
}
$launcher = Join-Path $release 'bin\devspace-laod.js'
$lifecycle = Join-Path $release 'src\lao\windows\lao-service-lifecycle.ps1'
if (-not (Test-Path -LiteralPath $lifecycle -PathType Leaf)) {
  throw 'Release candidate lacks the service lifecycle script'
}
$id = 'LAODevSpaceService'
$delayedLine = if ($DelayedAutoStart) { '  <delayedAutoStart>true</delayedAutoStart>' } else { '' }
$xml = @"
<service>
  <id>LAODevSpace</id>
  <name>LAO DevSpace</name>
  <description>Local Agent Orchestrator - isolated optional daemon</description>
  <executable>$(Xml $node)</executable>
  <arguments>&quot;$(Xml $launcher)&quot;</arguments>
  <workingdirectory>$(Xml $release)</workingdirectory>
  <startmode>$StartMode</startmode>
$delayedLine
  <serviceaccount>
    <username>NT AUTHORITY\LocalService</username>
  </serviceaccount>
  <stoptimeout>30sec</stoptimeout>
  <env name="DEVSPACE_LAO_ENABLED" value="true"/>
  <env name="DEVSPACE_LAO_STATE_DIR" value="%ProgramData%\LAODevSpace\state"/>
  <env name="DEVSPACE_LAO_PORT" value="7877"/>
  <env name="LAO_DASHBOARD_TOKEN_FILE" value="%ProgramData%\LAODevSpace\secrets\dashboard-token.txt"/>
  <env name="LAO_DEVSPACE_MCP_TOKEN_FILE" value="%ProgramData%\LAODevSpace\secrets\devspace-mcp-token.txt"/>
  <env name="LAO_RESTART_SUPERVISED" value="1"/>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
  <onfailure action="restart" delay="30 sec"/>
</service>
"@
[IO.Directory]::CreateDirectory($target) | Out-Null
$wrapperTarget = Join-Path $target ($id + '.exe')
$configTarget = Join-Path $target ($id + '.xml')
$lifecycleTarget = Join-Path $target 'lao-service-lifecycle.ps1'
[IO.File]::Copy($wrapper, $wrapperTarget, $false)
[IO.File]::WriteAllText($configTarget, $xml, [Text.UTF8Encoding]::new($false))
[IO.File]::Copy($lifecycle, $lifecycleTarget, $false)
$receipt = [ordered]@{
  kind = 'lao-windows-service-plan'
  preparedAt = (Get-Date).ToUniversalTime().ToString('o')
  winSW_SHA256 = $WinSWSha256.ToLowerInvariant()
  configSHA256 = (Get-Sha256 $configTarget)
  lifecycleSHA256 = (Get-Sha256 $lifecycleTarget)
  sourceKind = $manifest.kind
  nodeABI = $runtime.abi
  installed = $false
  serviceStarted = $false
  autostartEnabled = ($StartMode -eq 'Automatic')
  startMode = $StartMode
  delayedAutoStart = [bool]$DelayedAutoStart
  serviceAccount = 'NT AUTHORITY\LocalService'
  serviceId = 'LAODevSpace'
  stopTimeout = '30sec'
  releaseDir = $release
  nodeExe = $node
  wrapperFile = $wrapperTarget
  configFile = $configTarget
  serviceSecretsRequired = $true
  launcher = $launcher
  instruction = 'Run lao-service-lifecycle.ps1 with Action Validate first. Install/Uninstall require explicit action and administrator rights; automatic boot also requires explicit confirmation.'
}
[IO.File]::WriteAllText((Join-Path $target 'SERVICE_PLAN.json'),
  ($receipt | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Write-Output ($receipt | ConvertTo-Json -Compress -Depth 4)
