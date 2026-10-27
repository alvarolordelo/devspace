# LAO DevSpace tray - Windows, foreground and entirely opt-in.
# Launch manually with: powershell.exe -NoProfile -STA -File <this script>
# Exit closes ONLY the tray monitor, not the LAO daemon, DevSpace or Ollama.
[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = 7877,
    [switch]$CheckOnly,
    [switch]$UiCheckOnly,
    [switch]$ProbeOnly,
    [switch]$AsyncProbeOnly,
    [switch]$EnableNotifications
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'LAO tray requires Windows' }
if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA) {
    throw 'Run the tray in STA mode: powershell.exe -NoProfile -STA -File ...'
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http

$script:trayStatus = 'offline'
$script:lastCheck = $null
$script:baseUrl = "http://127.0.0.1:$Port"
# Never accept a token on the command line (process arguments are inspectable).
# An operator may pass the same secret as the daemon using the process environment.
$script:dashboardToken = $env:LAO_DASHBOARD_TOKEN
if ($script:dashboardToken -and $script:dashboardToken -cnotmatch '^[\x21-\x7e]{32,256}$') {
    throw 'Invalid LAO_DASHBOARD_TOKEN for tray'
}
function Get-LaoTraySnapshot {
    $state = 'offline'
    $label = 'LAO indisponivel'
    $activeTasks = $null
    $pendingReviews = $null
    $healthOk = $false
    try {
        $live = Invoke-RestMethod -Method Get -Uri ($script:baseUrl + '/health/live') `
            -TimeoutSec 2 -MaximumRedirection 0 -ErrorAction Stop
        $healthOk = ($live.live -eq $true)
    } catch { }
    if ($healthOk) {
        $state = 'idle'
        $label = 'Dependencias indisponiveis'
        try {
            $ready = Invoke-RestMethod -Method Get -Uri ($script:baseUrl + '/health/ready') `
                -TimeoutSec 3 -MaximumRedirection 0 -ErrorAction Stop
            if ($ready.ready -eq $true) {
                $state = 'active'
                $label = 'Operacional'
            }
        } catch { }
        # Task status is private. Only query the authenticated dashboard API.
        # A missing/invalid token MUST NOT be interpreted as zero active tasks.
        if ($script:dashboardToken) {
            try {
                $response = Invoke-RestMethod -Method Get -Uri ($script:baseUrl + '/dashboard/api/tasks') `
                    -Headers @{ Authorization = ('Bearer ' + $script:dashboardToken) } `
                    -TimeoutSec 2 -MaximumRedirection 0 -ErrorAction Stop
                if ($null -ne $response.tasks -and $response.tasks -is [array]) {
                    $activeTasks = @($response.tasks | Where-Object {
                        $_.status -in @('preparing','running','validating')
                    }).Count
                    $pendingReviews = @($response.tasks | Where-Object {
                        $_.status -eq 'awaiting_review'
                    }).Count
                    if ($state -eq 'active' -and $pendingReviews -gt 0) {
                        $state = 'review'
                        $label = 'Aguardando revisao'
                    } elseif ($state -eq 'active' -and $activeTasks -gt 0) {
                        $label = 'Executando tarefas'
                    }
                }
            } catch { }
        }
    }
    # Only aggregate counters are returned; never expose a task, token or path.
    return [pscustomobject]@{
        status = $state
        label = $label
        activeTasks = $activeTasks
        pendingReviews = $pendingReviews
        tasksAuthenticated = ($null -ne $activeTasks)
        checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
}
$iconsRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\docs\lao-devspace\assets\icons\ico'))
$icons = @{}
foreach ($state in @('active','idle','offline','review')) {
    $path = Join-Path $iconsRoot ("lao-tray-" + $state + ".ico")
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Approved LAO tray icon missing: $state"
    }
    $icons[$state] = [Drawing.Icon]::new($path)
}
. (Join-Path $PSScriptRoot 'lao-popup.ps1')
if ($CheckOnly) {
    foreach ($icon in $icons.Values) { $icon.Dispose() }
    Write-Output 'LAO tray check passed: Windows STA, WinForms and approved icons available.'
    return
}
if ($UiCheckOnly) {
    $logoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\docs\lao-devspace\assets\icons\png\lao-logo-64.png'))
    $ui = New-LaoPopup -LogoPath $logoPath
    try {
        if ($ui.Form.ClientSize.Width -ne 420 -or $ui.Rows.Count -ne 8 -or
            $ui.Actions.Count -ne 4) {
            throw 'LAO native popup layout contract failed'
        }
        foreach ($state in @('active','offline','review','idle')) {
            $snapshot = [pscustomobject]@{
                status=$state; statusAuthenticated=$true
                reasons=@('devspace_unverified','ollama_unavailable')
                modelConfigured='granite4.2-8b:gpu'
                gpuPercent=25; vramUsedMiB=1024; vramTotalMiB=6144
                tasksAuthenticated=$true; activeTasks=0
                pendingReviews=$(if($state -eq 'review'){1}else{0})
            }
            Update-LaoPopup $ui $snapshot
            $expectedColor = switch ($state) {
                'active' { $ui.Colors.green }
                'offline' { $ui.Colors.red }
                'review' { $ui.Colors.yellow }
                default { $ui.Colors.gray }
            }
            if ($ui.HeaderDot.ForeColor.ToArgb() -ne $expectedColor.ToArgb()) {
                throw "Popup status color incorrect: $state"
            }
            if ($state -eq 'review' -and
                (-not $ui.Actions.context.Enabled -or
                 $ui.CardTitle.Text -ne 'Aguardando revisão' -or
                 $ui.Rows.last.Title.Text -ne 'Pendências')) {
                throw 'Review popup did not expose its approval context'
            }
            if ($state -ne 'review' -and $ui.Actions.context.Enabled) {
                throw 'Uninstalled service control must remain disabled'
            }
        }
        $ui.Form.ClientSize=[Drawing.Size]::new(340,580)
        Resize-LaoPopupContents $ui 340
        foreach ($row in $ui.Rows.Values) {
            if ($row.Title.Right + 6 -gt $row.Value.Left -or $row.Value.Right -gt 340) {
                throw 'Narrow popup width overlaps health row labels'
            }
        }
        if ($ui.HeaderText.Right -ge $ui.Settings.Left) {
            throw 'Narrow popup header overlaps settings'
        }
        $ui.Form.ClientSize=[Drawing.Size]::new(420,790)
        Resize-LaoPopupContents $ui 420
        if ($ui.Freshness.Bottom -gt $ui.Form.ClientSize.Height-84-6) {
            throw 'Native popup footer is clipped at reference height'
        }
        [pscustomobject]@{
            validated=$true
            widthDip=$ui.Form.ClientSize.Width
            healthRows=$ui.Rows.Count
            actions=$ui.Actions.Count
            keyboardEscape=$ui.Form.KeyPreview
            lastHeader=$ui.HeaderText.Text
            fontFamily=$ui.HeaderText.Font.FontFamily.Name
        } | ConvertTo-Json -Compress
    } finally {
        $ui.Logo.Image.Dispose()
        $ui.Form.Dispose()
        foreach ($icon in $icons.Values) { $icon.Dispose() }
    }
    return
}
if ($ProbeOnly) {
    $snapshot = Get-LaoTraySnapshot
    foreach ($icon in $icons.Values) { $icon.Dispose() }
    $snapshot | ConvertTo-Json -Compress
    return
}
$mutex = $null
if (-not $AsyncProbeOnly) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $createdNew = $false
    $mutexName = "Local\LAO-DevSpace-Tray-" + $identity
    $mutex = [Threading.Mutex]::new($true, $mutexName, [ref]$createdNew)
    if (-not $createdNew) {
        $mutex.Dispose()
        foreach ($icon in $icons.Values) { $icon.Dispose() }
        Write-Output 'LAO tray is already running for this user.'
        return
    }
}

$notify = [Windows.Forms.NotifyIcon]::new()
$notify.Icon = $icons['offline']
$notify.Text = 'LAO DevSpace - offline'
$notify.Visible = (-not $AsyncProbeOnly)
$script:popup = $null
if (-not $AsyncProbeOnly) {
    $logoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\docs\lao-devspace\assets\icons\png\lao-logo-64.png'))
    $script:popup = New-LaoPopup -LogoPath $logoPath
}
$menu = [Windows.Forms.ContextMenuStrip]::new()
$openItem = $menu.Items.Add('Abrir painel LAO')
$stateItem = $menu.Items.Add('Status: offline')
$stateItem.Enabled = $false
$tasksItem = $menu.Items.Add('Tarefas: aguardando consulta')
$tasksItem.Enabled = $false
$copyItem = $menu.Items.Add('Copiar diagnostico')
$quitItem = $menu.Items.Add('Sair do monitor')
$notify.ContextMenuStrip = $menu
$context = [Windows.Forms.ApplicationContext]::new()
$timer = [Windows.Forms.Timer]::new()
$timer.Interval = 200
$script:initialized = $false
$script:previousStatus = 'offline'
$script:previousReviews = 0
$script:previousTasksAuthenticated = $false
$script:pollStage = 'none'
$script:pollTask = $null
$script:nextPollAt = [DateTime]::MinValue
$script:pollSnapshot = $null
$script:asyncResult = $null
$script:uiHeartbeatTicks = 0

# A PowerShell Invoke-RestMethod call on a WinForms timer blocks all menu
# clicks for the duration of its network timeout. HttpClient tasks complete
# on a .NET worker thread; all JSON parsing and UI mutation happen in the
# STA timer only AFTER task completion.
$publicHandler = [Net.Http.HttpClientHandler]::new()
$publicHandler.AllowAutoRedirect = $false
$publicClient = [Net.Http.HttpClient]::new($publicHandler)
$publicClient.Timeout = [TimeSpan]::FromSeconds(3)
$publicClient.MaxResponseContentBufferSize = 32768
$privateHandler = [Net.Http.HttpClientHandler]::new()
$privateHandler.AllowAutoRedirect = $false
$privateClient = [Net.Http.HttpClient]::new($privateHandler)
$privateClient.Timeout = [TimeSpan]::FromSeconds(3)
$privateClient.MaxResponseContentBufferSize = 262144
if ($script:dashboardToken) {
    $privateClient.DefaultRequestHeaders.Authorization =
        [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $script:dashboardToken)
}

function Start-LaoAsyncPoll {
    $script:pollSnapshot = [pscustomobject]@{
        status = 'offline'
        label = 'LAO indisponivel'
        activeTasks = $null
        pendingReviews = $null
        tasksAuthenticated = $false
        statusAuthenticated = $false
        reasons = @()
        modelConfigured = $null
        gpuPercent = $null
        vramUsedMiB = $null
        vramTotalMiB = $null
        lastTaskModel = $null
        checkedAt = $null
    }
    $script:pollStage = 'live'
    $script:pollTask = $publicClient.GetStringAsync($script:baseUrl + '/health/live')
}

function Finish-LaoAsyncPoll {
    $script:pollSnapshot.checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    $script:asyncResult = $script:pollSnapshot
    $script:pollTask = $null
    $script:pollStage = 'none'
    $script:nextPollAt = [DateTime]::UtcNow.AddSeconds(15)
    Update-LaoTray $script:asyncResult
    if ($AsyncProbeOnly) { $context.ExitThread() }
}

function Advance-LaoAsyncPoll {
    if ($script:pollStage -eq 'none' -or !$script:pollTask.IsCompleted) { return }
    $payload = $null
    try {
        # IsCompleted is mandatory; never synchronously wait for I/O in STA.
        $payload = $script:pollTask.GetAwaiter().GetResult() | ConvertFrom-Json -ErrorAction Stop
    } catch { }
    switch ($script:pollStage) {
        'live' {
            if ($null -eq $payload -or $payload.live -ne $true) {
                Finish-LaoAsyncPoll
                return
            }
            $script:pollSnapshot.status = 'idle'
            $script:pollSnapshot.label = 'Dependencias indisponiveis'
            $script:pollStage = 'ready'
            $script:pollTask = $publicClient.GetStringAsync($script:baseUrl + '/health/ready')
        }
        'ready' {
            if ($null -ne $payload -and $payload.ready -eq $true) {
                $script:pollSnapshot.status = 'active'
                $script:pollSnapshot.label = 'Operacional'
            }
            if (-not $script:dashboardToken) {
                Finish-LaoAsyncPoll
                return
            }
            $script:pollStage = 'status'
            $script:pollTask = $privateClient.GetStringAsync($script:baseUrl + '/dashboard/api/status')
        }
        'status' {
            if ($null -ne $payload -and $null -ne $payload.blockingReasons) {
                $script:pollSnapshot.statusAuthenticated = $true
                $script:pollSnapshot.reasons = @($payload.blockingReasons)
                $script:pollSnapshot.modelConfigured = $payload.modelConfigured
            }
            $script:pollStage = 'metrics'
            $script:pollTask = $privateClient.GetStringAsync($script:baseUrl + '/dashboard/api/metrics')
        }
        'metrics' {
            if ($null -ne $payload -and $null -ne $payload.gpu) {
                $script:pollSnapshot.gpuPercent = $payload.gpu.utilizationPercent
                $script:pollSnapshot.vramUsedMiB = $payload.gpu.vramUsedMiB
                $script:pollSnapshot.vramTotalMiB = $payload.gpu.vramTotalMiB
            }
            $script:pollStage = 'tasks'
            $script:pollTask = $privateClient.GetStringAsync($script:baseUrl + '/dashboard/api/tasks')
        }
        'tasks' {
            if ($null -ne $payload -and $null -ne $payload.tasks -and $payload.tasks -is [array]) {
                $active = @($payload.tasks | Where-Object {
                    $_.status -in @('preparing','running','validating')
                }).Count
                $reviews = @($payload.tasks | Where-Object {
                    $_.status -eq 'awaiting_review'
                }).Count
                $script:pollSnapshot.activeTasks = $active
                $script:pollSnapshot.pendingReviews = $reviews
                $script:pollSnapshot.tasksAuthenticated = $true
                $latest = @($payload.tasks | Where-Object {
                    $_.status -in @('running','validating','preparing')
                } | Select-Object -First 1)
                if ($latest.Count -gt 0) {
                    $script:pollSnapshot.lastTaskModel = [string]$latest[0].model
                }
                if ($script:pollSnapshot.status -eq 'active' -and $reviews -gt 0) {
                    $script:pollSnapshot.status = 'review'
                    $script:pollSnapshot.label = 'Aguardando revisao'
                } elseif ($script:pollSnapshot.status -eq 'active' -and $active -gt 0) {
                    $script:pollSnapshot.label = 'Executando tarefas'
                }
            }
            Finish-LaoAsyncPoll
        }
    }
}

function Update-LaoTray($snapshot) {
        $script:trayStatus = $snapshot.status
        if ($script:popup) { Update-LaoPopup $script:popup $snapshot }
        $script:lastCheck = Get-Date
        $notify.Icon = $icons[$snapshot.status]
        $stateItem.Text = "Status: $($snapshot.label)"
        $notify.Text = "LAO DevSpace - $($snapshot.label)"
        if ($snapshot.tasksAuthenticated) {
            $tasksItem.Text = "Tarefas: $($snapshot.activeTasks) executando; $($snapshot.pendingReviews) em revisao"
        } else {
            $tasksItem.Text = 'Tarefas: consulta nao autenticada'
        }
        if ($EnableNotifications -and -not $AsyncProbeOnly -and $script:initialized) {
            $newReviews = if ($null -eq $snapshot.pendingReviews) { 0 } else { [int]$snapshot.pendingReviews }
            if ($script:previousStatus -ne 'offline' -and $snapshot.status -eq 'offline') {
                $notify.BalloonTipTitle = 'LAO DevSpace indisponivel'
                $notify.BalloonTipText = 'O daemon local parou de responder.'
                $notify.ShowBalloonTip(5000)
            } elseif ($script:previousTasksAuthenticated -and $snapshot.tasksAuthenticated -and
                      $newReviews -gt $script:previousReviews -and $newReviews -gt 0) {
                $notify.BalloonTipTitle = 'LAO DevSpace: revisao'
                $notify.BalloonTipText = 'Ha tarefas aguardando revisao no painel.'
                $notify.ShowBalloonTip(5000)
            }
        }
        $script:initialized = $true
        $script:previousStatus = $snapshot.status
        $script:previousReviews = if ($null -eq $snapshot.pendingReviews) { 0 } else { [int]$snapshot.pendingReviews }
        $script:previousTasksAuthenticated = $snapshot.tasksAuthenticated
}

$timer.Add_Tick({
    $script:uiHeartbeatTicks++
    try {
        if ($script:pollStage -ne 'none') {
            Advance-LaoAsyncPoll
        } elseif ([DateTime]::UtcNow -ge $script:nextPollAt) {
            Start-LaoAsyncPoll
        }
    } catch {
        # A telemetry exception must never close the GUI or report green.
        $script:pollStage = 'none'
        $script:pollTask = $null
        $script:nextPollAt = [DateTime]::UtcNow.AddSeconds(15)
        Update-LaoTray ([pscustomobject]@{
            status = 'offline'; label = 'Falha na monitorizacao'
            activeTasks = $null; pendingReviews = $null
            tasksAuthenticated = $false; checkedAt = [DateTime]::UtcNow.ToString('o')
        })
        if ($AsyncProbeOnly) { $context.ExitThread() }
    }
})
$openItem.Add_Click({
    Start-Process ($script:baseUrl + '/dashboard') | Out-Null
})
if ($script:popup) {
    $notify.Add_MouseClick({
        if ($_.Button -eq [Windows.Forms.MouseButtons]::Left) {
            Toggle-LaoPopup $script:popup
        }
    })
    $script:popup.Actions.dashboard.Add_Click({
        $script:popup.Form.Hide()
        Start-Process ($script:baseUrl + '/dashboard') | Out-Null
    })
    $script:popup.Actions.context.Add_Click({
        $script:popup.Form.Hide()
        Start-Process ($script:baseUrl + '/dashboard#tarefas') | Out-Null
    })
    $script:popup.Actions.logs.Add_Click({
        $script:popup.Form.Hide()
        Start-Process ($script:baseUrl + '/dashboard#logs') | Out-Null
    })
    $script:popup.Actions.settings.Add_Click({
        $script:popup.Form.Hide()
        Start-Process ($script:baseUrl + '/dashboard#configuracoes') | Out-Null
    })
    $script:popup.Settings.Add_Click({
        $script:popup.Form.Hide()
        Start-Process ($script:baseUrl + '/dashboard#configuracoes') | Out-Null
    })
}
$copyItem.Add_Click({
    $stamp = if ($null -eq $script:lastCheck) { 'never' } else {
        $script:lastCheck.ToString('s')
    }
    $diagnostic = "LAO tray state: $($script:trayStatus); last check: $stamp; endpoint: 127.0.0.1:$Port"
    try {
        [Windows.Forms.Clipboard]::SetText($diagnostic)
    } catch {
        [Windows.Forms.MessageBox]::Show('Unable to copy diagnostic.', 'LAO DevSpace') | Out-Null
    }
})
$quitItem.Add_Click({ $context.ExitThread() })
try {
    $timer.Start()
    [Windows.Forms.Application]::Run($context)
} finally {
    $timer.Stop()
    $notify.Visible = $false
    if ($script:popup) {
        $script:popup.Form.Hide()
        $script:popup.Logo.Image.Dispose()
        $script:popup.Form.Dispose()
    }
    $timer.Dispose()
    $publicClient.CancelPendingRequests()
    $privateClient.CancelPendingRequests()
    $publicClient.Dispose()
    $privateClient.Dispose()
    $notify.Dispose()
    $menu.Dispose()
    $context.Dispose()
    foreach ($icon in $icons.Values) { $icon.Dispose() }
    if ($mutex) {
        try { $mutex.ReleaseMutex() } catch { }
        $mutex.Dispose()
    }
}
if ($AsyncProbeOnly) {
    $script:asyncResult | Add-Member -NotePropertyName uiHeartbeatTicks -NotePropertyValue $script:uiHeartbeatTicks
    $script:asyncResult | ConvertTo-Json -Compress
}
