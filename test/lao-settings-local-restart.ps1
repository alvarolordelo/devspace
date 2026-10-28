$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.ServiceProcess
$script:baseUrl='http://127.0.0.1:7877'
. (Join-Path $PSScriptRoot '..\src\lao\windows\lao-settings.ps1')

$snapshot=[pscustomobject]@{
    statusAuthenticated=$true; tasksAuthenticated=$true
    activeTasks=0; reasons=@()
}
function Get-LaoManagedService { param([string]$Kind) return $null }
function Get-LaoVerifiedLocalListener {
    param([string]$Kind,$Snapshot)
    return [pscustomobject]@{
        Kind=$Kind; Port=$(if($Kind -eq 'Ollama'){11434}else{7676})
        ProcessId=$(if($Kind -eq 'Ollama'){2202}else{1101})
        ProcessPath=$(if($Kind -eq 'Ollama'){'C:\Mock\ollama.exe'}else{'C:\Mock\node.exe'})
    }
}
function Test-LaoLocalPort { param([int]$Port) return $true }

foreach($kind in @('DevSpace','Ollama')) {
    $action=Get-LaoSettingsComponentAction $kind $snapshot
    if (-not $action -or $action.Mode -ne 'LocalProcess' -or $action.Operation -ne 'Restart') {
        throw "$kind healthy local process must expose Restart in Settings"
    }
}
$snapshot.activeTasks=1
if ((Get-LaoSettingsComponentAction DevSpace $snapshot) -or
    (Get-LaoSettingsComponentAction Ollama $snapshot)) {
    throw 'Settings restart must be blocked while a LAO task is active'
}
$snapshot.activeTasks=0

$script:calls=[Collections.Generic.List[string]]::new()
function Get-Process {
    param([int]$Id)
    return [pscustomobject]@{Id=$Id;Path=$(if($Id -eq 2202){'C:\Mock\ollama.exe'}else{'C:\Mock\node.exe'})}
}
function Stop-Process { param([int]$Id) $script:calls.Add('stop:'+$Id) }
function Wait-LaoLocalPort { param([int]$Port,[bool]$Listening,[int]$Seconds) $script:calls.Add('wait:'+$Port+':'+$Listening); return $true }
function Invoke-LaoLocalStart { param([string]$Kind) $script:calls.Add('start:'+$Kind) }
function Update-LaoComponentVersion { param([string]$Kind) return 'test' }
function Write-LaoRecoveryHistory {
    param($Kind,$ServiceName,$Operation,$Result)
    $script:calls.Add('history:'+$Kind+':'+$Operation+':'+$Result)
    return $true
}
$action=[pscustomobject]@{
    Kind='Ollama';Mode='LocalProcess';Operation='Restart';Port=11434
    ProcessId=2202;ProcessPath='C:\Mock\ollama.exe'
}
if (-not (Invoke-LaoLocalProcessRecoveryOperation $action)) {
    throw 'Verified local restart must succeed'
}
$expected='stop:2202,wait:11434:False,start:Ollama,wait:11434:True,history:Ollama:Restart:verified'
if (($script:calls -join ',') -ne $expected) {
    throw 'Local restart did not stop, start, verify and audit in the expected order'
}
Write-Output 'LAO settings local restart safety check passed'
