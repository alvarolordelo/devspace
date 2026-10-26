# LAO DevSpace tray - Windows, foreground and entirely opt-in.
# Launch manually with: powershell.exe -NoProfile -STA -File <this script>
# Exit closes ONLY the tray monitor, not the LAO daemon, DevSpace or Ollama.
[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = 7877,
    [switch]$CheckOnly
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
$copyItem = $menu.Items.Add('Copiar diagnostico')
$quitItem = $menu.Items.Add('Sair do monitor')
$notify.ContextMenuStrip = $menu
$context = [Windows.Forms.ApplicationContext]::new()
$timer = [Windows.Forms.Timer]::new()
$timer.Interval = 15000

function Update-LaoTray {
    if ($script:checking) { return }
    $script:checking = $true
    try {
        $live = $false
        try {
            $response = Invoke-RestMethod -Method Get -Uri ($script:baseUrl + '/health/live') -TimeoutSec 2
            $live = ($response.live -eq $true)
        } catch { $live = $false }
        $status = 'offline'
        if ($live) {
            $status = 'idle'
            try {
                $ready = Invoke-RestMethod -Method Get -Uri ($script:baseUrl + '/health/ready') -TimeoutSec 3
                if ($ready.ready -eq $true) { $status = 'active' }
            } catch { }
        }
        $script:trayStatus = $status
        $script:lastCheck = Get-Date
        $notify.Icon = $icons[$status]
        $stateItem.Text = "Status: $status"
        $notify.Text = "LAO DevSpace - $status"
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
