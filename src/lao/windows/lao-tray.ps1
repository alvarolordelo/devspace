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
. (Join-Path $PSScriptRoot 'lao-autostart.ps1')
. (Join-Path $PSScriptRoot 'lao-settings.ps1')
if ($CheckOnly) {
    foreach ($icon in $icons.Values) { $icon.Dispose() }
    Write-Output 'LAO tray check passed: Windows STA, WinForms and approved icons available.'
    return
}
if ($UiCheckOnly) {
    # Keep the visual regression fixture deterministic regardless of the
    # Windows display language. This does not persist a user preference.
    $script:uiLanguage='pt-BR'
    $logoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\docs\lao-devspace\assets\icons\png\lao-logo-64.png'))
    $ui = New-LaoPopup -LogoPath $logoPath
    $settingsUi = New-LaoSettingsForm $ui.Assets
    try {
        if ($settingsUi.Switch.AccessibleName -ne (Get-LaoUiText 'StartWithWindows') -or
            $settingsUi.Services.Count -ne 2 -or
            $settingsUi.Language.Items.Count -ne 2 -or
            -not $settingsUi.Language.Items.Contains('English') -or
            -not $settingsUi.Language.Items.Contains('Português') -or
            $settingsUi.Services.Ollama.Text -notmatch 'Ollama' -or
            $settingsUi.Services.DevSpace.Text -notmatch 'DevSpace') {
            throw 'Switch and controlled dependency restart settings missing'
        }
        $mockService=[pscustomobject]@{Name='LAO-MOCK-SERVICE';Status='Running'}
        $safeSnapshot=[pscustomobject]@{
            statusAuthenticated=$true;tasksAuthenticated=$true;activeTasks=0;reasons=@()
        }
        $unverifiedSnapshot=[pscustomobject]@{
            statusAuthenticated=$true;tasksAuthenticated=$true;activeTasks=0
            reasons=@('devspace_unverified')
        }
        $failedSnapshot=[pscustomobject]@{
            statusAuthenticated=$true;tasksAuthenticated=$true;activeTasks=0
            reasons=@('ollama_unavailable')
        }
        if ((Get-LaoDependencyRecoveryAction Ollama $safeSnapshot $mockService) -or
            (Get-LaoDependencyRecoveryAction DevSpace $unverifiedSnapshot $mockService) -or
            (Get-LaoDependencyRecoveryAction Ollama $failedSnapshot $null) -or
            (Get-LaoDependencyRecoveryAction DevSpace $failedSnapshot $mockService)) {
            throw 'Healthy, unverified, or unmanaged dependency must have no click action'
        }
        $recovery=Get-LaoDependencyRecoveryAction Ollama $failedSnapshot $mockService
        if (-not $recovery -or $recovery.Operation -ne 'Restart') {
            throw 'Confirmed Ollama outage must permit supervised recovery'
        }
        $stopped=[pscustomobject]@{Name='LAO-MOCK-SERVICE';Status='Stopped'}
        $recovery=Get-LaoDependencyRecoveryAction DevSpace $unverifiedSnapshot $stopped
        if (-not $recovery -or $recovery.Operation -ne 'Start') {
            throw 'Explicitly stopped managed DevSpace service must permit start'
        }
        $failedSnapshot.activeTasks=1
        if (Get-LaoDependencyRecoveryAction Ollama $failedSnapshot $mockService) {
            throw 'Recovery must be blocked during active LAO tasks'
        }
        $failedSnapshot.activeTasks=0
        $failedSnapshot.tasksAuthenticated=$false
        if (Get-LaoDependencyRecoveryAction Ollama $failedSnapshot $mockService) {
            throw 'Recovery must be blocked without verified LAO task safety'
        }
        if ($ui.Form.ClientSize.Width -ne 420 -or $ui.Rows.Count -ne 8 -or
            $ui.Actions.Count -ne 4) {
            throw 'LAO native popup layout contract failed'
        }
        if ($ui.Form.ClientSize.Height -ne 768 -or
            $ui.Actions.dashboard.Top -ge $ui.Actions.logs.Top -or
            $ui.Actions.logs.Top -ge $ui.Actions.context.Top -or
            $ui.Actions.context.Top -ge $ui.Actions.settings.Top -or
            $ui.Rows.service.Dot.Font.Size -lt 13 -or
            $ui.Rows.service.Title.Font.Size -lt 13 -or
            $ui.Card.Height -lt 150 -or
            $ui.Assets.Count -ne 10 -or
            $ui.Actions.dashboard.Tag -isnot [Drawing.Image] -or
            $ui.StartAll.Tag -isnot [Drawing.Image] -or
            $ui.CardIcon.Image -isnot [Drawing.Image]) {
            throw 'Approved popup visual hierarchy, spacing or icon order differs'
        }
        foreach ($action in $ui.Actions.Values) {
            if ($action.Tag -isnot [Drawing.Image]) {
                throw 'Native action uses a font glyph instead of an approved image asset'
            }
        }
        if ($ui.ModelCombo.DropDownStyle -ne [Windows.Forms.ComboBoxStyle]::DropDownList) {
            throw 'Modelos locais devem usar uma lista de seleção, não texto arbitrário'
        }
        if ($ui.ModelCombo.Top -ne $ui.Rows.model.Value.Top -or
            $ui.ModelCombo.Left -ne $ui.Rows.model.Value.Left -or
            $ui.ModelCombo.Width -ne $ui.Rows.model.Value.Width -or
            $ui.ModelCombo.Top -le $ui.Rows.ollama.Value.Bottom) {
            throw 'Model dropdown is not aligned to the Modelo padrão row'
        }
        Resize-LaoPopupContents $ui 340
        if ($ui.ModelCombo.Top -ne $ui.Rows.model.Value.Top -or
            $ui.ModelCombo.Left -ne $ui.Rows.model.Value.Left -or
            $ui.ModelCombo.Right -gt 340) {
            throw 'Model dropdown overlaps another row or overflows compact popup'
        }
        Resize-LaoPopupContents $ui 420
        foreach ($state in @('active','offline','review','idle')) {
            $fixtureReasons=switch($state){
                active {@()}
                review {@()}
                offline {@('devspace_unverified','ollama_unavailable')}
                default {@('devspace_unverified')}
            }
            $snapshot = [pscustomobject]@{
                status=$state; statusAuthenticated=$true
                reasons=$fixtureReasons
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
                 $ui.CardTitle.Text -ne (Get-LaoUiText 'AwaitingReview') -or
                 $ui.Actions.context.Tag -ne $ui.Assets['revisao'] -or
                 $ui.CardIcon.Image -ne $ui.Assets['documento-amarelo'] -or
                 $ui.Rows.last.Title.Text -ne (Get-LaoUiText 'Pending'))) {
                throw 'Review popup did not expose its approval context'
            }
            if ($state -eq 'offline' -and
                $ui.CardIcon.Image -ne $ui.Assets['documento-vermelho']) {
                throw 'Offline popup must use the approved red document asset'
            }
            if ($state -ne 'review' -and $ui.Actions.context.Enabled) {
                throw 'Uninstalled service control must remain disabled'
            }
        }
        $restartSnapshot=[pscustomobject]@{
            status='active';statusAuthenticated=$true;restartAvailable=$true
            reasons=@();modelConfigured='teste';activeTasks=0;pendingReviews=0
            tasksAuthenticated=$true
        }
        Update-LaoPopup $ui $restartSnapshot
        if (-not $ui.Actions.context.Enabled -or
            $ui.Actions.context.Tag -ne $ui.Assets['reiniciar'] -or
            $ui.Actions.context.Text -ne (Get-LaoUiText 'RestartLao')) {
            throw 'Available LAO-only restart must be enabled on native monitor'
        }
        $ui.Form.ClientSize=[Drawing.Size]::new(340,580)
        Resize-LaoPopupContents $ui 340
        foreach ($row in $ui.Rows.Values) {
            if ($row.Title.Right + 6 -gt $row.Value.Left -or $row.Value.Right -gt 340) {
                throw 'Narrow popup width overlaps health row labels'
            }
        }
        if ($ui.HeaderText.Right -ge $ui.StartAll.Left) {
            throw 'Narrow popup header overlaps start button'
        }
        $ui.Form.ClientSize=[Drawing.Size]::new(420,768)
        Resize-LaoPopupContents $ui 420
        if ($ui.Freshness.Bottom -gt $ui.Form.ClientSize.Height-96-2) {
            throw 'Native popup footer is clipped at reference height'
        }
        $uiSamples=[ordered]@{
            startAll=$ui.StartAll.AccessibleName
            model=$ui.Rows.model.Title.Text
            last=$ui.Rows.last.Title.Text
            statusDot=$ui.HeaderDot.Text
            dashboardAction=$ui.Actions.dashboard.Text
            restartAction=$ui.Actions.context.Text
        }
        $idleSnapshot=[pscustomobject]@{
            status='idle';statusAuthenticated=$true;restartAvailable=$false
            reasons=@('devspace_unverified')
            modelConfigured='teste';activeTasks=0;pendingReviews=0
            tasksAuthenticated=$true
        }
        Update-LaoPopup $ui $idleSnapshot
        $uiSamples.idleHeading=$ui.HeaderText.Text
        # Base64 UTF-8 avoids the Windows PowerShell 5.1 OEM console encoding
        # masking or introducing mojibake in the test runner's stdout.
        $uiTextJson=ConvertTo-Json -InputObject $uiSamples -Compress
        $uiTextBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($uiTextJson))
        [pscustomobject]@{
            validated=$true
            widthDip=$ui.Form.ClientSize.Width
            healthRows=$ui.Rows.Count
            actions=$ui.Actions.Count
            keyboardEscape=$ui.Form.KeyPreview
            lastHeader=$ui.HeaderText.Text
            fontFamily=$ui.HeaderText.Font.FontFamily.Name
            uiTextBase64=$uiTextBase64
        } | ConvertTo-Json -Compress
    } finally {
        $settingsUi.Form.Dispose()
        $ui.Logo.Image.Dispose()
        $ui.Form.Dispose()
        foreach ($asset in $ui.Assets.Values) { $asset.Dispose() }
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
$openItem = $menu.Items.Add((Get-LaoUiText 'TrayOpen'))
$stateItem = $menu.Items.Add((Get-LaoUiText 'TrayStatus')+': offline')
$stateItem.Enabled = $false
$tasksItem = $menu.Items.Add((Get-LaoUiText 'TrayTasks')+': '+(Get-LaoUiText 'WaitingQuery'))
$tasksItem.Enabled = $false
$copyItem = $menu.Items.Add((Get-LaoUiText 'TrayCopy'))
$quitItem = $menu.Items.Add((Get-LaoUiText 'TrayExit'))
$notify.ContextMenuStrip = $menu
$context = [Windows.Forms.ApplicationContext]::new()
$timer = [Windows.Forms.Timer]::new()
$timer.Interval = 200
[void](Initialize-LaoComponentVersions)
$script:runningMonitorVersion=[string]$script:componentVersions['LAO']
$script:versionRefreshTicks=0
$script:selfRestartRequested=$false
$script:initialized = $false
$script:previousStatus = 'offline'
$script:previousReviews = 0
$script:previousTasksAuthenticated = $false
$script:previousResourceWarnings = @()
$script:previousCompletedTaskIds = @()
$script:previousFailedTaskIds = @()
$script:pollStage = 'none'
$script:pollTask = $null
$script:nextPollAt = [DateTime]::MinValue
$script:pollSnapshot = $null
$script:asyncResult = $null
$script:uiHeartbeatTicks = 0
$script:launchTask = $null
$script:launchTarget = $null
$script:restartTask = $null
$script:modelListTask = $null
$script:modelSaveTask = $null
$script:modelSaveContent = $null
$script:modelChanging = $false
$script:settingsWindow = $null

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
        resourceWarnings = @()
        completedTaskIds = @()
        failedTaskIds = @()
        lastTaskModel = $null
        lastTaskId = $null
        lastTaskPhase = $null
        restartAvailable = $false
        laoRunningVersion = $null
        laoInstalledVersion = $null
        laoUpdateAvailable = $false
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
            $script:pollStage = 'version'
            $script:pollTask = $publicClient.GetStringAsync($script:baseUrl + '/health/version')
        }
        'version' {
            if ($null -ne $payload -and $payload.installedVersion -is [string] -and
                $payload.installedVersion -match '^\d+\.\d+\.\d+') {
                $script:pollSnapshot.laoRunningVersion=[string]$payload.runningVersion
                $script:pollSnapshot.laoInstalledVersion=[string]$payload.installedVersion
                $script:pollSnapshot.laoUpdateAvailable=($payload.updateAvailable -eq $true)
                $script:componentVersions['LAO']=[string]$payload.installedVersion
                if (-not $AsyncProbeOnly -and -not $script:selfRestartRequested -and
                    $script:runningMonitorVersion -and
                    [string]$payload.installedVersion -ne $script:runningMonitorVersion) {
                    $script:selfRestartRequested=$true
                    if ($script:popup) { Update-LaoPopup $script:popup $script:pollSnapshot }
                    $context.ExitThread()
                    return
                }
            }
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
                $script:pollSnapshot.restartAvailable = ($payload.restartAvailable -eq $true)
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
            if ($null -ne $payload -and $null -ne $payload.alerts -and
                $payload.alerts.advisoryOnly -eq $true -and
                $payload.alerts.warnings -is [array]) {
                $script:pollSnapshot.resourceWarnings = @($payload.alerts.warnings | Where-Object {
                    $_ -in @('cpu_pressure','ram_pressure','vram_pressure')
                })
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
                $script:pollSnapshot.completedTaskIds = @($payload.tasks | Where-Object {
                    $_.status -eq 'completed' -and [string]$_.id -match '^[a-fA-F0-9-]{36}$'
                } | ForEach-Object { [string]$_.id })
                $script:pollSnapshot.failedTaskIds = @($payload.tasks | Where-Object {
                    $_.status -eq 'failed' -and [string]$_.id -match '^[a-fA-F0-9-]{36}$'
                } | ForEach-Object { [string]$_.id })
                $latest = @($payload.tasks | Where-Object {
                    $_.status -in @('running','validating','preparing')
                } | Select-Object -First 1)
                if ($latest.Count -gt 0) {
                    $script:pollSnapshot.lastTaskModel = [string]$latest[0].model
                    $script:pollSnapshot.lastTaskId = [string]$latest[0].id
                    $script:pollSnapshot.lastTaskPhase = [string]$latest[0].status
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
        $aggregate=Get-LaoAggregateUiState $snapshot
        $displayStatus=[string]$aggregate.Status
        $displayLabel=[string]$aggregate.Label
        $script:trayStatus = $displayStatus
        if ($script:popup) { Update-LaoPopup $script:popup $snapshot }
        if ($script:popup) { Update-LaoDependencyRowActions $snapshot }
        $script:lastCheck = Get-Date
        $notify.Icon = $icons[$displayStatus]
        $stateItem.Text = (Get-LaoUiText 'TrayStatus')+": $displayLabel"
        $notify.Text = "LAO DevSpace - $displayLabel"
        if ($snapshot.tasksAuthenticated) {
            $tasksItem.Text = (Get-LaoUiText 'TrayTasks')+": $($snapshot.activeTasks) $(Get-LaoUiText 'Running'); $($snapshot.pendingReviews) $(Get-LaoUiText 'ReviewShort')"
        } else {
            $tasksItem.Text = (Get-LaoUiText 'TrayTasks')+': '+(Get-LaoUiText 'TrayUnauth')
        }
        if ($EnableNotifications -and -not $AsyncProbeOnly -and $script:initialized) {
            $newReviews = if ($null -eq $snapshot.pendingReviews) { 0 } else { [int]$snapshot.pendingReviews }
            if ($script:previousStatus -ne 'offline' -and $displayStatus -eq 'offline') {
                $notify.BalloonTipTitle = 'LAO DevSpace indisponivel'
                $notify.BalloonTipText = 'O daemon local parou de responder.'
                $notify.ShowBalloonTip(5000)
            } else {
                $messages = New-Object System.Collections.Generic.List[string]
                if ($script:previousTasksAuthenticated -and $snapshot.tasksAuthenticated -and
                    $newReviews -gt $script:previousReviews -and $newReviews -gt 0) {
                    $messages.Add('Ha tarefas aguardando revisao no painel.')
                }
                $newPressure = @($snapshot.resourceWarnings | Where-Object {
                    $_ -notin $script:previousResourceWarnings
                })
                if ($newPressure.Count -gt 0) {
                    $labels = @{
                        cpu_pressure='CPU'; ram_pressure='RAM'; vram_pressure='VRAM'
                    }
                    $names = @($newPressure | ForEach-Object { $labels[$_] }) -join ', '
                    $messages.Add('Pressao confirmada de recursos: ' + $names + '.')
                }
                if ($script:previousTasksAuthenticated -and $snapshot.tasksAuthenticated) {
                    $newCompleted = @($snapshot.completedTaskIds | Where-Object {
                        $_ -notin $script:previousCompletedTaskIds
                    })
                    $newFailed = @($snapshot.failedTaskIds | Where-Object {
                        $_ -notin $script:previousFailedTaskIds
                    })
                    if ($newCompleted.Count -eq 1) {
                        $messages.Add('Uma tarefa foi concluida. Consulte o painel para revisar o resultado.')
                    } elseif ($newCompleted.Count -gt 1) {
                        $messages.Add([string]$newCompleted.Count + ' tarefas foram concluidas. Consulte o painel.')
                    }
                    if ($newFailed.Count -eq 1) {
                        $messages.Add('Uma tarefa falhou. Consulte o painel para o diagnostico.')
                    } elseif ($newFailed.Count -gt 1) {
                        $messages.Add([string]$newFailed.Count + ' tarefas falharam. Consulte o painel.')
                    }
                }
                if ($messages.Count -gt 0) {
                    $notify.BalloonTipTitle = 'LAO DevSpace: atencao'
                    $notify.BalloonTipText = ($messages -join ' ')
                    $notify.ShowBalloonTip(5000)
                }
            }
        }
        $script:initialized = $true
        $script:previousStatus = $displayStatus
        $script:previousReviews = if ($null -eq $snapshot.pendingReviews) { 0 } else { [int]$snapshot.pendingReviews }
        $script:previousTasksAuthenticated = $snapshot.tasksAuthenticated
        $script:previousResourceWarnings = @($snapshot.resourceWarnings)
        $script:previousCompletedTaskIds = @($snapshot.completedTaskIds)
        $script:previousFailedTaskIds = @($snapshot.failedTaskIds)
}

function Update-LaoTrayLanguage {
    $openItem.Text=Get-LaoUiText 'TrayOpen'
    $copyItem.Text=Get-LaoUiText 'TrayCopy'
    $quitItem.Text=Get-LaoUiText 'TrayExit'
    if($script:popup){Apply-LaoPopupLanguage $script:popup}
    if($script:pollSnapshot){
        Update-LaoTray $script:pollSnapshot
    }else{
        $stateItem.Text=(Get-LaoUiText 'TrayStatus')+': offline'
        $tasksItem.Text=(Get-LaoUiText 'TrayTasks')+': '+(Get-LaoUiText 'WaitingQuery')
    }
}

function Open-LaoDashboard([string]$section = '') {
    $destination = $script:baseUrl + '/dashboard' + $section
    if (-not $script:dashboardToken) {
        # The dashboard will offer normal manual login.
        Start-Process $destination | Out-Null
        return
    }
    if ($script:launchTask) { return }
    $script:launchTarget = $destination
    try {
        # Non-blocking one-use session grant. Never place a credential in the URL.
        $script:launchTask = $privateClient.PostAsync(
            $script:baseUrl + '/dashboard/api/session/arm', [Net.Http.HttpContent]$null)
    } catch {
        $script:launchTask = $null
        Start-Process $destination | Out-Null
    }
}
function Open-LaoSettings {
    if ($script:settingsWindow -and !$script:settingsWindow.Form.IsDisposed) {
        $script:settingsWindow.Form.Activate()
        return
    }
    $script:settingsWindow=New-LaoSettingsForm $script:popup.Assets { $script:pollSnapshot }
    $script:settingsWindow.Form.Add_FormClosed({$this.Dispose()})
    $script:settingsWindow.Form.Show()
}

function Update-LaoDependencyRowActions($snapshot) {
    if (-not $script:popup) { return }
    foreach ($key in @('service','mcp','ollama')) {
        $kind=switch($key){service{'LAO'};mcp{'DevSpace'};ollama{'Ollama'}}
        $row=$script:popup.Rows[$key]
        $starting=$script:localStarts.ContainsKey($kind)
        $recovery=if($kind -ne 'LAO'){Get-LaoDependencyRecoveryAction $kind $snapshot}else{$null}
        $row.Start.Visible=$starting -or (Test-LaoLocalStartAvailable $kind $snapshot) -or $null -ne $recovery
        $row.Start.AccessibleName=$(if($recovery -and $recovery.Operation -eq 'Restart'){(Get-LaoUiText 'Restart')+' '+$kind}else{(Get-LaoUiText 'Start')+' '+$kind})
        $row.Start.Enabled=-not $starting
        if ($starting) { $row.Value.Text=Get-LaoUiText 'Starting' }
    }
    Resize-LaoPopupContents $script:popup $script:popup.Form.ClientSize.Width
    if ($snapshot.status -eq 'offline') {
        $script:popup.Actions.context.Enabled=-not $script:localStarts.ContainsKey('LAO')
        $script:popup.Actions.context.Text=$(if($script:localStarts.ContainsKey('LAO')){Get-LaoUiText 'StartingLao'}else{(Get-LaoUiText 'Start')+' LAO'})
    }
    foreach ($key in @('ollama','mcp')) {
        $kind=if ($key -eq 'ollama') {'Ollama'} else {'DevSpace'}
        $row=$script:popup.Rows[$key]
        $action=Get-LaoDependencyRecoveryAction $kind $snapshot
        $cursor=if ($action) {[Windows.Forms.Cursors]::Hand}else{[Windows.Forms.Cursors]::Default}
        foreach ($part in @($row.Title,$row.Value,$row.Dot)) {
            $part.Cursor=$cursor
            $part.AccessibleDescription=$(if ($action) {
                (Get-LaoUiText 'ServiceFaultDesc') -f $kind
            } else { Get-LaoUiText 'StatusOnlyDesc' })
        }
        # Only error states gain a recovery affordance. Healthy/unverified
        # rows retain the exact typography and text of the approved design.
        if ($action) {
            $row.Value.Text=$(if ($action.Operation -eq 'Start') {
                'Parado · Iniciar'
            } else {
                'Offline · Reiniciar'
            })
            $row.Value.ForeColor=$script:popup.Colors.red
        }
    }
}

function Invoke-LaoDependencyRowClick([string]$Kind) {
    if (-not $script:pollSnapshot) { return }
    # No side effect at all on healthy, unverified or unmanaged lines.
    if (-not (Get-LaoDependencyRecoveryAction $Kind $script:pollSnapshot)) { return }
    [void](Invoke-LaoDependencyRecovery $Kind $script:pollSnapshot)
    $script:nextPollAt=[DateTime]::MinValue
}

function Open-LaoModelCombo {
    if (-not $script:popup -or -not $script:dashboardToken -or
        $script:modelListTask -or $script:modelSaveTask) { return }
    $script:popup.ModelCombo.Visible=$true
    $script:popup.ModelCombo.Enabled=$false
    $script:popup.ModelCombo.Items.Clear()
    $script:popup.ModelCombo.Items.Add('Consultando modelos locais…') | Out-Null
    $script:popup.ModelCombo.SelectedIndex=0
    $script:modelChanging=$true
    try {
        $script:modelListTask=$privateClient.GetStringAsync(
            $script:baseUrl + '/dashboard/api/models')
    } catch {
        $script:popup.ModelCombo.Visible=$false
    }
}

$timer.Add_Tick({
    Update-LaoLocalStarts
    if ($script:popup -and $script:pollSnapshot) { Update-LaoDependencyRowActions $script:pollSnapshot }
    $script:uiHeartbeatTicks++
    $script:versionRefreshTicks++
    if (($script:versionRefreshTicks % 150) -eq 0) {
        foreach ($kind in @('DevSpace','Ollama')) { [void](Update-LaoComponentVersion $kind) }
        if ($script:popup -and $script:pollSnapshot) { Update-LaoPopup $script:popup $script:pollSnapshot }
    }
    if ($script:modelListTask -and $script:modelListTask.IsCompleted) {
        $task=$script:modelListTask
        $script:modelListTask=$null
        try {
            $models=$task.GetAwaiter().GetResult() | ConvertFrom-Json
            $names=@($models.models | Where-Object {
                $_ -is [string] -and $_.Length -gt 0 -and $_.Length -le 200
            })
            $script:popup.ModelCombo.Items.Clear()
            foreach ($name in $names) {
                $script:popup.ModelCombo.Items.Add([string]$name) | Out-Null
            }
            if ($names.Count -eq 0) { throw 'LAO_NO_LOCAL_MODELS' }
            $script:popup.ModelCombo.Enabled=$true
            if ($names -contains $models.selected) {
                $script:popup.ModelCombo.SelectedItem=[string]$models.selected
            } else {
                $script:popup.ModelCombo.SelectedIndex=-1
            }
            $script:modelChanging=$false
            $script:popup.ModelCombo.DroppedDown=$true
            $script:popup.ModelCombo.Focus()
        } catch {
            $script:popup.ModelCombo.Visible=$false
            $script:modelChanging=$false
            $message=if ($_.Exception.Message -eq 'LAO_NO_LOCAL_MODELS') {
                Get-LaoUiText 'NoLocalModelsFound'
            } else { Get-LaoUiText 'LocalModelsQueryFailed' }
            [Windows.Forms.MessageBox]::Show(
                $message,(Get-LaoUiText 'LocalModelsTitle')) | Out-Null
        }
    }
    if ($script:modelSaveTask -and $script:modelSaveTask.IsCompleted) {
        $task=$script:modelSaveTask
        $script:modelSaveTask=$null
        try {
            $response=$task.GetAwaiter().GetResult()
            $ok=$response.IsSuccessStatusCode
            $response.Dispose()
            if ($script:modelSaveContent) {
                $script:modelSaveContent.Dispose()
                $script:modelSaveContent=$null
            }
            if (-not $ok) { throw 'Seleção recusada pelo LAO' }
            $script:nextPollAt=[DateTime]::MinValue
        } catch {
            [Windows.Forms.MessageBox]::Show(
                'Não foi possível salvar o modelo selecionado.',
                'Modelos locais LAO') | Out-Null
        }
    }
    if ($script:restartTask -and $script:restartTask.IsCompleted) {
        $task=$script:restartTask
        $script:restartTask=$null
        try {
            $response=$task.GetAwaiter().GetResult()
            $ok=([int]$response.StatusCode -eq 202)
            $response.Dispose()
            if ($script:popup) {
                $script:popup.CardDetails.Text=$(if($ok){
                    'Reinício do LAO solicitado. Aguardando reconexão.'
                }else{'Reinício recusado pelo LAO; confira o Dashboard.'})
            }
            if ($ok) { $script:nextPollAt=[DateTime]::MinValue }
        } catch {
            if ($script:popup) {
                $script:popup.CardDetails.Text='Falha ao solicitar reinício. Confira o Dashboard.'
            }
        }
    }
    if ($script:launchTask -and $script:launchTask.IsCompleted) {
        $launch = $script:launchTask
        $script:launchTask = $null
        try {
            $reply = $launch.GetAwaiter().GetResult()
            $reply.Dispose()
        } catch { }
        # Whether the grant succeeds or fails, open the dashboard; manual login
        # remains available when the daemon is offline or running an older build.
        try { Start-Process $script:launchTarget | Out-Null } catch { }
        $script:launchTarget = $null
    }
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
    Open-LaoDashboard
})
if ($script:popup) {
    foreach ($key in @('service','mcp','ollama')) {
        $button=$script:popup.Rows[$key].Start
        $button.Tag=switch($key){service{'LAO'};mcp{'DevSpace'};ollama{'Ollama'}}
        $button.Add_Click({ Invoke-LaoComponentAction ([string]$this.Tag) })
    }
    foreach ($field in @('Title','Value')) {
        $script:popup.Rows.model[$field].Add_Click({ Open-LaoModelCombo })
    }
    $script:popup.ModelCombo.Add_SelectedIndexChanged({
        if ($script:modelChanging -or !$this.Enabled -or $script:modelSaveTask) { return }
        $name=[string]$this.SelectedItem
        if (!$name -or $name -eq [string]$script:pollSnapshot.modelConfigured) {
            $this.Visible=$false
            return
        }
        $this.Visible=$false
        $content=[Net.Http.StringContent]::new(
            '{"model":'+(ConvertTo-Json -InputObject $name -Compress)+'}',
            [Text.Encoding]::UTF8,'application/json')
        try {
            $script:modelSaveContent=$content
            $script:modelSaveTask=$privateClient.PostAsync(
                $script:baseUrl + '/dashboard/api/models/select',$content)
        } catch {
            $content.Dispose()
            $script:modelSaveContent=$null
            [Windows.Forms.MessageBox]::Show('Falha ao enviar a escolha do modelo.','LAO DevSpace') | Out-Null
        }
    })
    foreach ($key in @('mcp','ollama')) {
        $kind=if($key -eq 'ollama'){'Ollama'}else{'DevSpace'}
        foreach ($field in @('Title','Value','Dot')) {
            $control=$script:popup.Rows[$key][$field]
            $control.Tag=$kind
            $control.Cursor=[Windows.Forms.Cursors]::Default
            $control.Add_Click({ Invoke-LaoDependencyRowClick ([string]$this.Tag) })
        }
    }
    $notify.Add_MouseClick({
        if ($_.Button -eq [Windows.Forms.MouseButtons]::Left) {
            Toggle-LaoPopup $script:popup
        }
    })
    $script:popup.Actions.dashboard.Add_Click({
        $script:popup.Form.Hide()
        Open-LaoDashboard
    })
    $script:popup.Actions.context.Add_Click({
        if ($script:pollSnapshot.status -eq 'offline') {
            Invoke-LaoLocalStart LAO
            return
        }
        $reviews=if($null -eq $script:pollSnapshot.pendingReviews){0}else{[int]$script:pollSnapshot.pendingReviews}
        $active=if($null -eq $script:pollSnapshot.activeTasks){0}else{[int]$script:pollSnapshot.activeTasks}
        $canRestart=($reviews -eq 0 -and $active -eq 0 -and
            $script:pollSnapshot.statusAuthenticated -and
            $script:pollSnapshot.restartAvailable -eq $true)
        if ($canRestart) {
            if (-not $script:popup.Actions.context.Enabled -or
                -not $script:dashboardToken -or $script:restartTask) { return }
            $choice=[Windows.Forms.MessageBox]::Show(
                (Get-LaoUiText 'ConfirmRestartLao'),
                (Get-LaoUiText 'ConfirmRestartLaoTitle'),
                [Windows.Forms.MessageBoxButtons]::YesNo,
                [Windows.Forms.MessageBoxIcon]::Question)
            if ($choice -ne [Windows.Forms.DialogResult]::Yes) { return }
            $script:popup.Actions.context.Enabled=$false
            $script:popup.Actions.context.Text=Get-LaoUiText 'RestartingLao'
            try {
                $script:restartTask=$privateClient.PostAsync(
                    $script:baseUrl + '/dashboard/api/restart', [Net.Http.HttpContent]$null)
            } catch {
                $script:popup.CardDetails.Text=Get-LaoUiText 'RestartLaoFailed'
            }
            return
        }
        $script:popup.Form.Hide()
        if ($reviews -gt 0) {
            Open-LaoDashboard '#tarefas'
        }
    })
    $script:popup.Actions.logs.Add_Click({
        $script:popup.Form.Hide()
        Open-LaoDashboard '#logs'
    })
    $script:popup.Actions.settings.Add_Click({
        $script:popup.Form.Hide()
        Open-LaoSettings
    })
    $script:popup.StartAll.Add_Click({ Invoke-LaoStartAllComponents })
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
        foreach ($asset in $script:popup.Assets.Values) { $asset.Dispose() }
    }
    $timer.Dispose()
    $publicClient.CancelPendingRequests()
    $privateClient.CancelPendingRequests()
    $publicClient.Dispose()
    $privateClient.Dispose()
    if ($script:modelSaveContent) { $script:modelSaveContent.Dispose() }
    $notify.Dispose()
    $menu.Dispose()
    $context.Dispose()
    foreach ($icon in $icons.Values) { $icon.Dispose() }
    if ($mutex) {
        try { $mutex.ReleaseMutex() } catch { }
        $mutex.Dispose()
    }
}
if ($script:selfRestartRequested -and -not $AsyncProbeOnly) {
    $launcher=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\scripts\launch-lao-monitor.ps1'))
    if ([IO.File]::Exists($launcher)) {
        try {
            Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
                '-NoProfile','-ExecutionPolicy','Bypass','-File',$launcher,'-Port',[string]$Port
            ) | Out-Null
        } catch { }
    }
}
if ($AsyncProbeOnly) {
    $script:asyncResult | Add-Member -NotePropertyName uiHeartbeatTicks -NotePropertyValue $script:uiHeartbeatTicks
    $script:asyncResult | ConvertTo-Json -Compress
}
