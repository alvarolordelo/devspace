# Start the foreground LAO daemon. Missing dependencies are started on
# startup, without restarting healthy services or modifying Windows autostart.
# Keep the operator credential outside Git and outside the command line.
[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = 7877,
    [string]$StateDir
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'LAO local launcher requires Windows' }
$tokenFile = Join-Path $env:LOCALAPPDATA 'LAODevSpace\dashboard-token.txt'
if (-not (Test-Path -LiteralPath $tokenFile -PathType Leaf)) {
    throw 'LAO local token file is missing'
}
$token = [IO.File]::ReadAllText($tokenFile).Trim()
if ($token -cnotmatch '^[\x21-\x7e]{32,256}$') {
    throw 'Invalid local LAO dashboard credential'
}
if (-not $StateDir) {
    $StateDir = Join-Path $env:LOCALAPPDATA 'LAODevSpace\state'
}
if (-not [IO.Path]::IsPathRooted($StateDir)) {
    throw 'LAO state directory must be absolute'
}
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entry = Join-Path $root 'bin\devspace-laod.js'
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
    throw 'LAO executable not found'
}
$node = (Get-Command node.exe -ErrorAction Stop).Source
$mutexName='Local\LAODevSpace-Daemon-Startup-'+$Port
$startupMutex=[Threading.Mutex]::new($false,$mutexName)
$ownsStartupMutex=$false
try {
    try { $ownsStartupMutex=$startupMutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $ownsStartupMutex=$true }
    if (-not $ownsStartupMutex) {
        Write-Output 'LAO daemon launcher is already running; no duplicate launched.'
        return
    }
    # An occupied port is never a reason to terminate another process.
    $used=[Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().
        GetActiveTcpListeners() | Where-Object { $_.Port -eq $Port } | Select-Object -First 1
    if ($used) {
        Write-Output 'LAO daemon port is occupied; preserving the existing listener.'
        return
    }
    $bootstrap=Join-Path $root 'scripts\lao-ensure-dependencies.ps1'
    try {
        & $bootstrap -Start | ForEach-Object { Write-Output $_ }
    } catch {
        # A damaged/unavailable dependency must not prevent LAO itself from
        # starting and reporting which dependency is unavailable in /health.
        Write-Warning ('LAO bootstrap: '+$_.Exception.Message)
    }
$env:LAO_DASHBOARD_TOKEN = $token
$mcpTokenFile = Join-Path $env:LOCALAPPDATA 'LAODevSpace\devspace-mcp-token.txt'
if (-not $env:LAO_DEVSPACE_MCP_TOKEN_FILE -and
    (Test-Path -LiteralPath $mcpTokenFile -PathType Leaf)) {
    # A separately authorized OAuth access token; never reuse the dashboard token.
    $env:LAO_DEVSPACE_MCP_TOKEN_FILE = $mcpTokenFile
}
$env:DEVSPACE_LAO_ENABLED = 'true'
$env:DEVSPACE_LAO_PORT = [string]$Port
$env:DEVSPACE_LAO_STATE_DIR = [IO.Path]::GetFullPath($StateDir)
$env:LAO_RESTART_SUPERVISED = '1'
Push-Location -LiteralPath $root
try {
    $recentRestarts = New-Object System.Collections.Generic.List[datetime]
    do {
        & $node $entry
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 75) { break }
        $now = Get-Date
        $recentRestarts.Add($now)
        for ($i = $recentRestarts.Count - 1; $i -ge 0; $i--) {
            if (($now - $recentRestarts[$i]).TotalSeconds -gt 60) {
                $recentRestarts.RemoveAt($i)
            }
        }
        if ($recentRestarts.Count -gt 5) {
            throw 'LAO restart throttled: too many restarts in one minute'
        }
        Start-Sleep -Milliseconds 350
    } while ($true)
    if ($exitCode -ne 0) { throw "LAO daemon exited with code $exitCode" }
} finally {
    Pop-Location
}
} finally {
    if ($ownsStartupMutex) { $startupMutex.ReleaseMutex() }
    $startupMutex.Dispose()
}
