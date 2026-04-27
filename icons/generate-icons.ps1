# Generates icon-16.png, icon-48.png, icon-128.png from the YTrans design.
# Run once after cloning, or whenever the design changes.
# Usage:  powershell -ExecutionPolicy Bypass -File .\icons\generate-icons.ps1

Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-RoundRectPath($x, $y, $w, $h, $r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    if ($d -gt $w) { $d = $w }
    if ($d -gt $h) { $d = $h }
    $path.AddArc($x,             $y,             $d, $d, 180, 90)
    $path.AddArc($x + $w - $d,   $y,             $d, $d, 270, 90)
    $path.AddArc($x + $w - $d,   $y + $h - $d,   $d, $d,   0, 90)
    $path.AddArc($x,             $y + $h - $d,   $d, $d,  90, 90)
    $path.CloseFigure()
    return $path
}

function New-Icon($size, $outPath) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $s = $size / 128.0   # scale factor

    # Background – dark rounded square
    $bgBrush  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(26, 26, 26))
    $bgPath   = New-RoundRectPath 0 0 $size $size ([int](22 * $s))
    $g.FillPath($bgBrush, $bgPath)

    # Red play badge
    $redBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0, 0))
    $badge    = New-RoundRectPath ([int](10*$s)) ([int](14*$s)) ([int](108*$s)) ([int](64*$s)) ([int](14*$s))
    $g.FillPath($redBrush, $badge)

    # White play triangle
    $tri = @(
        (New-Object System.Drawing.PointF ([float](44*$s), [float](26*$s))),
        (New-Object System.Drawing.PointF ([float](44*$s), [float](66*$s))),
        (New-Object System.Drawing.PointF ([float](92*$s), [float](46*$s)))
    )
    $g.FillPolygon([System.Drawing.Brushes]::White, $tri)

    # Subtitle lines (only at 48 / 128 – too small at 16)
    if ($size -ge 48) {
        $grayBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(68, 68, 68))
        $blueBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(79, 195, 247))

        $g.FillPath($grayBrush, (New-RoundRectPath ([int](14*$s)) ([int](92*$s))  ([int](100*$s)) ([int](7*$s)) ([int](3*$s))))
        $g.FillPath($blueBrush, (New-RoundRectPath ([int](14*$s)) ([int](106*$s)) ([int](100*$s)) ([int](7*$s)) ([int](3*$s))))
        $g.FillPath($blueBrush, (New-RoundRectPath ([int](14*$s)) ([int](118*$s)) ([int](74*$s))  ([int](7*$s)) ([int](3*$s))))

        # CC tag
        $ccBg   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0, 0, 0))
        $ccRect = New-RoundRectPath ([int](80*$s)) ([int](55*$s)) ([int](30*$s)) ([int](18*$s)) ([int](4*$s))
        $g.FillPath($ccBg, $ccRect)
        $font   = New-Object System.Drawing.Font('Arial', [float](9*$s), [System.Drawing.FontStyle]::Bold)
        $sf     = New-Object System.Drawing.StringFormat
        $sf.Alignment     = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $rect = New-Object System.Drawing.RectangleF ([float](80*$s), [float](55*$s), [float](30*$s), [float](18*$s))
        $g.DrawString('CC', $font, [System.Drawing.Brushes]::White, $rect, $sf)
    }

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()

    Write-Host "  created $outPath ($size x $size)"
}

Write-Host "Generating YTrans icons..."
New-Icon 16  (Join-Path $scriptDir 'icon-16.png')
New-Icon 48  (Join-Path $scriptDir 'icon-48.png')
New-Icon 128 (Join-Path $scriptDir 'icon-128.png')
Write-Host "Done."
