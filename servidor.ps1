# ============================================================
# TIAGO STORE - Servidor local para probar antes de publicar
# ============================================================
# Levanta la tienda en http://localhost:8099 para verla como la
# ve el cliente, sin tener que publicar en GitHub.
#
# Por que existe: abrir el HTML con doble clic no sirve. Con file://
# el navegador bloquea los modulos ES, o sea que no carga ni el
# catalogo ni el panel. Hace falta servirlo por http.
#
# Esto usa HttpListener, que ya viene con Windows: no hay nada que
# instalar, y esta maquina no tiene Node.
#
# Uso:
#   powershell -File servidor.ps1
#   powershell -File servidor.ps1 -Abrir          (abre el navegador solo)
#   powershell -File servidor.ps1 -Puerto 3000
#
# Para pararlo: Ctrl+C en esa ventana.
#
# OJO: es solo para probar en tu PC. No sirve para publicar la
# tienda ni deja que otros la vean; para eso sigue estando GitHub.
# ============================================================
param(
  [int]$Puerto = 8099,
  [switch]$Abrir
)

$raiz = $PSScriptRoot
if (-not $raiz) { $raiz = (Get-Location).Path }

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
  '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'
  '.css'='text/css; charset=utf-8';  '.json'='application/json; charset=utf-8'
  '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.png'='image/png'
  '.svg'='image/svg+xml'; '.webp'='image/webp'; '.ico'='image/x-icon'
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.txt'='text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Puerto/")

try {
  $listener.Start()
} catch {
  Write-Host "No se pudo abrir el puerto $Puerto." -ForegroundColor Red
  Write-Host "Puede que ya haya otro servidor ahi. Proba con otro:" -ForegroundColor Yellow
  Write-Host "   powershell -File servidor.ps1 -Puerto 8100" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "  Tiago Store corriendo en  http://localhost:$Puerto/" -ForegroundColor Green
Write-Host "  Sirviendo: $raiz"
Write-Host "  Ctrl+C para parar."
Write-Host ""

if ($Abrir) { Start-Process "http://localhost:$Puerto/" }

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response

    # La ruta viene codificada (Img/opt/Free%20fire.jpg). Ojo: dentro de una
    # ruta el '+' es un '+' literal, no un espacio, asi que no se toca.
    $ruta = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($ruta -eq '/') { $ruta = '/index.html' }
    $archivo = Join-Path $raiz ($ruta.TrimStart('/') -replace '/', '\')

    # No dejar salir de la carpeta del proyecto.
    $full = [System.IO.Path]::GetFullPath($archivo)
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($raiz), 'OrdinalIgnoreCase')) {
      $res.StatusCode = 403; $res.Close(); continue
    }

    if (Test-Path $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $tipo = $mime[$ext]
      if (-not $tipo) { $tipo = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentType = $tipo
      $res.ContentLength64 = $bytes.Length
      # Cache corta de navegador. Con 'no-store' el navegador ni siquiera
      # reutiliza una imagen dentro de la MISMA pagina, y una foto usada en
      # dos lugares se baja dos veces. Para medir una primera visita de
      # verdad, recargar con Ctrl+F5.
      $res.Headers.Add('Cache-Control', 'public, max-age=60')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host ("  200 {0,8} B  {1}" -f $bytes.Length, $ruta) -ForegroundColor DarkGray
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404: $ruta")
      $res.OutputStream.Write($msg, 0, $msg.Length)
      # /favicon.ico lo pide el navegador solo; que falte no rompe nada.
      Write-Host "  404          $ruta" -ForegroundColor DarkYellow
    }
    $res.Close()
  } catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
  }
}
