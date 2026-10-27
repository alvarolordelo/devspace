# Manual-only LAO tray launcher: no service installation or Windows startup changes.
# The local token is read only into this process environment, never into argv.
[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 7877)
$ErrorActionPreference = 'Stop'
$tokenFile = Join-Path $env:LOCALAPPDATA 'LAODevSpace\dashboard-token.txt'
if (Test-Path -LiteralPath $tokenFile -PathType Leaf) {
    $token = [IO.File]::ReadAllText($tokenFile).Trim()
    if ($token -cnotmatch '^[\x21-\x7e]{32,256}$') {
        throw 'Invalid local LAO dashboard credential'
    }
    $env:LAO_DASHBOARD_TOKEN = $token
}
& (Join-Path $PSScriptRoot '..\src\lao\windows\lao-tray.ps1') -Port $Port
