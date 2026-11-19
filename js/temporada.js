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

// ============================================================
// RENDIMIENTO: que los adornos nunca traben el celular
// ============================================================
// Vale para todas las páginas y todo el año (la nieve, las mariposas,
// los pétalos y los efectos miran estas dos clases en <html>):
//
//   · fx-quieto: mientras hay una ventana abierta (la ficha, el carrito,
//     el registro, la de Recargas) el fondo se queda quieto. La ventana
//     esmerila lo de atrás, y si atrás algo se mueve el celular tiene que
//     volver a esmerilar toda la pantalla en cada cuadro: en un celular
//     de gama media eso es lo que más traba.
//   · fx-liviano: si el celular no llega a dibujar fluido (menos de ~50
//     cuadros por segundo al cargar o al deslizar) o tiene poca memoria,
//     se muestran la mitad de copos y pétalos, sin ondular, y las
//     explosiones son más chicas. Nadie lo nota y todo sigue andando.
(function () {
  const raiz = document.documentElement;

  try { if (navigator.deviceMemory && navigator.deviceMemory <= 2) raiz.classList.add('fx-liviano'); } catch (e) {}

  // Mide unos segundos con la página a la vista: cuando ya cargó todo, y
  // otra vez la primera vez que se desliza (que es cuando más se nota).
  // Por debajo de ~50 cuadros por segundo, modo liviano.
  function medir(dura) {
    if (raiz.classList.contains('fx-liviano') || document.hidden) return;
    let cuadros = 0, inicio = 0;
    const paso = t => {
      if (document.hidden) return;                       // se fue de la pestaña: no cuenta
      if (!inicio) inicio = t;
      cuadros++;
      if (t - inicio < dura) { requestAnimationFrame(paso); return; }
      if (cuadros * 1000 / (t - inicio) < 50) raiz.classList.add('fx-liviano');
    };
    requestAnimationFrame(paso);
  }
  window.addEventListener('load', () => setTimeout(() => medir(2500), 1200), { once: true });
  window.addEventListener('scroll', () => setTimeout(() => medir(1500), 50), { once: true, passive: true });

  // Una ventana está abierta si alguna de estas se ve
  const VENTANAS = '.modal-overlay, .tu-fondo';
  let pendiente = 0;
  function revisar() {
    pendiente = 0;
    const abierta = [...document.querySelectorAll(VENTANAS)].some(v => {
      const s = getComputedStyle(v);
      return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.05;
    });
    raiz.classList.toggle('fx-quieto', abierta);
  }
  function vigilar() {
    new MutationObserver(() => { if (!pendiente) pendiente = requestAnimationFrame(revisar); })
      .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    revisar();
  }
  if (document.body) vigilar();
  else document.addEventListener('DOMContentLoaded', vigilar);
})();
