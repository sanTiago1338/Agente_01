# ============================================================
# TIAGO STORE - Nueva version antes de publicar
# ============================================================
# Le pone a cada .js y .css que cargan las paginas un "?v=" con la fecha
# y hora de ahora:  js/tienda.js  ->  js/tienda.js?v=20260928193045
#
# Por que existe: GitHub Pages deja que el navegador reuse un archivo
# hasta 10 minutos sin preguntar si cambio. Despues de publicar, un
# cliente podia recibir la pagina nueva con el tienda.js viejo, y una
# pagina nueva con un script viejo se rompe (un boton que llama a una
# funcion que el script viejo no tiene). Con el ?v= nuevo, para el
# navegador es otro archivo y lo baja en el momento.
#
# Solo toca lo que cargan las paginas directamente. Los modulos que esos
# importan adentro (supabase-config.js, admin-compras.js...) siguen con
# los 10 minutos: cambian poco.
#
# Uso (antes de subir):
#   powershell -File nueva-version.ps1
# ============================================================

$ErrorActionPreference = 'Stop'
$raiz    = $PSScriptRoot
$version = Get-Date -Format 'yyyyMMddHHmmss'

# src="..." o href="..." de un .js o .css propio (no https://, no data:),
# con o sin un ?v= anterior
$patron = '((?:src|href)=")((?!https?:|//|data:)[^"?#]+\.(?:js|css))(?:\?v=\d+)?"'

$paginas = @(Get-ChildItem -Path $raiz -Filter *.html) +
           @(Get-ChildItem -Path (Join-Path $raiz 'admin') -Filter *.html)

foreach ($pagina in $paginas) {
  # Algunas paginas empiezan con la marca BOM y otras no: se deja como
  # estaba, para que el cambio sea solo el ?v=
  $bytes   = [IO.File]::ReadAllBytes($pagina.FullName)
  $conBom  = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  $antes   = [IO.File]::ReadAllText($pagina.FullName)
  $despues = [regex]::Replace($antes, $patron, "`$1`$2?v=$version`"")
  if ($despues -ne $antes) {
    [IO.File]::WriteAllText($pagina.FullName, $despues, (New-Object Text.UTF8Encoding($conBom)))
    $n = [regex]::Matches($antes, $patron).Count
    Write-Output ("{0,-28} {1} archivos" -f $pagina.Name, $n)
  }
}
Write-Output "Version $version"
