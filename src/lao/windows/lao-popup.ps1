# LAO approved native tray popup (Segoe UI, 420 DIP, independent of service).
# Local navigation plus confirmed LAO-only restart. Never install a Windows service.
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
    # Use vector-origin PNG assets, never font glyphs or improvised drawings.
    $assetDir = [IO.Path]::GetDirectoryName($LogoPath)
    $assets = @{}
    foreach($name in @('abrir-painel','logs','reiniciar','iniciar','configuracoes','revisao',
                       'chevron-direita','documento-verde','documento-amarelo',
                       'documento-vermelho')) {
        $assetPath=Join-Path $assetDir ("lao-action-" + $name + "-64.png")
        if(-not [IO.File]::Exists($assetPath)){
            throw "LAO approved icon missing: $name. Run scripts/build-lao-action-icons.ps1"
        }
        # Clone into managed memory so the GUI does not lock the asset on disk.
        # Assets can then be rebuilt without closing DevSpace or the daemon.
        $stream=[IO.MemoryStream]::new([IO.File]::ReadAllBytes($assetPath),$false)
        try {
            $sourceImage=[Drawing.Image]::FromStream($stream)
            try { $assets[$name]=[Drawing.Bitmap]::new($sourceImage) }
            finally { $sourceImage.Dispose() }
        } finally { $stream.Dispose() }
    }
    $form = [Windows.Forms.Form]::new()
    $form.Text = 'LAO DevSpace - Monitor'
    $form.FormBorderStyle = [Windows.Forms.FormBorderStyle]::None
    $form.ShowInTaskbar = $false
    $form.StartPosition = [Windows.Forms.FormStartPosition]::Manual
    $form.AutoScaleMode = [Windows.Forms.AutoScaleMode]::Dpi
    $form.BackColor = [Drawing.Color]::White
    $form.TopMost = $true
    $form.ClientSize = [Drawing.Size]::new(420,768)
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
    $scroll.Location = [Drawing.Point]::new(0,96)
    $scroll.Size = [Drawing.Size]::new(420,672)
    $scroll.Anchor = [Windows.Forms.AnchorStyles]::Top -bor [Windows.Forms.AnchorStyles]::Bottom -bor
        [Windows.Forms.AnchorStyles]::Left -bor [Windows.Forms.AnchorStyles]::Right
    $scroll.AutoScroll = $true
    $scroll.BackColor = [Drawing.Color]::White
    $form.Controls.Add($scroll)
    $header = [Windows.Forms.Panel]::new()
    $header.Location = [Drawing.Point]::new(0,0)
    $header.Size = [Drawing.Size]::new(420,96)
    $header.Anchor = [Windows.Forms.AnchorStyles]::Top -bor [Windows.Forms.AnchorStyles]::Left -bor
        [Windows.Forms.AnchorStyles]::Right
    $header.BackColor = [Drawing.Color]::White
    $form.Controls.Add($header)
    $header.BringToFront()
    $logo = [Windows.Forms.PictureBox]::new()
    $logo.Image = [Drawing.Image]::FromFile($LogoPath)
    $logo.SizeMode = [Windows.Forms.PictureBoxSizeMode]::Zoom
    $logo.Location = [Drawing.Point]::new(26,20)
    $logo.Size = [Drawing.Size]::new(56,56)
    $header.Controls.Add($logo)
    $brand = LaoLabel 'LAO DevSpace' 105 19 260 34 19 $true
    $header.Controls.Add($brand)
    $dot = LaoLabel '●' 104 55 23 25 14 $true
    $dot.Add_Paint({
        $brush=[Drawing.SolidBrush]::new($this.ForeColor)
        try {
            $_.Graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $_.Graphics.FillEllipse($brush,2,5,17,17)
        } finally {$brush.Dispose()}
    })
    $dot.ForeColor = $colors.gray
    $header.Controls.Add($dot)
    $heading = LaoLabel (Get-LaoUiText 'WaitingSignal') 133 55 218 27 13 $false
    $heading.ForeColor = $colors.gray
    $header.Controls.Add($heading)
    $startAll = [Windows.Forms.Button]::new()
    $startAll.Text = ''
    $startAll.AccessibleName = Get-LaoUiText 'StartAll'
    $startAll.AccessibleDescription = Get-LaoUiText 'StartAllDesc'
    $startAll.Tag=$assets['iniciar']
    $startAll.FlatStyle = [Windows.Forms.FlatStyle]::Flat
    $startAll.FlatAppearance.BorderSize = 0
    $startAll.ForeColor = $colors.muted
    $startAll.BackColor = [Drawing.Color]::White
    $startAll.Location = [Drawing.Point]::new(365,28)
    $startAll.Size = [Drawing.Size]::new(42,42)
    $startAll.Cursor=[Windows.Forms.Cursors]::Hand
    $startAll.Add_Paint({
        $_.Graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $_.Graphics.DrawImage($this.Tag,[Drawing.Rectangle]::new(7,7,28,28))
    })
    $header.Controls.Add($startAll)
    LaoLine $header 95
    $rows = @{}
    $fields = @(
       @('service','LAO Service'),@('mcp','DevSpace MCP'),@('ollama','Ollama'),
       @('model',(Get-LaoUiText 'DefaultModel')),@('gpu','GPU'),@('vram','VRAM'),
       @('queue',(Get-LaoUiText 'Queue')),@('last',(Get-LaoUiText 'LastRun'))
    )
    $y=1
    foreach($entry in $fields) {
        $key=[string]$entry[0]
        $symbol=LaoLabel '●' 32 ($y+7) 25 27 13.5 $true
        $symbol.Add_Paint({
            $brush=[Drawing.SolidBrush]::new($this.ForeColor)
            try {
                $_.Graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $_.Graphics.FillEllipse($brush,3,6,15,15)
            } finally {$brush.Dispose()}
        })
        $symbol.ForeColor=$colors.gray
        $label=LaoLabel ([string]$entry[1]) 70 ($y+6) 164 31 13.3 $false
        $value=LaoLabel '—' 230 ($y+6) 160 31 12.4 $false
        $value.ForeColor=$colors.muted
        $value.TextAlign=[Drawing.ContentAlignment]::MiddleRight
        $scroll.Controls.AddRange([Windows.Forms.Control[]]@($symbol,$label,$value))
        LaoLine $scroll ($y+39)
        $arrow=$null
        if ($key -in @('service','mcp','ollama')) {
            $arrow=[Windows.Forms.Button]::new()
            $arrow.Size=[Drawing.Size]::new(28,32)
            $arrow.Location=[Drawing.Point]::new(371,$y+4)
            $arrow.FlatStyle=[Windows.Forms.FlatStyle]::Flat
            $arrow.FlatAppearance.BorderSize=0
            $arrow.BackColor=[Drawing.Color]::White
            $arrow.Image=[Drawing.Bitmap]::new($assets['chevron-direita'],[Drawing.Size]::new(16,16))
            $arrow.AccessibleName='Iniciar '+[string]$entry[1]
            $arrow.Cursor=[Windows.Forms.Cursors]::Hand
            $arrow.Visible=$false
            $scroll.Controls.Add($arrow)
        }
        $rows[$key]=@{Dot=$symbol;Value=$value;Title=$label;Start=$arrow}
        $y+=40
    }
    # Normally hidden: selecting the approved model row opens a real WinForms
    # dropdown. It never displays a hardcoded/example inventory.
    $modelCombo=[Windows.Forms.ComboBox]::new()
    $modelCombo.DropDownStyle=[Windows.Forms.ComboBoxStyle]::DropDownList
    $modelCombo.Font=[Drawing.Font]::new('Segoe UI',11)
    # Overlay only the value of the "Modelo padrão" row, never "Ollama".
    # Derive coordinates from the row itself so DPI/layout changes cannot
    # accidentally move the combo one line above the approved position.
    $modelCombo.Location=$rows.model.Value.Location
    $modelCombo.Size=[Drawing.Size]::new($rows.model.Value.Width,31)
    $modelCombo.DropDownWidth=320
    $modelCombo.Visible=$false
    $modelCombo.IntegralHeight=$true
    $scroll.Controls.Add($modelCombo)
    $modelCombo.BringToFront()
    $rows.model.Value.Cursor=[Windows.Forms.Cursors]::Hand
    $rows.model.Title.Cursor=[Windows.Forms.Cursors]::Hand
    $rows.model.Value.AccessibleDescription=Get-LaoUiText 'ChooseModel'
    $card=[Windows.Forms.Panel]::new()
    $card.Location=[Drawing.Point]::new(19,$y+11)
    $card.Size=[Drawing.Size]::new(382,153)
    $card.BackColor=[Drawing.ColorTranslator]::FromHtml('#F8FAFC')
    $scroll.Controls.Add($card)
    Set-LaoRoundedControlRegion $card 16
    $card.Add_SizeChanged({Set-LaoRoundedControlRegion $this 16})
    $card.Add_Paint({
        $border=[Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#DEE6F0'),1)
        $outline=[Drawing.Drawing2D.GraphicsPath]::new()
        try {
            $width=$this.ClientSize.Width-2
            $height=$this.ClientSize.Height-2
            $outline.AddArc(1,1,16,16,180,90)
            $outline.AddArc($width-15,1,16,16,270,90)
            $outline.AddArc($width-15,$height-15,16,16,0,90)
            $outline.AddArc(1,$height-15,16,16,90,90)
            $outline.CloseFigure()
            $_.Graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $_.Graphics.DrawPath($border,$outline)
        } finally {$border.Dispose();$outline.Dispose()}
    })
    $iconBox=[Windows.Forms.Panel]::new()
    $iconBox.Location=[Drawing.Point]::new(16,18)
    $iconBox.Size=[Drawing.Size]::new(55,55)
    $iconBox.BackColor=[Drawing.ColorTranslator]::FromHtml('#E9F8EE')
    $card.Controls.Add($iconBox)
    Set-LaoRoundedControlRegion $iconBox 12
    $cardIcon=[Windows.Forms.PictureBox]::new()
    $cardIcon.Location=[Drawing.Point]::new(8,8)
    $cardIcon.Size=[Drawing.Size]::new(39,39)
    $cardIcon.BackColor=[Drawing.Color]::Transparent
    $cardIcon.SizeMode=[Windows.Forms.PictureBoxSizeMode]::Zoom
    $cardIcon.Image=$assets['documento-verde']
    $iconBox.Controls.Add($cardIcon)
    $cardCaption=LaoLabel (Get-LaoUiText 'CurrentSituation') 85 16 277 24 10.6 $false
    $cardCaption.ForeColor=$colors.muted
    $card.Controls.Add($cardCaption)
    $cardTitle=LaoLabel (Get-LaoUiText 'VerifyingLao') 85 44 277 31 12.7 $true
    $card.Controls.Add($cardTitle)
    $cardDetails=LaoLabel (Get-LaoUiText 'AwaitingLocalData') 85 79 277 64 11.2 $false
    $cardDetails.ForeColor=$colors.muted
    $card.Controls.Add($cardDetails)
    $actions=@{}
    $items=@(@('dashboard',(Get-LaoUiText 'OpenDashboard'),'abrir-painel'),
             @('logs',(Get-LaoUiText 'ViewLogs'),'logs'),
             @('context',(Get-LaoUiText 'ReviewContinue'),'reiniciar'),
             @('settings',(Get-LaoUiText 'Settings'),'configuracoes'))
    $pos=$y+172
    foreach($item in $items) {
        $button=[Windows.Forms.Button]::new()
        $button.Text=[string]$item[1]
        $button.AccessibleName=[string]$item[1]
        $button.Tag=$assets[[string]$item[2]]
        $button.FlatStyle=[Windows.Forms.FlatStyle]::Flat
        $button.FlatAppearance.BorderSize=0
        $button.TextAlign=[Drawing.ContentAlignment]::MiddleLeft
        $button.Font=[Drawing.Font]::new('Segoe UI',13)
        $button.BackColor=[Drawing.Color]::White
        $button.ForeColor=$colors.text
        $button.Location=[Drawing.Point]::new(19,$pos)
        $button.Size=[Drawing.Size]::new(381,40)
        $button.Padding=[Windows.Forms.Padding]::new(50,0,0,0)
        $scroll.Controls.Add($button)
        $button.Add_Paint({
            $_.Graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $_.Graphics.DrawImage($this.Tag,[Drawing.Rectangle]::new(9,7,26,26))
            $_.Graphics.DrawImage($this.Parent.Tag,
                [Drawing.Rectangle]::new($this.Width-30,12,16,16))
        })
        LaoLine $scroll ($pos+40)
        $actions[[string]$item[0]]=$button
        $pos+=40
    }
    $scroll.Tag=$assets['chevron-direita']
    $freshness=LaoLabel (Get-LaoUiText 'FreshWaiting') 20 ($pos+2) 365 14 8 $false
    $freshness.ForeColor=$colors.muted
    $scroll.Controls.Add($freshness)
    $form.Add_KeyDown({if($_.KeyCode -eq [Windows.Forms.Keys]::Escape){$this.Hide();$_.Handled=$true}})
    $form.Add_Deactivate({$this.Hide()})
    $form.Add_SizeChanged({ Set-LaoPopupShape $this })
    Set-LaoPopupShape $form
    return @{Form=$form;Logo=$logo;Brand=$brand;HeaderDot=$dot;HeaderText=$heading;
      Rows=$rows;Colors=$colors;Card=$card;CardIcon=$cardIcon;
      CardCaption=$cardCaption;CardTitle=$cardTitle;CardDetails=$cardDetails;
        Actions=$actions;StartAll=$startAll;IconBox=$iconBox;Freshness=$freshness;
      ModelCombo=$modelCombo;
      Assets=$assets}
}

function Apply-LaoPopupLanguage($popup) {
    if(-not $popup){return}
    $popup.StartAll.AccessibleName=Get-LaoUiText 'StartAll'
    $popup.StartAll.AccessibleDescription=Get-LaoUiText 'StartAllDesc'
    $popup.Rows.model.Title.Text=Get-LaoUiText 'DefaultModel'
    $popup.Rows.queue.Title.Text=Get-LaoUiText 'Queue'
    $popup.Rows.last.Title.Text=Get-LaoUiText 'LastRun'
    $popup.Rows.model.Value.AccessibleDescription=Get-LaoUiText 'ChooseModel'
    $popup.Actions.dashboard.Text=Get-LaoUiText 'OpenDashboard'
    $popup.Actions.dashboard.AccessibleName=$popup.Actions.dashboard.Text
    $popup.Actions.logs.Text=Get-LaoUiText 'ViewLogs'
    $popup.Actions.logs.AccessibleName=$popup.Actions.logs.Text
    $popup.Actions.settings.Text=Get-LaoUiText 'Settings'
    $popup.Actions.settings.AccessibleName=$popup.Actions.settings.Text
    if(-not $popup.Form.Visible -and -not $popup.HeaderText.Text){
        $popup.HeaderText.Text=Get-LaoUiText 'WaitingSignal'
    }
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

function Set-LaoComponentRow($popup,[string]$name,[string]$kind,[string]$status,[string]$state) {
    $row=$popup.Rows[$name]
    if(!$row){return}
    $version=$script:componentVersions[$kind]
    $full=if($version){$status+' · v'+$version}else{$status}
    $chosenSize=if($version){10.2}else{12.4}
    $measured=0
    $sizes=if($version){@(10.2,9.8,9.4,9.0,8.6)}else{@(12.4)}
    foreach($candidate in $sizes) {
        $probeFont=[Drawing.Font]::new('Segoe UI',[single]$candidate,[Drawing.FontStyle]::Regular)
        try {
            $candidateWidth=[Windows.Forms.TextRenderer]::MeasureText($full,$probeFont).Width
            $chosenSize=$candidate
            $measured=$candidateWidth
            if($candidateWidth -le $row.Value.ClientSize.Width) { break }
        } finally { $probeFont.Dispose() }
    }
    if([Math]::Abs($row.Value.Font.Size-[single]$chosenSize) -gt 0.05) {
        $oldFont=$row.Value.Font
        $row.Value.Font=[Drawing.Font]::new('Segoe UI',[single]$chosenSize,[Drawing.FontStyle]::Regular)
        if($oldFont){$oldFont.Dispose()}
    }
    Set-LaoPopupRow $popup $name $full $state

    # Preserve the complete installed version whenever possible. Long beta/RC
    # labels get progressively smaller before we ever fall back to status-only.
    # If even the minimum readable size cannot fit, operational status wins.
    if($measured -gt $row.Value.ClientSize.Width) {
        $row.Value.Text=$status
        $row.Value.AccessibleDescription=if($version){$status+'; versão '+$version}else{$status}
    } else {
        $row.Value.Text=$full
        $row.Value.AccessibleDescription=$full
    }
}

function Get-LaoAggregateUiState($snapshot) {
    if (-not $snapshot) {
        return [pscustomobject]@{Status='offline';Label=(Get-LaoUiText 'ServiceUnavailable')}
    }
    $reasons=@($snapshot.reasons)
    $laoLive=([string]$snapshot.status -ne 'offline')
    $devspaceOk=$snapshot.statusAuthenticated -and
        $reasons -notcontains 'devspace_unavailable' -and
        $reasons -notcontains 'devspace_unverified'
    $ollamaOk=$snapshot.statusAuthenticated -and
        $reasons -notcontains 'ollama_unavailable'
    if (-not $laoLive) {
        return [pscustomobject]@{Status='offline';Label=(Get-LaoUiText 'ServiceUnavailable')}
    }
    if ($null -ne $snapshot.pendingReviews -and [int]$snapshot.pendingReviews -gt 0) {
        return [pscustomobject]@{Status='review';Label=(Get-LaoUiText 'AwaitingReview')}
    }
    if ($devspaceOk -and $ollamaOk) {
        $label=if($null -ne $snapshot.activeTasks -and [int]$snapshot.activeTasks -gt 0){
            Get-LaoUiText 'RunningTasks'
        }else{Get-LaoUiText 'Active'}
        return [pscustomobject]@{Status='active';Label=$label}
    }
    return [pscustomobject]@{Status='idle';Label=(Get-LaoUiText 'Partial')}
}

function Update-LaoPopup($popup,$snapshot) {
    if(!$popup -or !$snapshot){return}
    $reasons=@($snapshot.reasons)
    $aggregate=Get-LaoAggregateUiState $snapshot
    $state=[string]$aggregate.Status
    $laoLive=([string]$snapshot.status -ne 'offline')
    $color=switch($state){
        active {$popup.Colors.green}
        review {$popup.Colors.yellow}
        offline {$popup.Colors.red}
        default {$popup.Colors.gray}
    }
    $popup.HeaderDot.ForeColor=$color
    $popup.HeaderText.Text=[string]$aggregate.Label
    $popup.HeaderText.ForeColor=$color
    $live=$state -ne 'offline'
    Set-LaoComponentRow $popup service 'LAO' $(if($laoLive){Get-LaoUiText 'Responding'}else{Get-LaoUiText 'NoResponse'}) $(if($laoLive){'good'}else{'bad'})
    $observed=[DateTimeOffset]::MinValue
    if([DateTimeOffset]::TryParse([string]$snapshot.checkedAt,[ref]$observed)){
        $popup.Freshness.Text=(Get-LaoUiText 'LastCheck')+': '+$observed.ToLocalTime().ToString('HH:mm:ss')+' · — = '+(Get-LaoUiText 'Unavailable')
    }else{
        $popup.Freshness.Text=(Get-LaoUiText 'NoConfirmedCheck')+' · — = '+(Get-LaoUiText 'Unavailable')
    }
    if(!$snapshot.statusAuthenticated){
        Set-LaoComponentRow $popup mcp 'DevSpace' (Get-LaoUiText 'NotVerified') unknown
        Set-LaoComponentRow $popup ollama 'Ollama' (Get-LaoUiText 'NotVerified') unknown
    }else{
        $mcpNotReady=$reasons -contains 'devspace_unverified'
        $mcpOffline=$reasons -contains 'devspace_unavailable'
        Set-LaoComponentRow $popup mcp 'DevSpace' $(if($mcpOffline){'Offline'}elseif($mcpNotReady){Get-LaoUiText 'NotVerified'}else{Get-LaoUiText 'Connected'}) $(if($mcpOffline){'bad'}elseif($mcpNotReady){'unknown'}else{'good'})
        $ollamaDown=$reasons -contains 'ollama_unavailable'
        Set-LaoComponentRow $popup ollama 'Ollama' $(if($ollamaDown){'Offline'}else{Get-LaoUiText 'Responding'}) $(if($ollamaDown){'bad'}else{'good'})
    }
    Set-LaoPopupRow $popup model $(if($snapshot.modelConfigured){[string]$snapshot.modelConfigured}else{'—'}) unknown
    Set-LaoPopupRow $popup gpu $(if($null -ne $snapshot.gpuPercent){"$($snapshot.gpuPercent)%"}else{'—'}) unknown
    Set-LaoPopupRow $popup vram $(if($null -ne $snapshot.vramUsedMiB -and $null -ne $snapshot.vramTotalMiB){
        "$($snapshot.vramUsedMiB) / $($snapshot.vramTotalMiB) MiB"
    }else{'—'}) unknown
    Set-LaoPopupRow $popup queue $(if($snapshot.tasksAuthenticated){"$($snapshot.activeTasks) $(Get-LaoUiText 'Running')"}else{Get-LaoUiText 'NotVerified'}) unknown
    if($null -ne $snapshot.pendingReviews -and $snapshot.pendingReviews -gt 0){
        $popup.Actions.context.Enabled=$true
        $popup.Actions.context.Text=Get-LaoUiText 'ReviewContinue'
        $popup.Actions.context.Tag=$popup.Assets['revisao']
        $popup.Rows.last.Title.Text=Get-LaoUiText 'Pending'
        Set-LaoPopupRow $popup last ((Get-LaoUiText 'ReviewCount') -f $snapshot.pendingReviews) review
        $popup.CardIcon.Image=$popup.Assets['documento-amarelo']
        $popup.IconBox.BackColor=[Drawing.ColorTranslator]::FromHtml('#FFF3D2')
        $popup.CardCaption.Text=Get-LaoUiText 'ActionRequired'
        $popup.CardTitle.Text=Get-LaoUiText 'AwaitingReview'
        $popup.CardDetails.Text=(Get-LaoUiText 'ReviewDetails') -f $snapshot.pendingReviews
        $popup.Card.BackColor=[Drawing.ColorTranslator]::FromHtml('#FFF8E7')
    }elseif($null -ne $snapshot.activeTasks -and $snapshot.activeTasks -gt 0){
        $popup.Actions.context.Enabled=$false
        $popup.Actions.context.Text=Get-LaoUiText 'RestartLaoActive'
        $popup.Actions.context.Tag=$popup.Assets['reiniciar']
        $popup.Rows.last.Title.Text=Get-LaoUiText 'LastRun'
        Set-LaoPopupRow $popup last (Get-LaoUiText 'RunInProgress') good
        $popup.CardIcon.Image=$popup.Assets['documento-verde']
        $popup.IconBox.BackColor=[Drawing.ColorTranslator]::FromHtml('#E9F8EE')
        $popup.CardCaption.Text=Get-LaoUiText 'CurrentTask'
        $popup.CardTitle.Text=$(if($snapshot.lastTaskId){
            'Tarefa ' + ([string]$snapshot.lastTaskId).Substring(0,[Math]::Min(8,([string]$snapshot.lastTaskId).Length))
        }else{Get-LaoUiText 'RunInProgress'})
        $phase=switch([string]$snapshot.lastTaskPhase){
            preparing {Get-LaoUiText 'Preparing'}
            running {Get-LaoUiText 'Executing'}
            validating {Get-LaoUiText 'Validating'}
            default {Get-LaoUiText 'NotReported'}
        }
        $executor=if($snapshot.lastTaskModel){[string]$snapshot.lastTaskModel}else{Get-LaoUiText 'NotInformed'}
        $popup.CardDetails.Text=(Get-LaoUiText 'Executor')+": $executor`r`n"+(Get-LaoUiText 'Phase')+": $phase`r`nTempo: "+(Get-LaoUiText 'TimeUnavailable')
        $popup.Card.BackColor=[Drawing.ColorTranslator]::FromHtml('#F3FAF5')
    }else{
        $canRestart=$live -and $snapshot.statusAuthenticated -and ($snapshot.restartAvailable -eq $true)
        $popup.Actions.context.Enabled=$canRestart
        $popup.Actions.context.Tag=$popup.Assets['reiniciar']
        $popup.Actions.context.Text=$(if($canRestart){
            Get-LaoUiText 'RestartLao'
        }elseif($live){
            Get-LaoUiText 'RestartLaoUnavailable'
        }else{Get-LaoUiText 'StartLaoUnavailable'})
        $popup.Rows.last.Title.Text=Get-LaoUiText 'LastRun'
        Set-LaoPopupRow $popup last '—' unknown
        $popup.CardIcon.Image=$(if($live){
            $popup.Assets['documento-verde']
        }else{
            $popup.Assets['documento-vermelho']
        })
        $popup.IconBox.BackColor=$(if($live){
            [Drawing.ColorTranslator]::FromHtml('#E9F8EE')
        }else{[Drawing.ColorTranslator]::FromHtml('#FFE6E8')})
        $popup.CardCaption.Text=Get-LaoUiText 'CurrentSituation'
        $popup.CardTitle.Text=$(if($live){Get-LaoUiText 'MonitorRunning'}else{Get-LaoUiText 'OrchestratorUnavailable'})
        $popup.CardDetails.Text=$(if($live){Get-LaoUiText 'NoActiveTask'}else{Get-LaoUiText 'DaemonNotResponding'})
        $popup.Card.BackColor=$(if($live){[Drawing.ColorTranslator]::FromHtml('#F8FAFC')}else{[Drawing.ColorTranslator]::FromHtml('#FFF0F0')})
    }
    $popup.CardIcon.Invalidate()
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
    $popup.Brand.Width=[Math]::Max(142,$width-170)
    $popup.HeaderText.Width=[Math]::Max(100,$width-202)
    $popup.StartAll.Left=$width-56
    foreach($row in $popup.Rows.Values){
        $row.Value.Left=[Math]::Max(207,$width-196)
        $row.Value.Width=[Math]::Max(103,$width-$row.Value.Left-22)
        if ($row.Start) {
            $row.Start.Left=$width-49
            if ($row.Start.Visible) { $row.Value.Width-=28 }
        }
        $row.Title.Width=[Math]::Min(158,[Math]::Max(118,$row.Value.Left-$row.Title.Left-8))
    }
    $popup.ModelCombo.Left=$popup.Rows.model.Value.Left
    $popup.ModelCombo.Top=$popup.Rows.model.Value.Top
    $popup.ModelCombo.Width=$popup.Rows.model.Value.Width
    $popup.Card.Width=$width-38
    $popup.CardCaption.Width=[Math]::Max(170,$popup.Card.Width-91)
    $popup.CardTitle.Width=[Math]::Max(170,$popup.Card.Width-91)
    $popup.CardDetails.Width=[Math]::Max(170,$popup.Card.Width-91)
    $popup.Freshness.Width=$width-42
    foreach($button in $popup.Actions.Values){$button.Width=$width-38}
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
    $height=[Math]::Min(768,[Math]::Max(280,$area.Height-16))
    $popup.Form.ClientSize=[Drawing.Size]::new($width,$height)
    Resize-LaoPopupContents $popup $width
    $x=[Math]::Max($area.Left+8,[Math]::Min($cursor.X-$width+30,$area.Right-$width-8))
    $y=if($cursor.Y -lt ($area.Top+$area.Height/2)){$area.Top+8}else{$area.Bottom-$height-8}
    $popup.Form.Location=[Drawing.Point]::new([int]$x,[int]$y)
    $popup.Form.Show()
    $popup.Form.Activate()
}
