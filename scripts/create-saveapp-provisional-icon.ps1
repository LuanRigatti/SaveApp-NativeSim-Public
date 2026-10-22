Add-Type -AssemblyName System.Drawing

function New-SaveAppMark([string]$Path, [int]$Size, [bool]$Background) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  if ($Background) {
    $rect = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
    $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $rect,
      [System.Drawing.Color]::FromArgb(49, 90, 232),
      [System.Drawing.Color]::FromArgb(117, 87, 214),
      45
    )
    $graphics.FillRectangle($brush, $rect)
    $brush.Dispose()
  }

  $fontSize = [single]($Size * 0.62)
  $font = [System.Drawing.Font]::new('Arial', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $color = if ($Background) { [System.Drawing.Color]::White } else { [System.Drawing.Color]::FromArgb(49, 90, 232) }
  $textBrush = [System.Drawing.SolidBrush]::new($color)
  $textBounds = [System.Drawing.RectangleF]::new(0, -($Size * 0.02), $Size, $Size)
  $graphics.DrawString('S', $font, $textBrush, $textBounds, $format)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $textBrush.Dispose()
  $format.Dispose()
  $font.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-SaveAppMark (Join-Path $PSScriptRoot '..\assets\icon.png') 1024 $true
New-SaveAppMark (Join-Path $PSScriptRoot '..\assets\adaptive-icon.png') 1024 $false
New-SaveAppMark (Join-Path $PSScriptRoot '..\assets\splash.png') 512 $false
