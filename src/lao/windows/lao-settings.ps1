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

function New-LaoSettingsForm {
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
    $toggle.Location=[Drawing.Point]::new(260,91)
    $toggle.Size=[Drawing.Size]::new(112,38)
    $toggle.TextAlign=[Drawing.ContentAlignment]::MiddleCenter
    $toggle.AccessibleName='Iniciar LAO e Monitor com Windows'
    $toggle.Checked=[bool](Get-LaoTrayAutostart)
    $form.Controls.Add($toggle)
    $toggle.Add_CheckedChanged({
        try {
            Set-LaoTrayAutostart ([bool]$this.Checked)
            $this.Text=$(if($this.Checked){'● LIGADO'}else{'○ DESLIGADO'})
            $this.BackColor=$(if($this.Checked){
                [Drawing.ColorTranslator]::FromHtml('#DFF6E8')
            }else{[Drawing.ColorTranslator]::FromHtml('#EDF2F7')})
        } catch {
            $this.Checked=Get-LaoTrayAutostart
            [Windows.Forms.MessageBox]::Show($_.Exception.Message,'LAO DevSpace') | Out-Null
        }
    })
    $toggle.Text=$(if($toggle.Checked){'● LIGADO'}else{'○ DESLIGADO'})
    $toggle.BackColor=$(if($toggle.Checked){
        [Drawing.ColorTranslator]::FromHtml('#DFF6E8')
    }else{[Drawing.ColorTranslator]::FromHtml('#EDF2F7')})
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
        $service=Get-LaoManagedService $kind
        $button.Enabled=($null -ne $service -and $service.Status -eq 'Running')
        $button.Text='↻ '+$kind
        $button.AccessibleDescription=$(if($button.Enabled){
            'Reiniciar serviço Windows gerenciado com confirmação'
        }else{'Indisponível: serviço Windows não gerenciado ou parado'})
        $button.Add_Click({
            $kind=[string]$this.Tag
            $service=Get-LaoManagedService $kind
            if (!$service -or $service.Status -ne 'Running') { return }
            $confirmed=[Windows.Forms.MessageBox]::Show(
                'Reiniciar o serviço Windows '+$kind+' ('+$service.Name+')? Tarefas e conexões externas poderão ser interrompidas.',
                'Confirmar reinício do '+$kind,
                [Windows.Forms.MessageBoxButtons]::YesNo,
                [Windows.Forms.MessageBoxIcon]::Warning)
            if ($confirmed -ne [Windows.Forms.DialogResult]::Yes) { return }
            $this.Enabled=$false
            try {
                Restart-Service -Name $service.Name -ErrorAction Stop
                [Windows.Forms.MessageBox]::Show('Reinício de '+$kind+' solicitado ao Windows.','LAO DevSpace') | Out-Null
            } catch {
                [Windows.Forms.MessageBox]::Show('Reinício recusado: '+$_.Exception.Message,'LAO DevSpace') | Out-Null
            } finally {
                $this.Enabled=[bool]((Get-LaoManagedService $kind).Status -eq 'Running')
            }
        })
        $form.Controls.Add($button)
        $controls[$kind]=$button
        $status=AddText $(if($button.Enabled){'Serviço Windows ativo'}else{'Não gerenciado neste PC'}) `
            $(if($kind -eq 'Ollama'){20}else{202}) 288 170 29
        $status.ForeColor=$(if($button.Enabled){
            [Drawing.ColorTranslator]::FromHtml('#12794A')
        }else{[Drawing.Color]::DimGray})
    }
    $foot=AddText 'Inicialização apenas na conta atual; DevSpace/Ollama independentes.' 20 332 353 34
    $foot.ForeColor=[Drawing.Color]::DimGray
    return @{Form=$form;Switch=$toggle;Services=$controls}
}
