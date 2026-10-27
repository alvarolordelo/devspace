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
  [Parameter(Mandatory=$true)][string]$NodeExe
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
$wrapperInfo = Get-Item -LiteralPath $wrapper
if ($wrapperInfo.Extension -ine '.exe' -or $wrapperInfo.Length -lt 1 -or
    $wrapperInfo.Length -gt 20971520) {
  throw 'Invalid WinSW executable'
}
# Hash with the .NET runtime directly. Some locked-down Windows runners do
# not expose the Get-FileHash cmdlet even though .NET SHA-256 is available.
$sha256 = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($wrapper)
try {
  $wrapperHash = [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '')
} finally {
  $stream.Dispose()
  $sha256.Dispose()
}
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
$id = 'LAODevSpaceService'
$xml = @"
<service>
  <id>LAODevSpace</id>
  <name>LAO DevSpace</name>
  <description>Local Agent Orchestrator - isolated optional daemon</description>
  <executable>$(Xml $node)</executable>
  <arguments>&quot;$(Xml $launcher)&quot;</arguments>
  <workingdirectory>$(Xml $release)</workingdirectory>
  <startmode>Manual</startmode>
  <serviceaccount>
    <username>NT AUTHORITY\LocalService</username>
  </serviceaccount>
  <stoptimeout>30sec</stoptimeout>
  <env name="DEVSPACE_LAO_ENABLED" value="true"/>
  <env name="DEVSPACE_LAO_STATE_DIR" value="%ProgramData%\LAODevSpace\state"/>
  <env name="DEVSPACE_LAO_PORT" value="7877"/>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
  <onfailure action="restart" delay="30 sec"/>
</service>
"@
[IO.Directory]::CreateDirectory($target) | Out-Null
[IO.File]::Copy($wrapper, (Join-Path $target ($id + '.exe')), $false)
[IO.File]::WriteAllText((Join-Path $target ($id + '.xml')), $xml, [Text.UTF8Encoding]::new($false))
$receipt = [ordered]@{
  kind = 'lao-windows-service-plan'
  preparedAt = (Get-Date).ToUniversalTime().ToString('o')
  winSW_SHA256 = $WinSWSha256.ToLowerInvariant()
  sourceKind = $manifest.kind
  nodeABI = $runtime.abi
  installed = $false
  serviceStarted = $false
  autostartEnabled = $false
  serviceAccount = 'NT AUTHORITY\LocalService'
  stopTimeout = '30sec'
  launcher = $launcher
  instruction = 'Requires separate authorization, explicit state-directory ACL for LocalService, verified wrapper version, backup and disposable Windows operational testing before installation.'
}
[IO.File]::WriteAllText((Join-Path $target 'SERVICE_PLAN.json'),
  ($receipt | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Write-Output ($receipt | ConvertTo-Json -Compress -Depth 4)
