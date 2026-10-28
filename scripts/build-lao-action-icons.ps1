# Deterministic native Windows WPF renderer: the approved SVG path is the
# source of truth. PNGs are for WinForms, which does not render SVG directly.
# No fonts, icon libraries, remote services or third-party executables.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows icon rasterization requires Windows' }
if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne 'STA') {
    throw 'Launch icon build with powershell.exe -NoProfile -STA -File ...'
}
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$inputDir = Join-Path $root 'docs\lao-devspace\assets\icons\actions'
$outputDir = Join-Path $root 'docs\lao-devspace\assets\icons\png'
$icons = @(
    @('abrir-painel','abrir-painel',''),
    @('logs','logs',''),
    @('reiniciar','reiniciar',''),
    @('iniciar','iniciar',''),
    @('configuracoes','configuracoes',''),
    @('revisao','revisao',''),
    @('chevron-direita','chevron-direita',''),
    @('documento','documento-verde',''),
    @('documento','documento-amarelo','#D18B00'),
    @('documento','documento-vermelho','#D92D3B'),
    @('status','status',''),
    @('modelos','modelos',''),
    @('ollama','ollama',''),
    @('recursos','recursos','')
)

function Parse-LaoColor([string]$value) {
    if ($value -eq '' -or $value -eq 'none') { return $null }
    if ($value -cnotmatch '^#[0-9A-Fa-f]{6}$') {
        throw "Unsupported LAO icon color: $value"
    }
    return [Windows.Media.SolidColorBrush]::new(
        [Windows.Media.ColorConverter]::ConvertFromString($value))
}

foreach ($entry in $icons) {
    $sourceName = [string]$entry[0]
    $targetName = [string]$entry[1]
    $override = [string]$entry[2]
    $sourcePath = Join-Path $inputDir ($sourceName + '.svg')
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Missing approved LAO icon: $sourceName"
    }
    [xml]$svg = [IO.File]::ReadAllText($sourcePath,[Text.Encoding]::UTF8)
    $rootNode = $svg.DocumentElement
    if ($rootNode.LocalName -ne 'svg' -or $rootNode.GetAttribute('viewBox') -ne '0 0 24 24') {
        throw "LAO icon must have 24x24 viewBox: $sourceName"
    }
    $strokeValue = if ($override) { $override } else { $rootNode.GetAttribute('stroke') }
    $stroke = Parse-LaoColor $strokeValue
    $strokeWidth = [double]::Parse($rootNode.GetAttribute('stroke-width'),
        [Globalization.CultureInfo]::InvariantCulture)
    $pen = [Windows.Media.Pen]::new($stroke,$strokeWidth)
    $pen.StartLineCap = [Windows.Media.PenLineCap]::Round
    $pen.EndLineCap = [Windows.Media.PenLineCap]::Round
    $pen.LineJoin = [Windows.Media.PenLineJoin]::Round
    $visual = [Windows.Media.DrawingVisual]::new()
    $context = $visual.RenderOpen()
    try {
        $context.PushTransform([Windows.Media.ScaleTransform]::new(64/24,64/24))
        foreach ($node in $rootNode.ChildNodes) {
            if ($node.NodeType -ne 'Element') { continue }
            if ($node.LocalName -notin @('path','rect','circle')) {
                throw "Unsupported SVG element in approved icon: $($node.LocalName)"
            }
            $geometry = switch ($node.LocalName) {
                'path' {
                    [Windows.Media.Geometry]::Parse($node.GetAttribute('d'))
                }
                'rect' {
                    $x=[double]::Parse($node.GetAttribute('x'),[Globalization.CultureInfo]::InvariantCulture)
                    $y=[double]::Parse($node.GetAttribute('y'),[Globalization.CultureInfo]::InvariantCulture)
                    $w=[double]::Parse($node.GetAttribute('width'),[Globalization.CultureInfo]::InvariantCulture)
                    $h=[double]::Parse($node.GetAttribute('height'),[Globalization.CultureInfo]::InvariantCulture)
                    $rx=if ($node.HasAttribute('rx')) {
                        [double]::Parse($node.GetAttribute('rx'),[Globalization.CultureInfo]::InvariantCulture)
                    } else { 0.0 }
                    [Windows.Media.RectangleGeometry]::new([Windows.Rect]::new($x,$y,$w,$h),$rx,$rx)
                }
                'circle' {
                    $cx=[double]::Parse($node.GetAttribute('cx'),[Globalization.CultureInfo]::InvariantCulture)
                    $cy=[double]::Parse($node.GetAttribute('cy'),[Globalization.CultureInfo]::InvariantCulture)
                    $radius=[double]::Parse($node.GetAttribute('r'),[Globalization.CultureInfo]::InvariantCulture)
                    [Windows.Media.EllipseGeometry]::new([Windows.Point]::new($cx,$cy),$radius,$radius)
                }
            }
            $fillValue = if ($node.HasAttribute('fill')) { $node.GetAttribute('fill') } else {
                $rootNode.GetAttribute('fill')
            }
            $fill = Parse-LaoColor $fillValue
            $context.DrawGeometry($fill,$pen,$geometry)
        }
        $context.Pop()
    } finally { $context.Close() }
    $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new(64,64,96,96,
        [Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder=[Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $destination=Join-Path $outputDir ("lao-action-$targetName-64.png")
    $stream=[IO.File]::Open($destination,[IO.FileMode]::Create,[IO.FileAccess]::Write)
    try { $encoder.Save($stream) } finally { $stream.Dispose() }
    Write-Output "LAO icon asset generated: $targetName"
}
