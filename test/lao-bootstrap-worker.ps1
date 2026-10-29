# Exercise the REAL detached PowerShell worker with a harmless local command.
# Uses an ephemeral port, never starts/stops DevSpace, Ollama or LAO.
$ErrorActionPreference='Stop'
$existing=$env:LOCALAPPDATA
$temp=Join-Path ([IO.Path]::GetTempPath()) ('lao-boot-worker-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp) | Out-Null
try {
    $env:LOCALAPPDATA=$temp
    . (Join-Path $PSScriptRoot '..\scripts\lao-ensure-dependencies.ps1') -LibraryOnly
    function Get-LaoLocalStartCommand([string]$Kind) {
        return 'Write-Output "LAO_BOOTSTRAP_WORKER_OK"'
    }
    $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
    $listener.Start()
    $port=([Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()
    $started=Start-LaoBootstrapDependency Ollama $port
    if($started.action -ne 'launched' -or $started.pid -le 0){throw 'No worker launched'}
    $done=$false
    for($i=0;$i -lt 70;$i++){
        $log=Get-ChildItem -LiteralPath (Join-Path $temp 'LAODevSpace\logs') -Filter 'bootstrap-Ollama-*.log' -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if($log) {
            # Start-Process can hold an exclusive log handle while the child
            # is running. This is a normal startup race, not a failed worker.
            try { $content=[IO.File]::ReadAllText($log.FullName) }
            catch [IO.IOException] { $content='' }
            if($content.Contains('LAO_BOOTSTRAP_WORKER_OK')){$done=$true;break}
        }
        Start-Sleep -Milliseconds 100
    }
    if(-not $done){throw 'Detached launcher did not run the isolated worker'}
    Write-Output 'LAO isolated bootstrap worker check passed'
} finally {
    $env:LOCALAPPDATA=$existing
    Remove-Item -LiteralPath $temp -Force -Recurse -ErrorAction SilentlyContinue
}
