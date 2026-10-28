# Ancillary settings dialog, separate from the visually approved 420 DIP popup.
# Restart dependencies only by an explicitly configured Windows SCM identity.
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

function Invoke-LaoDependencyRecovery([string]$Kind,$Snapshot) {
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
    $fresh=Get-LaoDependencyRecoveryAction $Kind $Snapshot
    if (-not $fresh -or $fresh.ServiceName -cne $candidate.ServiceName -or
        $fresh.Operation -ne $candidate.Operation) {
        return $false
    }
    try {
        if ($fresh.Operation -eq 'Start') {
            Start-Service -Name $fresh.ServiceName -ErrorAction Stop
        } else {
            Restart-Service -Name $fresh.ServiceName -ErrorAction Stop
        }
        return $true
    } catch {
        [Windows.Forms.MessageBox]::Show(
            'O Windows recusou a ação: '+$_.Exception.Message,
            'LAO DevSpace') | Out-Null
        return $false
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
    $services=AddText 'Reiniciar serviços gerenciados' 20 153 350 30
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
        $recovery=Get-LaoDependencyRecoveryAction $kind $snapshot
        $button.Enabled=$null -ne $recovery
        $button.Text=$kind
        $button.FlatStyle=[Windows.Forms.FlatStyle]::Flat
        $button.FlatAppearance.BorderColor=[Drawing.ColorTranslator]::FromHtml('#CBD5E1')
        if ($Assets -and $Assets['reiniciar']) {
            $button.Image=[Drawing.Bitmap]::new($Assets['reiniciar'],[Drawing.Size]::new(24,24))
            $button.ImageAlign=[Drawing.ContentAlignment]::MiddleLeft
            $button.TextImageRelation=[Windows.Forms.TextImageRelation]::ImageBeforeText
        }
        $button.AccessibleDescription=$(if($button.Enabled){
            'Recuperar somente a dependência com falha, mediante confirmação'
        }else{'Sem ação: dependência saudável, não verificada ou não gerenciada'})
        $button.Tag=[pscustomobject]@{Kind=$kind;SnapshotProvider=$SnapshotProvider}
        $button.Add_Click({
            $target=[string]$this.Tag.Kind
            $snapshot=if($this.Tag.SnapshotProvider){& $this.Tag.SnapshotProvider}else{$null}
            if (-not (Get-LaoDependencyRecoveryAction $target $snapshot)) { return }
            $this.Enabled=$false
            try {
                [void](Invoke-LaoDependencyRecovery $target $snapshot)
            } finally {
                $next=if($this.Tag.SnapshotProvider){& $this.Tag.SnapshotProvider}else{$null}
                $this.Enabled=$null -ne (Get-LaoDependencyRecoveryAction $target $next)
            }
        })
        $form.Controls.Add($button)
        $controls[$kind]=$button
        $status=AddText $(if($button.Enabled){'Falha: recuperação possível'}else{'Sem ação disponível'}) `
            $(if($kind -eq 'Ollama'){20}else{202}) 288 170 29
        $status.ForeColor=$(if($button.Enabled){
            [Drawing.ColorTranslator]::FromHtml('#12794A')
        }else{[Drawing.Color]::DimGray})
    }
    $foot=AddText 'Inicialização apenas na conta atual; DevSpace/Ollama independentes.' 20 332 353 34
    $foot.ForeColor=[Drawing.Color]::DimGray
    $form.Add_FormClosed({
        foreach($button in $this.Controls) {
            if($button -is [Windows.Forms.Button] -and $button.Image) { $button.Image.Dispose() }
        }
    })
    return @{Form=$form;Switch=$toggle;Services=$controls}
}
