param(
 [string]$Archive = "$env:USERPROFILE\Downloads\LAO-DevSpace-Assets-Feature-Preparacao.zip",
 [string]$Root = 'D:\desenvolvimento\lao-devspace'
)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $Archive)) { throw "Pacote nao encontrado: $Archive. Baixe o ZIP da conversa e indique seu caminho em -Archive." }
if (!(Test-Path -LiteralPath (Join-Path $Root '.git'))) { throw "Worktree nao encontrado: $Root" }
$branch = (& git -C $Root branch --show-current).Trim()
if ($branch -ne 'feature/lao-devspace') { throw "Branch inesperada: $branch" }
$tmp=Join-Path $env:TEMP ('lao-assets-'+[guid]::NewGuid().ToString('N'))
try {
 Expand-Archive -LiteralPath $Archive -DestinationPath $tmp
 $src=Join-Path $tmp 'LAO-DevSpace\docs\lao-devspace'
 if (!(Test-Path $src)) { throw "Pacote invalido: faltando docs/lao-devspace" }
 $dst=Join-Path $Root 'docs\lao-devspace'
 $refs=Join-Path $dst 'assets\references'
 New-Item -ItemType Directory -Force $refs | Out-Null
 Get-ChildItem (Join-Path $src 'assets\references') -File -Filter '*.png' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $refs -Force }
 foreach ($doc in @('ROADMAP.md')) {
   $origin=Join-Path $src $doc
   $target=Join-Path $dst $doc
   if ((Test-Path $origin) -and !(Test-Path $target)) { Copy-Item $origin $target }
 }
 # Preserve the original interactive preview and its stylesheet when importing
 foreach ($name in @('monitor-demo.html','monitor-demo.css')) {
   $origin=Join-Path $src ('preview\'+$name)
   $target=Join-Path $dst ('preview\'+$name)
   if (Test-Path $origin) {
     New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
     Copy-Item $origin $target -Force
   }
 }
 Write-Output "Assets importados em $dst"
 Get-ChildItem $refs -File | Select-Object Name,Length
} finally { if(Test-Path $tmp) { Remove-Item $tmp -Recurse -Force } }
