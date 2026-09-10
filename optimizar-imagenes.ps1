# ============================================================
# TIAGO STORE - Optimizador de imagenes
# ============================================================
# Genera una version liviana de cada imagen de /Img en /Img/opt.
# Los originales NO se tocan: quedan como respaldo y como red de
# seguridad para cualquier referencia vieja.
#
# Por que /Img/opt en vez de reemplazar en el lugar:
#   las rutas de las imagenes viven en Supabase (campo "imagen" de
#   cada producto y "logo" de cada juego), no solo en el codigo. Si
#   renombraramos los archivos habria que migrar la base. En cambio
#   la tienda redirige sola de "Img/X.png" a "Img/opt/X.jpg" desde
#   enAlta() en index.html.
#
# Uso:
#   powershell -File optimizar-imagenes.ps1
#   powershell -File optimizar-imagenes.ps1 -MaxLado 900 -Calidad 95
#
# Requisitos: ninguno. Usa System.Drawing, que ya viene con Windows.
# ============================================================
param(
  # 900 px cubre una pantalla de celular a 3x sobre los 265 px en que
  # se muestran las imagenes mas grandes del sitio (el carrusel).
  [int]$MaxLado = 900,
  # q95 medido: 41,5 dB de PSNR al tamano real de pantalla. Por encima
  # de 40 dB la diferencia con el original ya no se ve.
  [int]$Calidad = 95,
  [switch]$Forzar
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$raiz    = Split-Path -Parent $MyInvocation.MyCommand.Path
$origen  = Join-Path $raiz 'Img'
$destino = Join-Path $origen 'opt'

if (-not (Test-Path $origen)) { throw "No encuentro la carpeta $origen" }
New-Item -ItemType Directory -Force $destino | Out-Null

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
             Where-Object { $_.MimeType -eq 'image/jpeg' }

function Load-Bmp([string]$path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $img = [System.Drawing.Image]::FromStream($ms)
  $bmp = New-Object System.Drawing.Bitmap $img
  $img.Dispose(); $ms.Dispose()
  return $bmp
}

# Reduce al lado maximo pedido. Nunca agranda.
function Resize-Bmp([System.Drawing.Bitmap]$src, [int]$maxLado) {
  $escala = [Math]::Min(1.0, $maxLado / [Math]::Max($src.Width, $src.Height))
  $nw = [Math]::Max(1, [int][Math]::Round($src.Width  * $escala))
  $nh = [Math]::Max(1, [int][Math]::Round($src.Height * $escala))
  $dst = New-Object System.Drawing.Bitmap $nw, $nh, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $dst.SetResolution(96, 96)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  # Fondo blanco: ninguna imagen de /Img usa transparencia (verificado
  # recorriendo el canal alfa completo), pero por si entra una nueva.
  $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $nw, $nh))
  $g.Dispose()
  return $dst
}

function Save-Jpeg([System.Drawing.Bitmap]$bmp, [string]$path, [int]$q) {
  $ps = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter `
                   ([System.Drawing.Imaging.Encoder]::Quality), ([int64]$q)
  $bmp.Save($path, $jpegCodec, $ps)
  $ps.Dispose()
}

$archivos = Get-ChildItem $origen -File |
            Where-Object { $_.Extension -match '^\.(png|jpg|jpeg)$' } |
            Sort-Object Length -Descending

"Optimizando $($archivos.Count) imagenes  ->  $MaxLado px maximo, JPEG q$Calidad"
"Los originales quedan intactos en /Img"
""
"{0,-40} {1,10} {2,10} {3,8}" -f 'archivo', 'antes', 'despues', 'ahorro'
"-" * 72

$totalAntes = 0; $totalDespues = 0; $copiados = 0; $fallaron = @()

foreach ($f in $archivos) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  $salida = Join-Path $destino "$base.jpg"

  if ((Test-Path $salida) -and -not $Forzar) {
    $totalAntes   += $f.Length
    $totalDespues += (Get-Item $salida).Length
    continue
  }

  try {
    $bmp = Load-Bmp $f.FullName
    $red = Resize-Bmp $bmp $MaxLado
    Save-Jpeg $red $salida $Calidad
    $bmp.Dispose(); $red.Dispose()

    # Si la version "optimizada" salio mas pesada (pasa con archivos que
    # ya venian chicos y bien comprimidos), nos quedamos con el original.
    if ((Get-Item $salida).Length -ge $f.Length) {
      Copy-Item $f.FullName $salida -Force
      $copiados++
    }

    $kbA = [math]::Round($f.Length / 1KB)
    $kbD = [math]::Round((Get-Item $salida).Length / 1KB)
    $pct = 0
    if ($f.Length -gt 0) { $pct = [math]::Round(100 - ($kbD * 100.0 / $kbA)) }
    $nombre = $f.Name
    if ($nombre.Length -gt 39) { $nombre = $nombre.Substring(0, 36) + '...' }
    "{0,-40} {1,7} KB {2,7} KB {3,7}%" -f $nombre, $kbA, $kbD, $pct

    $totalAntes   += $f.Length
    $totalDespues += (Get-Item $salida).Length
  } catch {
    $fallaron += "$($f.Name): $($_.Exception.Message)"
  }
}

"-" * 72
$mbA = [math]::Round($totalAntes / 1MB, 1)
$mbD = [math]::Round($totalDespues / 1MB, 1)
$pctTotal = 0
if ($totalAntes -gt 0) { $pctTotal = [math]::Round(100 - ($totalDespues * 100.0 / $totalAntes)) }
"{0,-40} {1,7} MB {2,7} MB {3,7}%" -f 'TOTAL', $mbA, $mbD, $pctTotal
""
if ($copiados -gt 0) { "$copiados archivo(s) ya estaban bien: se copiaron tal cual." }
if ($fallaron.Count -gt 0) {
  "FALLARON $($fallaron.Count):"
  $fallaron | ForEach-Object { "   $_" }
}
