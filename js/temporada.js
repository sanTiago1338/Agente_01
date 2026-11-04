// ============================================================
// TIAGO STORE · Temas de temporada
// ============================================================
// Prende un tema de temporada en las fechas de TEMPORADAS y lo apaga
// solo cuando pasan: la tienda vuelve a su vidrio claro de siempre sin
// tocar nada. Este archivo pone la clase del tema en <html>, le cambia
// el color a la barra del navegador del celular y cambia los textos
// marcados con data-<tema> mientras dura.
//
// (Halloween se borró el 4 de noviembre de 2026: la carpeta HALLOWEN y
// css/halloween.css. Quedan en el historial de git si algún año vuelve.)
//
// NAVIDAD (del 4 de noviembre al 6 de enero) es NAVIDAD/navidad.css, que
// también empieza todo con html.navidad, y NAVIDAD/navidad.js, que este
// archivo pide solo en esas fechas: el cielo de invierno con nieve, el
// pueblo nevado, y la nieve y las luces de las barras. data-navidad
// cambia los textos ("Ofertas del momento" pasa a "Ofertas navideñas").
//
// Va en el <head> sin defer, antes de tenido.js: así la página ya sale
// con su tema desde el primer cuadro, sin un salto de colores.
//
// Para verlo fuera de fecha, o apagarlo para comparar, en la URL:
//   ?tema=navidad · ?tema=normal · ?tema=auto (vuelve a las fechas)
// Se acuerda en esa pestaña mientras navegás (sessionStorage).
// ============================================================
(function () {
  // Desde y hasta, inclusive (mes-día), con la fecha del celular del
  // cliente. "color" es el de la barra del navegador en el celular.
  // Si "hasta" es menor que "desde", cruza el año (Navidad termina en enero).
  const TEMPORADAS = [
    { tema: 'navidad',   desde: '11-04', hasta: '01-06', color: '#e9f1f9' }
  ];
  const LLAVE = 'tiago-tema';
  const raiz  = document.documentElement;

  function elegido() {
    try {
      const pedido = new URLSearchParams(location.search).get('tema');
      if (pedido === 'auto') sessionStorage.removeItem(LLAVE);
      else if (pedido) sessionStorage.setItem(LLAVE, pedido);
      return sessionStorage.getItem(LLAVE);
    } catch (e) {
      return null;   // sin permiso para guardar: van las fechas
    }
  }

  function porFecha() {
    const hoy = new Date();
    const md  = String(hoy.getMonth() + 1).padStart(2, '0') + '-' +
                String(hoy.getDate()).padStart(2, '0');
    return TEMPORADAS.find(t => t.desde <= t.hasta
      ? md >= t.desde && md <= t.hasta          // dentro del mismo año
      : md >= t.desde || md <= t.hasta);        // de noviembre a enero
  }

  const pedido = elegido();
  const activa = pedido ? TEMPORADAS.find(t => t.tema === pedido) : porFecha();
  if (!activa) return;

  raiz.classList.add(activa.tema);
  const barra = document.querySelector('meta[name="theme-color"]');
  if (barra) barra.content = activa.color;

  // Textos de temporada: en el HTML, data-navidad="…" (con el nombre del
  // tema) dice qué poner en lugar del texto de siempre mientras dura.
  // Fuera de fecha queda el texto escrito, sin tocar nada.
  function textosDeTemporada() {
    document.querySelectorAll(`[data-${activa.tema}]`).forEach(el => {
      el.textContent = el.dataset[activa.tema];
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', textosDeTemporada);
  else textosDeTemporada();

  // ---------- Navidad (carpeta NAVIDAD) ----------
  // Los colores ya están en cada página (NAVIDAD/navidad.css, solo pisa
  // algo con html.navidad). Acá se pide lo que se mueve: el cielo, la
  // nieve y las luces de las barras (NAVIDAD/navidad.js, ver
  // NAVIDAD/LEEME.md). Fuera de fecha no se descarga. Lleva la misma
  // versión que este archivo, así se actualiza junto con él.
  if (activa.tema === 'navidad') {
    const yo = document.currentScript;
    if (yo && yo.src) {
      const guion = document.createElement('script');
      guion.src = new URL('../NAVIDAD/navidad.js', yo.src).href + new URL(yo.src).search;
      document.head.appendChild(guion);
    }
    return;
  }
})();
