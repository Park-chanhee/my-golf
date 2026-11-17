# App icon generator: fitness-ring style (black bg, green ring, white pole, red flag)
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot 'icons'
New-Item -ItemType Directory -Force $out | Out-Null

function C($r, $g, $b, $a = 255) { [System.Drawing.Color]::FromArgb($a, $r, $g, $b) }

function Draw([int]$S, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $k = $S / 512.0
  $g.Clear((C 0 0 0))
  # ring track
  $rr = 150 * $k; $w = 44 * $k
  $rect = New-Object System.Drawing.RectangleF ([float](256 * $k - $rr)), ([float](256 * $k - $rr)), ([float](2 * $rr)), ([float](2 * $rr))
  $track = New-Object System.Drawing.Pen (C 31 59 36), ([float]$w)
  $g.DrawEllipse($track, $rect)
  # ring progress with diagonal gradient and round caps
  $gr = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.RectangleF 0, 0, $S, $S), (C 182 255 92), (C 47 214 107), ([float]45)
  $pen = New-Object System.Drawing.Pen $gr, ([float]$w)
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $g.DrawArc($pen, $rect, [float]-90, [float]250)
  # pole
  $white = New-Object System.Drawing.SolidBrush (C 255 255 255)
  $g.FillRectangle($white, [float](248 * $k), [float](203 * $k), [float](14 * $k), [float](104 * $k))
  $g.FillEllipse($white, [float](248 * $k), [float](200 * $k), [float](14 * $k), [float](14 * $k))
  # red flag
  $red = New-Object System.Drawing.SolidBrush (C 255 59 48)
  $pts = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ([float](262 * $k)), ([float](204 * $k))),
    (New-Object System.Drawing.PointF ([float](316 * $k)), ([float](226 * $k))),
    (New-Object System.Drawing.PointF ([float](262 * $k)), ([float](248 * $k))))
  $g.FillPolygon($red, $pts)
  # hole
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (C 255 255 255 153)), [float](217 * $k), [float](305 * $k), [float](76 * $k), [float](18 * $k))
  $g.Dispose()
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Draw 180 'apple-touch-icon.png'
Draw 192 'icon-192.png'
Draw 512 'icon-512.png'
Draw 32  'favicon-32.png'
Write-Host "done"
