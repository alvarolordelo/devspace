param([string]$Root = 'D:\desenvolvimento\lao-devspace')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$base=Join-Path $Root 'docs\lao-devspace\assets\icons'
$png=Join-Path $base 'png'; $ico=Join-Path $base 'ico'
New-Item -ItemType Directory -Force -Path $png,$ico | Out-Null
$states=@{active='#16A34A'; offline='#EF3339'; review='#F4B400'; idle='#94A3B8'}
$sizes=@(16,20,24,32,48,64,96,128,256)
function IconPng([int]$size,[string]$color,[string]$path,[bool]$badge) {
 $bmp=[Drawing.Bitmap]::new($size,$size)
 $g=[Drawing.Graphics]::FromImage($bmp)
 $g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
 $g.Clear([Drawing.Color]::Transparent)
 $scale=$size/256.0; $g.ScaleTransform($scale,$scale)
 $pathBg=[Drawing.Drawing2D.GraphicsPath]::new()
 $pathBg.AddArc(5,5,90,90,180,90);$pathBg.AddArc(161,5,90,90,270,90)
 $pathBg.AddArc(161,161,90,90,0,90);$pathBg.AddArc(5,161,90,90,90,90)
 $pathBg.CloseFigure()
 $dark=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#0B172B'))
 $white=[Drawing.Brushes]::White
 $green=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#15A656'))
 $g.FillPath($dark,$pathBg)
 $pen=[Drawing.Pen]::new([Drawing.Color]::White,11)
 $pen.StartCap='Round';$pen.EndCap='Round'
 $g.DrawLine($pen,126,72,75,178);$g.DrawLine($pen,129,73,181,181)
 $g.FillEllipse($white,102,41,50,50)
 $g.FillEllipse($white,42,155,56,56)
 $g.FillEllipse($green,50,163,40,40)
 $g.FillEllipse($white,158,156,54,54)
 if($badge) {
  $brush=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($color))
  $g.FillEllipse($white,174,174,78,78)
  $g.FillEllipse($brush,182,182,62,62)
  $brush.Dispose()
 }
 $bmp.Save($path,[Drawing.Imaging.ImageFormat]::Png)
 $pen.Dispose();$dark.Dispose();$green.Dispose();$pathBg.Dispose();$g.Dispose();$bmp.Dispose()
}
function IconIco([string]$state) {
 $frames=@(16,24,32,48,64,128,256)
 $out=Join-Path $ico ('lao-tray-'+$state+'.ico')
 $writer=[IO.BinaryWriter]::new([IO.File]::Create($out))
 try {
  $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$frames.Count)
  $offset=6+16*$frames.Count;$data=@()
  foreach($s in $frames) {
   $img=[IO.File]::ReadAllBytes((Join-Path $png ('lao-tray-'+$state+'-'+$s+'.png')))
   $data+=,$img
   $v=[byte]$(if($s -eq 256){0}else{$s})
   $writer.Write($v);$writer.Write($v);$writer.Write([byte]0);$writer.Write([byte]0)
   $writer.Write([uint16]1);$writer.Write([uint16]32)
   $writer.Write([uint32]$img.Length);$writer.Write([uint32]$offset);$offset+=$img.Length
  }
  foreach($img in $data) { $writer.Write($img) }
 } finally { $writer.Dispose() }
}
foreach($state in @('active','offline','review','idle')) {
 foreach($s in $sizes) { IconPng $s $states[$state] (Join-Path $png ('lao-tray-'+$state+'-'+$s+'.png')) $true }
 IconIco $state
}
foreach($s in @(32,64,128,256,512)) { IconPng $s '#16A34A' (Join-Path $png ('lao-logo-'+$s+'.png')) $false }
Write-Output "LAO tray icons generated in $base"
