// ============================================================
// TIAGO STORE · Modo prueba
// ============================================================
// Para probar la tienda sin ensuciar las ventas. El panel abre la tienda
// con index.html#prueba=<clave> ("Probar la tienda") y este navegador
// queda en modo prueba hasta tocar "Salir":
//   · arriba se ve el cartel "Modo prueba"
//   · las compras se crean marcadas como prueba: no avisan por Telegram,
//     no cuentan en las ventas y, si nadie las paga, a las 2 horas se
//     cancelan solas
//   · no se anota nada en el embudo
//
// La clave la comprueba la base (supabase/20-modo-prueba.sql). Con un
// ?prueba=1 cualquier cliente podría comprar "de prueba".
//
// Lo usan js/tienda-catalogo.js (el embudo) y js/pedido-automatico.js (la
// compra). El cartel sale solo en cualquier página que lo cargue.
// ============================================================

import { sb } from './supabase-base.js';

const LLAVE = 'tiago-modo-prueba';

/** La clave de este navegador, o null si no está en modo prueba. */
export function clavePrueba() {
  try { return localStorage.getItem(LLAVE) || null; } catch { return null; }
}

export function salirDelModoPrueba() {
  try { localStorage.removeItem(LLAVE); } catch { /* nada */ }
  document.getElementById('modoPrueba')?.remove();
}

// #prueba=<clave> entra y #prueba=salir sale. Se saca de la dirección: así
// no queda en un link que se copie y se mande.
function leerDireccion() {
  const m = location.hash.match(/^#prueba=([0-9a-f]{32}|salir)$/i);
  if (!m) return;
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* da igual */ }
  const valor = m[1].toLowerCase();
  if (valor === 'salir') { salirDelModoPrueba(); return; }
  try { localStorage.setItem(LLAVE, valor); } catch { /* sin almacenamiento no hay modo prueba */ }
}

// Una clave que la base no reconoce (la cambiaron, o la escribieron a
// mano) no deja el cartel puesto: comprar con ella daría error. Si no se
// pudo preguntar (sin internet), se queda como está.
async function comprobar(clave) {
  try {
    const { data, error } = await sb.rpc('es_clave_de_prueba', { p_clave: clave });
    if (!error && data === false) salirDelModoPrueba();
  } catch { /* se queda como está */ }
}

// Arriba al medio, por encima de todo, también de la ventana de compra: se
// tiene que ver en cada pantalla que se está probando.
function pintarCartel() {
  if (document.getElementById('modoPrueba')) return;

  const css = document.createElement('style');
  css.textContent = `
    .modo-prueba {
      position: fixed; top: 6px; left: 50%; transform: translateX(-50%);
      z-index: 1000;
      display: flex; align-items: center; gap: .45rem;
      max-width: calc(100% - 20px);
      padding: .28rem .3rem .28rem .65rem;
      border-radius: 999px;
      background: #1f2430; color: #fde68a;
      font: 600 .74rem/1.2 'Outfit', system-ui, sans-serif;
      white-space: nowrap;
      box-shadow: 0 6px 18px rgba(20,22,26,.28);
    }
    .modo-prueba svg { flex: none; width: 15px; height: 15px; }
    .modo-prueba b { font-weight: 800; letter-spacing: .02em; }
    .modo-prueba-sub { color: #e5e7eb; overflow: hidden; text-overflow: ellipsis; }
    .modo-prueba button {
      flex: none; border: none; border-radius: 999px;
      padding: .26rem .65rem;
      background: #fde68a; color: #1f2430;
      font: inherit; font-weight: 800; cursor: pointer;
    }
  `;
  document.head.appendChild(css);

  const c = document.createElement('div');
  c.id = 'modoPrueba';
  c.className = 'modo-prueba';
  c.setAttribute('role', 'status');
  c.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/></svg>
    <b>Modo prueba</b>
    <span class="modo-prueba-sub">no cuenta como venta</span>
    <button type="button">Salir</button>`;
  c.querySelector('button').addEventListener('click', salirDelModoPrueba);
  document.body.appendChild(c);
}

function arrancar() {
  leerDireccion();
  const clave = clavePrueba();
  if (clave) {
    pintarCartel();
    comprobar(clave);
  }
}

arrancar();
// El link también puede llegar con la página ya abierta en esta pestaña
window.addEventListener('hashchange', () => {
  if (/^#prueba=/i.test(location.hash)) arrancar();
});
