# Mock-only click regression: do not launch or stop any real Windows service.
$ErrorActionPreference='Stop'
$script:baseUrl='http://127.0.0.1:7877'
$env:DEVSPACE_LAO_OLLAMA_URL='http://127.0.0.1:11434'
. (Join-Path $PSScriptRoot '..\src\lao\windows\lao-start.ps1')
$script:popup=$null
$script:listening=@(7877)
$script:launched=[Collections.Generic.List[string]]::new()
function Test-LaoLocalPort([int]$Port) {
    return $script:listening -contains $Port
}
function Invoke-LaoLocalStart([string]$Kind) {
    $script:launched.Add($Kind)
    $script:localStarts[$Kind]=$true
}
Invoke-LaoStartAllComponents
if (($script:launched -join ',') -ne 'DevSpace,Ollama') {
    throw 'Already listening LAO must be skipped, stopped dependencies started'
}
Invoke-LaoStartAllComponents
if (($script:launched -join ',') -ne 'DevSpace,Ollama') {
    throw 'Second click must not start a duplicate service'
}
$script:localStarts.Clear()
$script:listening=@()
$script:launched.Clear()
Invoke-LaoStartAllComponents
if (($script:launched -join ',') -ne 'LAO,DevSpace,Ollama') {
    throw 'Offline LAO must not block startup of DevSpace and Ollama'
}
Write-Output 'LAO start-all click safety check passed'
