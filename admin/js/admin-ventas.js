// ============================================================
// TIAGO STORE · Ventas (panel)
// ============================================================
// La vista 💳 Ventas: los pedidos que entran, y el botón que confirma el
// pago y dispara la entrega.
//
// LA PANTALLA QUE VAS A MIRAR TODO EL DÍA
//   El resto del panel se toca de vez en cuando (cambiar un precio, subir
//   una foto). Esta se mira cada vez que alguien compra. Por eso:
//     · los pedidos entran solos, sin recargar (Realtime)
//     · lo primero que se ve arriba es lo que necesita tu atención
//     · confirmar es un botón, no un formulario
//
// LA PUERTA ÚNICA
//   El botón "Confirmar pago" llama a confirmar_pago(), la misma función
//   que va a llamar el webhook de la pasarela cuando tengas una. No hay
//   dos caminos de entrega que puedan quedar desincronizados: hay uno.
//
// Solo plataformas, no juegos: ver el comentario de admin-stock.js.
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';
import { tengoPermiso, carteSinPermiso } from './admin-permiso.js';

const $ = id => document.getElementById(id);
const aviso = (t, tipo) => (window.avisoAdmin ? window.avisoAdmin(t, tipo) : console.log(t));

const escapar = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let PEDIDOS   = [];
let CREDS     = {};        // pedido_id -> credenciales entregadas
let filtro    = 'atencion';
let confirmando = null;

// En qué estados tiene sentido tocar "Confirmar".
//
// "vencido" está en la lista, y es el que menos se espera. Vencer es solo
// una etiqueta de orden: saca el pedido de la lista de pendientes para que
// esa pantalla no se llene de gente que nunca iba a pagar. NO significa
// que la plata no pueda llegar.
//
// De hecho llega seguido: alguien mira la tienda de noche, se va a dormir
// y transfiere a la mañana. Si el botón no estuviera, ese cliente pagó y
// vos no tendrías forma de entregarle desde el panel. La base siempre lo
// permitió —confirmar_pago() solo rechaza entregados y cancelados—; lo que
// faltaba era el botón.
const CONFIRMABLES = ['esperando_pago', 'pagado', 'sin_stock', 'vencido'];

// Cuántas cuentas libres hay de cada producto. Se llena en cada carga.
let STOCK = new Map();

/**
 * ¿Tiene sentido ofrecer el botón "Confirmar pago" en este pedido?
 *
 * No alcanza con que el estado lo permita: tiene que HABER una cuenta
 * para entregar. Confirmar un pedido sin stock no entrega nada — lo deja
 * en sin_stock y te obliga a resolverlo por WhatsApp igual. O sea que el
 * botón te hacía dar una vuelta para terminar en el mismo lugar.
 *
 * Con esto, los pedidos de productos sin cuentas cargadas muestran
 * directamente "Entrega por WhatsApp", que es lo que realmente va a pasar.
 * Y si más tarde cargás stock de ese producto, el botón aparece solo.
 */
function sePuedeConfirmar(p) {
  if (!CONFIRMABLES.includes(p.estado)) return false;

  // En una compra de varios productos, el botón confirma la compra ENTERA
  // y entrega lo que pueda. Así que alcanza con que UNA de sus líneas
  // tenga stock: negarte el botón porque falta una sería dejarte sin
  // entregar las otras dos.
  if (p.grupo) {
    return PEDIDOS.some(o =>
      o.grupo === p.grupo &&
      CONFIRMABLES.includes(o.estado) &&
      (STOCK.get(o.producto_id) || 0) > 0);
  }

  return (STOCK.get(p.producto_id) || 0) > 0;
}

/**
 * El primer pedido de cada compra agrupada.
 *
 * Una compra de 3 productos son 3 filas en la tabla, pero UNA sola venta:
 * se pagó con una transferencia y se confirma con un botón. Mostrar tres
 * botones haría pensar que son tres pagos distintos.
 *
 * Así que el botón va solo en la primera fila del grupo, y las demás
 * quedan marcadas como parte de la misma compra.
 */
function primerosDeGrupo(lista) {
  const vistos = new Set();
  const primeros = new Set();
  for (const p of lista) {
    if (!p.grupo) { primeros.add(p.id); continue; }
    if (!vistos.has(p.grupo)) { vistos.add(p.grupo); primeros.add(p.id); }
  }
  return primeros;
}

// El orden importa: es el orden en que te tenés que ocupar de las cosas.
const ESTADOS = {
  sin_stock:      { txt: 'Sin stock',    color: '#dc2626', bg: 'rgba(220,38,38,.10)' },
  esperando_pago: { txt: 'Esperando',    color: '#b45309', bg: 'rgba(180,83,9,.10)' },
  pagado:         { txt: 'Pagado',       color: '#b45309', bg: 'rgba(180,83,9,.10)' },
  entregado:      { txt: 'Entregado',    color: '#15803d', bg: 'rgba(21,128,61,.10)' },
  vencido:        { txt: 'Vencido',      color: '#9aa0ab', bg: 'rgba(20,22,26,.05)' },
  cancelado:      { txt: 'Cancelado',    color: '#9aa0ab', bg: 'rgba(20,22,26,.05)' }
};


// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .vt-wrap { max-width: 1180px; margin: 0 auto; padding: 22px 20px 60px; }

  .vt-barra { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
  .vt-filtro {
    background: none; border: 1px solid var(--borde);
    color: var(--gris); border-radius: 99px;
    padding: 7px 15px; font-size: 13.5px; cursor: pointer;
    font-family: inherit; font-weight: 600;
  }
  .vt-filtro:hover { border-color: var(--rojo); color: var(--rojo); }
  .vt-filtro.activo { background: var(--tinta); border-color: var(--tinta); color: #fff; }
  .vt-filtro .n {
    display: inline-block; margin-left: 6px;
    font-variant-numeric: tabular-nums; opacity: .75;
  }

  .vt-pedido {
    background: var(--panel);
    border: 1px solid var(--borde);
    border-radius: 12px;
    padding: 15px 17px;
    margin-bottom: 10px;
    display: grid;
    grid-template-columns: 62px 1fr auto;
    gap: 14px;
    align-items: center;
  }
  /* Lo que necesita tu atención se ve distinto sin tener que leerlo */
  .vt-pedido.urgente { border-color: rgba(220,38,38,.4); background: rgba(220,38,38,.03); }
  .vt-pedido.espera  { border-color: rgba(180,83,9,.35); }

  .vt-num {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 15px; font-weight: 700; color: var(--tinta);
    font-variant-numeric: tabular-nums;
  }
  .vt-fecha { font-size: 11.5px; color: var(--gris-dim); }

  .vt-medio { min-width: 0; }
  .vt-prod {
    font-weight: 600; color: var(--tinta); font-size: 14.5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .vt-cliente { font-size: 12.5px; color: var(--gris); margin-top: 3px; }
  .vt-cliente a { color: var(--gris); text-decoration: none; border-bottom: 1px dotted var(--borde); }
  .vt-cliente a:hover { color: #15803d; }

  .vt-der { display: flex; align-items: center; gap: 12px; flex: none; }
  .vt-precio {
    font-weight: 800; font-size: 16px; color: var(--tinta);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .vt-badge {
    font-size: 11.5px; font-weight: 700; padding: 4px 10px;
    border-radius: 99px; letter-spacing: .03em; white-space: nowrap;
  }

  /* Ocupa el lugar del botón cuando no hay stock. Se ve apagado a
     propósito: no es una acción, es un aviso de que ese pedido se resuelve
     en otro lado. */
  .vt-wa-only {
    font-size: 12.5px; font-weight: 600; color: var(--gris);
    white-space: nowrap; padding: 4px 2px;
  }

  /* Credenciales entregadas, por si hay que reenviarlas a mano */
  .vt-cred {
    grid-column: 1 / -1;
    margin-top: 4px; padding: 10px 13px;
    background: var(--panel-2); border-radius: 9px;
    font-family: ui-monospace, Consolas, monospace; font-size: 12.5px;
    display: flex; gap: 16px; flex-wrap: wrap; align-items: center;
  }
  .vt-cred button {
    margin-left: auto; background: none; border: 1px solid var(--borde);
    color: var(--gris); border-radius: 7px; padding: 4px 10px;
    font-size: 12px; cursor: pointer; font-family: inherit;
  }
  .vt-cred button:hover { border-color: var(--rojo); color: var(--rojo); }

  .vt-vacio { padding: 56px 20px; text-align: center; color: var(--gris-dim); }
  .vt-vacio .emo { font-size: 42px; margin-bottom: 12px; }

  /* ---------- Modal de confirmación ---------- */
  .vt-fondo {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(20,22,26,.42); backdrop-filter: blur(3px);
    display: none; overflow-y: auto; padding: 24px 16px;
  }
  .vt-fondo.abierto { display: block; }
  .vt-modal {
    max-width: 470px; margin: 0 auto;
    background: var(--panel); border: 1px solid var(--borde);
    border-radius: 15px; box-shadow: var(--sombra-alta);
    padding: 24px;
  }
  .vt-modal h3 { margin: 0 0 6px; font-size: 18px; color: var(--tinta); }
  .vt-modal .sub { font-size: 13.5px; color: var(--gris); line-height: 1.55; margin: 0 0 18px; }
  .vt-modal label {
    display: block; font-size: 12.5px; font-weight: 600;
    color: var(--gris); margin-bottom: 6px;
  }
  .vt-modal input {
    width: 100%; padding: 10px 12px; margin-bottom: 6px;
    background: var(--panel-2); border: 1px solid var(--borde);
    border-radius: 8px; color: var(--texto); font-size: 14px; font-family: inherit;
  }
  .vt-modal input:focus { outline: none; border-color: var(--rojo); }
  .vt-nota {
    font-size: 12.5px; color: var(--gris-dim); line-height: 1.5; margin: 10px 0 0;
  }
  .vt-pie { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }

  .vt-alerta {
    padding: 11px 13px; border-radius: 9px; font-size: 13px;
    line-height: 1.5; margin-bottom: 16px;
  }
  .vt-alerta.ojo { background: rgba(180,83,9,.09); border: 1px solid rgba(180,83,9,.28); color: #7c3d06; }

  @media (max-width: 680px) {
    .vt-pedido { grid-template-columns: 1fr auto; }
    .vt-num-caja { grid-column: 1 / -1; display: flex; gap: 10px; align-items: baseline; }
  }
`;
document.head.appendChild(css);


// ============================================================
// 2. LA VISTA
// ============================================================
$('vistaVentas').innerHTML = `
  <div class="vt-wrap">
    <section class="resumen" style="margin-bottom:22px;">
      <div class="metrica"><div class="metrica-n warn" id="vtEsperando">–</div><div class="metrica-l">Esperando pago</div></div>
      <div class="metrica"><div class="metrica-n ok"   id="vtHoy">–</div><div class="metrica-l">Entregados hoy</div></div>
      <div class="metrica"><div class="metrica-n"      id="vtHoyBs">–</div><div class="metrica-l">Vendido hoy</div></div>
      <div class="metrica"><div class="metrica-n"      id="vtProblemas">–</div><div class="metrica-l">Necesitan atención</div></div>
    </section>

    <div class="vt-barra">
      <button class="vt-filtro activo" data-filtro="atencion">⚠️ Para atender <span class="n" id="nAtencion"></span></button>
      <button class="vt-filtro" data-filtro="entregado">✓ Entregados <span class="n" id="nEntregado"></span></button>
      <button class="vt-filtro" data-filtro="todos">Todos <span class="n" id="nTodos"></span></button>
      <button class="btn btn-fantasma" id="vtRefrescar" style="margin-left:auto;">↻ Actualizar</button>
    </div>

    <div id="vtLista"></div>
  </div>

  <!-- ===== Modal: confirmar pago ===== -->
  <div class="vt-fondo" id="vtFondo">
    <div class="vt-modal">
      <h3>Confirmar el pago</h3>
      <p class="sub" id="vtSub"></p>

      <div class="vt-alerta ojo">
        Confirmá solo si <strong>ya viste la plata en tu cuenta</strong>.
        Al confirmar, la cuenta se entrega sola y no se puede deshacer.
      </div>

      <label for="vtRef">Número de comprobante <span style="font-weight:400;">(opcional)</span></label>
      <input type="text" id="vtRef" placeholder="Ej: 00123456" autocomplete="off">
      <p class="vt-nota">
        Sirve para cruzarlo después con el extracto del banco si alguna vez
        hay una discusión sobre un pago.
      </p>

      <div class="vt-pie">
        <button class="btn btn-fantasma" id="vtCancelar">Cancelar</button>
        <button class="btn btn-primario" id="vtConfirmar">Confirmar y entregar</button>
      </div>
    </div>
  </div>
`;


// ============================================================
// 3. LEER DE LA BASE
// ============================================================
async function cargarTodo() {
  // Preguntar ANTES de consultar. RLS devuelve una lista vacía cuando no
  // te deja leer, así que sin esto la pantalla diría "no hay nada
  // pendiente" a alguien que tiene 40 pedidos y no los puede ver.
  const permiso = await tengoPermiso();
  if (!permiso.puede) {
    $('vtLista').innerHTML = carteSinPermiso(permiso.motivo, 'vt-vacio');
    ['vtEsperando','vtHoy','vtHoyBs','vtProblemas'].forEach(id => { $(id).textContent = '–'; });
    return;
  }

  $('vtRefrescar').disabled = true;

  // Los últimos 200 alcanzan: esta pantalla es para trabajar el día, no
  // para hacer contabilidad del año.
  //
  // El stock viene junto porque de él depende si se muestra el botón de
  // confirmar. Van las dos consultas a la vez, no una después de la otra.
  const [rPedidos, rStock] = await Promise.all([
    sbAdmin.from('pedidos').select('*')
      .order('creado_en', { ascending: false })
      .limit(200),
    sbAdmin.rpc('stock_disponible')
  ]);

  const { data, error } = rPedidos;

  // Si falla el stock no se corta nada: se queda el mapa vacío y ningún
  // pedido muestra el botón. Es el lado seguro — peor sería ofrecerte
  // confirmar algo que no se puede entregar.
  STOCK = rStock.error
    ? new Map()
    : new Map((rStock.data || []).map(f => [f.producto_id, f.libres]));

  $('vtRefrescar').disabled = false;

  if (error) {
    console.error(error);
    const rls = (error.message || '').toLowerCase().includes('permission') || error.code === '42501';
    $('vtLista').innerHTML = `
      <div class="vt-vacio">
        <div class="emo">🔒</div>
        <h3>No se pudieron leer los pedidos</h3>
        <p>${escapar(error.message)}</p>
        ${rls ? '<p>Tu usuario no está en la tabla <code>admins</code>.</p>' : ''}
      </div>`;
    return;
  }

  PEDIDOS = data;
  await cargarCredenciales();
  metricas();
  listar();
}

// Las credenciales ya entregadas, para poder reenviarlas si el cliente
// dice que no le llegó o cerró la pestaña sin copiar.
async function cargarCredenciales() {
  const ids = PEDIDOS.filter(p => p.estado === 'entregado').map(p => p.id);
  if (ids.length === 0) { CREDS = {}; return; }

  const { data, error } = await sbAdmin
    .from('cuentas').select('pedido_id, credenciales').in('pedido_id', ids);

  if (error) { console.error(error); return; }

  CREDS = {};
  for (const c of data) CREDS[c.pedido_id] = c.credenciales;
}


// ============================================================
// 4. MÉTRICAS
// ============================================================
function metricas() {
  const hoy = new Date().toDateString();

  const esperando = PEDIDOS.filter(p => p.estado === 'esperando_pago');
  const problemas = PEDIDOS.filter(p => p.estado === 'sin_stock' || p.estado === 'pagado');
  const dadosHoy  = PEDIDOS.filter(p =>
    p.estado === 'entregado' && p.entregado_en &&
    new Date(p.entregado_en).toDateString() === hoy);

  const bsHoy = dadosHoy.reduce((s, p) => s + Number(p.precio || 0), 0);

  $('vtEsperando').textContent = esperando.length;
  $('vtHoy').textContent       = dadosHoy.length;
  $('vtHoyBs').textContent     = bsHoy > 0 ? `${bsHoy.toFixed(0)} Bs` : '–';
  $('vtProblemas').textContent = problemas.length;
}


// ============================================================
// 5. LA LISTA
// ============================================================
// "Para atender" es la vista por defecto a propósito: al abrir la pestaña
// tenés adelante lo que hay que hacer, no un historial que ya resolviste.
function pedidosDelFiltro() {
  if (filtro === 'atencion') {
    return PEDIDOS.filter(p =>
      p.estado === 'sin_stock' || p.estado === 'pagado' || p.estado === 'esperando_pago');
  }
  if (filtro === 'entregado') return PEDIDOS.filter(p => p.estado === 'entregado');
  return PEDIDOS;
}

function listar() {
  $('nAtencion').textContent  = PEDIDOS.filter(p =>
    ['sin_stock','pagado','esperando_pago'].includes(p.estado)).length || '';
  $('nEntregado').textContent = PEDIDOS.filter(p => p.estado === 'entregado').length || '';
  $('nTodos').textContent     = PEDIDOS.length || '';

  const lista = pedidosDelFiltro();

  if (lista.length === 0) {
    $('vtLista').innerHTML = `
      <div class="vt-vacio">
        <div class="emo">${filtro === 'atencion' ? '✅' : '🧾'}</div>
        <h3>${filtro === 'atencion' ? 'No hay nada pendiente' : 'Todavía no hay pedidos'}</h3>
        <p>${filtro === 'atencion'
             ? 'Todos los pedidos están resueltos.'
             : 'Van a aparecer acá solos, apenas alguien compre.'}</p>
      </div>`;
    return;
  }

  const primeros = primerosDeGrupo(lista);
  $('vtLista').innerHTML = lista.map(p => pintarPedido(p, primeros.has(p.id))).join('');
}

function pintarPedido(p, esPrimeroDelGrupo = true) {
  const e = ESTADOS[p.estado] || ESTADOS.cancelado;
  const cred = CREDS[p.id];

  const clase = p.estado === 'sin_stock' ? 'urgente'
              : p.estado === 'esperando_pago' || p.estado === 'pagado' ? 'espera' : '';

  const wa = (p.cliente_whatsapp || '').replace(/[^0-9]/g, '');

  return `
    <div class="vt-pedido ${clase}">
      <div class="vt-num-caja">
        <div class="vt-num">#${p.numero}</div>
        <!-- Entregado: la fecha y hora exactas, con año. "hace 3 h" sirve
             para trabajar el día, pero cuando un cliente reclama dentro de
             un mes lo que necesitás es el dato completo para cruzarlo con
             el extracto del banco. -->
        <div class="vt-fecha">${p.entregado_en
          ? fechaCompleta(p.entregado_en)
          : cuandoFue(p.creado_en)}</div>
      </div>

      <div class="vt-medio">
        <div class="vt-prod">${escapar(p.producto_nombre)}</div>
        <div class="vt-cliente">
          ${escapar(p.cliente_nombre || 'Sin nombre')}
          ${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener">📲 ${escapar(p.cliente_whatsapp)}</a>` : ''}
          ${p.cliente_email ? ` · ${escapar(p.cliente_email)}` : ''}
          ${p.referencia_pago ? ` · comprobante ${escapar(p.referencia_pago)}` : ''}
        </div>
      </div>

      <div class="vt-der">
        <span class="vt-precio">${Number(p.precio).toFixed(2)} Bs</span>
        <span class="vt-badge" style="color:${e.color};background:${e.bg}">${e.txt}</span>
        ${(esPrimeroDelGrupo && sePuedeConfirmar(p))
          ? `<button class="btn btn-primario" data-confirmar="${p.id}">
               ${p.estado === 'sin_stock' ? 'Reintentar'
                 : p.estado === 'vencido' ? 'Pagó tarde: entregar'
                 : p.grupo               ? 'Confirmar compra'
                 : 'Confirmar pago'}
             </button>`
          : (!esPrimeroDelGrupo)
            // Parte de una compra que ya tiene su botón más arriba. Se dice
            // para que no parezca un pedido olvidado sin acción.
            ? `<span class="vt-wa-only">↑ misma compra</span>`
            : CONFIRMABLES.includes(p.estado)
            // Sin cuentas cargadas no hay nada que entregar, así que no se
            // ofrece un botón que solo daría una vuelta para terminar en
            // WhatsApp igual. Se dice de una qué hay que hacer.
            ? `<span class="vt-wa-only">Entrega por WhatsApp</span>`
            : ''}
      </div>

      ${cred ? `
        <div class="vt-cred">
          <span>👤 ${escapar(cred.usuario || '')}</span>
          ${cred.clave  ? `<span>🔑 ${escapar(cred.clave)}</span>`   : ''}
          ${cred.perfil ? `<span>👥 ${escapar(cred.perfil)}</span>`  : ''}
          ${cred.pin    ? `<span># ${escapar(cred.pin)}</span>`      : ''}
          <button data-copiar="${p.id}">Copiar para mandar</button>
        </div>` : ''}

      ${p.estado === 'sin_stock' ? `
        <div class="vt-cred" style="background:rgba(220,38,38,.06);color:#8f1616;">
          Pagó y no había cuentas libres. Cargá stock de este producto y tocá
          <strong>Reintentar</strong>, o resolvelo por WhatsApp.
        </div>` : ''}
    </div>`;
}

// "hace 5 min" se lee mucho más rápido que una fecha, y en esta pantalla
// lo que importa es qué tan reciente es, no el día exacto.
function cuandoFue(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (min < 1)    return 'recién';
  if (min < 60)   return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)     return `hace ${h} h`;
  return new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
}

// Fecha, hora y AÑO de la entrega: "8 sep 2026, 14:32".
//
// Para trabajar el día alcanza con "hace 3 h", pero cuando un cliente
// reclama dentro de un mes —"pagué y no me llegó"— lo que necesitás es el
// momento exacto para cruzarlo con el extracto del banco. Por eso el año
// va aunque sea el actual: la captura que le mandes tiene que valer sola,
// sin que nadie tenga que adivinar de qué año habla.
function fechaCompleta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-BO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}


// ============================================================
// 6. INTERACCIÓN
// ============================================================
document.querySelector('.vt-barra').addEventListener('click', e => {
  const btn = e.target.closest('[data-filtro]');
  if (!btn) return;
  document.querySelectorAll('.vt-filtro').forEach(f => f.classList.remove('activo'));
  btn.classList.add('activo');
  filtro = btn.dataset.filtro;
  listar();
});

$('vtRefrescar').addEventListener('click', cargarTodo);

$('vtLista').addEventListener('click', async e => {
  const confirmar = e.target.closest('[data-confirmar]');
  if (confirmar) { abrirConfirmacion(confirmar.dataset.confirmar); return; }

  const copiar = e.target.closest('[data-copiar]');
  if (copiar) { await copiarParaMandar(copiar.dataset.copiar); return; }
});

// Deja el mensaje listo para pegar en WhatsApp, con el formato que ya usás.
async function copiarParaMandar(pedidoId) {
  const p    = PEDIDOS.find(x => x.id === pedidoId);
  const cred = CREDS[pedidoId];
  if (!p || !cred) return;

  const texto = [
    `🦁 *TIAGO STORE* · Pedido #${p.numero}`,
    ``,
    `*${p.producto_nombre}*`,
    ``,
    `👤 Usuario: ${cred.usuario || ''}`,
    cred.clave  ? `🔑 Clave: ${cred.clave}`   : '',
    cred.perfil ? `👥 Perfil: ${cred.perfil}` : '',
    cred.pin    ? `🔢 PIN: ${cred.pin}`       : '',
    cred.notas  ? `\n📌 ${cred.notas}`        : '',
    ``,
    `¡Gracias por tu compra!`
  ].filter(l => l !== '').join('\n');

  try {
    await navigator.clipboard.writeText(texto);
    aviso('Mensaje copiado, pegalo en WhatsApp', 'ok');
  } catch {
    aviso('No se pudo copiar. Seleccionalo a mano.', 'error');
  }
}


// ============================================================
// 7. CONFIRMAR
// ============================================================
function abrirConfirmacion(pedidoId) {
  const p = PEDIDOS.find(x => x.id === pedidoId);
  if (!p) return;

  confirmando = p;
  $('vtSub').innerHTML =
    `Pedido <strong>#${p.numero}</strong> · ${escapar(p.producto_nombre)}<br>` +
    `<strong>${Number(p.precio).toFixed(2)} Bs</strong> de ${escapar(p.cliente_nombre || 'cliente sin nombre')}`;
  $('vtRef').value = p.referencia_pago || '';
  $('vtFondo').classList.add('abierto');
  $('vtRef').focus();
}

function cerrar() { $('vtFondo').classList.remove('abierto'); confirmando = null; }

$('vtCancelar').addEventListener('click', cerrar);
$('vtFondo').addEventListener('click', e => { if (e.target === $('vtFondo')) cerrar(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('vtFondo').classList.contains('abierto')) cerrar();
});

$('vtConfirmar').addEventListener('click', async () => {
  if (!confirmando) return;
  const p   = confirmando;
  const btn = $('vtConfirmar');

  btn.disabled = true;
  btn.textContent = 'Confirmando…';

  const referencia = $('vtRef').value.trim() || null;
  const quien      = 'panel:' + ($('usuarioEmail')?.textContent || 'admin');

  // Si el pedido es parte de una compra de varios productos, se confirma
  // la compra ENTERA. Se pagó con una sola transferencia, así que confirmar
  // de a uno sería hacerte tocar el botón tres veces por un solo pago —y
  // peor: entre toque y toque el cliente vería media compra entregada.
  const { data, error } = p.grupo
    ? await sbAdmin.rpc('confirmar_compra', {
        p_grupo: p.grupo, p_referencia: referencia, p_quien: quien })
    : await sbAdmin.rpc('confirmar_pago', {
        p_pedido_id: p.id, p_referencia: referencia, p_quien: quien });

  btn.disabled = false;
  btn.textContent = 'Confirmar y entregar';

  if (error) {
    console.error(error);
    aviso(`No se pudo confirmar: ${error.message}`, 'error');
    return;
  }

  if (p.grupo) {
    // confirmar_compra devuelve { entregados, sin_stock, sin_cambio }
    const r = data || {};
    if (r.sin_stock > 0 && r.entregados > 0) {
      aviso(`✓ ${r.entregados} entregada(s), ${r.sin_stock} sin stock. Cargá cuentas y reintentá.`, 'error');
    } else if (r.sin_stock > 0) {
      aviso(`Pago registrado, pero no había stock. Cargá cuentas y reintentá.`, 'error');
    } else {
      aviso(`✓ Compra entregada: ${r.entregados} cuenta(s)`, 'ok');
    }
  } else {
    // confirmar_pago devuelve una fila: { estado, entregada, mensaje }
    const r = Array.isArray(data) ? data[0] : data;
    if (r.entregada) {
      aviso(`✓ Pedido #${p.numero} entregado`, 'ok');
    } else if (r.estado === 'sin_stock') {
      aviso(`Pago registrado, pero no hay stock de "${p.producto_nombre}". Cargá cuentas y reintentá.`, 'error');
    } else {
      aviso(r.mensaje, 'ok');
    }
  }

  cerrar();
  await cargarTodo();
});


// ============================================================
// 8. LOS PEDIDOS ENTRAN SOLOS
// ============================================================
// Sin esto habría que estar recargando para ver si alguien compró. El
// panel está logueado y es admin, así que RLS lo deja escuchar la tabla.
// (La página del cliente NO puede: ver el comentario de 05-cobros.sql.)
let canal = null;

function escuchar() {
  if (canal) return;
  canal = sbAdmin
    .channel('pedidos-panel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
      if (payload.eventType === 'INSERT') {
        aviso(`🛒 Pedido nuevo: ${payload.new.producto_nombre}`, 'ok');
      }
      cargarTodo();
    })
    .subscribe();
}


// ============================================================
// 9. ARRANQUE
// ============================================================
let yaCargado = false;
document.addEventListener('vista-cambiada', e => {
  if (e.detail.vista !== 'ventas') return;
  if (!yaCargado) { yaCargado = true; cargarTodo(); escuchar(); }
  else cargarTodo();
});

console.log('%c✓ Ventas listo', 'color:#22c55e;font-weight:bold');
