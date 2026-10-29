# Regression check: the monitor handoff is read-only and independent of the dashboard.
$ErrorActionPreference='Stop'
$root=Join-Path $PSScriptRoot '..\src\lao\windows'
. (Join-Path $root 'lao-start.ps1')
. (Join-Path $root 'lao-review.ps1')
$script:uiLanguage='pt-BR'
$id='c84f8450-5d9a-4f38-9dfb-711760cda558'
$tasks=@(
    [pscustomobject]@{id=$id;status='awaiting_review';requestedBy='gemini';model='granite4.2-8b:gpu';goalPreview='Tarefa retomada apos reboot'},
    [pscustomobject]@{id='fae7afaf-7abc-4d22-8c10-012345678abc';status='needs_revision';requestedBy='claude';model='spark';goalPreview='Corrigir um teste'},
    [pscustomobject]@{id='b14f0c7e-d0a4-4e17-bab9-100000000001';status='interrupted';requestedBy='';model='granite';goalPreview='Tarefa interrompida'},
    [pscustomobject]@{id='b14f0c7e-d0a4-4e17-bab9-100000000002';status='approved';requestedBy='chatgpt';model='granite';goalPreview='Ja revisada'},
    [pscustomobject]@{id='malicious/id';status='awaiting_review';requestedBy='chatgpt';model='granite';goalPreview='Invalida'}
)
$candidates=@(Get-LaoReviewCandidates $tasks)
if($candidates.Count -ne 3 -or $candidates[0].Id -ne $id -or
    $candidates[2].RequestedBy -ne 'unknown') { throw 'Unsafe or missing review candidates' }
$message=Get-LaoHandoffInstruction $candidates[0].Id
if($message -notmatch 'lao_resume' -or $message -notmatch [regex]::Escape($id) -or
    $message -notmatch 'Nao aprove' -or $message -match 'dashboard/api') {
    throw 'Handoff must request MCP resume without UI or approval shortcuts'
}
$rejected=$false
try { [void](Get-LaoHandoffInstruction '../evil') } catch { $rejected=$true }
if(-not $rejected) { throw 'Invalid handoff task ID accepted' }
$script:uiLanguage='en-US'
$en=Get-LaoHandoffInstruction $id
if($en -notmatch 'lao_resume' -or $en -notmatch 'Do not approve') {
    throw 'English handoff lost the supervision policy'
}
# Exercise the real native dialog without touching the clipboard or launching
# an AI client. Close it automatically as soon as the expected controls exist.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$script:dialogValidated=$false
$timer=[Windows.Forms.Timer]::new()
$timer.Interval=100
$timer.Add_Tick({
    foreach($window in [Windows.Forms.Application]::OpenForms) {
        if($window.Text -notlike 'LAO DevSpace - *') { continue }
        $combos=@($window.Controls | Where-Object {$_ -is [Windows.Forms.ComboBox]})
        $buttons=@($window.Controls | Where-Object {$_ -is [Windows.Forms.Button]})
        $instruction=@($window.Controls | Where-Object {
            $_ -is [Windows.Forms.TextBox] -and $_.ReadOnly
        })
        $script:dialogValidated=($combos.Count -eq 2 -and
            $combos[0].Items.Count -eq 3 -and $combos[1].Items.Count -eq 5 -and
            $buttons.Count -eq 2 -and $instruction.Count -eq 1 -and
            $instruction[0].Text.Contains('lao_resume'))
        $window.Close()
        break
    }
})
try {
    $timer.Start()
    Show-LaoReviewDialog $tasks
} finally {
    $timer.Stop()
    $timer.Dispose()
}
if(-not $script:dialogValidated) { throw 'Native task review dialog did not render correctly' }
Write-Output 'LAO native review handoff check passed'
