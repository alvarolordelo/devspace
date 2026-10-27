# LAO approved native tray popup (Segoe UI, 420 DIP, independent of service).
# All actions are read-only local navigation. Never install or restart a service.
function Set-LaoRoundedControlRegion($control,[int]$radius) {
    $w=$control.ClientSize.Width; $h=$control.ClientSize.Height
    if($w -lt $radius -or $h -lt $radius){return}
    $path=[Drawing.Drawing2D.GraphicsPath]::new()
    try {
        $path.AddArc(0,0,$radius,$radius,180,90)
        $path.AddArc($w-$radius,0,$radius,$radius,270,90)
        $path.AddArc($w-$radius,$h-$radius,$radius,$radius,0,90)
        $path.AddArc(0,$h-$radius,$radius,$radius,90,90)
        $path.CloseFigure()
        $old=$control.Region; $control.Region=[Drawing.Region]::new($path)
        if($old){$old.Dispose()}
    } finally {$path.Dispose()}
}
function New-LaoPopup {
    param([string]$LogoPath)
    $form = [Windows.Forms.Form]::new()
    $form.Text = 'LAO DevSpace - Monitor'
    $form.FormBorderStyle = [Windows.Forms.FormBorderStyle]::None
    $form.ShowInTaskbar = $false
    $form.StartPosition = [Windows.Forms.FormStartPosition]::Manual
    $form.AutoScaleMode = [Windows.Forms.AutoScaleMode]::Dpi
    $form.BackColor = [Drawing.Color]::White
    $form.TopMost = $true
    $form.ClientSize = [Drawing.Size]::new(420,790)
    $form.KeyPreview = $true
    $colors = @{
        text = [Drawing.ColorTranslator]::FromHtml('#111827')
        muted = [Drawing.ColorTranslator]::FromHtml('#667085')
        line = [Drawing.ColorTranslator]::FromHtml('#E2E8F0')
        green = [Drawing.ColorTranslator]::FromHtml('#16A34A')
        red = [Drawing.ColorTranslator]::FromHtml('#EF3339')
        yellow = [Drawing.ColorTranslator]::FromHtml('#F4B400')
        gray = [Drawing.ColorTranslator]::FromHtml('#94A3B8')
    }
    function LaoLabel([string]$text, [int]$x, [int]$y, [int]$w, [int]$h,
                      [float]$size, [bool]$bold) {
        $l = [Windows.Forms.Label]::new()
        $l.Text = $text
        $l.Location = [Drawing.Point]::new($x,$y)
        $l.Size = [Drawing.Size]::new($w,$h)
        $style = if($bold){[Drawing.FontStyle]::Bold}else{[Drawing.FontStyle]::Regular}
        $l.Font = [Drawing.Font]::new('Segoe UI',$size,$style)
        $l.ForeColor = $colors.text
        $l.AutoEllipsis = $true
        return $l
    }
    function LaoLine($parent, [int]$top) {
        $line = [Windows.Forms.Panel]::new()
        $line.Location = [Drawing.Point]::new(19,$top)
        $line.Size = [Drawing.Size]::new(376,1)
        $line.BackColor = $colors.line
        $parent.Controls.Add($line)
    }
    $scroll = [Windows.Forms.Panel]::new()
    $scroll.Location = [Drawing.Point]::new(0,84)
    $scroll.Size = [Drawing.Size]::new(420,706)
    $scroll.Anchor = [Windows.Forms.AnchorStyles]::Top -bor [Windows.Forms.AnchorStyles]::Bottom -bor
        [Windows.Forms.AnchorStyles]::Left -bor [Windows.Forms.AnchorStyles]::Right
    $scroll.AutoScroll = $true
    $scroll.BackColor = [Drawing.Color]::White
    $form.Controls.Add($scroll)
    $header = [Windows.Forms.Panel]::new()
    $header.Location = [Drawing.Point]::new(0,0)
    $header.Size = [Drawing.Size]::new(420,84)
    $header.Anchor = [Windows.Forms.AnchorStyles]::Top -bor [Windows.Forms.AnchorStyles]::Left -bor
        [Windows.Forms.AnchorStyles]::Right
    $header.BackColor = [Drawing.Color]::White
    $form.Controls.Add($header)
    $header.BringToFront()
    $logo = [Windows.Forms.PictureBox]::new()
    $logo.Image = [Drawing.Image]::FromFile($LogoPath)
    $logo.SizeMode = [Windows.Forms.PictureBoxSizeMode]::Zoom
    $logo.Location = [Drawing.Point]::new(18,12)
    $logo.Size = [Drawing.Size]::new(56,56)
    $header.Controls.Add($logo)
    $brand = LaoLabel 'LAO DevSpace' 87 12 262 32 18 $true
    $header.Controls.Add($brand)
    $dot = LaoLabel '●' 87 45 20 24 12 $true
    $dot.ForeColor = $colors.gray
    $header.Controls.Add($dot)
    $heading = LaoLabel 'Aguardando sinal' 109 46 245 24 11 $false
    $heading.ForeColor = $colors.gray
    $header.Controls.Add($heading)
    $settings = [Windows.Forms.Button]::new()
    $settings.Text = '⚙'
    $settings.AccessibleName = 'Configurações'
    $settings.FlatStyle = [Windows.Forms.FlatStyle]::Flat
    $settings.FlatAppearance.BorderSize = 0
    $settings.ForeColor = $colors.muted
    $settings.BackColor = [Drawing.Color]::White
    $settings.Font = [Drawing.Font]::new('Segoe UI Symbol',18)
    $settings.Location = [Drawing.Point]::new(363,19)
    $settings.Size = [Drawing.Size]::new(43,39)
    $header.Controls.Add($settings)
    LaoLine $header 82
    $rows = @{}
    $fields = @(
       @('service','LAO Service'),@('mcp','DevSpace MCP'),@('ollama','Ollama'),
       @('model','Modelo padrão'),@('gpu','GPU'),@('vram','VRAM'),
       @('queue','Fila'),@('last','Última execução')
    )
    $y=3
    foreach($entry in $fields) {
        $key=[string]$entry[0]
        $symbol=LaoLabel '●' 23 ($y+8) 25 30 12.5 $true
        $symbol.ForeColor=$colors.gray
        $label=LaoLabel ([string]$entry[1]) 64 ($y+10) 158 25 11.3 $false
        $value=LaoLabel '—' 225 ($y+10) 166 25 10.4 $false
        $value.ForeColor=$colors.muted
        $value.TextAlign=[Drawing.ContentAlignment]::MiddleRight
        $scroll.Controls.AddRange([Windows.Forms.Control[]]@($symbol,$label,$value))
        LaoLine $scroll ($y+42)
        $rows[$key]=@{Dot=$symbol;Value=$value;Title=$label}
        $y+=44
    }
    $card=[Windows.Forms.Panel]::new()
    $card.Location=[Drawing.Point]::new(19,$y+12)
    $card.Size=[Drawing.Size]::new(376,142)
    $card.BackColor=[Drawing.ColorTranslator]::FromHtml('#F8FAFC')
    $scroll.Controls.Add($card)
    Set-LaoRoundedControlRegion $card 16
    $card.Add_SizeChanged({Set-LaoRoundedControlRegion $this 16})
    $iconBox=[Windows.Forms.Panel]::new()
    $iconBox.Location=[Drawing.Point]::new(15,32)
    $iconBox.Size=[Drawing.Size]::new(48,48)
    $iconBox.BackColor=[Drawing.ColorTranslator]::FromHtml('#E9F8EE')
    $card.Controls.Add($iconBox)
    Set-LaoRoundedControlRegion $iconBox 12
    $cardIcon=LaoLabel '▤' 9 4 32 40 21 $true
    $cardIcon.ForeColor=$colors.green
    $cardIcon.TextAlign=[Drawing.ContentAlignment]::MiddleCenter
    $iconBox.Controls.Add($cardIcon)
    $cardCaption=LaoLabel 'Situação atual' 77 18 280 22 10 $false
    $cardCaption.ForeColor=$colors.muted
    $card.Controls.Add($cardCaption)
    $cardTitle=LaoLabel 'Verificando o LAO' 77 46 280 29 11.5 $true
    $card.Controls.Add($cardTitle)
    $cardDetails=LaoLabel 'Aguardando dados locais' 77 82 280 50 10 $false
    $cardDetails.ForeColor=$colors.muted
    $card.Controls.Add($cardDetails)
    $actions=@{}
    $items=@(@('dashboard','↗  Abrir painel'),
             @('context','▤  Ver revisão'),
             @('logs','☷  Ver logs'),
             @('settings','⚙  Configurações'))
    $pos=$y+163
    foreach($item in $items) {
        $button=[Windows.Forms.Button]::new()
        $button.Text=[string]$item[1]
        $button.AccessibleName=[string]$item[1]
        $button.FlatStyle=[Windows.Forms.FlatStyle]::Flat
        $button.FlatAppearance.BorderSize=0
        $button.TextAlign=[Drawing.ContentAlignment]::MiddleLeft
        $button.Font=[Drawing.Font]::new('Segoe UI',11)
        $button.BackColor=[Drawing.Color]::White
        $button.ForeColor=$colors.text
        $button.Location=[Drawing.Point]::new(18,$pos)
        $button.Size=[Drawing.Size]::new(379,38)
        $scroll.Controls.Add($button)
        $button.Add_Paint({
            $font=[Drawing.Font]::new('Segoe UI',13)
            try {
                [Windows.Forms.TextRenderer]::DrawText($_.Graphics,'›',$font,
                    [Drawing.Rectangle]::new($this.Width-32,0,26,$this.Height),
                    [Drawing.ColorTranslator]::FromHtml('#667085'),
                    [Windows.Forms.TextFormatFlags]::VerticalCenter)
            } finally {$font.Dispose()}
        })
        LaoLine $scroll ($pos+39)
        $actions[[string]$item[0]]=$button
        $pos+=41
    }
    $freshness=LaoLabel 'Aguardando coleta · — = não verificado' 20 $pos 365 14 8 $false
    $freshness.ForeColor=$colors.muted
    $scroll.Controls.Add($freshness)
    $form.Add_KeyDown({if($_.KeyCode -eq [Windows.Forms.Keys]::Escape){$this.Hide();$_.Handled=$true}})
    $form.Add_Deactivate({$this.Hide()})
    $form.Add_SizeChanged({ Set-LaoPopupShape $this })
    Set-LaoPopupShape $form
    return @{Form=$form;Logo=$logo;Brand=$brand;HeaderDot=$dot;HeaderText=$heading;
      Rows=$rows;Colors=$colors;Card=$card;CardIcon=$cardIcon;
      CardCaption=$cardCaption;CardTitle=$cardTitle;CardDetails=$cardDetails;
      Actions=$actions;Settings=$settings;IconBox=$iconBox;Freshness=$freshness}
}

function Set-LaoPopupRow($popup,[string]$name,[string]$text,[string]$kind) {
    $row=$popup.Rows[$name]
    if(!$row){return}
    $row.Value.Text=$text
    $color=switch($kind){
        good {$popup.Colors.green}
        bad {$popup.Colors.red}
        review {$popup.Colors.yellow}
        default {$popup.Colors.gray}
    }
    $row.Dot.ForeColor=$color
    $row.Value.ForeColor=if($kind -in @('bad','review')){$color}else{$popup.Colors.text}
}

function Update-LaoPopup($popup,$snapshot) {
    if(!$popup -or !$snapshot){return}
    $state=[string]$snapshot.status
    $color=switch($state){
        active {$popup.Colors.green}
        review {$popup.Colors.yellow}
        offline {$popup.Colors.red}
        default {$popup.Colors.gray}
    }
    $popup.HeaderDot.ForeColor=$color
    $popup.HeaderText.Text=switch($state){
        active {'Ativo'}
        review {'Aguardando revisão'}
        offline {'Serviço indisponível'}
        default {'Atenção · parcialmente disponível'}
    }
    $popup.HeaderText.ForeColor=$color
    $live=$state -ne 'offline'
    Set-LaoPopupRow $popup service $(if($live){'Respondendo'}else{'Sem resposta'}) $(if($live){'good'}else{'bad'})
    $observed=[DateTimeOffset]::MinValue
    if([DateTimeOffset]::TryParse([string]$snapshot.checkedAt,[ref]$observed)){
        $popup.Freshness.Text='Última verificação: '+$observed.ToLocalTime().ToString('HH:mm:ss')+' · — = indisponível'
    }else{
        $popup.Freshness.Text='Sem coleta confirmada · — = indisponível'
    }
    $reasons=@($snapshot.reasons)
    if(!$snapshot.statusAuthenticated){
        Set-LaoPopupRow $popup mcp 'Não verificado' unknown
        Set-LaoPopupRow $popup ollama 'Não verificado' unknown
    }else{
        $mcpNotReady=$reasons -contains 'devspace_unverified'
        Set-LaoPopupRow $popup mcp $(if($mcpNotReady){'Não verificado'}else{'Conectado'}) $(if($mcpNotReady){'unknown'}else{'good'})
        $ollamaDown=$reasons -contains 'ollama_unavailable'
        Set-LaoPopupRow $popup ollama $(if($ollamaDown){'Offline'}else{'Respondendo'}) $(if($ollamaDown){'bad'}else{'good'})
    }
    Set-LaoPopupRow $popup model $(if($snapshot.modelConfigured){[string]$snapshot.modelConfigured}else{'—'}) unknown
    Set-LaoPopupRow $popup gpu $(if($null -ne $snapshot.gpuPercent){"$($snapshot.gpuPercent)%"}else{'—'}) unknown
    Set-LaoPopupRow $popup vram $(if($null -ne $snapshot.vramUsedMiB -and $null -ne $snapshot.vramTotalMiB){
        "$($snapshot.vramUsedMiB) / $($snapshot.vramTotalMiB) MiB"
    }else{'—'}) unknown
    Set-LaoPopupRow $popup queue $(if($snapshot.tasksAuthenticated){"$($snapshot.activeTasks) em execução"}else{'Não verificada'}) unknown
    if($null -ne $snapshot.pendingReviews -and $snapshot.pendingReviews -gt 0){
        $popup.Actions.context.Enabled=$true
        $popup.Actions.context.Text='▤  Ver revisão'
        $popup.Rows.last.Title.Text='Pendências'
        Set-LaoPopupRow $popup last "$($snapshot.pendingReviews) revisão(ões)" review
        $popup.CardIcon.ForeColor=$popup.Colors.yellow
        $popup.IconBox.BackColor=[Drawing.ColorTranslator]::FromHtml('#FFF3D2')
        $popup.CardCaption.Text='Ação necessária'
        $popup.CardTitle.Text='Aguardando revisão'
        $popup.CardDetails.Text="Há $($snapshot.pendingReviews) tarefa(s) aguardando aprovação."
        $popup.Card.BackColor=[Drawing.ColorTranslator]::FromHtml('#FFF8E7')
    }elseif($null -ne $snapshot.activeTasks -and $snapshot.activeTasks -gt 0){
        $popup.Actions.context.Enabled=$false
        $popup.Actions.context.Text='↻  Reiniciar LAO (tarefa ativa)'
        $popup.Rows.last.Title.Text='Última execução'
        Set-LaoPopupRow $popup last 'Execução em andamento' good
        $popup.CardIcon.ForeColor=$popup.Colors.green
        $popup.IconBox.BackColor=[Drawing.ColorTranslator]::FromHtml('#E9F8EE')
        $popup.CardCaption.Text='Tarefa atual'
        $popup.CardTitle.Text='Execução local em andamento'
        $popup.CardDetails.Text=$(if($snapshot.lastTaskModel){"Executor: $($snapshot.lastTaskModel)"}else{'Acompanhe os detalhes no painel.'})
        $popup.Card.BackColor=[Drawing.ColorTranslator]::FromHtml('#F3FAF5')
    }else{
        $canRestart=$live -and $snapshot.statusAuthenticated -and ($snapshot.restartAvailable -eq $true)
        $popup.Actions.context.Enabled=$canRestart
        $popup.Actions.context.Text=$(if($canRestart){
            '↻  Reiniciar LAO'
        }elseif($live){
            '↻  Reiniciar serviço (não instalado)'
        }else{'▷  Iniciar serviço (não instalado)'})
        $popup.Rows.last.Title.Text='Última execução'
        Set-LaoPopupRow $popup last '—' unknown
        $popup.CardIcon.ForeColor=$(if($live){$popup.Colors.green}else{$popup.Colors.red})
        $popup.IconBox.BackColor=$(if($live){
            [Drawing.ColorTranslator]::FromHtml('#E9F8EE')
        }else{[Drawing.ColorTranslator]::FromHtml('#FFE6E8')})
        $popup.CardCaption.Text='Situação atual'
        $popup.CardTitle.Text=$(if($live){'Monitor em funcionamento'}else{'Orquestrador indisponível'})
        $popup.CardDetails.Text=$(if($live){'Nenhuma tarefa ativa confirmada.'}else{'O daemon não está respondendo.'})
        $popup.Card.BackColor=$(if($live){[Drawing.ColorTranslator]::FromHtml('#F8FAFC')}else{[Drawing.ColorTranslator]::FromHtml('#FFF0F0')})
    }
}

function Set-LaoPopupShape($form) {
    if(!$form -or $form.ClientSize.Width -lt 50 -or $form.ClientSize.Height -lt 50) {return}
    $w=$form.ClientSize.Width;$h=$form.ClientSize.Height;$d=32
    $p=[Drawing.Drawing2D.GraphicsPath]::new()
    try{
        $p.AddArc(0,0,$d,$d,180,90)
        $p.AddArc($w-$d,0,$d,$d,270,90)
        $p.AddArc($w-$d,$h-$d,$d,$d,0,90)
        $p.AddArc(0,$h-$d,$d,$d,90,90)
        $p.CloseFigure()
        $old=$form.Region
        $form.Region=[Drawing.Region]::new($p)
        if($old){$old.Dispose()}
    }finally{$p.Dispose()}
}

function Resize-LaoPopupContents($popup,[int]$width) {
    $popup.Brand.Width=[Math]::Max(142,$width-160)
    $popup.HeaderText.Width=[Math]::Max(100,$width-174)
    $popup.Settings.Left=$width-56
    foreach($row in $popup.Rows.Values){
        $row.Value.Left=[Math]::Max(207,$width-196)
        $row.Value.Width=[Math]::Max(103,$width-$row.Value.Left-22)
        $row.Title.Width=[Math]::Min(158,[Math]::Max(118,$row.Value.Left-$row.Title.Left-8))
    }
    $popup.Card.Width=$width-44
    $popup.CardCaption.Width=[Math]::Max(170,$popup.Card.Width-91)
    $popup.CardTitle.Width=[Math]::Max(170,$popup.Card.Width-91)
    $popup.CardDetails.Width=[Math]::Max(170,$popup.Card.Width-91)
    $popup.Freshness.Width=$width-42
    foreach($button in $popup.Actions.Values){$button.Width=$width-42}
    foreach($child in $popup.Form.Controls){
        foreach($c in $child.Controls){
            if($c -is [Windows.Forms.Panel] -and $c.Height -eq 1 -and
               $c.Left -eq 19){$c.Width=$width-44}
        }
    }
}

function Toggle-LaoPopup($popup) {
    if($popup.Form.Visible){$popup.Form.Hide();return}
    $cursor=[Windows.Forms.Cursor]::Position
    $area=[Windows.Forms.Screen]::FromPoint($cursor).WorkingArea
    $width=[Math]::Min(420,[Math]::Max(340,$area.Width-16))
    $height=[Math]::Min(790,[Math]::Max(280,$area.Height-16))
    $popup.Form.ClientSize=[Drawing.Size]::new($width,$height)
    Resize-LaoPopupContents $popup $width
    $x=[Math]::Max($area.Left+8,[Math]::Min($cursor.X-$width+30,$area.Right-$width-8))
    $y=if($cursor.Y -lt ($area.Top+$area.Height/2)){$area.Top+8}else{$area.Bottom-$height-8}
    $popup.Form.Location=[Drawing.Point]::new([int]$x,[int]$y)
    $popup.Form.Show()
    $popup.Form.Activate()
}
