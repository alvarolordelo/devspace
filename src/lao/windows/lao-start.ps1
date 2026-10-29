# Local user-session starts. No installation, elevation, process killing or autostart.
$script:localStarts=@{}
$script:componentVersions=@{}
$script:uiLanguage=$null
function Get-LaoUiPreferencesPath {
    $directory=Join-Path $env:LOCALAPPDATA 'LAODevSpace'
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    return Join-Path $directory 'ui-preferences.json'
}
function Get-LaoUiLanguage {
    if ($script:uiLanguage -in @('pt-BR','en-US')) { return $script:uiLanguage }
    $systemLanguage=[Globalization.CultureInfo]::CurrentUICulture.Name
    $script:uiLanguage=$(if($systemLanguage -like 'pt-*'){'pt-BR'}else{'en-US'})
    try {
        $path=Get-LaoUiPreferencesPath
        if ([IO.File]::Exists($path)) {
            $saved=[IO.File]::ReadAllText($path,[Text.Encoding]::UTF8) | ConvertFrom-Json
            if ([string]$saved.language -in @('pt-BR','en-US')) {
                $script:uiLanguage=[string]$saved.language
            }
        }
    } catch {
        $script:uiLanguage=$(if($systemLanguage -like 'pt-*'){'pt-BR'}else{'en-US'})
    }
    return $script:uiLanguage
}
function Set-LaoUiLanguage([ValidateSet('pt-BR','en-US')][string]$Language) {
    $path=Get-LaoUiPreferencesPath
    $temp=$path+'.tmp-'+[guid]::NewGuid().ToString('N')
    try {
        $json=[ordered]@{schemaVersion=1;language=$Language} | ConvertTo-Json -Compress
        [IO.File]::WriteAllText($temp,$json+"`n",(New-Object Text.UTF8Encoding($false)))
        Move-Item -LiteralPath $temp -Destination $path -Force
        $script:uiLanguage=$Language
    } finally {
        if ([IO.File]::Exists($temp)) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
    }
}
function Get-LaoUiText([string]$Key) {
    $language=Get-LaoUiLanguage
    $pt=@{
        SettingsTitle='LAO DevSpace · Configurações'; AutoStartTitle='Inicialização automática';
        AutoStartDesc='Iniciar LAO, Monitor e dependências ausentes ao entrar no Windows.'; On='LIGADO'; Off='DESLIGADO';
        StartWithWindows='Iniciar LAO, Monitor, DevSpace e Ollama com Windows'; ManageComponents='Gerenciar componentes';
        RestartNotice='Reinicializações exigem confirmação. Serviços externos são validados antes da ação.';
        Restart='Reiniciar'; Start='Iniciar'; Starting='Iniciando…'; ActiveRestart='Ativo: reinício disponível';
        StoppedStart='Parado: clique para iniciar'; NoSafeAction='Sem ação segura disponível';
        AwaitingResponse='Aguardando resposta'; ActiveTaskBlocked='Tarefa ativa: reinício bloqueado';
        ConnectionUnverified='Conexão não verificada'; SettingsFoot='Só nesta conta. Serviços saudáveis não serão reiniciados.';
        Language='Idioma'; Portuguese='Português'; English='English';
        WaitingSignal='Aguardando sinal'; StartAll='Iniciar LAO, DevSpace e Ollama';
        StartAllDesc='Verifica os três serviços e inicia apenas os que estiverem parados'; DefaultModel='Modelo padrão';
        Queue='Fila'; LastRun='Última execução'; ChooseModel='Clique para escolher um modelo local do Ollama';
        CurrentSituation='Situação atual'; VerifyingLao='Verificando o LAO'; AwaitingLocalData='Aguardando dados locais';
        OpenDashboard='Abrir painel'; ViewLogs='Ver logs'; ViewReview='Ver revisão'; Settings='Configurações';
        ReviewContinue='Revisar / Continuar'; ReviewSelectTask='Tarefa pendente'; ReviewSelectAgent='Continuar com';
        ReviewCopyOnly='Apenas copiar'; ReviewCopyOpen='Copiar instrução e abrir IA'; ReviewClose='Fechar';
        ReviewNoTasks='Não há tarefas elegíveis para revisão. Atualize o monitor.';
        ReviewRequestedBy='Solicitado por'; ReviewSafetyNote='A instrução será copiada. Envie-a na IA escolhida, com o conector DevSpace conectado. Nenhuma alteração será aprovada automaticamente.';
        ReviewCopied='Instrução copiada. Cole e envie no cliente de IA escolhido.';
        ReviewCopyFailed='Falha ao copiar. Selecione e copie a instrução exibida.';
        ReviewOpenFailed='Instrução copiada, mas não foi possível abrir o cliente de IA.';
        ReviewQueryFailed='Não foi possível consultar as tarefas. Verifique a autenticação do monitor e a conexão com o LAO.';
        FreshWaiting='Aguardando coleta · — = não verificado'; ServiceUnavailable='Serviço indisponível';
        AwaitingReview='Aguardando revisão'; RunningTasks='Executando tarefas'; Active='Ativo';
        Partial='Atenção · parcialmente disponível'; Responding='Respondendo'; NoResponse='Sem resposta';
        NotVerified='Não verificado'; Connected='Conectado'; Running='em execução'; Pending='Pendências';
        ActionRequired='Ação necessária'; ReviewCount='{0} revisão(ões)'; ReviewDetails='Há {0} tarefa(s) aguardando aprovação.';
        CurrentTask='Tarefa atual'; RestartLaoActive='Reiniciar LAO (tarefa ativa)'; RunInProgress='Execução em andamento';
        Preparing='Preparando'; Executing='Executando'; Validating='Validando'; NotReported='Não informada';
        NotInformed='Não informado'; Executor='Executor'; Phase='Fase'; TimeUnavailable='não disponível';
        RestartLao='Reiniciar LAO'; RestartLaoUnavailable='Reiniciar LAO (indisponível)';
        StartLaoUnavailable='Iniciar LAO (indisponível)'; MonitorRunning='Monitor em funcionamento';
        OrchestratorUnavailable='Orquestrador indisponível'; NoActiveTask='Nenhuma tarefa ativa confirmada.';
        DaemonNotResponding='O daemon não está respondendo.'; LastCheck='Última verificação';
        Unavailable='indisponível'; NoConfirmedCheck='Sem coleta confirmada';
        TrayOpen='Abrir painel LAO'; TrayStatus='Status'; TrayTasks='Tarefas'; TrayCopy='Copiar diagnóstico'; TrayExit='Sair do monitor';
        TrayUnauth='consulta não autenticada'; ReviewShort='em revisão'; WaitingQuery='aguardando consulta';
        StartingLao='Iniciando LAO…'; RestartingLao='Reiniciando LAO…';
        ConfirmRestartLao='Reiniciar somente o LAO DevSpace? DevSpace MCP e Ollama continuarão funcionando.';
        ConfirmRestartLaoTitle='Confirmar reinício LAO'; RestartLaoFailed='Falha ao solicitar reinício do LAO.';
        ServiceFaultDesc='Serviço com falha. Clique para confirmar recuperação do {0}'; StatusOnlyDesc='Somente status. Nenhuma ação disponível.'
        ComponentActionQuestion='{0} {1} agora? A conexão desse componente poderá ser interrompida temporariamente.';
        ComponentActionFailed='Não foi possível confirmar a ação. Consulte os logs e o histórico de recuperação.'
        LocalModelsTitle='Modelos locais LAO'; NoLocalModelsFound='O Ollama está respondendo, mas retornou 0 modelos. Verifique se OLLAMA_MODELS aponta para a pasta dos modelos existentes e reinicie o Ollama em Configurações > Gerenciar componentes.';
        LocalModelsQueryFailed='Não foi possível consultar a lista de modelos. Verifique a conexão com o LAO, o Ollama e a autenticação do monitor.'
    }
    $en=@{
        SettingsTitle='LAO DevSpace · Settings'; AutoStartTitle='Automatic startup';
        AutoStartDesc='Start LAO, Monitor and missing dependencies when signing in.'; On='ON'; Off='OFF';
        StartWithWindows='Start LAO, Monitor, DevSpace and Ollama with Windows'; ManageComponents='Manage components';
        RestartNotice='Restarts require confirmation. External services are validated before the action.';
        Restart='Restart'; Start='Start'; Starting='Starting…'; ActiveRestart='Active: restart available';
        StoppedStart='Stopped: click to start'; NoSafeAction='No safe action available';
        AwaitingResponse='Waiting for response'; ActiveTaskBlocked='Active task: restart blocked';
        ConnectionUnverified='Connection not verified'; SettingsFoot='Current account only. Healthy services will not be restarted.';
        Language='Language'; Portuguese='Português'; English='English';
        WaitingSignal='Waiting for signal'; StartAll='Start LAO, DevSpace and Ollama';
        StartAllDesc='Checks all three services and starts only those that are stopped'; DefaultModel='Default model';
        Queue='Queue'; LastRun='Last run'; ChooseModel='Click to choose a local Ollama model';
        CurrentSituation='Current status'; VerifyingLao='Checking LAO'; AwaitingLocalData='Waiting for local data';
        OpenDashboard='Open dashboard'; ViewLogs='View logs'; ViewReview='View review'; Settings='Settings';
        ReviewContinue='Review / Continue'; ReviewSelectTask='Pending task'; ReviewSelectAgent='Continue with';
        ReviewCopyOnly='Copy only'; ReviewCopyOpen='Copy instruction and open AI'; ReviewClose='Close';
        ReviewNoTasks='No eligible tasks remain for review. Refresh the monitor.';
        ReviewRequestedBy='Requested by'; ReviewSafetyNote='The instruction is copied. Send it in the selected assistant with DevSpace connected. No changes are approved automatically.';
        ReviewCopied='Instruction copied. Paste and send it in the selected AI client.';
        ReviewCopyFailed='Clipboard unavailable. Select and copy the displayed instruction.';
        ReviewOpenFailed='Instruction copied, but the AI client could not be opened.';
        ReviewQueryFailed='Unable to load tasks. Check LAO connectivity and monitor authentication.';
        FreshWaiting='Waiting for check · — = unavailable'; ServiceUnavailable='Service unavailable';
        AwaitingReview='Awaiting review'; RunningTasks='Running tasks'; Active='Active';
        Partial='Attention · partially available'; Responding='Responding'; NoResponse='No response';
        NotVerified='Not verified'; Connected='Connected'; Running='running'; Pending='Pending';
        ActionRequired='Action required'; ReviewCount='{0} review(s)'; ReviewDetails='{0} task(s) awaiting approval.';
        CurrentTask='Current task'; RestartLaoActive='Restart LAO (active task)'; RunInProgress='Run in progress';
        Preparing='Preparing'; Executing='Running'; Validating='Validating'; NotReported='Not reported';
        NotInformed='Not provided'; Executor='Executor'; Phase='Phase'; TimeUnavailable='unavailable';
        RestartLao='Restart LAO'; RestartLaoUnavailable='Restart LAO (unavailable)';
        StartLaoUnavailable='Start LAO (unavailable)'; MonitorRunning='Monitor running';
        OrchestratorUnavailable='Orchestrator unavailable'; NoActiveTask='No active task confirmed.';
        DaemonNotResponding='The daemon is not responding.'; LastCheck='Last check';
        Unavailable='unavailable'; NoConfirmedCheck='No confirmed check';
        TrayOpen='Open LAO dashboard'; TrayStatus='Status'; TrayTasks='Tasks'; TrayCopy='Copy diagnostics'; TrayExit='Exit monitor';
        TrayUnauth='unauthenticated query'; ReviewShort='in review'; WaitingQuery='waiting for check';
        StartingLao='Starting LAO…'; RestartingLao='Restarting LAO…';
        ConfirmRestartLao='Restart only LAO DevSpace? DevSpace MCP and Ollama will keep running.';
        ConfirmRestartLaoTitle='Confirm LAO restart'; RestartLaoFailed='Failed to request LAO restart.';
        ServiceFaultDesc='Service failure. Click to confirm recovery of {0}'; StatusOnlyDesc='Status only. No action available.'
        ComponentActionQuestion='{0} {1} now? This component connection may be temporarily interrupted.';
        ComponentActionFailed='The action could not be confirmed. Check logs and recovery history.'
        LocalModelsTitle='LAO local models'; NoLocalModelsFound='Ollama is responding but returned 0 models. Make sure OLLAMA_MODELS points to your existing model directory, then restart Ollama under Settings > Manage components.';
        LocalModelsQueryFailed='Could not retrieve the model list. Check the LAO and Ollama connections and the monitor authentication.'
    }
    $table=if($language -eq 'en-US'){$en}else{$pt}
    $value=$table[$Key]
    if($null -eq $value){return $Key}
    return [string]$value
}
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
function Get-LaoOllamaModelsPath {
    # Read the persisted Windows user setting as well: a tray started at login
    # can have an old process environment even after OLLAMA_MODELS is corrected.
    $configured=[Environment]::GetEnvironmentVariable('OLLAMA_MODELS','User')
    if (-not $configured) { $configured=[Environment]::GetEnvironmentVariable('OLLAMA_MODELS','Process') }
    if (-not $configured) { $configured=[Environment]::GetEnvironmentVariable('OLLAMA_MODELS','Machine') }
    if (-not $configured) { return $null }
    $configured=[Environment]::ExpandEnvironmentVariables($configured)
    if (-not [IO.Path]::IsPathRooted($configured) -or
        -not (Test-Path -LiteralPath $configured -PathType Container)) {
        throw 'OLLAMA_MODELS aponta para um diretório inexistente ou relativo. Corrija a configuração antes de iniciar o Ollama.'
    }
    return [IO.Path]::GetFullPath($configured)
}
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
            # Match the monitored endpoint and the persistent local model store.
            # Otherwise Ollama silently starts with an empty default C: store
            # even though the user's installed models live on another drive.
            $modelsPath=Get-LaoOllamaModelsPath
            $modelsEnv=if ($modelsPath) {
                '$env:OLLAMA_MODELS='+(ConvertTo-LaoPsLiteral $modelsPath)+'; '
            } else { '' }
            return '$env:OLLAMA_HOST="127.0.0.1:11434"; '+$modelsEnv+
                '& '+(ConvertTo-LaoPsLiteral $exe)+' serve'
        }
        'DevSpace' {
            # Run exactly one MCP server: DevSpace core remains pinned at 1.0.8,
            # while this LAO build adds the opt-in LAO tool surface on top.
            $entry=Join-Path $root 'bin\devspace.js'
            $package=Join-Path $root 'package.json'
            $pinFile=Join-Path $root 'docs\lao-devspace\DEVSPACE_VERSION_PIN.json'
            if (-not [IO.File]::Exists($entry) -or -not [IO.File]::Exists($package)) {
                throw 'Build integrado do LAO/DevSpace não encontrado.'
            }
            $version=([IO.File]::ReadAllText($package) | ConvertFrom-Json).version
            if ($version -ne '1.0.8') { throw 'O DevSpace precisa corresponder à versão fixa 1.0.8.' }
            if (-not [IO.File]::Exists($pinFile)) { throw 'Pin de versão do DevSpace não encontrado.' }
            $pin=[IO.File]::ReadAllText($pinFile) | ConvertFrom-Json
            if ($pin.version -ne '1.0.8') { throw 'Pin do DevSpace precisa permanecer em 1.0.8.' }
            $node=(Get-Command node.exe -ErrorAction Stop).Source
            $stateDir=Join-Path $env:LOCALAPPDATA 'LAODevSpace\state'
            return '$env:DEVSPACE_LAO_ENABLED="true"; '+
                '$env:DEVSPACE_LAO_STATE_DIR='+(ConvertTo-LaoPsLiteral ([IO.Path]::GetFullPath($stateDir)))+'; '+
                'Set-Location -LiteralPath '+(ConvertTo-LaoPsLiteral $root)+'; & '+(ConvertTo-LaoPsLiteral $node)+' '+
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
