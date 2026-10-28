# Local user-session starts. No installation, elevation, process killing or autostart.
$script:localStarts=@{}
$script:componentVersions=@{}
function Get-LaoComponentVersion([string]$Kind) {
    $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
    switch ($Kind) {
        'LAO' {
            $versionFile=Join-Path $root 'docs\lao-devspace\LAO_VERSION.json'
            if (-not [IO.File]::Exists($versionFile)) { return $null }
            $metadata=[IO.File]::ReadAllText($versionFile) | ConvertFrom-Json
            if ($metadata.schemaVersion -ne 1 -or $metadata.product -ne 'LAO DevSpace') { return $null }
            return [string]$metadata.version
        }
        'DevSpace' {
            $stable=Join-Path ([IO.Path]::GetDirectoryName($root)) 'devspace-upstream-test'
            $package=Join-Path $stable 'package.json'
            if (-not [IO.File]::Exists($package)) { return $null }
            return [string](([IO.File]::ReadAllText($package) | ConvertFrom-Json).version)
        }
        'Ollama' {
            $exe=Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
            if (-not [IO.File]::Exists($exe)) {
                $command=Get-Command ollama.exe -ErrorAction SilentlyContinue
                if (-not $command) { return $null }
                $exe=$command.Source
            }
            try {
                $output=[string](& $exe --version 2>$null)
                if ($output -match '(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)') { return $Matches[1] }
                $fileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($exe).ProductVersion
                if ($fileVersion -match '(\d+\.\d+\.\d+(?:\.\d+)?)') { return $Matches[1] }
            } catch { }
            return $null
        }
        default { return $null }
    }
}
function Update-LaoComponentVersion([string]$Kind) {
    try {
        $version=Get-LaoComponentVersion $Kind
        if ($version) { $script:componentVersions[$Kind]=$version }
        else { $script:componentVersions.Remove($Kind) }
    } catch {
        $script:componentVersions.Remove($Kind)
    }
    return $script:componentVersions[$Kind]
}
function Initialize-LaoComponentVersions {
    foreach ($kind in @('LAO','DevSpace','Ollama')) { [void](Update-LaoComponentVersion $kind) }
}
function Format-LaoComponentStatus([string]$Kind,[string]$Status) {
    $version=$script:componentVersions[$Kind]
    if ($version) { return $Status+' · v'+$version }
    return $Status
}
function Get-LaoLocalStartPort([string]$Kind) {
    switch ($Kind) {
        'LAO' { return [int]([uri]$script:baseUrl).Port }
        'Ollama' {
            if ($env:DEVSPACE_LAO_OLLAMA_URL -and
                $env:DEVSPACE_LAO_OLLAMA_URL -ne 'http://127.0.0.1:11434') {
                throw 'Ollama usa endereço personalizado. Inicie pela instalação configurada.'
            }
            return 11434
        }
        'DevSpace' { return 7676 }
        default { throw 'Componente desconhecido' }
    }
}
function Test-LaoLocalPort([int]$Port) {
    try {
        # Query the Windows TCP listener table directly instead of opening a
        # loopback connection. The previous 200 ms BeginConnect probe could
        # time out on some Windows machines even when the port was simply
        # unused, preventing the Play button from starting anything.
        return [bool]([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().
            GetActiveTcpListeners() | Where-Object { $_.Port -eq $Port } | Select-Object -First 1)
    } catch {
        # If Windows cannot enumerate listeners, fail closed: never risk a
        # second daemon on a port whose ownership could not be verified.
        throw 'Não foi possível verificar a porta local com segurança. Tente novamente.'
    }
}
function Test-LaoLocalStartAvailable([string]$Kind,$Snapshot) {
    if (-not $Snapshot) { return $false }
    if ($script:localStarts.ContainsKey($Kind)) { return $false }
    if ($Kind -eq 'LAO') { return $Snapshot.status -eq 'offline' }
    $managed=Get-LaoManagedService $Kind
    if ($managed -and [string]$managed.Status -ne 'Stopped') { return $false }
    $reason=if($Kind -eq 'Ollama'){'ollama_unavailable'}else{'devspace_unavailable'}
    return $Snapshot.statusAuthenticated -and @($Snapshot.reasons) -contains $reason
}
function ConvertTo-LaoPsLiteral([string]$Value) { return "'"+$Value.Replace("'","''")+"'" }
function Get-LaoLocalStartCommand([string]$Kind) {
    $managed=if($Kind -ne 'LAO'){Get-LaoManagedService $Kind}else{
        Get-Service -Name LAODevSpace -ErrorAction SilentlyContinue
    }
    if ($managed) {
        if ([string]$managed.Status -ne 'Stopped') { throw 'Serviço já iniciado. Consulte o status ou a recuperação gerenciada.' }
        return 'Start-Service -Name '+(ConvertTo-LaoPsLiteral $managed.Name)+' -ErrorAction Stop'
    }
    $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
    switch ($Kind) {
        'LAO' {
            $launcher=Join-Path $root 'scripts\launch-lao-daemon.ps1'
            if (-not [IO.File]::Exists($launcher)) { throw 'Launcher do LAO não encontrado.' }
            return '& '+(ConvertTo-LaoPsLiteral $launcher)+' -Port '+(Get-LaoLocalStartPort LAO)
        }
        'Ollama' {
            $exe=Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
            if (-not [IO.File]::Exists($exe)) {
                $command=Get-Command ollama.exe -ErrorAction SilentlyContinue
                if (-not $command) { throw 'Ollama não encontrado. Instale-o ou adicione ollama.exe ao PATH.' }
                $exe=$command.Source
            }
            # Match the local endpoint monitored by LAO, not an inherited remote host.
            return '$env:OLLAMA_HOST="127.0.0.1:11434"; & '+(ConvertTo-LaoPsLiteral $exe)+' serve'
        }
        'DevSpace' {
            # Reuse the existing pinned checkout and its persisted configuration.
            # Never start the LAO feature checkout as a second MCP server.
            $stable=Join-Path ([IO.Path]::GetDirectoryName($root)) 'devspace-upstream-test'
            $entry=Join-Path $stable 'bin\devspace.js'
            $package=Join-Path $stable 'package.json'
            if (-not [IO.File]::Exists($entry) -or -not [IO.File]::Exists($package)) {
                throw 'Instalação DevSpace esperada em devspace-upstream-test não encontrada.'
            }
            $version=([IO.File]::ReadAllText($package) | ConvertFrom-Json).version
            if ($version -ne '1.0.8') { throw 'O DevSpace precisa corresponder à versão fixa 1.0.8.' }
            $node=(Get-Command node.exe -ErrorAction Stop).Source
            return '$env:DEVSPACE_LAO_ENABLED="false"; Set-Location -LiteralPath '+
                (ConvertTo-LaoPsLiteral $stable)+'; & '+(ConvertTo-LaoPsLiteral $node)+' '+
                (ConvertTo-LaoPsLiteral $entry)+' serve'
        }
    }
}
function Invoke-LaoComponentAction([string]$Kind) {
    if (Test-LaoLocalStartAvailable $Kind $script:pollSnapshot) { Invoke-LaoLocalStart $Kind }
    elseif ($Kind -ne 'LAO') { [void](Invoke-LaoDependencyRecovery $Kind $script:pollSnapshot) }
}
function Invoke-LaoLocalStart([string]$Kind) {
    if ($script:localStarts.ContainsKey($Kind)) { return }
    try {
        [void](Update-LaoComponentVersion $Kind)
        $port=Get-LaoLocalStartPort $Kind
        # An occupied port is never permission to launch or replace another process.
        if (Test-LaoLocalPort $port) { throw 'A porta já está respondendo. Aguarde a atualização do monitor; nenhuma segunda instância foi iniciada.' }
        $command=Get-LaoLocalStartCommand $Kind
        $logs=Join-Path $env:LOCALAPPDATA 'LAODevSpace\logs'
        [IO.Directory]::CreateDirectory($logs) | Out-Null
        $log=Join-Path $logs ($Kind+'-start-'+[guid]::NewGuid().ToString('N')+'.log')
        $mutexName='Local\LAODevSpace-Start-'+$Kind+'-'+$port
        $body='$ErrorActionPreference="Stop"; $mutex=[Threading.Mutex]::new($false,'+
            (ConvertTo-LaoPsLiteral $mutexName)+'); $owned=$false; try { '+
            'try { $owned=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned=$true }; '+
            'if (-not $owned) { throw "Inicialização já em andamento em outro monitor." }; '+
            '. '+(ConvertTo-LaoPsLiteral (Join-Path $PSScriptRoot 'lao-start.ps1'))+'; '+
            'if (Test-LaoLocalPort '+$port+') { throw "Porta já ocupada." }; '+
            $command+'; if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Processo terminou com erro." } '+
            '} catch { $_ | Out-String | Write-Output; exit 1 } finally { if ($owned) { $mutex.ReleaseMutex() }; $mutex.Dispose() }'
        $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($body))
        $process=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') `
            -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded) `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError ($log+'.err')
        $script:localStarts[$Kind]=[pscustomobject]@{Process=$process;Deadline=[DateTime]::UtcNow.AddSeconds(45);Log=$log}
        $script:nextPollAt=[DateTime]::MinValue
        if ($script:popup) { $script:popup.CardDetails.Text='Iniciando '+$Kind+'…' }
    } catch {
        [Windows.Forms.MessageBox]::Show([string]$_.Exception.Message,'Iniciar '+$Kind) | Out-Null
    }
}
function Invoke-LaoStartAllComponents {
    # A single click works even when the LAO daemon is offline and cannot
    # provide an authenticated status for the other two services yet.
    if ($script:allStartInProgress) { return }
    $script:allStartInProgress=$true
    if ($script:popup) { $script:popup.StartAll.Enabled=$false }
    $started=[Collections.Generic.List[string]]::new()
    $existing=[Collections.Generic.List[string]]::new()
    $failed=[Collections.Generic.List[string]]::new()
    try {
        foreach ($kind in @('LAO','DevSpace','Ollama')) {
            [void](Update-LaoComponentVersion $kind)
            if ($script:localStarts.ContainsKey($kind)) {
                $existing.Add($kind)
                continue
            }
            try {
                $port=Get-LaoLocalStartPort $kind
                # A listening endpoint must never be replaced or duplicated,
                # even when the LAO dashboard has not yet verified it.
                if (Test-LaoLocalPort $port) {
                    $existing.Add($kind)
                    continue
                }
                Invoke-LaoLocalStart $kind
                if ($script:localStarts.ContainsKey($kind)) {
                    $started.Add($kind)
                } else {
                    $failed.Add($kind)
                }
            } catch {
                $failed.Add($kind)
                [Windows.Forms.MessageBox]::Show(
                    [string]$_.Exception.Message,'Iniciar '+$kind) | Out-Null
            }
        }
        if ($script:popup) {
            $message=if ($started.Count) {
                'Inicializando: '+($started -join ', ')+'.'
            } else {
                'Nenhuma nova inicialização necessária.'
            }
            if ($existing.Count) { $message+=' Já iniciados ou com porta ocupada: '+($existing -join ', ')+'.' }
            if ($failed.Count) { $message+=' Verifique: '+($failed -join ', ')+'.' }
            $script:popup.CardDetails.Text=$message
        }
        $script:nextPollAt=[DateTime]::MinValue
    } finally {
        $script:allStartInProgress=$false
        if ($script:popup) { $script:popup.StartAll.Enabled=$true }
    }
}
function Update-LaoLocalStarts {
    foreach ($kind in @($script:localStarts.Keys)) {
        $item=$script:localStarts[$kind]
        $snapshot=$script:pollSnapshot
        $ready=$false
        if ($snapshot) {
            if ($kind -eq 'LAO') { $ready=$snapshot.status -ne 'offline' }
            elseif ($snapshot.statusAuthenticated) {
                $reason=if($kind -eq 'Ollama'){'ollama_unavailable'}else{'devspace_unavailable'}
                $ready=@($snapshot.reasons) -notcontains $reason
                if ($kind -eq 'DevSpace') { $ready=$ready -and @($snapshot.reasons) -notcontains 'devspace_unverified' }
            }
        }
        if ($ready) {
            $script:localStarts.Remove($kind)
            $item.Process.Dispose()
            if ($script:popup) { $script:popup.CardDetails.Text=$kind+' iniciado e verificado.' }
        } elseif ($item.Process.HasExited -and $item.Process.ExitCode -ne 0 -or [DateTime]::UtcNow -gt $item.Deadline) {
            $script:localStarts.Remove($kind)
            $item.Process.Dispose()
            [Windows.Forms.MessageBox]::Show(
                'Não foi possível confirmar a inicialização de '+$kind+'. Consulte os logs: '+$item.Log,
                'Inicialização de '+$kind) | Out-Null
        }
    }
}
