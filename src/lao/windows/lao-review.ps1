# Local, read-only task handoff from the native Windows monitor.
# A handoff never executes MCP tools, approves a task or changes a workspace.
function Get-LaoReviewCandidates($Tasks) {
    $result=New-Object System.Collections.Generic.List[object]
    foreach ($task in @($Tasks)) {
        $id=[string]$task.id
        if ($id -cnotmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' -or
            [string]$task.status -notin @('awaiting_review','needs_revision','interrupted')) { continue }
        $goal=[string]$task.goalPreview
        $goal=($goal -replace '[\r\n\t]+',' ').Trim()
        if ($goal.Length -gt 92) { $goal=$goal.Substring(0,92)+'...' }
        if (!$goal) { $goal='Task '+$id.Substring(0,8) }
        $origin=([string]$task.requestedBy -replace '[^a-zA-Z0-9_-]','')
        if (!$origin) { $origin='unknown' }
        $result.Add([pscustomobject]@{
            Id=$id; Goal=$goal; RequestedBy=$origin; Status=[string]$task.status
            Model=([string]$task.model).Substring(0,[Math]::Min(80,([string]$task.model).Length))
            Display=$goal+'  (#'+$id.Substring(0,8)+')'
        })
    }
    return @($result.ToArray())
}

function Get-LaoHandoffInstruction([string]$TaskId) {
    if ($TaskId -cnotmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') {
        throw 'Invalid LAO task ID'
    }
    if ((Get-LaoUiLanguage) -eq 'en-US') {
        return "Review/continue LAO task $TaskId. Use the DevSpace MCP connection and call lao_resume with task_id=$TaskId. Read the original request, results, tests and changes before deciding. Do not approve or promote changes automatically. If lao_resume is unavailable, tell me that the DevSpace connector tool catalog needs to be refreshed."
    }
    return "Revise/continue a tarefa LAO $TaskId. Use o conector DevSpace MCP e chame lao_resume com task_id=$TaskId. Leia o pedido original, os resultados, os testes e as alteracoes antes de decidir. Nao aprove nem aplique alteracoes automaticamente. Se lao_resume nao estiver disponivel, informe que o catalogo MCP do conector DevSpace precisa ser atualizado."
}

function Show-LaoReviewDialog($Tasks) {
    $candidates=@(Get-LaoReviewCandidates $Tasks)
    if ($candidates.Count -eq 0) {
        [Windows.Forms.MessageBox]::Show((Get-LaoUiText 'ReviewNoTasks'),'LAO DevSpace') | Out-Null
        return
    }
    $providers=@(
        [pscustomobject]@{Name=(Get-LaoUiText 'ReviewCopyOnly'); Url=''},
        [pscustomobject]@{Name='ChatGPT'; Url='https://chatgpt.com/'},
        [pscustomobject]@{Name='Claude'; Url='https://claude.ai/new'},
        [pscustomobject]@{Name='Gemini'; Url='https://gemini.google.com/app'},
        [pscustomobject]@{Name='Grok'; Url='https://grok.com/'}
    )
    $form=[Windows.Forms.Form]::new()
    $form.Text='LAO DevSpace - '+(Get-LaoUiText 'ReviewContinue')
    $form.StartPosition=[Windows.Forms.FormStartPosition]::CenterScreen
    $form.FormBorderStyle=[Windows.Forms.FormBorderStyle]::FixedDialog
    $form.MaximizeBox=$false; $form.MinimizeBox=$false; $form.ShowInTaskbar=$true
    $form.TopMost=$true; $form.ClientSize=[Drawing.Size]::new(520,362)
    $form.Font=[Drawing.Font]::new('Segoe UI',10)
    $form.BackColor=[Drawing.Color]::White
    $title=[Windows.Forms.Label]::new()
    $title.Text=(Get-LaoUiText 'ReviewSelectTask'); $title.SetBounds(18,14,480,25)
    $form.Controls.Add($title)
    $tasksCombo=[Windows.Forms.ComboBox]::new()
    $tasksCombo.DropDownStyle=[Windows.Forms.ComboBoxStyle]::DropDownList
    $tasksCombo.SetBounds(18,42,483,30)
    foreach ($task in $candidates) { [void]$tasksCombo.Items.Add($task.Display) }
    $tasksCombo.SelectedIndex=0
    $form.Controls.Add($tasksCombo)
    $details=[Windows.Forms.Label]::new()
    $details.SetBounds(18,80,480,45);$details.AutoEllipsis=$true
    $form.Controls.Add($details)
    $providerLabel=[Windows.Forms.Label]::new()
    $providerLabel.Text=Get-LaoUiText 'ReviewSelectAgent'
    $providerLabel.SetBounds(18,133,480,23);$form.Controls.Add($providerLabel)
    $providerCombo=[Windows.Forms.ComboBox]::new()
    $providerCombo.DropDownStyle=[Windows.Forms.ComboBoxStyle]::DropDownList
    $providerCombo.SetBounds(18,158,483,30)
    foreach ($provider in $providers) { [void]$providerCombo.Items.Add($provider.Name) }
    $providerCombo.SelectedIndex=0
    $form.Controls.Add($providerCombo)
    $notice=[Windows.Forms.Label]::new()
    $notice.Text=Get-LaoUiText 'ReviewSafetyNote'; $notice.SetBounds(18,199,482,46)
    $form.Controls.Add($notice)
    $instruction=[Windows.Forms.TextBox]::new()
    $instruction.Multiline=$true;$instruction.ReadOnly=$true
    $instruction.ScrollBars=[Windows.Forms.ScrollBars]::Vertical
    $instruction.SetBounds(18,248,483,59)
    $form.Controls.Add($instruction)
    $go=[Windows.Forms.Button]::new()
    $go.Text=Get-LaoUiText 'ReviewCopyOpen';$go.SetBounds(18,316,320,32)
    $form.Controls.Add($go)
    $close=[Windows.Forms.Button]::new()
    $close.Text=Get-LaoUiText 'ReviewClose';$close.SetBounds(350,316,151,32)
    $close.Add_Click({$form.Close()});$form.Controls.Add($close)
    $refresh={
        $selected=$candidates[$tasksCombo.SelectedIndex]
        $details.Text=(Get-LaoUiText 'ReviewRequestedBy')+': '+$selected.RequestedBy+
            '    |    '+$selected.Model+'    |    '+$selected.Status
        $instruction.Text=Get-LaoHandoffInstruction $selected.Id
    }
    $tasksCombo.Add_SelectedIndexChanged($refresh)
    $go.Add_Click({
        $selected=$candidates[$tasksCombo.SelectedIndex]
        $message=Get-LaoHandoffInstruction $selected.Id
        try {
            [Windows.Forms.Clipboard]::SetText($message)
        } catch {
            [Windows.Forms.MessageBox]::Show((Get-LaoUiText 'ReviewCopyFailed'),'LAO DevSpace') | Out-Null
            $instruction.Focus();$instruction.SelectAll();return
        }
        $target=$providers[$providerCombo.SelectedIndex]
        if ($target.Url) {
            try { Start-Process -FilePath $target.Url | Out-Null }
            catch {
                [Windows.Forms.MessageBox]::Show((Get-LaoUiText 'ReviewOpenFailed'),'LAO DevSpace') | Out-Null
                return
            }
        }
        [Windows.Forms.MessageBox]::Show((Get-LaoUiText 'ReviewCopied'),'LAO DevSpace') | Out-Null
        $form.Close()
    })
    & $refresh
    try { [void]$form.ShowDialog() }
    finally { $form.Dispose() }
}
