// ============================================================
// TIAGO STORE · NAVIDAD: lo que se mueve
// ============================================================
// Arma los adornos de Navidad de NAVIDAD/navidad.css:
//
//   · el cielo de atrás (.nv-cielo): estrellas, la aurora, la estrella
//     de Belén, el pueblo nevado y la nieve que cae
//   · en cada barra de arriba (el menú de la tienda, de Planes, de
//     Contacto, de Recargas, del pago y de Mis compras): nieve apoyada
//     sobre el canto y una guirnalda de luces que cuelga por debajo
//   · en la barra de abajo: nieve sobre el canto
//
// Lo carga js/temporada.js solo cuando el tema de Navidad está prendido
// (del 4 de noviembre al 6 de enero). Fuera de fecha no se descarga.
//
// TODO ES ADORNO: aria-hidden, sin clics, sin foco. Nada ocupa lugar:
// el cielo va detrás de todo (fixed, z-index -1) y lo de las barras en
// una capa suelta (position: absolute) del tamaño de cada barra.
//
// Con "reducir movimiento" no cae nieve y las luces no titilan (lo hace
// navidad.css). Con la pestaña oculta el navegador frena las animaciones
// solo: son todas de CSS.
// ============================================================
(function () {
  'use strict';

  const raiz = document.documentElement;
  if (!raiz.classList.contains('navidad')) return;   // fuera de fecha, nada

  // Un azar con semilla: los mismos copos y la misma nieve cada vez, así
  // la página no "salta" distinta en cada visita ni al cambiar el tamaño
  function azar(semilla) {
    let s = semilla >>> 0 || 1;
    return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296;
  }

  // ---------- El cielo ----------
  function armarCielo() {
    if (document.querySelector('.nv-cielo')) return;
    const ancho = window.innerWidth;
    // Menos copos en el celular: se ve igual de nevado y cuesta menos
    const cuantos = ancho < 700 ? 22 : ancho < 1100 ? 34 : 46;
    const r = azar(1225);
    let nieve = '';
    for (let i = 0; i < cuantos; i++) {
      const grande = i % 9 === 4;                       // uno de cada nueve
      const lado   = grande ? 10 + r() * 8 : 3 + r() * 5;
      const caida  = (grande ? 18 : 11) + r() * 14;     // segundos en cruzar la pantalla
      nieve +=
        `<div class="nv-copo${grande ? ' grande' : ''}" style="` +
        `--x:${(r() * 100).toFixed(1)}%;--s:${lado.toFixed(1)}px;` +
        `--t:${caida.toFixed(1)}s;--d:${(-r() * caida).toFixed(1)}s;` +
        `--m:${(2.5 + r() * 3).toFixed(1)}s;--o:${(.45 + r() * .5).toFixed(2)}"><i></i></div>`;
    }
    const cielo = document.createElement('div');
    cielo.className = 'nv-cielo';
    cielo.setAttribute('aria-hidden', 'true');
    cielo.innerHTML =
      '<div class="nv-estrellas"></div>' +
      '<div class="nv-aurora"></div>' +
      '<div class="nv-belen"></div>' +
      '<div class="nv-pueblo"></div>' +
      nieve;
    document.body.appendChild(cielo);
  }

  // ---------- La nieve sobre el canto de una barra ----------
  // Una banda blanca ondulada con alguna gota que cuelga, desde donde
  // termina la curva de la esquina hasta la otra punta.
  function svgNieve(ancho, radio) {
    const x0 = Math.min(radio * .55, ancho * .2);
    const x1 = ancho - x0;
    const r = azar(Math.round(ancho) * 7 + 3);
    let abajo = '';
    const paso = 26;
    for (let x = x1; x > x0; x -= paso) {
      const xm = Math.max(x0, x - paso / 2), xe = Math.max(x0, x - paso);
      const hondo = 5 + r() * 3.5;
      abajo += ` Q${xm.toFixed(1)} ${(hondo + 1.5).toFixed(1)} ${xe.toFixed(1)} ${(4 + r() * 1.5).toFixed(1)}`;
    }
    // Arriba, la nieve amontonada; las puntas se afinan
    let d = `M${x0.toFixed(1)} 5 C${(x0 + 6).toFixed(1)} 1, ${(x0 + 16).toFixed(1)} .4, ${(x0 + 30).toFixed(1)} .6` +
            ` L${(x1 - 30).toFixed(1)} .6 C${(x1 - 16).toFixed(1)} .4, ${(x1 - 6).toFixed(1)} 1, ${x1.toFixed(1)} 5` +
            abajo + ' Z';
    // Algunas gotas de nieve que cuelgan del borde
    let gotas = '';
    const cuantas = Math.max(2, Math.round((x1 - x0) / 140));
    for (let i = 0; i < cuantas; i++) {
      const x = x0 + 24 + r() * (x1 - x0 - 48);
      const largo = 3 + r() * 4;
      gotas += `<path d="M${(x - 3).toFixed(1)} 5.5 Q${x.toFixed(1)} ${(6 + largo * 2).toFixed(1)} ${(x + 3).toFixed(1)} 5.5Z"/>`;
    }
    return `<svg class="nv-tope" width="${ancho.toFixed(0)}" height="14" viewBox="0 0 ${ancho.toFixed(1)} 14" aria-hidden="true">` +
           `<defs><linearGradient id="nvN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/>` +
           `<stop offset="1" stop-color="#d4e3f2"/></linearGradient></defs>` +
           `<g fill="url(#nvN)"><path d="${d}"/>${gotas}</g></svg>`;
  }

  // ---------- La guirnalda de luces ----------
  // El cable cae en curvas entre los clavos y de cada curva cuelgan dos
  // focos, en cinco colores que se turnan. Titilan en tres turnos (CSS).
  const COLORES = ['oro', 'rojo', 'verde', 'azul', 'rosa'];
  function svgLuces(ancho, radio) {
    const x0 = Math.max(14, radio * .6), x1 = ancho - x0;
    const tramos = Math.max(3, Math.round((x1 - x0) / 74));
    const largo = (x1 - x0) / tramos, cae = 7;
    let cable = `M${x0.toFixed(1)} 0`, focos = '', n = 0;
    for (let i = 0; i < tramos; i++) {
      const a = x0 + i * largo;
      cable += ` Q${(a + largo / 2).toFixed(1)} ${cae * 2} ${(a + largo).toFixed(1)} 0`;
      for (const t of [.3, .7]) {
        const x = a + t * largo;
        const y = 4 * cae * t * (1 - t);                  // la altura del cable ahí
        const giro = (1 - 2 * t) * -14;                    // el foco sigue la curva
        focos +=
          `<g class="nv-foco ${COLORES[n % 5]} t${n % 3 + 1}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${giro.toFixed(0)})">` +
          `<rect x="-1.7" y="-.5" width="3.4" height="3.2" rx=".8" fill="#2a3d30"/>` +
          `<ellipse cx="0" cy="6.2" rx="2.7" ry="4"/></g>`;
        n++;
      }
    }
    return `<svg class="nv-luces" width="${ancho.toFixed(0)}" height="24" viewBox="0 0 ${ancho.toFixed(1)} 24" aria-hidden="true">` +
           `<path d="${cable}" fill="none" stroke="#173322" stroke-width="1.3"/>${focos}</svg>`;
  }

  // Cada barra adornada deja acá cómo volver a medirse
  const medidas = [];

  // ---------- Una barra adornada ----------
  // La capa va DENTRO de la barra (así acompaña al menú cuando queda
  // pegado arriba al bajar) pero suelta, con position: absolute: no es
  // parte de la fila del menú y no corre nada. Se ubica midiendo:
  // funciona tenga la barra
  // posición propia o no.
  function adornar(barra, { luces }) {
    if (barra.querySelector(':scope > .nv-barra')) return;
    const capa = document.createElement('span');
    capa.className = 'nv-barra';
    capa.setAttribute('aria-hidden', 'true');
    // Suelta desde el primer momento, aunque navidad.css no hubiera llegado
    capa.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none';
    barra.appendChild(capa);

    let ultimo = '';
    const acomodar = () => {
      Object.assign(capa.style, { left: '0px', top: '0px' });
      const origen = capa.getBoundingClientRect();
      const b = barra.getBoundingClientRect();
      if (!b.width) return;
      Object.assign(capa.style, {
        left: (b.left - origen.left) + 'px', top: (b.top - origen.top) + 'px',
        width: b.width + 'px', height: b.height + 'px'
      });
      const radio = Math.min(parseFloat(getComputedStyle(barra).borderTopLeftRadius) || 0, b.height / 2);
      const clave = `${Math.round(b.width)}x${Math.round(radio)}`;
      if (clave === ultimo) return;                      // mismo ancho: el dibujo sirve
      ultimo = clave;
      capa.innerHTML = svgNieve(b.width, radio) + (luces ? svgLuces(b.width, radio) : '');
    };
    acomodar();
    medidas.push(acomodar);
    let espera;
    window.addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(acomodar, 150); });
    // La barra puede cambiar de alto sola (el menú de la tienda en el
    // celular, cuando cargan las letras): se vuelve a medir
    if ('ResizeObserver' in window) new ResizeObserver(() => { clearTimeout(espera); espera = setTimeout(acomodar, 60); }).observe(barra);
  }

  // Las barras de arriba de cada página, y la de abajo
  const ARRIBA = '.nav-principal, body > nav, header.header, .pay-header, body > header';

  function iniciar() {
    armarCielo();
    document.querySelectorAll(ARRIBA).forEach(b => adornar(b, { luces: true }));
    document.querySelectorAll('.bottom-nav').forEach(b => adornar(b, { luces: false }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
  // Las letras (Bebas Neue, Outfit) cambian el alto de las barras cuando
  // llegan: una medida más al terminar de cargar
  window.addEventListener('load', () => medidas.forEach(m => m()), { once: true });
})();
