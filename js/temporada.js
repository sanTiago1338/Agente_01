// ============================================================
// TIAGO STORE · Temas de temporada
// ============================================================
// Prende un tema de temporada en las fechas de TEMPORADAS y lo apaga
// solo cuando pasan: la tienda vuelve a su vidrio claro de siempre sin
// tocar nada.
//
// El tema de Halloween es css/halloween.css. Todo lo que tiene adentro
// empieza con html.halloween, así que fuera de fecha no pisa nada. Este
// archivo pone esa clase en <html>, le cambia el color a la barra del
// navegador del celular, cambia los textos marcados con data-halloween
// ("Ofertas del momento" pasa a "Descuento Halloween") y arma el cielo de
// atrás: estrellas, telarañas, murciélagos y niebla (la luz de la luna y
// los resplandores son del CSS).
//
// Va en el <head> sin defer, antes de tenido.js: así la página ya sale
// de noche desde el primer cuadro, sin un destello blanco.
//
// Para verlo fuera de fecha, o apagarlo para comparar, en la URL:
//   ?tema=halloween   ·   ?tema=normal   ·   ?tema=auto (vuelve a las fechas)
// Se acuerda en esa pestaña mientras navegás (sessionStorage).
// ============================================================
(function () {
  // Desde y hasta, inclusive (mes-día), con la fecha del celular del
  // cliente. "color" es el de la barra del navegador en el celular.
  const TEMPORADAS = [
    { tema: 'halloween', desde: '10-24', hasta: '11-02', color: '#0e0818' }
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
    return TEMPORADAS.find(t => md >= t.desde && md <= t.hasta);
  }

  const pedido = elegido();
  const activa = pedido ? TEMPORADAS.find(t => t.tema === pedido) : porFecha();
  if (!activa) return;

  raiz.classList.add(activa.tema);
  const barra = document.querySelector('meta[name="theme-color"]');
  if (barra) barra.content = activa.color;

  // Textos de temporada: en el HTML, data-halloween="…" (con el nombre del
  // tema) dice qué poner en lugar del texto de siempre mientras dura.
  // Fuera de fecha queda el texto escrito, sin tocar nada.
  function textosDeTemporada() {
    document.querySelectorAll(`[data-${activa.tema}]`).forEach(el => {
      el.textContent = el.dataset[activa.tema];
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', textosDeTemporada);
  else textosDeTemporada();

  if (activa.tema !== 'halloween') return;

  // ---------- El cielo ----------
  // Una sola capa fija detrás de todo (z-index -1, sin clicks), como las
  // burbujas, que en Halloween no se muestran. Se mueve solo con
  // transform: lo resuelve la placa de video, sin trabajo por cuadro.
  const MURCIELAGO =
    '<svg viewBox="0 0 64 30" aria-hidden="true"><path fill="currentColor" d="' +
    'M32 9.5c-.9-1.6-1.8-2.6-2.6-3.1l-.5 2.4c-1.6-.4-3-.2-4.3.5' +
    'C21.6 4.6 15.8 1.6 7.6 1.4c3.2 2.1 4.8 5.1 4.6 8.4C8.4 8.6 4.2 9.3 0 12.4' +
    'c4.4.1 7.6 1.6 9.3 4.4 2.2-1.6 5.2-1.9 7.4-.8.8-2.3 3-3.5 5.4-3.1' +
    '2.6.4 4.4 2.6 4.8 5.6 1.3-1.2 3-1.8 5.1-1.8s3.8.6 5.1 1.8' +
    'c.4-3 2.2-5.2 4.8-5.6 2.4-.4 4.6.8 5.4 3.1 2.2-1.1 5.2-.8 7.4.8' +
    '1.7-2.8 4.9-4.3 9.3-4.4-4.2-3.1-8.4-3.8-12.2-2.6-.2-3.3 1.4-6.3 4.6-8.4' +
    '-8.2.2-14 3.2-17.6 7.8-1.3-.7-2.7-.9-4.3-.5l-.5-2.4c-.8.5-1.7 1.5-2.6 3.1z"/></svg>';

  // Una telaraña de esquina: hilos que salen del rincón y anillos que
  // los cruzan, con la panza hacia el rincón como las de verdad.
  function telarana() {
    const R = 120, rayos = [0, 15, 30, 45, 60, 75, 90];
    const rad = g => g * Math.PI / 180;
    let d = rayos.map(g => `M0 0L${(R * Math.cos(rad(g))).toFixed(1)} ${(R * Math.sin(rad(g))).toFixed(1)}`).join('');
    [26, 48, 72, 98].forEach(r => {
      for (let i = 0; i < rayos.length - 1; i++) {
        const a = rad(rayos[i]), b = rad(rayos[i + 1]), m = (a + b) / 2, panza = r * 0.82;
        const p1 = [r * Math.cos(a), r * Math.sin(a)], p2 = [r * Math.cos(b), r * Math.sin(b)];
        const c  = [panza * Math.cos(m), panza * Math.sin(m)];
        d += `${i ? '' : `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`}Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
    });
    return `<svg viewBox="0 0 ${R} ${R}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width=".7"/></svg>`;
  }

  function armarCielo() {
    if (document.querySelector('.hw-cielo')) return;
    const ancho    = window.innerWidth;
    const cantidad = ancho < 700 ? 3 : ancho < 1100 ? 4 : 6;
    // Altura (vh), duración del cruce (s), arranque (s, negativo: ya
    // están volando al abrir), tamaño y sentido. Fijos, no al azar: así
    // nunca salen todos juntos ni encima del buscador.
    const vuelos = [
      [14, 34,  -4, 1,    1], [32, 46, -30, .7,  -1], [9,  58, -12, .55,  1],
      [24, 40, -22, .85, -1], [40, 64, -50, .5,   1], [18, 52, -38, .65, -1]
    ].slice(0, cantidad);

    const cielo = document.createElement('div');
    cielo.className = 'hw-cielo';
    cielo.setAttribute('aria-hidden', 'true');
    cielo.innerHTML =
      '<div class="hw-estrellas"></div>' +
      `<div class="hw-telarana hw-telarana--izq">${telarana()}</div>` +
      `<div class="hw-telarana hw-telarana--der">${telarana()}</div>` +
      vuelos.map(([y, t, d, s, sentido]) =>
        `<div class="hw-vuelo${sentido < 0 ? ' hw-vuelo--vuelta' : ''}" style="--y:${y}vh;--t:${t}s;--d:${d}s;--s:${s}">` +
        `<div class="hw-murcielago">${MURCIELAGO}</div></div>`).join('') +
      '<div class="hw-niebla"><span></span><span></span></div>';
    document.body.appendChild(cielo);
  }

  if (document.body) armarCielo();
  else document.addEventListener('DOMContentLoaded', armarCielo);
})();
