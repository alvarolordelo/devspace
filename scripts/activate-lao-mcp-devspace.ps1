[CmdletBinding()]
param(
    [ValidateRange(0,30)][int]$DelaySeconds = 0,
    [ValidateRange(1024,65535)][int]$Port = 7676,
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'LAO MCP activation requires Windows.' }

if ($DelaySeconds -gt 0) { Start-Sleep -Seconds $DelaySeconds }

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packagePath = Join-Path $root 'package.json'
$pinPath = Join-Path $root 'docs\lao-devspace\DEVSPACE_VERSION_PIN.json'
$entry = Join-Path $root 'bin\devspace.js'

foreach ($required in @($packagePath,$pinPath,$entry)) {
    if (-not [IO.File]::Exists($required)) { throw "Required integration file missing: $required" }
}
$package = [IO.File]::ReadAllText($packagePath) | ConvertFrom-Json
$pin = [IO.File]::ReadAllText($pinPath) | ConvertFrom-Json
if ($package.version -ne '1.0.8' -or $pin.version -ne '1.0.8') {
    throw 'DevSpace core must remain pinned at 1.0.8 before enabling LAO MCP tools.'
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
# Changes to DevSpace's state directory or managed worktree root invalidate
# existing LAO task-workspace IDs even if the separate LAO database survives.
# Fail closed before stopping the active listener.
Remove-Item Env:DEVSPACE_CONFIG_DIR -ErrorAction SilentlyContinue
$configModule = Join-Path $root 'dist\config.js'
if (-not [IO.File]::Exists($configModule)) { throw 'Build LAO before activating MCP.' }
$configUri = ([Uri]([IO.Path]::GetFullPath($configModule))).AbsoluteUri
$resolvedConfig = (& $node -e 'import(process.argv[1]).then(m=>{const c=m.loadConfig();console.log(JSON.stringify({stateDir:c.stateDir,worktreeRoot:c.worktreeRoot}))}).catch(e=>{console.error(e.message);process.exitCode=1})' $configUri | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($resolvedConfig)) {
    throw 'Could not verify the DevSpace persistent workspace configuration.'
}
$resolvedPaths = $resolvedConfig | ConvertFrom-Json
$stateMarkerDir = Join-Path $env:LOCALAPPDATA 'LAODevSpace'
[IO.Directory]::CreateDirectory($stateMarkerDir) | Out-Null
foreach ($entryPin in @(
    @{ Name = 'devspace-state-dir.txt'; Path = $resolvedPaths.stateDir },
    @{ Name = 'devspace-worktree-root.txt'; Path = $resolvedPaths.worktreeRoot }
)) {
    if ([string]::IsNullOrWhiteSpace($entryPin.Path)) {
        throw 'DevSpace workspace path is missing.'
    }
    $targetPath = [IO.Path]::GetFullPath([string]$entryPin.Path)
    $marker = Join-Path $stateMarkerDir $entryPin.Name
    if ([IO.File]::Exists($marker)) {
        $previous = [IO.File]::ReadAllText($marker).Trim()
        if ([IO.Path]::GetFullPath($previous) -ine $targetPath) {
            throw 'DevSpace workspace storage/worktree root has changed. Restore the previously pinned configuration before restarting.'
        }
    } else {
        [IO.File]::WriteAllText($marker, $targetPath)
    }
}
if ($VerifyOnly) {
    Write-Output "DevSpace workspace state pin verified: $($resolvedPaths.stateDir)"
    Write-Output "DevSpace managed worktree root pin verified: $($resolvedPaths.worktreeRoot)"
    return
}
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($listener) {
    $process = Get-Process -Id ([int]$listener.OwningProcess) -ErrorAction Stop
    if ([IO.Path]::GetFullPath([string]$process.Path) -ine [IO.Path]::GetFullPath($node)) {
        throw "Port $Port is not owned by the expected Node executable."
    }
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
    $deadline = (Get-Date).AddSeconds(15)
    do {
        $stillListening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if (-not $stillListening) { break }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    if ($stillListening) { throw "Port $Port did not close after stopping DevSpace." }
}

$env:DEVSPACE_LAO_ENABLED = 'true'
$env:DEVSPACE_LAO_STATE_DIR = Join-Path $env:LOCALAPPDATA 'LAODevSpace\state'

$logDir = Join-Path $env:LOCALAPPDATA 'LAODevSpace\logs'
[IO.Directory]::CreateDirectory($logDir) | Out-Null
$stdout = Join-Path $logDir 'DevSpace-integrated.log'
$stderr = Join-Path $logDir 'DevSpace-integrated.err.log'

$child = Start-Process $node -ArgumentList @($entry,'serve') -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

$deadline = (Get-Date).AddSeconds(45)
do {
    if ($child.HasExited) {
        throw "Integrated DevSpace exited with code $($child.ExitCode). See $stderr"
    }
    $ready = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -eq $child.Id } | Select-Object -First 1
    if ($ready) { break }
    Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)

if (-not $ready) {
    Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
    throw "Integrated DevSpace did not listen on port $Port within the startup window."
}

Write-Output "Integrated DevSpace MCP active on port $Port (PID $($child.Id)); LAO tools enabled."
