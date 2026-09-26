// ============================================================
// TIAGO STORE · Barras de desplazamiento que se esconden solas
// ============================================================
// La barra de la derecha (la de la página) y las de las filas marcadas
// con class="barra-sola" (los Tops) solo se ven mientras se usan:
//   · mientras se desliza, y un momento después;
//   · con el mouse encima de la fila, o cerca del borde derecho para la
//     de la página (así se la puede ir a agarrar).
// El resto del tiempo llevan la clase .barra-quieta, que en
// css/vidrio.css deja la varilla de vidrio transparente.
//
// Chrome no vuelve a pintar la barra cuando solo cambia su estilo, así
// que después de cambiar la clase se la hace dibujar de nuevo: se apaga
// y se prende el overflow en el mismo cuadro. No se ve ni mueve nada.
// Mientras se desliza no hace falta (la barra se pinta igual) y además
// podría cortar un desplazamiento suave, así que ahí no se fuerza.
//
// En el celular la barra de la página es del sistema y ya se esconde
// sola: esa no se toca. La de los Tops sí: aparece mientras se desliza
// con el dedo.
// ============================================================
(function () {
  const conMouse = !!window.matchMedia && matchMedia('(pointer: fine)').matches;

  const QUIETA_MS = 900;       // cuánto sigue visible después de deslizar
  const BORDE_PX  = 24;        // qué tan cerca del borde derecho aparece

  // Los dos ejes: la página se desliza para abajo y los Tops de costado.
  // Se devuelve lo que hubiera escrito en el elemento (por ejemplo el
  // overflow:hidden que traba la página con una ventana abierta).
  function repintar(el) {
    const x = el.style.overflowX, y = el.style.overflowY;
    el.style.overflow = 'hidden';
    void el.offsetHeight;
    el.style.overflowX = x;
    el.style.overflowY = y;
  }

  // Cada barra lleva su propio estado: si se está deslizando y si el
  // mouse la está buscando. Se ve si pasa cualquiera de las dos.
  //   el:          el que lleva la clase (de ahí saca Chrome el estilo)
  //   fuenteScroll: el que avisa cuando se desliza
  //   desliza:     el que tiene la barra, y se hace dibujar de nuevo
  function vigilar(el, fuenteScroll, desliza) {
    const estado = { deslizando: false, mouse: false, quieta: true, reloj: 0 };
    el.classList.add('barra-quieta');
    repintar(desliza);       // ya estaba dibujada, visible, desde antes

    function pintar(forzar) {
      const quieta = !estado.deslizando && !estado.mouse;
      if (quieta === estado.quieta) return;
      estado.quieta = quieta;
      el.classList.toggle('barra-quieta', quieta);
      if (forzar) repintar(desliza);
    }

    fuenteScroll.addEventListener('scroll', function () {
      estado.deslizando = true;
      pintar(false);
      clearTimeout(estado.reloj);
      estado.reloj = setTimeout(function () {
        estado.deslizando = false;
        pintar(true);
      }, QUIETA_MS);
    }, { passive: true });

    return function mouse(cerca) {
      if (cerca === estado.mouse) return;
      estado.mouse = cerca;
      pintar(!estado.deslizando);
    };
  }

  function empezar() {
    // La de la página: aparece con el mouse pegado al borde derecho.
    // La clase va en el <body> y no en el <html>: cuando el body tiene
    // estilo de barra (y lo tiene, por el ::-webkit-scrollbar general),
    // Chrome dibuja la barra de la página con el del body.
    if (conMouse) {
      const raiz = document.documentElement;
      const mousePagina = vigilar(document.body, window, raiz);
      document.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        mousePagina(e.clientX >= raiz.clientWidth - BORDE_PX);
      }, { passive: true });
      // Salir de la ventana (por la derecha, pasando por la barra) la esconde
      document.addEventListener('pointerout', function (e) {
        if (!e.relatedTarget) mousePagina(false);
      });
    }

    // Las filas: aparece con el mouse en cualquier parte de la fila
    document.querySelectorAll('.barra-sola').forEach(function (fila) {
      const mouseFila = vigilar(fila, fila, fila);
      fila.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'mouse') mouseFila(true);
      });
      fila.addEventListener('pointerleave', function () { mouseFila(false); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', empezar);
  else empezar();
})();
