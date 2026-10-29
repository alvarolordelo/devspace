# LAO tray launcher: auto-boot missing components on launch, without
# installing a service or enabling Windows startup. The native settings
# switch controls whether Windows invokes this launcher at sign-in.
# The local token is read only into this process environment, never into argv.
[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 7877)
$ErrorActionPreference = 'Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tokenFile = Join-Path $env:LOCALAPPDATA 'LAODevSpace\dashboard-token.txt'
if (Test-Path -LiteralPath $tokenFile -PathType Leaf) {
    $token = [IO.File]::ReadAllText($tokenFile).Trim()
    if ($token -cnotmatch '^[\x21-\x7e]{32,256}$') {
        throw 'Invalid local LAO dashboard credential'
    }
    $env:LAO_DASHBOARD_TOKEN = $token
}
$daemonPortListening=[bool]([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().
    GetActiveTcpListeners() | Where-Object {$_.Port -eq $Port} | Select-Object -First 1)
if (-not $daemonPortListening) {
    # Launch the LAO daemon without blocking the native monitor. The daemon
    # launcher performs the dependency bootstrap under a cross-process mutex.
    $daemon=Join-Path $root 'scripts\launch-lao-daemon.ps1'
    $powershell=Join-Path $PSHOME 'powershell.exe'
    $argument='-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+
        $daemon+'" -Port '+$Port
    Start-Process -FilePath $powershell -ArgumentList $argument -WindowStyle Hidden | Out-Null
} else {
    # Manual tray launch must also recover missing dependencies when LAO is
    # already running. Existing listeners are never restarted or replaced.
    try { & (Join-Path $root 'scripts\lao-ensure-dependencies.ps1') -Start | Out-Null }
    catch { Write-Warning ('LAO bootstrap: '+$_.Exception.Message) }
}
& (Join-Path $PSScriptRoot '..\src\lao\windows\lao-tray.ps1') -Port $Port
