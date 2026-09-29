// ============================================================
// TIAGO STORE · Instalar la tienda como app ("Agregar a inicio")
// ============================================================
// La app es la misma página publicada, abierta sin la barra del
// navegador y con el ícono en la pantalla del celular (manifest.webmanifest).
// NO hay service worker a propósito: nada se guarda en el celular, así
// que cada vez que la abren carga lo último que subiste.
//
// Cómo se instala depende del celular:
//   · Android (Chrome): el navegador avisa que se puede ("beforeinstallprompt")
//     y el botón abre su ventana de instalar.
//   · iPhone (Safari): Apple no deja instalar con un botón. Se explica en
//     dos pasos: Compartir → "Agregar a inicio".
//
// Dónde se ofrece:
//   · Un aviso chico abajo, solo en el celular, una vez cada 30 días si lo
//     cierran con ✕.
//   · "Instalar la app" en el pie, siempre que se pueda.
// Si ya la abren como app, no se ofrece nada.
// ============================================================
(function () {
  const LLAVE   = 'tiago-app-aviso';          // cuándo cerraron el aviso
  const PAUSA   = 30 * 24 * 60 * 60 * 1000;   // 30 días sin volver a mostrarlo
  const DEMORA  = 4000;                       // que primero vean la tienda

  const yaEsApp = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
                  window.navigator.standalone === true;
  if (yaEsApp) return;

  const ua = navigator.userAgent || '';
  const esIphone = /iphone|ipad|ipod/i.test(ua) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Dentro de WhatsApp, Facebook o Instagram el iPhone no deja agregar a
  // inicio: primero hay que abrir la página en Safari. Ahí no se ofrece.
  const dentroDeOtraApp = /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua);

  let pedido = null;   // el evento de Android, para abrir su ventana después

  function cerradoHace() {
    try { return Date.now() - Number(localStorage.getItem(LLAVE) || 0); }
    catch { return Infinity; }
  }
  function anotarCerrado() {
    try { localStorage.setItem(LLAVE, String(Date.now())); } catch { /* sin almacenamiento: vuelve a salir */ }
  }

  // ---------- El aviso de abajo ----------
  let aviso = null;

  function crearAviso() {
    if (aviso) return aviso;
    aviso = document.createElement('div');
    aviso.className = 'app-aviso';
    aviso.setAttribute('role', 'dialog');
    aviso.setAttribute('aria-label', 'Instalar la app');
    aviso.innerHTML = `
      <img src="icono-192.png" alt="" width="38" height="38">
      <div class="app-aviso-txt">
        <b>Tiago Store en tu celular</b>
        <span class="app-aviso-sub">Instalala como app y entrás en un toque.</span>
      </div>
      <button type="button" class="app-aviso-si" data-instalar>Instalar</button>
      <button type="button" class="app-aviso-no" aria-label="Ahora no">✕</button>`;
    aviso.querySelector('.app-aviso-no').addEventListener('click', () => {
      anotarCerrado();
      ocultarAviso();
    });
    document.body.appendChild(aviso);
    return aviso;
  }

  function mostrarAviso() {
    // Solo en el celular, y no si lo cerraron hace poco
    if (!matchMedia('(max-width: 700px)').matches) return;
    if (cerradoHace() < PAUSA) return;
    setTimeout(() => crearAviso().classList.add('visible'), DEMORA);
  }

  function ocultarAviso() {
    if (aviso) aviso.classList.remove('visible');
  }

  // En el iPhone el botón no instala: el aviso pasa a explicar cómo
  function explicarIphone() {
    const a = crearAviso();
    a.classList.add('visible', 'pasos');
    a.querySelector('.app-aviso-txt').innerHTML = `
      <b>Instalala en 2 pasos</b>
      <span class="app-aviso-sub">1. Tocá <strong>Compartir</strong> (el cuadrado con la flecha para arriba).<br>
      2. Elegí <strong>"Agregar a inicio"</strong>.</span>`;
    const si = a.querySelector('.app-aviso-si');
    if (si) si.remove();
  }

  // ---------- "Instalar la app" en el pie ----------
  function mostrarEnElPie() {
    const li = document.getElementById('pieInstalar');
    if (li) li.hidden = false;
  }

  // ---------- Los botones ----------
  document.addEventListener('click', async e => {
    const boton = e.target.closest('[data-instalar]');
    if (!boton) return;
    e.preventDefault();

    if (pedido) {
      pedido.prompt();
      const { outcome } = await pedido.userChoice;
      pedido = null;               // el navegador lo deja usar una sola vez
      if (outcome === 'accepted') ocultarAviso();
      return;
    }
    if (esIphone) explicarIphone();
  });

  // ---------- Cuándo se ofrece ----------
  // Android: cuando el navegador dice que se puede instalar
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();            // en vez de su cartel, el nuestro
    pedido = e;
    mostrarEnElPie();
    mostrarAviso();
  });

  // Ya instalada: fuera los avisos
  window.addEventListener('appinstalled', () => {
    pedido = null;
    ocultarAviso();
    const li = document.getElementById('pieInstalar');
    if (li) li.hidden = true;
  });

  // iPhone: no hay aviso del navegador, se ofrece directo (en Safari)
  if (esIphone && !dentroDeOtraApp) {
    const arrancar = () => { mostrarEnElPie(); mostrarAviso(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
    else arrancar();
  }
})();
