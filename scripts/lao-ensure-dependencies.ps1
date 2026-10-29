# LAO bootstrap: check dependencies and start ONLY missing local listeners.
# Never install services, change Windows startup, kill a process or replace a listener.
# Probe is the default; -Start is an explicit opt-in used by LAO launchers.
[CmdletBinding()]
param(
    [switch]$Start,
    [switch]$AsJson,
    [switch]$LibraryOnly
)
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw 'LAO dependency bootstrap requires Windows' }
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:baseUrl='http://127.0.0.1:7877'
. (Join-Path $root 'src\lao\windows\lao-settings.ps1')

function Get-LaoBootstrapPlan {
    $result=New-Object System.Collections.Generic.List[object]
    foreach($kind in @('DevSpace','Ollama')) {
        $port=Get-LaoLocalStartPort $kind
        $listening=Test-LaoLocalPort $port
        # Never assume that an arbitrary listener is our intended service.
        $result.Add([pscustomobject]@{
            dependency=$kind; port=$port
            state=$(if($listening){'listening_unverified'}else{'stopped'})
            action=$(if($listening){'none'}else{'start'})
        })
    }
    return @($result.ToArray())
}

function Start-LaoBootstrapDependency([string]$Kind,[int]$Port) {
    # Validate configuration before launching a child process. Never update
    # DevSpace dependencies automatically or change its persistent workspace.
    if ($Kind -eq 'DevSpace') {
        & (Join-Path $root 'scripts\activate-lao-mcp-devspace.ps1') -VerifyOnly | Out-Null
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            throw 'DevSpace pinned configuration verification failed'
        }
    }
    $command=Get-LaoLocalStartCommand $Kind
    $logDir=Join-Path $env:LOCALAPPDATA 'LAODevSpace\logs'
    [IO.Directory]::CreateDirectory($logDir) | Out-Null
    $stamp=[guid]::NewGuid().ToString('N')
    $stdout=Join-Path $logDir ('bootstrap-'+$Kind+'-'+$stamp+'.log')
    $stderr=$stdout+'.err'
    $mutexName='Local\LAODevSpace-Start-'+$Kind+'-'+$Port
    $quote={param([string]$v) return "'"+$v.Replace("'","''")+"'"}
    $module=Join-Path $root 'src\lao\windows\lao-start.ps1'
    # This worker owns a mutex until its service exits, including after the
    # parent exits. The identical mutex is used by the Monitor's Play button.
    $environment='if('+(& $quote $Kind)+' -eq ''DevSpace''){Remove-Item Env:DEVSPACE_CONFIG_DIR -ErrorAction SilentlyContinue}; '
    $body='$ErrorActionPreference="Stop"; '+
        '$env:LAO_DASHBOARD_TOKEN=$null; $env:LAO_DEVSPACE_MCP_TOKEN_FILE=$null; '+
        $environment+
        '$mutex=[Threading.Mutex]::new($false,'+(& $quote $mutexName)+'); '+
        '$owned=$false; try { '+
        'try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true}; '+
        'if(-not $owned){exit 0}; '+
        '. '+(& $quote $module)+'; '+
        'if(Test-LaoLocalPort '+$Port+'){exit 0}; '+
        $command+'; if($LASTEXITCODE -and $LASTEXITCODE -ne 0){exit 1} '+
        '} catch { $_ | Out-String | Write-Output; exit 1 } finally { '+
        'if($owned){$mutex.ReleaseMutex()};$mutex.Dispose() }'
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($body))
    $powershell=Join-Path $PSHOME 'powershell.exe'
    $proc=Start-Process -FilePath $powershell -ArgumentList @(
        '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded
    ) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $id=$proc.Id
    $proc.Dispose()
    return [pscustomobject]@{dependency=$Kind;port=$Port;state='starting';action='launched';pid=$id}
}

function Invoke-LaoBootstrap([bool]$StartMissing=$false) {
    $items=New-Object System.Collections.Generic.List[object]
    foreach($item in @(Get-LaoBootstrapPlan)) {
        if (-not $StartMissing -or $item.action -eq 'none') {
            $items.Add($item)
            continue
        }
        try {
            # Recheck immediately before dispatch. Worker rechecks under
            # a named mutex, so concurrent Startup shortcuts cannot duplicate.
            if(Test-LaoLocalPort $item.port) {
                $items.Add([pscustomobject]@{
                    dependency=$item.dependency;port=$item.port
                    state='listening_unverified';action='none'
                })
                continue
            }
            $items.Add((Start-LaoBootstrapDependency $item.dependency $item.port))
        } catch {
            $items.Add([pscustomobject]@{
                dependency=$item.dependency;port=$item.port
                state='unavailable';action='failed'
                error=($_.Exception.Message -replace '[\r\n]+',' ')
            })
        }
    }
    return @($items.ToArray())
}

if(-not $LibraryOnly) {
    $out=Invoke-LaoBootstrap ([bool]$Start)
    if ($Start) {
        # Operational evidence for the user's review after signing into Windows.
        # Do not log token values, prompts or workspace contents.
        try {
            $directory=Join-Path $env:LOCALAPPDATA 'LAODevSpace\logs'
            [IO.Directory]::CreateDirectory($directory) | Out-Null
            foreach($item in $out) {
                $record=[ordered]@{
                    at=(Get-Date).ToUniversalTime().ToString('o')
                    dependency=$item.dependency;port=$item.port
                    state=$item.state;action=$item.action
                }
                Add-Content -LiteralPath (Join-Path $directory 'startup-history.jsonl') -Value (
                    $record | ConvertTo-Json -Compress) -Encoding UTF8
            }
        } catch { Write-Warning 'LAO startup history could not be written.' }
    }
    if($AsJson){ @($out) | ConvertTo-Json -Compress -Depth 4 }
    else {
        foreach($item in $out) {
            Write-Output ('LAO bootstrap '+$item.dependency+': '+$item.state+
                ' ('+$item.action+')')
        }
    }
}
