# Per-user Startup folder ONLY: explicit switch managed in the native LAO UI.
# Not a Windows Service, scheduled task, registry Run key or system-wide action.
function Get-LaoTrayStartupShortcut([string]$Directory=[Environment]::GetFolderPath('Startup')) {
    if (![IO.Directory]::Exists($Directory)) { throw 'Pasta de inicialização Windows indisponível' }
    return Join-Path $Directory 'LAO DevSpace Monitor.lnk'
}
function Get-LaoDaemonStartupShortcut([string]$Directory=[Environment]::GetFolderPath('Startup')) {
    if (![IO.Directory]::Exists($Directory)) { throw 'Pasta de inicialização Windows indisponível' }
    return Join-Path $Directory 'LAO DevSpace Daemon.lnk'
}
function Test-LaoOwnedStartupShortcut([string]$Path,[string]$ScriptPath) {
    if (-not [IO.File]::Exists($Path)) { return $false }
    $shell=New-Object -ComObject WScript.Shell
    try {
        $link=$shell.CreateShortcut($Path)
        $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $args='-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$ScriptPath+'"'
        return ($link.Arguments -ceq $args -and
                $link.TargetPath -ieq $powershell)
    } finally {
        [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
    }
}
function Get-LaoTrayAutostart([string]$Directory=[Environment]::GetFolderPath('Startup')) {
    $tray=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\scripts\launch-lao-monitor.ps1'))
    $daemon=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\scripts\launch-lao-daemon.ps1'))
    return ((Test-LaoOwnedStartupShortcut (Get-LaoTrayStartupShortcut $Directory) $tray) -and
            (Test-LaoOwnedStartupShortcut (Get-LaoDaemonStartupShortcut $Directory) $daemon))
}
function Set-LaoTrayAutostart([bool]$Enabled,[string]$Directory=[Environment]::GetFolderPath('Startup')) {
    $pair=@(
        @((Get-LaoTrayStartupShortcut $Directory),'launch-lao-monitor.ps1','lao-tray-idle.ico'),
        @((Get-LaoDaemonStartupShortcut $Directory),'launch-lao-daemon.ps1','lao-tray-idle.ico')
    )
    foreach($entry in $pair) {
        $path=[string]$entry[0]
        $launcher=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('..\..\..\scripts\'+$entry[1])))
        if ((Test-Path -LiteralPath $path) -and
            -not (Test-LaoOwnedStartupShortcut $path $launcher)) {
            throw 'Não é seguro substituir o atalho existente de outro aplicativo.'
        }
    }
    if (-not $Enabled) {
        foreach($entry in $pair) {
            Remove-Item -LiteralPath ([string]$entry[0]) -Force -ErrorAction SilentlyContinue
        }
        return
    }
    $icon=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\docs\lao-devspace\assets\icons\ico\lao-tray-idle.ico'))
    if (-not [IO.File]::Exists($icon)) {
        throw 'Atalho de inicialização LAO indisponível.'
    }
    $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shell=New-Object -ComObject WScript.Shell
    try {
        foreach($entry in $pair) {
            $path=[string]$entry[0]
            $launcher=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('..\..\..\scripts\'+$entry[1])))
            if (-not [IO.File]::Exists($launcher)) { throw 'Launcher LAO indisponível' }
            $link=$shell.CreateShortcut($path)
            $link.TargetPath=$powershell
            $link.Arguments='-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$launcher+'"'
            $link.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
            $link.IconLocation=$icon+',0'
            $link.Description='Iniciar LAO DevSpace ao entrar no Windows'
            $link.WindowStyle=7
            $link.Save()
        }
    } finally {
        [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
    }
}
