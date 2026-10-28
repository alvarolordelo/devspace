$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.ServiceProcess
. (Join-Path $PSScriptRoot '..\src\lao\windows\lao-settings.ps1')

$script:baseUrl = 'http://127.0.0.1:7877'
$script:dashboardToken = 'test-operator-token-xxxxxxxxxxxxxxxxxxxx'
function Invoke-RestMethod {
    [CmdletBinding()]
    param($Method, $Uri, $Headers, $TimeoutSec, $MaximumRedirection)
    if ($Uri -ne $script:baseUrl + '/dashboard/api/status' -or
        $Headers.Authorization -ne 'Bearer ' + $script:dashboardToken -or
        $MaximumRedirection -ne 0) { throw 'Fresh recovery request was not authenticated' }
    return [pscustomobject]@{ activeTasks=0; blockingReasons=@('ollama_unavailable') }
}
$fresh = Get-LaoDependencyFreshSnapshot
if (-not $fresh.statusAuthenticated -or -not $fresh.tasksAuthenticated -or
    $fresh.activeTasks -ne 0 -or $fresh.reasons -notcontains 'ollama_unavailable') {
    throw 'Fresh snapshot was not validated'
}

$script:calls = New-Object System.Collections.Generic.List[string]
$script:history = $null
$script:failStop = $false
$script:failAudit = $false
function Stop-Service {
    [CmdletBinding()]
    param([string]$Name)
    $script:calls.Add('stop:'+$Name)
    if ($script:failStop) { throw 'mock failure' }
}
function Start-Service {
    [CmdletBinding()]
    param([string]$Name)
    $script:calls.Add('start:'+$Name)
}
function Get-Service {
    [CmdletBinding()]
    param([string]$Name)
    $service=[pscustomobject]@{Name=$Name;Status='Running'}
    $service | Add-Member -MemberType ScriptMethod -Name WaitForStatus -Value {
        param($Status,$Timeout)
        $script:calls.Add('wait:'+[string]$Status)
    }
    return $service
}
function Get-LaoDependencyFreshSnapshot {
    return [pscustomobject]@{
        statusAuthenticated=$true; tasksAuthenticated=$true; activeTasks=0
        reasons=@('devspace_unverified')
    }
}
function Write-LaoRecoveryHistory {
    param($Kind,$ServiceName,$Operation,$Result)
    $script:history="$Kind/$ServiceName/$Operation/$Result"
    return (-not $script:failAudit)
}
$action=[pscustomobject]@{Kind='Ollama';ServiceName='LAO-MOCK';Operation='Restart'}
if (-not (Invoke-LaoDependencyRecoveryOperation $action)) {
    throw 'Healthy Ollama recovery was not verified independently of DevSpace authentication'
}
if (($script:calls -join ',') -ne 'stop:LAO-MOCK,wait:Stopped,start:LAO-MOCK,wait:Running' -or
    $script:history -ne 'Ollama/LAO-MOCK/Restart/verified') {
    throw 'Recovery did not verify stop, start and history'
}
$script:calls.Clear()
$script:failStop=$true
if (Invoke-LaoDependencyRecoveryOperation $action) { throw 'Failed stop was reported as recovery' }
if (($script:calls -join ',') -ne 'stop:LAO-MOCK' -or
    $script:history -ne 'Ollama/LAO-MOCK/Restart/failed') {
    throw 'Failed recovery must not start the service and must record failure'
}
$script:failStop=$false
$script:failAudit=$true
if (Invoke-LaoDependencyRecoveryOperation $action) {
    throw 'A recovery without durable history must not be reported verified'
}
Write-Output 'LAO recovery safety check passed'
