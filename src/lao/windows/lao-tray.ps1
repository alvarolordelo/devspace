# LAO DevSpace tray - Windows, foreground and entirely opt-in.
# Launch manually with: powershell.exe -NoProfile -STA -File <this script>
# Exit closes ONLY the tray monitor, not the LAO daemon, DevSpace or Ollama.
[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = 7877,
    [switch]$CheckOnly,
    [switch]$ProbeOnly,
    [switch]$EnableNotifications
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'LAO tray requires Windows' }
if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA) {
    throw 'Run the tray in STA mode: powershell.exe -NoProfile -STA -File ...'
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:trayStatus = 'offline'
$script:checking = $false
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
if ($CheckOnly) {
    foreach ($icon in $icons.Values) { $icon.Dispose() }
    Write-Output 'LAO tray check passed: Windows STA, WinForms and approved icons available.'
    return
}
if ($ProbeOnly) {
    $snapshot = Get-LaoTraySnapshot
    foreach ($icon in $icons.Values) { $icon.Dispose() }
    $snapshot | ConvertTo-Json -Compress
    return
}
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

$notify = [Windows.Forms.NotifyIcon]::new()
$notify.Icon = $icons['offline']
$notify.Text = 'LAO DevSpace - offline'
$notify.Visible = $true
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
$timer.Interval = 15000
$script:initialized = $false
$script:previousStatus = 'offline'
$script:previousReviews = 0
$script:previousTasksAuthenticated = $false

function Update-LaoTray {
    if ($script:checking) { return }
    $script:checking = $true
    try {
        $snapshot = Get-LaoTraySnapshot
        $script:trayStatus = $snapshot.status
        $script:lastCheck = Get-Date
        $notify.Icon = $icons[$snapshot.status]
        $stateItem.Text = "Status: $($snapshot.label)"
        $notify.Text = "LAO DevSpace - $($snapshot.label)"
        if ($snapshot.tasksAuthenticated) {
            $tasksItem.Text = "Tarefas: $($snapshot.activeTasks) executando; $($snapshot.pendingReviews) em revisao"
        } else {
            $tasksItem.Text = 'Tarefas: autenticacao nao configurada'
        }
        if ($EnableNotifications -and $script:initialized) {
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
    } finally { $script:checking = $false }
}

$timer.Add_Tick({ Update-LaoTray })
$openItem.Add_Click({
    Start-Process ($script:baseUrl + '/dashboard') | Out-Null
})
$notify.Add_DoubleClick({
    Start-Process ($script:baseUrl + '/dashboard') | Out-Null
})
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
    Update-LaoTray
    $timer.Start()
    [Windows.Forms.Application]::Run($context)
} finally {
    $timer.Stop()
    $notify.Visible = $false
    $timer.Dispose()
    $notify.Dispose()
    $menu.Dispose()
    $context.Dispose()
    foreach ($icon in $icons.Values) { $icon.Dispose() }
    try { $mutex.ReleaseMutex() } catch { }
    $mutex.Dispose()
}
