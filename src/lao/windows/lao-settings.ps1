# Ancillary settings dialog, separate from the visually approved 420 DIP popup.
# Shared start actions work without requiring Windows service installation.
. (Join-Path $PSScriptRoot 'lao-start.ps1')
function Get-LaoManagedService([string]$Kind) {
    $variable=switch ($Kind) {
        'Ollama' {'LAO_MANAGED_OLLAMA_SERVICE'}
        'DevSpace' {'LAO_MANAGED_DEVSPACE_SERVICE'}
        default { throw 'Dependência não reconhecida' }
    }
    $name=[Environment]::GetEnvironmentVariable($variable,'Process')
    if (!$name -or $name -cnotmatch '^[a-zA-Z][a-zA-Z0-9_-]{0,79}$') { return $null }
    return Get-Service -Name $name -ErrorAction SilentlyContinue
}

function Get-LaoVerifiedLocalListener([string]$Kind,$Snapshot) {
    if ($Kind -notin @('Ollama','DevSpace')) { return $null }
    $port=Get-LaoLocalStartPort $Kind
    try {
        $connection=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop |
            Select-Object -First 1
        if (-not $connection) { return $null }
        $process=Get-Process -Id ([int]$connection.OwningProcess) -ErrorAction Stop
        $actual=[IO.Path]::GetFullPath([string]$process.Path)
        if ($Kind -eq 'Ollama') {
            $expected=Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
            if (-not [IO.File]::Exists($expected)) {
                $command=Get-Command ollama.exe -ErrorAction SilentlyContinue
                if (-not $command) { return $null }
                $expected=$command.Source
            }
            if ($actual -ine [IO.Path]::GetFullPath($expected)) { return $null }
        } else {
            $node=(Get-Command node.exe -ErrorAction SilentlyContinue)
            if (-not $node -or $actual -ine [IO.Path]::GetFullPath($node.Source)) { return $null }
            # Port + node.exe alone is not enough to kill a process. Require
            # the authenticated LAO probe to have verified this endpoint as
            # the configured DevSpace MCP before offering a local restart.
            $reasons=@($Snapshot.reasons)
            if (-not $Snapshot -or -not $Snapshot.statusAuthenticated -or
                $reasons -contains 'devspace_unavailable' -or
                $reasons -contains 'devspace_unverified') { return $null }
        }
        return [pscustomobject]@{
            Kind=$Kind; Port=$port; ProcessId=[int]$process.Id
            ProcessPath=$actual
        }
    } catch { return $null }
}

function Get-LaoSettingsComponentAction([string]$Kind,$Snapshot) {
    if ($Kind -notin @('Ollama','DevSpace') -or $script:localStarts.ContainsKey($Kind)) {
        return $null
    }
    if ($Snapshot -and $Snapshot.tasksAuthenticated -and
        $null -ne $Snapshot.activeTasks -and [int]$Snapshot.activeTasks -gt 0) {
        return $null
    }
    $service=Get-LaoManagedService $Kind
    if ($service) {
        $status=[string]$service.Status
        if ($status -notin @('Running','Stopped')) { return $null }
        return [pscustomobject]@{
            Kind=$Kind; Mode='Service'; ServiceName=[string]$service.Name
            Operation=$(if($status -eq 'Stopped'){'Start'}else{'Restart'})
        }
    }
    $listener=Get-LaoVerifiedLocalListener $Kind $Snapshot
    if ($listener) {
        return [pscustomobject]@{
            Kind=$Kind; Mode='LocalProcess'; Operation='Restart'
            ProcessId=$listener.ProcessId; ProcessPath=$listener.ProcessPath
            Port=$listener.Port
        }
    }
    $port=Get-LaoLocalStartPort $Kind
    if (Test-LaoLocalPort $port) { return $null }
    return [pscustomobject]@{
        Kind=$Kind; Mode='LocalProcess'; Operation='Start'; Port=$port
    }
}

function Wait-LaoLocalPort([int]$Port,[bool]$Listening,[int]$Seconds=25) {
    $deadline=(Get-Date).AddSeconds($Seconds)
    do {
        if ((Test-LaoLocalPort $Port) -eq $Listening) { return $true }
        [Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Invoke-LaoLocalProcessRecoveryOperation($Action) {
    $kind=[string]$Action.Kind
    $port=[int]$Action.Port
    $operation=[string]$Action.Operation
    $identity=if($operation -eq 'Restart'){'pid:'+[string]$Action.ProcessId}else{'local'}
    $result='failed'
    $verified=$false
    try {
        if ($operation -eq 'Restart') {
            $process=Get-Process -Id ([int]$Action.ProcessId) -ErrorAction Stop
            if ([IO.Path]::GetFullPath([string]$process.Path) -ine
                [IO.Path]::GetFullPath([string]$Action.ProcessPath)) {
                throw 'O processo mudou antes do reinício; ação cancelada.'
            }
            Stop-Process -Id ([int]$Action.ProcessId) -ErrorAction Stop
            if (-not (Wait-LaoLocalPort $port $false 15)) {
                throw 'A porta não foi liberada após encerrar o processo validado.'
            }
        }
        Invoke-LaoLocalStart $kind
        if (Wait-LaoLocalPort $port $true 45) {
            [void](Update-LaoComponentVersion $kind)
            $result='verified'; $verified=$true
        } else {
            $result='running_unverified'
        }
    } catch {
        $result='failed'
    }
    $recorded=Write-LaoRecoveryHistory $kind $identity $operation $result
    return $verified -and $recorded
}

function Invoke-LaoSettingsComponentAction([string]$Kind,$Snapshot) {
    if ($script:dependencyRecoveryInProgress) { return $false }
    $candidate=Get-LaoSettingsComponentAction $Kind $Snapshot
    if (-not $candidate) { return $false }
    $verb=if($candidate.Operation -eq 'Start'){'Iniciar'}else{'Reiniciar'}
    $question="$verb $Kind agora? A conexão desse componente poderá ser interrompida temporariamente."
    $confirmed=[Windows.Forms.MessageBox]::Show(
        $question, "$verb $Kind",
        [Windows.Forms.MessageBoxButtons]::YesNo,
        [Windows.Forms.MessageBoxIcon]::Warning)
    if ($confirmed -ne [Windows.Forms.DialogResult]::Yes) { return $false }
    $script:dependencyRecoveryInProgress=$true
    try {
        $freshSnapshot=Get-LaoDependencyFreshSnapshot
        if (-not $freshSnapshot) { $freshSnapshot=$Snapshot }
        $fresh=Get-LaoSettingsComponentAction $Kind $freshSnapshot
        if (-not $fresh -or $fresh.Mode -ne $candidate.Mode -or
            $fresh.Operation -ne $candidate.Operation) { return $false }
        if ($candidate.Mode -eq 'Service') {
            if ($fresh.ServiceName -cne $candidate.ServiceName) { return $false }
            $verified=Invoke-LaoDependencyRecoveryOperation $fresh
        } else {
            if ($candidate.Operation -eq 'Restart' -and
                ([int]$fresh.ProcessId -ne [int]$candidate.ProcessId -or
                 [string]$fresh.ProcessPath -ine [string]$candidate.ProcessPath)) { return $false }
            $verified=Invoke-LaoLocalProcessRecoveryOperation $fresh
        }
        if (-not $verified) {
            [Windows.Forms.MessageBox]::Show(
                'Não foi possível confirmar a ação. Consulte os logs e o histórico de recuperação.',
                'LAO DevSpace') | Out-Null
        }
        $script:nextPollAt=[DateTime]::MinValue
        return $verified
    } finally {
        $script:dependencyRecoveryInProgress=$false
    }
}

# Only a demonstrated service failure permits a recovery action. In
# particular, devspace_unverified means "not authenticated/checked", NOT
# "DevSpace is down" and must never trigger a restart.
function Get-LaoDependencyRecoveryAction([string]$Kind,$Snapshot,$Service=$null) {
    if (-not $Snapshot -or $Kind -notin @('Ollama','DevSpace')) { return $null }
    if (-not $Snapshot.tasksAuthenticated -or
        $null -eq $Snapshot.activeTasks -or [int]$Snapshot.activeTasks -gt 0) {
        return $null
    }
    if (-not $PSBoundParameters.ContainsKey('Service')) {
        $Service=Get-LaoManagedService $Kind
    }
    if (-not $Service) { return $null }
    $status=[string]$Service.Status
    if ($status -notin @('Running','Stopped')) { return $null }
    $reasons=@($Snapshot.reasons)
    $reason=$(if ($Kind -eq 'Ollama'){'ollama_unavailable'}else{'devspace_unavailable'})
    $confirmedFault=$Snapshot.statusAuthenticated -and $reasons -contains $reason
    # An explicitly configured/known Windows service being stopped is itself
    # evidence of a problem, even if its HTTP state has not been checked.
    if ($status -ne 'Stopped' -and -not $confirmedFault) { return $null }
    return [pscustomobject]@{
        Kind=$Kind
        ServiceName=[string]$Service.Name
        Operation=$(if($status -eq 'Stopped'){'Start'}else{'Restart'})
    }
}

# A recovery decision uses a new authenticated daemon result, not the tray's
# 15-second display cache. The daemon counts all active tasks for this gate.
function Get-LaoDependencyFreshSnapshot {
    if (-not $script:dashboardToken -or -not $script:baseUrl) { return $null }
    try {
        $value=Invoke-RestMethod -Method Get `
            -Uri ($script:baseUrl + '/dashboard/api/status') `
            -Headers @{Authorization=('Bearer '+$script:dashboardToken)} `
            -TimeoutSec 10 -MaximumRedirection 0 -ErrorAction Stop
        if ($null -eq $value.activeTasks -or $null -eq $value.blockingReasons -or
            [int]$value.activeTasks -lt 0) { return $null }
        return [pscustomobject]@{
            statusAuthenticated=$true; tasksAuthenticated=$true
            activeTasks=[int]$value.activeTasks; reasons=@($value.blockingReasons)
        }
    } catch { return $null }
}

function Write-LaoRecoveryHistory([string]$Kind,[string]$ServiceName,
    [string]$Operation,[string]$Result) {
    try {
        $directory=Join-Path $env:LOCALAPPDATA 'LAODevSpace'
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        $path=Join-Path $directory 'recovery-history.jsonl'
        $item=[ordered]@{
            at=(Get-Date).ToUniversalTime().ToString('o')
            dependency=$Kind; service=$ServiceName
            operation=$Operation; result=$Result
        }
        Add-Content -LiteralPath $path -Value ($item | ConvertTo-Json -Compress) -Encoding UTF8
        return $true
    } catch { return $false }
}

function Invoke-LaoDependencyRecoveryOperation($Action) {
    $kind=[string]$Action.Kind
    $service=[string]$Action.ServiceName
    $operation=[string]$Action.Operation
    $result='failed'
    $verified=$false
    try {
        if ($operation -eq 'Restart') {
            Stop-Service -Name $service -ErrorAction Stop
            (Get-Service -Name $service -ErrorAction Stop).WaitForStatus(
                [ServiceProcess.ServiceControllerStatus]::Stopped,
                [TimeSpan]::FromSeconds(15))
        }
        Start-Service -Name $service -ErrorAction Stop
        (Get-Service -Name $service -ErrorAction Stop).WaitForStatus(
            [ServiceProcess.ServiceControllerStatus]::Running,
            [TimeSpan]::FromSeconds(15))
        if ($kind -eq 'DevSpace') {
            # The daemon caches authenticated MCP probes for 10 seconds.
            # Never accept a pre-restart green response as post-restart proof.
            $cacheExpiry=(Get-Date).AddSeconds(11)
            while ((Get-Date) -lt $cacheExpiry) {
                [Windows.Forms.Application]::DoEvents()
                Start-Sleep -Milliseconds 250
            }
        }
        $deadline=(Get-Date).AddSeconds(25)
        $reason=if($kind -eq 'Ollama'){'ollama_unavailable'}else{'devspace_unavailable'}
        do {
            $health=Get-LaoDependencyFreshSnapshot
            if ($health -and $health.statusAuthenticated -and
                $health.reasons -notcontains $reason -and
                ($kind -ne 'DevSpace' -or
                 $health.reasons -notcontains 'devspace_unverified') -and
                $health.activeTasks -eq 0) {
                $result='verified'; $verified=$true; break
            }
            [Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 800
        } while ((Get-Date) -lt $deadline)
        if (-not $verified) { $result='running_unverified' }
    } catch {
        $result='failed'
    }
    $recorded=Write-LaoRecoveryHistory $kind $service $operation $result
    return $verified -and $recorded
}

function Invoke-LaoDependencyRecovery([string]$Kind,$Snapshot) {
    if ($script:dependencyRecoveryInProgress) { return $false }
    $candidate=Get-LaoDependencyRecoveryAction $Kind $Snapshot
    if (-not $candidate) { return $false }
    $verb=if($candidate.Operation -eq 'Start'){'Iniciar'}else{'Reiniciar'}
    $question="$verb somente o serviço Windows $Kind ($($candidate.ServiceName))? A conexão poderá ser interrompida."
    $confirmed=[Windows.Forms.MessageBox]::Show(
        $question, "Confirmar ação: $Kind",
        [Windows.Forms.MessageBoxButtons]::YesNo,
        [Windows.Forms.MessageBoxIcon]::Warning)
    if ($confirmed -ne [Windows.Forms.DialogResult]::Yes) { return $false }
    # Re-evaluate after confirmation: a recovery request must never turn into
    # an unconditional restart of a service that became healthy meanwhile.
    $script:dependencyRecoveryInProgress=$true
    try {
        $freshSnapshot=Get-LaoDependencyFreshSnapshot
        $fresh=Get-LaoDependencyRecoveryAction $Kind $freshSnapshot
        if (-not $fresh -or $fresh.ServiceName -cne $candidate.ServiceName -or
            $fresh.Operation -ne $candidate.Operation) {
            return $false
        }
        $verified=Invoke-LaoDependencyRecoveryOperation $fresh
        if (-not $verified) {
            [Windows.Forms.MessageBox]::Show(
                'A ação não pôde ser verificada ou registrada. Consulte o histórico de recuperação.',
                'LAO DevSpace') | Out-Null
        }
        return $verified
    } finally {
        $script:dependencyRecoveryInProgress=$false
        if ((Get-Command Start-LaoAsyncPoll -ErrorAction SilentlyContinue) -and
            $script:pollStage -eq 'none') { Start-LaoAsyncPoll }
    }
}

function New-LaoSettingsForm($Assets,$SnapshotProvider) {
    $form=[Windows.Forms.Form]::new()
    $form.Text='LAO DevSpace · Configurações'
    $form.ClientSize=[Drawing.Size]::new(395,375)
    $form.FormBorderStyle=[Windows.Forms.FormBorderStyle]::FixedDialog
    $form.MaximizeBox=$false
    $form.MinimizeBox=$false
    $form.StartPosition=[Windows.Forms.FormStartPosition]::CenterScreen
    $form.Font=[Drawing.Font]::new('Segoe UI',10)
    $form.BackColor=[Drawing.Color]::White
    function AddText([string]$label,[int]$x,[int]$y,[int]$width,[int]$height) {
        $control=[Windows.Forms.Label]::new()
        $control.Location=[Drawing.Point]::new($x,$y)
        $control.Size=[Drawing.Size]::new($width,$height)
        $control.Text=$label
        $form.Controls.Add($control)
        return $control
    }
    $title=AddText 'Inicialização automática' 20 18 350 32
    $title.Font=[Drawing.Font]::new('Segoe UI',13,[Drawing.FontStyle]::Bold)
    $description=AddText 'Iniciar LAO e Monitor ao entrar nesta conta do Windows.' 20 54 352 43
    $description.ForeColor=[Drawing.Color]::DimGray
    $toggle=[Windows.Forms.CheckBox]::new()
    $toggle.Appearance=[Windows.Forms.Appearance]::Button
    $toggle.FlatStyle=[Windows.Forms.FlatStyle]::Flat
    $toggle.FlatAppearance.BorderSize=0
    $toggle.FlatAppearance.MouseOverBackColor=[Drawing.Color]::White
    $toggle.Location=[Drawing.Point]::new(226,91)
    $toggle.Size=[Drawing.Size]::new(149,38)
    $toggle.TextAlign=[Drawing.ContentAlignment]::MiddleCenter
    $toggle.AccessibleName='Iniciar LAO e Monitor com Windows'
    $toggle.Checked=[bool](Get-LaoTrayAutostart)
    $form.Controls.Add($toggle)
    $toggle.Add_CheckedChanged({
        try {
            Set-LaoTrayAutostart ([bool]$this.Checked)
            $this.Text=$(if($this.Checked){'LIGADO'}else{'DESLIGADO'})
            $this.Invalidate()
        } catch {
            $this.Checked=Get-LaoTrayAutostart
            [Windows.Forms.MessageBox]::Show($_.Exception.Message,'LAO DevSpace') | Out-Null
        }
    })
    $toggle.Text=$(if($toggle.Checked){'LIGADO'}else{'DESLIGADO'})
    $toggle.TextAlign=[Drawing.ContentAlignment]::MiddleLeft
    $toggle.BackColor=[Drawing.Color]::White
    $toggle.Add_Paint({
        $track=[Drawing.SolidBrush]::new($(if($this.Checked){
            [Drawing.ColorTranslator]::FromHtml('#16A34A')
        }else{[Drawing.ColorTranslator]::FromHtml('#CBD5E1')}))
        $knob=[Drawing.SolidBrush]::new([Drawing.Color]::White)
        try{
            $_.Graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $_.Graphics.FillRectangle($track,[Drawing.Rectangle]::new(111,8,22,23))
            $_.Graphics.FillEllipse($track,99,8,24,23)
            $_.Graphics.FillEllipse($track,123,8,24,23)
            $_.Graphics.FillEllipse($knob,$(if($this.Checked){126}else{102}),11,17,17)
        }finally{$track.Dispose();$knob.Dispose()}
    })
    $services=AddText 'Gerenciar componentes' 20 153 350 30
    $services.Font=[Drawing.Font]::new('Segoe UI',13,[Drawing.FontStyle]::Bold)
    $notice=AddText 'Reinicializações exigem confirmação. Serviços externos não são encerrados por PID.' 20 187 352 40
    $notice.ForeColor=[Drawing.Color]::DimGray
    $controls=@{}
    foreach($kind in @('Ollama','DevSpace')) {
        $button=[Windows.Forms.Button]::new()
        $button.Location=[Drawing.Point]::new($(if($kind -eq 'Ollama'){20}else{202}),240)
        $button.Size=[Drawing.Size]::new(170,43)
        $button.Tag=$kind
        $snapshot=if($SnapshotProvider){& $SnapshotProvider}else{$null}
        $action=Get-LaoSettingsComponentAction $kind $snapshot
        $button.Enabled=$null -ne $action
        $button.Text=$(if($action){$(if([string]$action.Operation -eq 'Restart'){'Reiniciar '}else{'Iniciar '})+$kind}else{$kind})
        $button.FlatStyle=[Windows.Forms.FlatStyle]::Flat
        $button.FlatAppearance.BorderColor=[Drawing.ColorTranslator]::FromHtml('#CBD5E1')
        if ($Assets -and $Assets['reiniciar']) {
            $button.Image=[Drawing.Bitmap]::new($Assets['reiniciar'],[Drawing.Size]::new(24,24))
            $button.ImageAlign=[Drawing.ContentAlignment]::MiddleLeft
            $button.TextImageRelation=[Windows.Forms.TextImageRelation]::ImageBeforeText
        }
        $button.AccessibleDescription=$(if($button.Enabled){
            'Iniciar ou reiniciar somente este componente, mediante confirmação'
        }else{'Sem ação segura disponível neste momento'})
        $button.Tag=[pscustomobject]@{Kind=$kind;SnapshotProvider=$SnapshotProvider}
        $button.Add_Click({
            $target=[string]$this.Tag.Kind
            $snapshot=if($this.Tag.SnapshotProvider){& $this.Tag.SnapshotProvider}else{$null}
            $this.Enabled=$false
            try {
                [void](Invoke-LaoSettingsComponentAction $target $snapshot)
            } finally {
                $next=if($this.Tag.SnapshotProvider){& $this.Tag.SnapshotProvider}else{$null}
                $this.Enabled=$null -ne (Get-LaoSettingsComponentAction $target $next)
            }
        })
        $form.Controls.Add($button)
        $controls[$kind]=$button
        $status=AddText $(if($action){$(if($action.Operation -eq 'Restart'){'Ativo: reinício disponível'}else{'Parado: clique para iniciar'})}else{'Sem ação segura disponível'}) `
            $(if($kind -eq 'Ollama'){20}else{202}) 288 170 29
        $button.Tag | Add-Member -NotePropertyName StatusLabel -NotePropertyValue $status
        $status.ForeColor=$(if($button.Enabled){
            [Drawing.ColorTranslator]::FromHtml('#12794A')
        }else{[Drawing.Color]::DimGray})
    }
    $foot=AddText 'Inicialização apenas na conta atual; DevSpace/Ollama independentes.' 20 332 353 34
    $foot.ForeColor=[Drawing.Color]::DimGray
    $refresh=[Windows.Forms.Timer]::new()
    $refresh.Interval=750
    $refresh.Tag=[pscustomobject]@{Controls=$controls;Provider=$SnapshotProvider}
    $refresh.Add_Tick({
        $snapshot=if($this.Tag.Provider){& $this.Tag.Provider}else{$null}
        foreach($kind in @('Ollama','DevSpace')) {
            $button=$this.Tag.Controls[$kind]
            $starting=$script:localStarts.ContainsKey($kind)
            $action=Get-LaoSettingsComponentAction $kind $snapshot
            $button.Enabled=-not $starting -and $null -ne $action
            $button.Text=$(if($starting){'Iniciando…'}elseif($action -and $action.Operation -eq 'Restart'){'Reiniciar '+$kind}elseif($action){'Iniciar '+$kind}else{$kind})
            $button.Tag.StatusLabel.Text=$(if($starting){'Aguardando resposta'}elseif($snapshot -and $snapshot.tasksAuthenticated -and $snapshot.activeTasks -gt 0){'Tarefa ativa: reinício bloqueado'}elseif($action -and $action.Operation -eq 'Restart'){'Ativo: reinício disponível'}elseif($action){'Parado: clique para iniciar'}elseif(-not $snapshot -or -not $snapshot.statusAuthenticated -or ($kind -eq 'DevSpace' -and @($snapshot.reasons) -contains 'devspace_unverified')){'Conexão não verificada'}else{'Sem ação segura disponível'})
        }
    })
    $form.Tag=$refresh
    $refresh.Start()
    $form.Add_FormClosed({
        $this.Tag.Stop(); $this.Tag.Dispose()

        foreach($button in $this.Controls) {
            if($button -is [Windows.Forms.Button] -and $button.Image) { $button.Image.Dispose() }
        }
    })
    return @{Form=$form;Switch=$toggle;Services=$controls}
}
