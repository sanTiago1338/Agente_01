// ============================================================
// TIAGO STORE · HALLOWEEN DE TERROR: lo que se mueve
// ============================================================
// Monta las piezas animadas de los kits de esta carpeta:
//
//   · la mansión de la luna roja (kit v2), arriba de todo en cada
//     página, que al bajar se funde en el pasillo
//   · el ambiente del kit de garras (garras/, su coordinador
//     garras/src/ambiente.js, sin cambios):
//       - sombras a los costados que se acercan y alejan (17 s)
//       - dos bancos de niebla lenta (33 y 41 s)
//       - la aparición de pelo largo, que cada tanto sale DETRÁS del
//         contenido, hace sus ocho poses y se va
//       - el evento de terror: dos garras agarran el título por detrás
//         y, un instante después, sangre de utilería escurre por el fondo.
//         Dura 7 s y descansa 24 s
//
// Lo carga js/temporada.js solo cuando el tema de Halloween está
// prendido. Los estilos están en horror.css.
//
// TODO ES FONDO
//   La aparición, la sangre, las sombras y la niebla van en el cielo de
//   atrás (.hw-cielo, la capa fija que arma js/temporada.js), detrás de
//   todo el contenido: se ven en los márgenes, entre las tarjetas y a
//   través del vidrio, nunca encima de una foto, un precio o un botón.
//   Las garras van detrás del logo, dentro del título (el kit agrega ahí
//   un adorno suelto, que no cambia el tamaño ni el lugar de nada).
//
//   Antes la aparición iba en el banner de la tienda; el kit de garras
//   pide sacarla de ahí ("no pegues una cabeza sobre un banner
//   promocional") y ahora es parte del fondo.
//
// Se detiene sola (lo hace el kit) con la pestaña oculta y con "reducir
// movimiento". Todo es decorado: aria-hidden, sin clics, sin foco.
// ============================================================
(function () {
  'use strict';

  const raiz = document.documentElement;
  if (!raiz.classList.contains('halloween')) return;   // fuera de fecha, nada

  // La carpeta y la versión salen de este mismo archivo
  // (HALLOWEN/horror.js?v=…): todo lo que carga se actualiza con él.
  const yo      = document.currentScript;
  const carpeta = yo ? new URL('.', yo.src) : new URL('HALLOWEN/', location.href);
  const version = yo ? new URL(yo.src).search : '';
  const ruta    = archivo => new URL(archivo, carpeta).href + version;
  // Las imágenes que también usa horror.css van sin ?v=: así se piden una vez
  const foto    = archivo => new URL(archivo, carpeta).href;

  // El título de cada página: el nombre de la tienda arriba (el mismo
  // elemento de siempre; en Halloween muestra el logo de terror)
  const TITULO = '.nav-marca, .nav-logo, .header-logo, .pay-header a, header a.logo';

  function cargarCss(archivo) {
    if (document.querySelector(`link[data-horror="${archivo}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = ruta(archivo);
    l.dataset.horror = archivo;
    document.head.appendChild(l);
  }

  // Carga un script del kit una sola vez (global: lo que deja definido)
  function cargarJs(archivo, global) {
    return new Promise((listo, fallo) => {
      if (window[global]) { listo(); return; }
      const s = document.createElement('script');
      s.src = ruta(archivo);
      s.onload = listo;
      s.onerror = fallo;
      document.head.appendChild(s);
    });
  }

  // ---------- La mansión (kit v2) ----------
  // Arriba de todo, detrás del contenido; se funde en el pasillo al
  // bajar (ver horror.css, "LA MANSIÓN"). Va como primer elemento de la
  // página: así queda debajo del cielo (sombras, niebla, sangre).
  // Aparece despacio cuando la foto ya llegó.
  function ponerMansion() {
    if (document.querySelector('.hw-mansion')) return;
    const mansion = document.createElement('div');
    mansion.className = 'hw-mansion';
    mansion.setAttribute('aria-hidden', 'true');
    document.body.prepend(mansion);
    const imagen = new Image();
    imagen.onload = () => requestAnimationFrame(() => mansion.classList.add('lista'));
    imagen.onerror = () => mansion.remove();
    imagen.src = foto('web/fondo-mansion.jpg');
  }

  // ---------- Dónde van las garras ----------
  // El kit las pone DENTRO del título, detrás de las letras. En esta
  // tienda eso no se ve: el título pinta su texto con background-clip:
  // text (css/tienda.css) y en Chrome lo que se dibuja adentro por debajo
  // del texto desaparece (probado: ni con borde rojo se veían).
  //
  // Por eso van en un marco propio, suelto (position: absolute), justo
  // antes del título y en su mismo lugar, como permite el kit ("si
  // necesitas un wrapper decorativo, que sea absoluto"). Van delante del
  // logo pero solo en sus extremos, sin tapar letras (ver horror.css: el
  // logo de terror tiene un halo de espinas casi opaco que tapaba todo lo
  // de atrás). El marco va dentro de un recorte del tamaño de la barra
  // del título, que deja ver solo lo que cae adentro (los dedos que
  // entran a agarrarlo), como pide el kit cuando no hay lugar: nunca
  // tapan la franja de arriba ni la de abajo.
  //
  // Nada de esto ocupa lugar: la barra y el título no se mueven.
  function marcoDeGarras(titulo) {
    const barra = titulo.parentElement;
    const recorte = document.createElement('span');
    recorte.className = 'hw-garras-recorte';
    recorte.setAttribute('aria-hidden', 'true');
    const marco = document.createElement('span');
    marco.className = 'hw-garras-marco';
    // Suelto desde el primer momento, aunque horror.css no hubiera
    // llegado: nunca ocupa lugar en la barra (es un hijo más del menú)
    recorte.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none';
    marco.style.position = 'absolute';
    recorte.appendChild(marco);
    titulo.before(recorte);

    const acomodar = () => {
      Object.assign(recorte.style, { left: '0px', top: '0px', width: '0px', height: '0px' });
      const origen = recorte.getBoundingClientRect();
      const b = barra.getBoundingClientRect();
      const t = titulo.getBoundingClientRect();
      // Solo la franja del título: en el celular el menú tiene dos filas
      // (el logo arriba, los enlaces abajo) y las garras no deben llegar a
      // los enlaces. Tanto aire abajo del título como el que hay arriba.
      let alto = Math.min(b.height, (t.bottom - b.top) + (t.top - b.top));
      // Y nunca hasta un botón o enlace de la fila de abajo: 2 px antes
      barra.querySelectorAll('a, button, input, select').forEach(el => {
        if (el === titulo || titulo.contains(el)) return;
        const r = el.getBoundingClientRect();
        if (r.height && r.top > t.top + t.height / 2) alto = Math.min(alto, r.top - b.top - 2);
      });
      const radio = getComputedStyle(barra);
      Object.assign(recorte.style, {
        left: (b.left - origen.left) + 'px', top: (b.top - origen.top) + 'px',
        width: b.width + 'px', height: alto + 'px',
        borderRadius: alto < b.height - 1
          ? `${radio.borderTopLeftRadius} ${radio.borderTopRightRadius} 0 0`
          : radio.borderRadius
      });
      Object.assign(marco.style, {
        left: (t.left - b.left) + 'px', top: (t.top - b.top) + 'px',
        width: t.width + 'px', height: t.height + 'px',
        // El mismo tamaño de letra que el título: horror.css ubica las
        // garras en em, al compás del logo
        fontSize: getComputedStyle(titulo).fontSize
      });
    };
    acomodar();
    let espera;
    window.addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(acomodar, 150); });
    return marco;
  }

  // ---------- Garras, sangre y aparición (kit de garras) ----------
  // Se monta SOLO el coordinador del kit (TiagoHorrorFondo), que arma
  // por dentro las garras y la aparición, como pide su instrucción.
  let efecto = null;

  async function ponerAmbiente() {
    if (efecto) return;
    const cielo  = document.querySelector('.hw-cielo');
    const titulo = document.querySelector(TITULO);
    if (!cielo || !titulo) return;   // sin cielo o sin título: la página sigue sin estos adornos
    efecto = 'cargando';
    try {
      cargarCss('garras/src/efecto.css');
      cargarCss('garras/src/terror-sprite.css');
      cargarCss('garras/src/ambiente.css');
      // En este orden, como pide el kit
      await cargarJs('garras/src/efecto.js', 'TiagoGarras');
      await cargarJs('garras/src/terror-sprite.js', 'TiagoTerror');
      await cargarJs('garras/src/ambiente.js', 'TiagoHorrorFondo');

      // En el celular el kit no muestra la aparición (ambiente.css, hasta
      // 600 px): ahí no se descarga su imagen de 450 KB, va una vacía
      const celular = matchMedia('(max-width: 600px)').matches;
      efecto = window.TiagoHorrorFondo.mount({
        background: cielo,
        title: marcoDeGarras(titulo),
        // La pared del kit: el pasillo húmedo. La dibuja body::before
        // (horror.css), debajo de la mansión; la del kit queda apagada
        wall: foto('web/fondo-garras.jpg'),
        sprite: celular
          ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
          : ruta('web/aparicion-sprite.webp'),
        hand: ruta('web/garra.webp'),
        blood: ruta('web/sangre.webp'),
        onError() { /* un adorno que no cargó: la tienda sigue igual */ }
      });
    } catch (e) {
      // Sin el kit, la tienda sigue igual: el resto del tema no depende de esto
      efecto = null;
    }
  }

  function iniciar() {
    ponerMansion();
    // Después de que la tienda cargó lo suyo (las fotos primero). Para
    // entonces el cielo de js/temporada.js ya está armado seguro.
    const empezar = () => (window.requestIdleCallback || setTimeout)(ponerAmbiente, { timeout: 1500 });
    if (document.readyState === 'complete') empezar();
    else window.addEventListener('load', empezar, { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
