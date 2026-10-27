# Creates an explicit, reversible launcher for the interactive LAO tray.
# Does NOT install a service, create a scheduled task, or add Windows autostart.
[CmdletBinding()]
param(
    [switch]$Remove,
    [switch]$DesktopOnly,
    [string]$DestinationDirectory
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'LAO shortcuts require Windows.' }
if ($DestinationDirectory -and -not $DesktopOnly) {
    throw 'A custom shortcut directory requires -DesktopOnly.'
}

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $PSScriptRoot 'launch-lao-monitor.ps1'
$icon = Join-Path $root 'docs\lao-devspace\assets\icons\ico\lao-tray-idle.ico'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf) -or
    -not (Test-Path -LiteralPath $icon -PathType Leaf)) {
    throw 'LAO launcher or approved icon not found in this checkout.'
}
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $powershell -PathType Leaf)) {
    throw 'Windows PowerShell was not found.'
}
# The shortcut contains only a path to the launcher, never authentication data.
$arguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"'
$locations = @()
if ($DestinationDirectory) {
    $locations += $DestinationDirectory
} else {
    $locations += [Environment]::GetFolderPath('Desktop')
}
if (-not $DesktopOnly) {
    $locations += [Environment]::GetFolderPath('Programs')
}
$shell = New-Object -ComObject WScript.Shell
try {
    foreach ($directory in $locations) {
        if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
            if ($DestinationDirectory) {
                New-Item -ItemType Directory -Path $directory -Force | Out-Null
            } else {
                throw "Windows shortcut folder not available: $directory"
            }
        }
        $path = Join-Path $directory 'LAO DevSpace Monitor.lnk'
        if (Test-Path -LiteralPath $path) {
            $existing = $shell.CreateShortcut($path)
            # Do not replace or remove user-created shortcuts pointing elsewhere.
            if ($existing.TargetPath -ine $powershell -or $existing.Arguments -ine $arguments) {
                throw "Refusing to overwrite unrelated shortcut: $path"
            }
        }
        if ($Remove) {
            if (Test-Path -LiteralPath $path) {
                Remove-Item -LiteralPath $path -Force
                Write-Output "Removed LAO shortcut: $path"
            }
            continue
        }
        $shortcut = $shell.CreateShortcut($path)
        $shortcut.TargetPath = $powershell
        $shortcut.Arguments = $arguments
        $shortcut.WorkingDirectory = $root
        $shortcut.IconLocation = $icon + ',0'
        $shortcut.Description = 'Abrir o Monitor LAO DevSpace na bandeja do Windows'
        $shortcut.WindowStyle = 7
        $shortcut.Save()
        Write-Output "LAO shortcut ready: $path"
    }
} finally {
    [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
}
