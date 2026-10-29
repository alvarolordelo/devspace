# Isolated startup policy regression. Never launches services or opens ports.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\lao-ensure-dependencies.ps1') -LibraryOnly
$script:listening=@(7676,11434)
$script:launched=New-Object System.Collections.Generic.List[string]
function Test-LaoLocalPort([int]$Port) { return $script:listening -contains $Port }
function Start-LaoBootstrapDependency([string]$Kind,[int]$Port) {
    $script:launched.Add($Kind)
    return [pscustomobject]@{dependency=$Kind;port=$Port;state='starting';action='launched'}
}
$running=@(Invoke-LaoBootstrap $true)
if($running.Count -ne 2 -or $script:launched.Count -ne 0 -or
   @($running | Where-Object {$_.action -ne 'none'}).Count -ne 0) {
    throw 'Bootstrap started an already listening dependency'
}
$script:listening=@(7676)
$one=@(Invoke-LaoBootstrap $true)
if(($script:launched -join ',') -ne 'Ollama' -or
    $one[0].action -ne 'none' -or $one[1].action -ne 'launched') {
    throw 'Bootstrap failed to start only missing Ollama'
}
$script:listening=@()
$script:launched.Clear()
$preview=@(Invoke-LaoBootstrap $false)
if($script:launched.Count -ne 0 -or @($preview | Where-Object {$_.action -ne 'start'}).Count -ne 0) {
    throw 'Read-only probe tried to start components'
}
$startedItems=@(Invoke-LaoBootstrap $true)
if(($script:launched -join ',') -ne 'DevSpace,Ollama' -or
    @($startedItems | Where-Object {$_.state -ne 'starting'}).Count -ne 0) {
    throw 'Bootstrap failed to start two missing dependencies'
}
# Process crash, stale data or refusal must not stop the other dependency.
function Start-LaoBootstrapDependency([string]$Kind,[int]$Port) {
    if($Kind -eq 'DevSpace'){throw 'mock launch blocked'}
    return [pscustomobject]@{dependency=$Kind;port=$Port;state='starting';action='launched'}
}
$partial=@(Invoke-LaoBootstrap $true)
if($partial[0].action -ne 'failed' -or $partial[1].action -ne 'launched' -or
    $partial[0].error -notmatch 'mock launch blocked') {
    throw 'Bootstrap failure must not block independent dependency recovery'
}
Write-Output 'LAO startup dependency bootstrap safety check passed'
