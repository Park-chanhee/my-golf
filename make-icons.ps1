# App icon generator: deep green bg, light green hill, white flag pole, red flag, golf ball
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot 'icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Draw([int]$S, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $k = $S / 512.0
  # --
  $rect = New-Object System.Drawing.Rectangle 0, 0, $S, $S
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(46,107,69)), ([System.Drawing.Color]::FromArgb(23,72,47)), 90
  $g.FillRectangle($bg, $rect)
  # --
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(79,143,90))), [float](-120*$k), [float](330*$k), [float](760*$k), [float](420*$k))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(127,191,110))), [float](-60*$k), [float](372*$k), [float](640*$k), [float](380*$k))
  # --
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18,59,39))), [float](262*$k), [float](392*$k), [float](44*$k), [float](14*$k))
  # --
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillRectangle($white, [float](280*$k), [float](112*$k), [float](10*$k), [float](290*$k))
  # --
  $flag = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(224,75,75))
  $pts = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ([float](290*$k)), ([float](112*$k))),
    (New-Object System.Drawing.PointF ([float](400*$k)), ([float](152*$k))),
    (New-Object System.Drawing.PointF ([float](290*$k)), ([float](192*$k))))
  $g.FillPolygon($flag, $pts)
  # --
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70,0,0,0))), [float](150*$k), [float](398*$k), [float](74*$k), [float](16*$k))
  $g.FillEllipse($white, [float](150*$k), [float](338*$k), [float](70*$k), [float](70*$k))
  $dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40,31,95,63))
  foreach ($d in @(@(172,358),@(192,354),@(182,374),@(202,372),@(170,382),@(194,390))) {
    $g.FillEllipse($dim, [float]($d[0]*$k), [float]($d[1]*$k), [float](8*$k), [float](8*$k))
  }
  $g.Dispose()
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Draw 180 'apple-touch-icon.png'
Draw 192 'icon-192.png'
Draw 512 'icon-512.png'
Draw 32  'favicon-32.png'
Write-Host "done"
