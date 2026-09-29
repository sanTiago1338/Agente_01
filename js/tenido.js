// ============================================================
// TIAGO STORE · Transparente o teñido
// ============================================================
// Como el ajuste de Liquid Glass del iPhone: un control chico, parado,
// abajo a la izquierda y a la altura de la burbuja de WhatsApp, que va
// de Transparente (abajo) a Teñido (arriba). Transparente deja ver lo
// de atrás casi sin esmerilar; Teñido esmerila y pone blanco: se ve
// menos lo de atrás y las letras contrastan más. Tiene tres paradas
// (transparente, intermedio y teñido), como las del iPhone.
//
// El valor va en --tenido (0 a 1) sobre <html>: los vidrios de
// css/vidrio.css lo siguen solos, en todas las páginas. La clase
// .tenido prende además el blanco de los que tienen degradé propio.
//
// Se acuerda de lo elegido en este navegador (localStorage), en todas
// las páginas. Va en el <head> sin defer, así el vidrio ya sale como lo
// dejó el cliente desde el primer cuadro y no cambia al cargar.
// ============================================================
(function () {
  const LLAVE   = 'tiago-tenido';
  const PARADAS = [0, 0.5, 1];
  const NOMBRES = ['Transparente', 'Intermedio', 'Teñido'];
  const raiz = document.documentElement;

  function leer() {
    try {
      const v = parseFloat(localStorage.getItem(LLAVE));
      return PARADAS.includes(v) ? v : 0;
    } catch (e) {
      return 0;   // modo incógnito o sin permiso: arranca transparente
    }
  }

  function guardar(v) {
    try { localStorage.setItem(LLAVE, String(v)); } catch (e) { /* da igual */ }
  }

  // Lo que se ve: el vidrio de la página
  function aplicar(v) {
    raiz.style.setProperty('--tenido', String(v));
    raiz.classList.toggle('tenido', v > 0);
  }

  let valor = leer();
  aplicar(valor);

  const cerca = v => PARADAS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);

  // Iconos del iPhone: dos tarjetas encimadas, vacías (transparente)
  // o rellenas (teñido)
  const ICONO_TRANSPARENTE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="14" height="11" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<rect x="7" y="9" width="14" height="11" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  const ICONO_TENIDO =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="14" height="11" rx="4" fill="currentColor" opacity=".55"/>' +
    '<rect x="7" y="9" width="14" height="11" rx="4" fill="currentColor"/></svg>';

  function armar() {
    if (document.querySelector('.tenido-control')) return;

    const caja = document.createElement('div');
    caja.className = 'tenido-control';
    caja.innerHTML = `
      <span class="tenido-ico tenido-ico--lleno" title="Teñido">${ICONO_TENIDO}</span>
      <div class="tenido-pista" role="slider" tabindex="0" aria-orientation="vertical"
           aria-label="Vidrio: transparente o teñido" aria-valuemin="0" aria-valuemax="100">
        <span class="tenido-riel"></span>
        <span class="tenido-relleno"></span>
        ${PARADAS.map(p => `<span class="tenido-punto" style="--p:${p}"></span>`).join('')}
        <span class="tenido-perilla"></span>
      </div>
      <span class="tenido-ico" title="Transparente">${ICONO_TRANSPARENTE}</span>`;
    document.body.appendChild(caja);

    const pista = caja.querySelector('.tenido-pista');

    // Dibuja la perilla en una posición (0 abajo, 1 arriba). Mientras se
    // arrastra se mueve suelta; al soltar va a la parada más cercana.
    function pintar(pos) {
      caja.style.setProperty('--pos', String(pos));
      const i = PARADAS.indexOf(cerca(pos));
      pista.setAttribute('aria-valuenow', String(Math.round(PARADAS[i] * 100)));
      pista.setAttribute('aria-valuetext', NOMBRES[i]);
      caja.querySelectorAll('.tenido-punto').forEach((p, j) => p.classList.toggle('tapado', j === i));
    }

    function elegir(v) {
      valor = v;
      aplicar(v);
      guardar(v);
      pintar(v);
    }

    // Arrastrar: la pista entera se puede agarrar, no solo la perilla
    const posDe = e => {
      const r = pista.getBoundingClientRect();
      const margen = 11;   // media perilla: arriba y abajo no llega al borde (css/vidrio.css)
      const y = Math.min(Math.max(e.clientY, r.top + margen), r.bottom - margen);
      return 1 - (y - r.top - margen) / (r.height - 2 * margen);
    };

    let arrastrando = false;
    pista.addEventListener('pointerdown', e => {
      arrastrando = true;
      caja.classList.add('arrastrando');
      pista.setPointerCapture(e.pointerId);
      const pos = posDe(e);
      pintar(pos);
      aplicar(pos);           // el vidrio cambia mientras se mueve
      e.preventDefault();
    });
    pista.addEventListener('pointermove', e => {
      if (!arrastrando) return;
      const pos = posDe(e);
      pintar(pos);
      aplicar(pos);
    });
    const soltar = e => {
      if (!arrastrando) return;
      arrastrando = false;
      caja.classList.remove('arrastrando');
      elegir(cerca(posDe(e)));
    };
    pista.addEventListener('pointerup', soltar);
    pista.addEventListener('pointercancel', () => {
      if (!arrastrando) return;
      arrastrando = false;
      caja.classList.remove('arrastrando');
      elegir(valor);
    });

    // Con el teclado: arriba y abajo cambian de parada
    pista.addEventListener('keydown', e => {
      const i = PARADAS.indexOf(valor);
      let j = i;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'PageUp') j = Math.min(i + 1, PARADAS.length - 1);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'PageDown') j = Math.max(i - 1, 0);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = PARADAS.length - 1;
      else return;
      e.preventDefault();
      elegir(PARADAS[j]);
    });

    pintar(valor);

    // A la altura de la burbuja de WhatsApp: se le copia el "bottom",
    // que cambia según la página (con barra de abajo va más arriba). La
    // burbuja la pone wa-bubble.js, que puede llegar después: se vuelve
    // a mirar al terminar de cargar y al cambiar el ancho.
    function alinear() {
      const wa = document.querySelector('.wa-bubble');
      if (!wa) return;
      const abajo = getComputedStyle(wa).bottom;
      if (abajo && abajo !== 'auto') caja.style.bottom = abajo;
    }
    alinear();
    window.addEventListener('load', alinear);
    window.addEventListener('resize', alinear);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armar);
  else armar();
})();
