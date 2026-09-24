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
import { agruparCompras, numerosDeCompra, productosDeCompra, nombreDeCompra,
         estadoPrincipal, cuantasCompras } from './admin-compras.js';

const $ = id => document.getElementById(id);
const aviso = (t, tipo) => (window.avisoAdmin ? window.avisoAdmin(t, tipo) : console.log(t));

const escapar = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let PEDIDOS   = [];
let CREDS     = {};        // pedido_id -> credenciales entregadas
let filtro    = 'atencion';
let confirmando = null;
// Si los pedidos ya se leyeron alguna vez. Lo mira el aviso en vivo: sin
// datos cargados no hay nada que refrescar, alcanza con avisar.
let yaCargado = false;

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
 * Cuántas de las cuentas que faltan entregar de una compra salen solas al
 * confirmar, con el stock de ahora.
 *
 * De esto depende el botón "Confirmar pago": tiene que HABER una cuenta
 * para entregar. Confirmar sin stock no entrega nada — deja el pedido en
 * sin_stock y te obliga a resolverlo por WhatsApp igual. Así que sin
 * cuentas cargadas se muestra directamente "Entrega por WhatsApp", y si
 * más tarde cargás stock, el botón aparece solo.
 *
 * En una compra de varios productos alcanza con que haya para UNA: el
 * botón confirma la compra entera y entrega lo que pueda. Negarte el botón
 * porque falta una sería dejarte sin entregar las otras dos.
 *
 * Dos unidades del mismo producto piden dos cuentas: con una sola libre,
 * se entrega una.
 */
function cobertura(c) {
  const pendientes = c.lineas.filter(o => CONFIRMABLES.includes(o.estado));

  let hay = 0;
  const faltan = [];              // "Disney ×1": lo que queda sin stock
  for (const x of productosDeCompra(pendientes)) {
    const libres = STOCK.get(x.lineas[0].producto_id) || 0;
    const salen  = Math.min(x.cant, libres);
    hay += salen;
    if (salen < x.cant) faltan.push(`${x.nombre} ×${x.cant - salen}`);
  }
  return { hay, de: pendientes.length, faltan, pendientes };
}

/** La compra entera de un pedido: él y los que se compraron con él. */
function compraDe(p) {
  const clave = p.grupo || p.id;
  return agruparCompras(PEDIDOS.filter(o => (o.grupo || o.id) === clave))[0];
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
  .vt-fecha-sel {
    background: var(--panel-2); border: 1px solid var(--borde);
    color: var(--texto); border-radius: 99px;
    padding: 6px 13px; font-size: 13.5px; font-family: inherit;
  }
  .vt-fecha-sel:focus { outline: none; border-color: var(--rojo); }
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
    grid-template-columns: 86px 1fr auto;
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
  .vt-orden {
    font-size: 12px; color: var(--gris-dim); margin-top: 3px;
    font-variant-numeric: tabular-nums;
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

  /* "Listo" y "✕" para los pedidos que se entregan por WhatsApp.
     Van chicos y apagados a propósito: el botón importante de esta
     pantalla es "Confirmar pago", estos son el cierre a mano. */
  .vt-mini {
    background: none; border: 1px solid var(--borde); color: var(--gris);
    border-radius: 8px; padding: 5px 11px;
    font-size: 12.5px; font-weight: 700; font-family: inherit;
    cursor: pointer; white-space: nowrap;
  }
  .vt-mini:hover { border-color: #15803d; color: #15803d; }
  .vt-mini.no { padding: 5px 9px; }
  .vt-mini.no:hover { border-color: var(--rojo); color: var(--rojo); }

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

  /* Los cuatro datos de la cuenta, de a dos por fila en pantalla grande */
  .vt-mano-campos { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10px; }
  @media (max-width: 480px) {
    .vt-mano-campos { grid-template-columns: 1fr; }
  }

  .vt-alerta {
    padding: 11px 13px; border-radius: 9px; font-size: 13px;
    line-height: 1.5; margin-bottom: 16px;
  }
  .vt-alerta.ojo { background: rgba(180,83,9,.09); border: 1px solid rgba(180,83,9,.28); color: #7c3d06; }

  /* ---------- Motivo del rechazo ---------- */
  .vt-motivos { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 9px; }
  .vt-motivo {
    background: none; border: 1px solid var(--borde); color: var(--gris);
    border-radius: 99px; padding: 6px 13px;
    font-size: 12.5px; font-family: inherit; cursor: pointer;
  }
  .vt-motivo:hover { border-color: var(--rojo); color: var(--rojo); }
  .vt-motivo.elegido { background: var(--tinta); border-color: var(--tinta); color: #fff; }

  /* El motivo escrito a mano, en la fila del pedido rechazado */
  .vt-motivo-fila {
    grid-column: 1 / -1;
    font-size: 12.5px; color: var(--gris);
    padding: 7px 11px; border-radius: 8px;
    background: var(--panel-2);
  }

  /* El que pidió aviso de renovación. Va en verde y no en gris: es el
     único renglón de la fila que pide algo tuyo más adelante. */
  .vt-renov-fila {
    grid-column: 1 / -1;
    font-size: 12.5px; color: #15803d;
    padding: 7px 11px; border-radius: 8px;
    background: rgba(34,197,94,.09);
  }
  .vt-renov-fila strong { color: #14532d; }

  /* ---------- Lo que se compró ----------
     Renglón por renglón, con el descuento combo y el total: la misma
     cuenta que el cliente vio en el carrito y en el QR. El total es lo que
     se compara con la transferencia. */
  .vt-lineas {
    grid-column: 1 / -1;
    border: 1px solid var(--borde); border-radius: 10px;
    padding: 2px 13px;
    font-size: 13px; font-variant-numeric: tabular-nums;
  }
  .vt-linea {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 0; border-bottom: 1px dashed var(--borde);
  }
  .vt-linea:last-child, .vt-linea:has(+ .total) { border-bottom: none; }
  .vt-l-cant { flex: none; min-width: 24px; font-weight: 700; color: var(--gris); }
  .vt-l-nom  { flex: 1; min-width: 0; font-weight: 600; color: var(--tinta); }
  .vt-l-nom small { font-weight: 400; font-size: 11.5px; color: var(--gris-dim); margin-left: 6px; }
  .vt-l-bs   { flex: none; font-weight: 700; color: var(--tinta); white-space: nowrap; }
  .vt-linea.desc .vt-l-nom, .vt-linea.desc .vt-l-bs { color: #15803d; }
  .vt-linea.total { border-top: 1px solid var(--borde); }
  .vt-linea.total .vt-l-nom { font-weight: 800; }
  .vt-linea.total .vt-l-bs  { font-weight: 800; font-size: 15px; }
  .vt-modal .vt-lineas { margin-bottom: 16px; }

  /* Cuántas cuentas salen solas al confirmar. En azul si alcanza para
     todo; en naranja si algo va a quedar sin stock. */
  .vt-stock-fila {
    grid-column: 1 / -1;
    font-size: 12.5px; padding: 7px 11px; border-radius: 8px;
    background: rgba(29,78,216,.07); color: #1e3a8a;
  }
  .vt-stock-fila.parcial { background: rgba(180,83,9,.09); color: #7c3d06; }

  /* De qué producto es cada cuenta, cuando la compra tiene varias */
  .vt-cred-de { font-family: 'Outfit', system-ui, sans-serif; font-weight: 700; color: var(--tinta); }
  .vt-cred-todas { grid-column: 1 / -1; display: flex; justify-content: flex-end; }

  /* ---------- Celular ----------
     La fila deja de ser una grilla de tres columnas y pasa a ser una sola,
     en tres renglones: número, producto y cliente, y abajo plata y botones.

     ANTES ERA "1fr auto" Y ESO ROMPÍA LA FILA. La columna "auto" son el
     precio, el estado y los botones, todos con white-space: nowrap: entre
     los cinco pedían 408 px. Como "auto" se sirve primero y "1fr" se queda
     con el resto, al 1fr no le quedaba nada — medido: 0 px. El nombre del
     producto, la fecha y el cliente quedaban en una columna de ancho cero,
     partidos en una letra por renglón. */
  @media (max-width: 680px) {
    .vt-pedido { grid-template-columns: 1fr; gap: 10px; padding: 14px; }
    .vt-num-caja { display: flex; gap: 10px; align-items: baseline; }

    /* El nombre puede ocupar dos renglones. Es lo que identifica el
       pedido: cortarlo con puntos suspensivos no ayuda a nadie. */
    .vt-prod { white-space: normal; overflow: visible; }

    /* Y que la plata y los botones envuelvan en vez de empujar. */
    .vt-der { flex-wrap: wrap; gap: 9px 12px; }
    .vt-cred { margin-top: 0; }
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
      <!-- "El cliente dice que hizo una orden el lunes": con esto se busca
           por el día que él te dice, sin scrollear la lista entera. -->
      <button class="vt-filtro" data-filtro="fecha">📅 Por fecha <span class="n" id="nFecha"></span></button>
      <input type="date" id="vtFecha" class="vt-fecha-sel" style="display:none;">
      <!-- Solo aparece si el navegador todavía no tiene permiso: pedirlo
           hace falta que salga de un toque tuyo, no se puede solo. -->
      <button class="vt-filtro" id="vtAvisos" hidden style="margin-left:auto;">🔔 Activar avisos</button>
      <button class="btn btn-fantasma" id="vtRefrescar" style="margin-left:auto;">↻ Actualizar</button>
    </div>

    <div id="vtLista"></div>
  </div>

  <!-- ===== Modal: confirmar pago ===== -->
  <div class="vt-fondo" id="vtFondo">
    <div class="vt-modal">
      <h3>Confirmar el pago</h3>
      <p class="sub" id="vtSub"></p>

      <!-- Lo que se compró y el total. Es contra este número que mirás la
           transferencia: con el descuento combo, ya no es el precio de
           ningún producto suelto. -->
      <div id="vtDetalle"></div>

      <div class="vt-alerta ojo" id="vtAlerta"></div>

      <!-- El nombre y no el número de comprobante: en la transferencia lo
           que ves es quién te pagó, y ese es el dato con el que después
           encontrás la venta. El número había que copiarlo a mano de una
           captura, y no le decía nada a nadie. -->
      <label for="vtCliente">Nombre del cliente <span style="font-weight:400;">(opcional)</span></label>
      <input type="text" id="vtCliente" placeholder="Ej: María Pérez" autocomplete="off">
      <p class="vt-nota">
        El nombre que te figura en la transferencia. Queda guardado en el
        pedido, así después sabés de quién fue esta venta.
      </p>

      <div class="vt-pie">
        <button class="btn btn-fantasma" id="vtCancelar">Cancelar</button>
        <button class="btn btn-primario" id="vtConfirmar">Confirmar y entregar</button>
      </div>
    </div>
  </div>

  <!-- ===== Modal: cerrar a mano (Listo / ✕) ===== -->
  <div class="vt-fondo" id="vtFondoMano">
    <div class="vt-modal" role="alertdialog" aria-modal="true">
      <h3 id="vtManoTitulo"></h3>
      <p class="sub" id="vtManoSub"></p>
      <div id="vtManoDetalle"></div>
      <div class="vt-alerta ojo" id="vtManoAviso"></div>

      <!-- La cuenta que le pasaste por el chat. Guardarla acá es lo que
           hace que el cliente la vea en su página y en "Mis compras", en
           vez de depender de que no borre la conversación. -->
      <div id="vtManoCuenta" hidden>
        <label>Datos de la cuenta <span style="font-weight:400;">(opcional)</span></label>
        <div class="vt-mano-campos">
          <input type="text" id="vtManoUsuario" placeholder="Usuario o correo" autocomplete="off">
          <input type="text" id="vtManoClave"   placeholder="Clave"            autocomplete="off">
          <input type="text" id="vtManoPerfil"  placeholder="Perfil"           autocomplete="off">
          <input type="text" id="vtManoPin"     placeholder="PIN"              autocomplete="off">
        </div>
        <p class="vt-nota" id="vtManoNota"></p>
      </div>

      <!-- Por qué lo rechazás. Dentro de un mes, seis pedidos rechazados
           sin motivo no te dicen nada; con motivo te dicen si el problema
           es que la gente no paga, que los comprobantes no cierran, o que
           son pruebas tuyas. Son tres cosas distintas. -->
      <div id="vtManoMotivo" hidden>
        <label>¿Por qué lo rechazás?</label>
        <div class="vt-motivos" id="vtMotivos"></div>
        <input type="text" id="vtManoMotivoOtro" placeholder="O escribilo con tus palabras" autocomplete="off">
      </div>

      <div class="vt-pie">
        <button class="btn btn-fantasma" id="vtManoVolver">Volver</button>
        <button class="btn btn-primario" id="vtManoOk"></button>
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
  yaCargado = true;
  await cargarCredenciales();
  metricas();

  // Mirando por fecha, los últimos 200 pueden no llegar a ese día: se
  // vuelven a traer los suyos, y cargarDia() termina pintando la lista.
  if (filtro === 'fecha' && $('vtFecha').value) {
    await cargarDia($('vtFecha').value);
    return;
  }

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
// Se cuentan COMPRAS, no filas: la de 3 productos es un pago por
// confirmar, no tres. La plata sí sale de las filas, y como "precio" ya
// trae el descuento combo, la suma es lo que entró de verdad.
function metricas() {
  const hoy = new Date().toDateString();

  const esperando = PEDIDOS.filter(p => p.estado === 'esperando_pago');
  const problemas = PEDIDOS.filter(p => p.estado === 'sin_stock' || p.estado === 'pagado');
  const dadosHoy  = PEDIDOS.filter(p =>
    p.estado === 'entregado' && p.entregado_en &&
    new Date(p.entregado_en).toDateString() === hoy);

  const bsHoy = dadosHoy.reduce((s, p) => s + Number(p.precio || 0), 0);

  $('vtEsperando').textContent = cuantasCompras(esperando);
  $('vtHoy').textContent       = cuantasCompras(dadosHoy);
  $('vtHoyBs').textContent     = bsHoy > 0 ? `${bsHoy.toFixed(0)} Bs` : '–';
  $('vtProblemas').textContent = cuantasCompras(problemas);
}


// ============================================================
// 5. LA LISTA
// ============================================================
// "Para atender" es la vista por defecto a propósito: al abrir la pestaña
// tenés adelante lo que hay que hacer, no un historial que ya resolviste.
//
// Se filtran compras: una entra si ALGUNA de sus líneas cumple. Una con
// una cuenta entregada y otra sin stock sale en "Para atender" y en
// "Entregados", porque las dos cosas son ciertas.
const EN_ATENCION = ['sin_stock', 'pagado', 'esperando_pago'];

const algunaEn = (c, estados) => c.lineas.some(o => estados.includes(o.estado));

function comprasDelFiltro(compras) {
  if (filtro === 'atencion')  return compras.filter(c => algunaEn(c, EN_ATENCION));
  if (filtro === 'entregado') return compras.filter(c => algunaEn(c, ['entregado']));
  if (filtro === 'fecha') {
    const dia = $('vtFecha').value;
    return dia ? compras.filter(c => diaLocal(c.primera.creado_en) === dia) : [];
  }
  return compras;
}

// El día de un timestamp, en TU hora y con el formato del <input type=date>.
// La base guarda en UTC: a las 21:00 de Bolivia allá ya es el día siguiente,
// así que comparar los textos crudos traería los pedidos del día equivocado.
function diaLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Los pedidos de un día, traídos de la base.
 *
 * La pantalla trabaja con los últimos 200 pedidos, que alcanzan para el
 * día a día pero se quedan cortos apenas se busca hacia atrás: sin esto,
 * elegir una fecha de hace dos meses mostraría "no hubo pedidos" cuando en
 * realidad los hubo y no estaban cargados.
 *
 * Los que faltan se SUMAN a la lista de siempre, no la reemplazan: así los
 * botones, las credenciales y las compras agrupadas siguen encontrando su
 * pedido donde lo buscan.
 */
async function cargarDia(dia) {
  if (!dia) { listar(); return; }

  const desde = new Date(`${dia}T00:00:00`);
  if (Number.isNaN(desde.getTime())) { listar(); return; }
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await sbAdmin.from('pedidos').select('*')
    .gte('creado_en', desde.toISOString())
    .lt('creado_en',  hasta.toISOString())
    .order('creado_en', { ascending: false });

  if (error) {
    console.error(error);
    aviso(`No se pudieron leer los pedidos de ese día: ${error.message}`, 'error');
    return;
  }

  const conocidos = new Set(PEDIDOS.map(p => p.id));
  const nuevos    = (data || []).filter(p => !conocidos.has(p.id));

  if (nuevos.length) {
    PEDIDOS = [...PEDIDOS, ...nuevos]
      .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
    await cargarCredenciales();
  }

  listar();
}

function listar() {
  const compras = agruparCompras(PEDIDOS);
  const pendientes = compras.filter(c => algunaEn(c, EN_ATENCION)).length;

  // En la pestaña se lee "(2) Panel Tiago Store" sin tener que entrar
  actualizarTitulo(pendientes);

  $('nAtencion').textContent  = pendientes || '';
  $('nEntregado').textContent = compras.filter(c => algunaEn(c, ['entregado'])).length || '';
  $('nTodos').textContent     = compras.length || '';

  const lista = comprasDelFiltro(compras);

  $('nFecha').textContent = filtro === 'fecha' ? (lista.length || '') : '';

  if (lista.length === 0) {
    const dia = $('vtFecha').value;
    $('vtLista').innerHTML = `
      <div class="vt-vacio">
        <div class="emo">${filtro === 'atencion' ? '✅' : filtro === 'fecha' ? '📅' : '🧾'}</div>
        <h3>${filtro === 'atencion' ? 'No hay nada pendiente'
             : filtro === 'fecha'   ? `No hubo pedidos el ${dia ? fechaOrden(`${dia}T00:00:00`).split(' ')[0] : 'ese día'}`
             : 'Todavía no hay pedidos'}</h3>
        <p>${filtro === 'atencion'
             ? 'Todos los pedidos están resueltos.'
             : filtro === 'fecha'
             ? 'Probá con otro día, o mirá "Todos".'
             : 'Van a aparecer acá solos, apenas alguien compre.'}</p>
      </div>`;
    return;
  }

  $('vtLista').innerHTML = lista.map(pintarCompra).join('');
}

const bsTxt = n => `${Number(n || 0).toFixed(2)} Bs`;

const badgeEstado = (estado, txt) => {
  const e = ESTADOS[estado] || ESTADOS.cancelado;
  return `<span class="vt-badge" style="color:${e.color};background:${e.bg}">${txt || e.txt}</span>`;
};

/**
 * Lo que se compró, renglón por renglón: cada producto con su cantidad y
 * su precio normal, el descuento combo aparte y el total. Es la misma
 * cuenta que el cliente vio en el carrito y en la página del QR.
 *
 * Con porEstado, las unidades de un mismo producto se separan si quedaron
 * en estados distintos (una entregada y otra sin stock), cada una con su
 * cartel.
 */
function detalleCompra(c, { porEstado = false } = {}) {
  const filas = productosDeCompra(c.lineas, porEstado).map(x => `
    <div class="vt-linea">
      <span class="vt-l-cant">${x.cant}×</span>
      <span class="vt-l-nom">${escapar(x.nombre)}<small>${x.lineas.map(o => '#' + o.numero).join(' · ')}</small></span>
      ${porEstado ? badgeEstado(x.estado) : ''}
      <span class="vt-l-bs">${bsTxt(x.unitario * x.cant)}</span>
    </div>`).join('');

  const descuento = c.descuento > 0 ? `
    <div class="vt-linea desc">
      <span class="vt-l-cant">🎁</span>
      <span class="vt-l-nom">Descuento combo</span>
      <span class="vt-l-bs">−${bsTxt(c.descuento)}</span>
    </div>` : '';

  const rotulo = c.lineas.some(o => o.estado === 'esperando_pago' || o.estado === 'vencido') ? 'Total a cobrar'
               : c.lineas.every(o => o.estado === 'cancelado') ? 'Total'
               : 'Total pagado';

  return `
    <div class="vt-lineas">
      ${filas}${descuento}
      <div class="vt-linea total">
        <span class="vt-l-cant"></span>
        <span class="vt-l-nom">${rotulo}</span>
        <span class="vt-l-bs">${bsTxt(c.total)}</span>
      </div>
    </div>`;
}

/**
 * Una tarjeta por compra.
 *
 * Una compra de 3 productos son 3 filas en la tabla, pero UNA sola venta:
 * se pagó con una transferencia y se confirma con un botón. Antes se veían
 * tres tarjetas, cada una con su precio, y el total que tenía que coincidir
 * con la transferencia no estaba en ningún lado. Con el descuento combo ni
 * siquiera se podía sacar a ojo: el descuento va en una sola de las filas.
 *
 * Arriba queda como siempre: número, qué se compró, cliente, total, estado
 * y botones. Abajo, si hay más de una cuenta o hubo descuento, el detalle.
 */
function pintarCompra(c) {
  const L = c.lineas;
  const p = c.primera;
  const n = L.length;

  const principal = estadoPrincipal(L);
  const mixto = new Set(L.map(o => o.estado)).size > 1;

  const clase = principal === 'sin_stock' ? 'urgente'
              : principal === 'esperando_pago' || principal === 'pagado' ? 'espera' : '';

  // Con estados mezclados, el cartel dice cuánto va entregado. El color
  // sigue siendo el de lo que falta: es lo que te pide algo.
  const entregadas = L.filter(o => o.estado === 'entregado');
  const cartel = mixto && entregadas.length
    ? badgeEstado(principal, `${entregadas.length} de ${n} entregadas`)
    : badgeEstado(principal);

  const wa = (p.cliente_whatsapp || '').replace(/[^0-9]/g, '');
  const comprobante = L.find(o => o.referencia_pago)?.referencia_pago;
  // Entregada, manda el momento de la entrega (la última, si fue de a
  // partes): es el dato que se busca cuando alguien reclama.
  const entregadaEn = L.map(o => o.entregado_en).filter(Boolean).sort().pop();

  const cob  = cobertura(c);
  const pend = cob.pendientes;

  let acciones = '';
  if (pend.length && cob.hay > 0) {
    // Con stock hay dos caminos y los dos tienen que estar a mano:
    // confirmar, o rechazar. Sin la ✕, el que nunca pagó se quedaba en
    // "Para atender" hasta que venciera solo.
    const txt = pend.some(o => o.estado === 'sin_stock') ? 'Reintentar'
              : pend.every(o => o.estado === 'vencido')   ? 'Pagó tarde: entregar'
              : n > 1                                      ? 'Confirmar compra'
              :                                              'Confirmar pago';
    acciones = `
      <button class="btn btn-primario" data-confirmar="${pend[0].id}">${txt}</button>
      <button class="vt-mini no" data-cancelar="${pend[0].id}"
              title="Rechazar ${n > 1 ? 'esta compra' : 'este pedido'}">✕</button>`;
  } else if (pend.length) {
    // Sin cuentas cargadas no hay nada que entregar, así que no se ofrece
    // un botón que solo daría una vuelta para terminar en WhatsApp igual.
    // Se dice de una qué hay que hacer, y van los dos botones para cerrar
    // la compra cuando ya lo hiciste: si no, se queda en "Esperando" para
    // siempre, tapando la lista de lo que de verdad falta.
    acciones = `
      <span class="vt-wa-only">Entrega por WhatsApp</span>
      <button class="vt-mini" data-listo="${pend[0].id}"
              title="Ya se lo entregaste por WhatsApp">Listo</button>
      <button class="vt-mini no" data-cancelar="${pend[0].id}"
              title="Rechazar ${n > 1 ? 'esta compra' : 'este pedido'}">✕</button>`;
  } else if (entregadas.some(entregadoAMano)) {
    // Ya cerrada a mano: se dice cómo se entregó, porque no tiene
    // credenciales que mostrar abajo.
    acciones = `<span class="vt-wa-only">${entregadas.every(entregadoAMano)
      ? '✓ Entregado por WhatsApp' : '✓ Una parte por WhatsApp'}</span>`;
  }

  // Cuántas salen solas al confirmar. Con una sola cuenta el botón ya lo
  // dice; con varias, hace falta saber si alcanza para todas.
  let stock = '';
  if (pend.length > 1 && cob.hay > 0) {
    stock = cob.hay >= cob.de
      ? `<div class="vt-stock-fila">⚡ Hay stock para todo: al confirmar se entregan solas las ${cob.de} cuentas.</div>`
      : `<div class="vt-stock-fila parcial">⚡ Hay stock para ${cob.hay} de ${cob.de}: al confirmar se
           ${cob.hay === 1 ? 'entrega esa' : 'entregan esas'}, y lo demás (<strong>${escapar(cob.faltan.join(', '))}</strong>)
           queda sin stock hasta que cargues cuentas o lo entregues por WhatsApp.</div>`;
  }

  // Una fila por cuenta entregada, por si hay que reenviarla. Con varias,
  // cada una dice de qué producto es, y hay un botón que las copia todas
  // en un solo mensaje.
  const conCuenta = L.filter(o => CREDS[o.id]);
  const cuentas = conCuenta.map(o => {
    const cred = CREDS[o.id];
    return `
      <div class="vt-cred">
        ${n > 1 ? `<span class="vt-cred-de">${escapar(o.producto_nombre)} · #${o.numero}</span>` : ''}
        <span>👤 ${escapar(cred.usuario || '')}</span>
        ${cred.clave  ? `<span>🔑 ${escapar(cred.clave)}</span>`   : ''}
        ${cred.perfil ? `<span>👥 ${escapar(cred.perfil)}</span>`  : ''}
        ${cred.pin    ? `<span># ${escapar(cred.pin)}</span>`      : ''}
        <button data-copiar="${o.id}">Copiar para mandar</button>
      </div>`;
  }).join('') + (conCuenta.length > 1 ? `
      <div class="vt-cred-todas">
        <button class="vt-mini" data-copiar-compra="${c.clave}">📋 Copiar las ${conCuenta.length} en un solo mensaje</button>
      </div>` : '');

  const sinStock  = L.filter(o => o.estado === 'sin_stock');
  const rechazada = L.find(o => o.estado === 'cancelado' && o.motivo);

  // El aviso de renovación es de la compra entera, pero cada producto
  // vence cuando vence su plan: con varios, va la fecha de cada uno.
  const renov = productosDeCompra(L.filter(o => o.renovar));
  const cuandoVence = o => o.suscripcion_vence_en
    ? `se le vence el <strong>${fechaCorta(o.suscripcion_vence_en)}</strong>`
    : o.plan_dias ? `plan de ${o.plan_dias} días, la fecha se anota al entregar` : '';
  // Mientras no se entregó ninguna, con varias alcanza con decirlo una vez.
  const sinFechas = renov.length > 1 && renov.every(x => x.lineas.every(o => !o.suscripcion_vence_en));
  const vencimientos = sinFechas ? ['las fechas se anotan al entregar'] : renov.map(x => {
    // La que vence primero, que es la que hay que avisar antes
    const o = [...x.lineas].sort((a, b) =>
      String(a.suscripcion_vence_en || '9').localeCompare(String(b.suscripcion_vence_en || '9')))[0];
    const q = cuandoVence(o);
    return renov.length > 1 ? `${escapar(x.nombre)}${q ? ': ' + q : ''}` : q;
  }).filter(Boolean);

  return `
    <div class="vt-pedido ${clase}">
      <div class="vt-num-caja">
        <div class="vt-num">${numerosDeCompra(L)}</div>
        <!-- Solo qué tan reciente es. La fecha exacta va completa abajo,
             junto a lo que se compró. -->
        <div class="vt-fecha">${cuandoFue(p.creado_en)}</div>
      </div>

      <div class="vt-medio">
        <div class="vt-prod">${escapar(nombreDeCompra(L))}</div>
        <!-- Una sola fecha, con el mismo formato que le queda al cliente en
             su mensaje de WhatsApp. Entregada, la de la entrega; mientras
             no, la de cuando armó el pedido. -->
        <div class="vt-orden">Fecha de orden: ${fechaOrden(entregadaEn || p.creado_en)}${n > 1 ? ` · ${n} cuentas` : ''}</div>
        <div class="vt-cliente">
          ${escapar(p.cliente_nombre || 'Sin nombre')}
          ${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener">📲 ${escapar(p.cliente_whatsapp)}</a>` : ''}
          ${p.cliente_email ? ` · ${escapar(p.cliente_email)}` : ''}
          ${comprobante ? ` · comprobante ${escapar(comprobante)}` : ''}
        </div>
      </div>

      <div class="vt-der">
        <span class="vt-precio" title="Lo que paga el cliente${c.descuento > 0 ? ', ya con el descuento combo' : ''}">${bsTxt(c.total)}</span>
        ${cartel}
        ${acciones}
      </div>

      ${n > 1 || c.descuento > 0 ? detalleCompra(c, { porEstado: mixto }) : ''}
      ${stock}
      ${cuentas}

      ${sinStock.length ? `
        <div class="vt-cred" style="background:rgba(220,38,38,.06);color:#8f1616;font-family:inherit;">
          <span>Pagó y no había cuentas libres${n > 1 ? ` de <strong>${escapar(nombreDeCompra(sinStock))}</strong>` : ''}.
          Cargá stock y tocá <strong>Reintentar</strong>, o resolvelo por WhatsApp.</span>
        </div>` : ''}

      ${rechazada ? `
        <div class="vt-motivo-fila">✕ Rechazado: ${escapar(rechazada.motivo)}</div>` : ''}

      ${renov.length ? `
        <div class="vt-renov-fila">
          🔁 Pidió que le avisemos para renovar${vencimientos.length ? ' · ' + vencimientos.join(' · ') : ''}${
            L.some(o => o.renovar && o.suscripcion_avisada_en) ? ' · ya te avisé por Telegram' : ''}
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

// "07-09-2026 18:52 PM" — el mismo formato, al pie de la letra, que el
// cliente tiene en su mensaje de WhatsApp. Si acá se viera de otra forma,
// cruzar los dos sería adivinar.
// Una fecha suelta de la base ("2026-10-10"), sin hora. No se pasa por
// new Date(): eso la lee como UTC y en Bolivia la muestra un dia antes.
function fechaCorta(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function fechaOrden(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  // Reloj de 12: después de las 12 viene la 1 PM, no las 13.
  // El 0 de la medianoche se dice "12 AM", que es como lo dice la gente.
  const h = d.getHours();
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ` +
         `${p(h % 12 || 12)}:${p(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
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

  // El selector de día solo se ve cuando se está mirando por fecha; el
  // resto del tiempo sería un control que no hace nada.
  $('vtFecha').style.display = filtro === 'fecha' ? '' : 'none';

  if (filtro === 'fecha') {
    if (!$('vtFecha').value) $('vtFecha').value = diaLocal(new Date().toISOString());
    cargarDia($('vtFecha').value);
    return;
  }

  listar();
});

$('vtFecha').addEventListener('change', () => {
  filtro = 'fecha';
  cargarDia($('vtFecha').value);
});

$('vtRefrescar').addEventListener('click', cargarTodo);

$('vtLista').addEventListener('click', async e => {
  const confirmar = e.target.closest('[data-confirmar]');
  if (confirmar) { abrirConfirmacion(confirmar.dataset.confirmar); return; }

  const copiar = e.target.closest('[data-copiar]');
  if (copiar) { await copiarParaMandar(copiar.dataset.copiar); return; }

  const copiarCompra = e.target.closest('[data-copiar-compra]');
  if (copiarCompra) { await copiarCompraEntera(copiarCompra.dataset.copiarCompra); return; }

  const listo = e.target.closest('[data-listo]');
  if (listo) { abrirCierreAMano(listo.dataset.listo, 'entregar'); return; }

  const cancelar = e.target.closest('[data-cancelar]');
  if (cancelar) { abrirCierreAMano(cancelar.dataset.cancelar, 'cancelar'); return; }
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

  await copiarTexto(texto);
}

// Todas las cuentas de una compra en un solo mensaje: el que compró tres
// recibe uno, no tres seguidos.
async function copiarCompraEntera(clave) {
  const c = agruparCompras(PEDIDOS.filter(o => (o.grupo || o.id) === clave))[0];
  if (!c) return;

  const bloques = c.lineas.filter(o => CREDS[o.id]).map(o => {
    const cred = CREDS[o.id];
    return [
      `*${o.producto_nombre}* (#${o.numero})`,
      `👤 Usuario: ${cred.usuario || ''}`,
      cred.clave  ? `🔑 Clave: ${cred.clave}`   : '',
      cred.perfil ? `👥 Perfil: ${cred.perfil}` : '',
      cred.pin    ? `🔢 PIN: ${cred.pin}`       : '',
      cred.notas  ? `📌 ${cred.notas}`          : ''
    ].filter(Boolean).join('\n');
  });
  if (!bloques.length) return;

  await copiarTexto([
    `🦁 *TIAGO STORE* · Pedido ${numerosDeCompra(c.lineas)}`,
    ...bloques,
    `¡Gracias por tu compra!`
  ].join('\n\n'));
}

async function copiarTexto(texto) {
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

  // Se muestra la compra entera y su total: es lo que se pagó con una
  // transferencia, y lo que confirmar_compra entrega de una vez.
  const c   = compraDe(p);
  const cob = cobertura(c);
  const varias = c.lineas.length > 1;

  confirmando = p;
  $('vtSub').innerHTML =
    `${varias ? 'Compra' : 'Pedido'} <strong>${numerosDeCompra(c.lineas)}</strong> ` +
    `de ${escapar(p.cliente_nombre || 'cliente sin nombre')}`;
  $('vtDetalle').innerHTML = detalleCompra(c);

  // Ya pagó (sin stock que se reintenta) o todavía no se sabe: en el
  // segundo caso, lo que hay que ver en la cuenta es el total exacto.
  const yaPago = cob.pendientes.every(o => o.estado === 'sin_stock' || o.estado === 'pagado');
  const entrega = cob.hay >= cob.de
    ? (cob.de > 1 ? `las ${cob.de} cuentas se entregan solas` : 'la cuenta se entrega sola')
    : `se ${cob.hay === 1 ? 'entrega sola 1' : `entregan solas ${cob.hay}`} de las ${cob.de} cuentas ` +
      `y lo demás (${escapar(cob.faltan.join(', '))}) queda sin stock`;
  $('vtAlerta').innerHTML = yaPago
    ? `Este pago ya estaba registrado. Al confirmar, ${entrega}, y no se puede deshacer.`
    : `Confirmá solo si <strong>ya te entraron ${bsTxt(c.total)}</strong> en tu cuenta. ` +
      `Al confirmar, ${entrega}, y no se puede deshacer.`;

  $('vtCliente').value = p.cliente_nombre || '';
  $('vtFondo').classList.add('abierto');
  $('vtCliente').focus();
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

  const nombre = $('vtCliente').value.trim();
  const quien  = 'panel:' + ($('usuarioEmail')?.textContent || 'admin');

  // El nombre se guarda en el pedido ANTES de confirmar: si se guardara
  // después y algo fallara, la cuenta ya estaría entregada y la venta
  // quedaría sin dueño. En una compra de varios va a todas sus líneas,
  // que son una sola venta.
  if (nombre) {
    const ids = p.grupo
      ? PEDIDOS.filter(o => o.grupo === p.grupo).map(o => o.id)
      : [p.id];
    const { error: errNombre } = await sbAdmin.from('pedidos')
      .update({ cliente_nombre: nombre }).in('id', ids);

    if (errNombre) {
      console.error(errNombre);
      aviso(`No se pudo guardar el nombre: ${errNombre.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Confirmar y entregar';
      return;
    }
  }

  // Si el pedido es parte de una compra de varios productos, se confirma
  // la compra ENTERA. Se pagó con una sola transferencia, así que confirmar
  // de a uno sería hacerte tocar el botón tres veces por un solo pago —y
  // peor: entre toque y toque el cliente vería media compra entregada.
  //
  // p_referencia va en null: el número de comprobante ya no se pide. Si
  // alguno viejo lo tenía, la función lo conserva (usa coalesce).
  const { data, error } = p.grupo
    ? await sbAdmin.rpc('confirmar_compra', {
        p_grupo: p.grupo, p_referencia: null, p_quien: quien })
    : await sbAdmin.rpc('confirmar_pago', {
        p_pedido_id: p.id, p_referencia: null, p_quien: quien });

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
// 7b. CERRAR A MANO: "Listo" y "✕"
// ============================================================
// Los pedidos sin cuentas cargadas se entregan por WhatsApp, y de eso el
// panel no se entera nunca: la fila se quedaba en "Esperando" para siempre
// aunque el cliente ya tuviera su cuenta. Con el tiempo la lista de "Para
// atender" se llenaba de cosas ya resueltas y dejaba de servir.
//
// "Listo" lo da por entregado y "✕" lo da de baja. Ninguno de los dos toca
// el stock: no hay cuenta que entregar, la entrega la hiciste vos.

// Queda escrito en confirmado_por, que es el campo de auditoría: así la
// fila puede decir "Entregado por WhatsApp" en vez de un "Entregado" seco,
// y dentro de un mes se sabe cuál entregó el sistema y cuál entregaste vos.
const MARCA_MANO = 'panel-wa:';

function entregadoAMano(p) {
  return p.estado === 'entregado' &&
         String(p.confirmado_por || '').startsWith(MARCA_MANO);
}

// Las filas que se cierran juntas. Una compra de 3 productos son 3 filas
// pero UNA venta: se entregó de una sola vez por WhatsApp, así que un
// toque las cierra a todas. Las ya entregadas no se tocan.
function filasDeLaCompra(p) {
  if (!p.grupo) return [p];
  const hermanas = PEDIDOS.filter(o => o.grupo === p.grupo && CONFIRMABLES.includes(o.estado));
  return hermanas.length ? hermanas : [p];
}

let cerrandoAMano = null;   // { pedido, accion }

function abrirCierreAMano(pedidoId, accion) {
  const p = PEDIDOS.find(x => x.id === pedidoId);
  if (!p) return;

  const filas = filasDeLaCompra(p);
  const c = compraDe(p);
  const varias = c.lineas.length > 1;

  cerrandoAMano = { pedido: p, accion };

  $('vtManoTitulo').textContent = accion === 'entregar'
    ? '¿Ya se lo entregaste?'
    : `¿Rechazar ${varias ? 'esta compra' : 'este pedido'}?`;

  // Lo que se cierra, con su total. Si una parte ya estaba entregada, esa
  // no se toca: se dice, para que no parezca que se deshace.
  const quedan = c.lineas.length - filas.length;
  $('vtManoSub').innerHTML =
    `${varias ? 'Compra' : 'Pedido'} <strong>${numerosDeCompra(c.lineas)}</strong> ` +
    `de ${escapar(p.cliente_nombre || 'cliente sin nombre')}` +
    (quedan > 0 ? `<br>Se ${filas.length === 1 ? 'cierra' : 'cierran'} ${filas.length} de ${c.lineas.length}: ` +
                  'las ya entregadas quedan como están.' : '');
  $('vtManoDetalle').innerHTML = detalleCompra(quedan > 0 ? agruparCompras(filas)[0] : c);

  $('vtManoAviso').innerHTML = accion === 'entregar'
    ? 'Se marca como <strong>entregado por WhatsApp</strong> y suma a lo vendido hoy. ' +
      'Tocalo solo si ya le pasaste la cuenta.'
    : `${varias ? 'La compra' : 'El pedido'} queda <strong>rechazad${varias ? 'a' : 'o'}</strong> y desaparece de lo pendiente. ` +
      `No se entrega nada y después no vas a poder confirmarl${varias ? 'a' : 'o'} desde acá.`;

  // Los datos de la cuenta solo tienen sentido al entregar, y solo en una
  // compra de un producto: con tres, un solo usuario y clave no alcanza —
  // esas se cargan desde Stock, que sabe cuál va con cuál.
  const cabeLaCuenta = accion === 'entregar' && filas.length === 1 && !!p.producto_id;
  $('vtManoCuenta').hidden = !cabeLaCuenta;
  ['vtManoUsuario', 'vtManoClave', 'vtManoPerfil', 'vtManoPin'].forEach(id => { $(id).value = ''; });

  if (cabeLaCuenta) {
    $('vtManoNota').textContent =
      'Si los pegás acá, al cliente le aparecen en su página y en "Mis compras", ' +
      'aunque borre el chat de WhatsApp. Si lo dejás vacío, solo se marca entregado.';
  }

  // El motivo solo al rechazar: al entregar no hay nada que explicar.
  const pideMotivo = accion !== 'entregar';
  $('vtManoMotivo').hidden = !pideMotivo;
  motivoElegido = '';
  $('vtManoMotivoOtro').value = '';
  if (pideMotivo) dibujarMotivos();

  $('vtManoOk').textContent = accion === 'entregar' ? 'Sí, ya lo entregué' : 'Sí, rechazar';
  $('vtFondoMano').classList.add('abierto');
  $('vtManoOk').focus();
}

// ------------------------------------------------------------
// Los motivos de rechazo
// ------------------------------------------------------------
// La lista vive acá y no en la base: los motivos de verdad aparecen con el
// uso, y así agregar uno es tocar esta línea. La columna guarda texto
// libre, así que lo escrito a mano vale igual que lo de la lista.
const MOTIVOS = [
  'Nunca pagó',
  'El comprobante no coincide',
  'Se arrepintió',
  'Pedido duplicado',
  'Prueba mía'
];

let motivoElegido = '';

function dibujarMotivos() {
  $('vtMotivos').innerHTML = MOTIVOS.map(m =>
    `<button type="button" class="vt-motivo${m === motivoElegido ? ' elegido' : ''}"
             data-motivo="${escapar(m)}">${escapar(m)}</button>`).join('');
}

$('vtMotivos').addEventListener('click', e => {
  const b = e.target.closest('[data-motivo]');
  if (!b) return;
  // Tocar el que ya estaba elegido lo deselecciona.
  motivoElegido = (b.dataset.motivo === motivoElegido) ? '' : b.dataset.motivo;
  // Elegir de la lista pisa lo escrito a mano: si no, quedaban los dos y
  // no se sabía cuál se guardaba.
  if (motivoElegido) $('vtManoMotivoOtro').value = '';
  dibujarMotivos();
});

// Y escribir a mano deselecciona la lista, por el mismo motivo.
$('vtManoMotivoOtro').addEventListener('input', () => {
  if ($('vtManoMotivoOtro').value.trim() && motivoElegido) {
    motivoElegido = '';
    dibujarMotivos();
  }
});

/** Lo que se guarda: lo escrito a mano gana, si hay algo. */
function motivoDelRechazo() {
  return $('vtManoMotivoOtro').value.trim() || motivoElegido || '';
}

// Lo escrito en el formulario, sin los campos vacíos. Devuelve null si no
// se escribió nada: entonces se cierra la fila y nada más, como antes.
function credencialesEscritas() {
  const cred = {
    usuario: $('vtManoUsuario').value.trim(),
    clave:   $('vtManoClave').value.trim(),
    perfil:  $('vtManoPerfil').value.trim(),
    pin:     $('vtManoPin').value.trim()
  };
  for (const k of Object.keys(cred)) if (!cred[k]) delete cred[k];
  return Object.keys(cred).length ? cred : null;
}

function cerrarMano() { $('vtFondoMano').classList.remove('abierto'); cerrandoAMano = null; }

$('vtManoVolver').addEventListener('click', cerrarMano);
$('vtFondoMano').addEventListener('click', e => { if (e.target === $('vtFondoMano')) cerrarMano(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('vtFondoMano').classList.contains('abierto')) cerrarMano();
});

$('vtManoOk').addEventListener('click', async () => {
  if (!cerrandoAMano) return;
  const { pedido, accion } = cerrandoAMano;
  const btn   = $('vtManoOk');
  const texto = btn.textContent;
  const filas = filasDeLaCompra(pedido);
  const ids   = filas.map(o => o.id);

  btn.disabled = true;
  btn.textContent = 'Guardando…';

  let error;
  let cred = null;
  if (accion === 'entregar') {
    const ahora = new Date().toISOString();

    // La cuenta se guarda ANTES de dar el pedido por entregado. Al revés,
    // si fallara esta parte el cliente vería su pedido entregado y sin
    // datos, y el botón para cargarlos ya no estaría.
    cred = $('vtManoCuenta').hidden ? null : credencialesEscritas();
    if (cred) {
      const { error: errCuenta } = await sbAdmin.from('cuentas').insert({
        producto_id:  pedido.producto_id,
        credenciales: cred,
        estado:       'entregada',
        pedido_id:    pedido.id,
        entregada_en: ahora
      });

      if (errCuenta) {
        console.error(errCuenta);
        aviso(`No se pudo guardar la cuenta: ${errCuenta.message}`, 'error');
        btn.disabled = false;
        btn.textContent = texto;
        return;
      }
    }

    ({ error } = await sbAdmin.from('pedidos').update({
      estado:         'entregado',
      entregado_en:   ahora,
      confirmado_por: MARCA_MANO + ($('usuarioEmail')?.textContent || 'admin')
    }).in('id', ids));

    // La plata entró, aunque nunca hayas tocado "Confirmar pago". Solo se
    // completa si estaba vacío: si ya tenía fecha, esa es la buena.
    if (!error) {
      await sbAdmin.from('pedidos')
        .update({ pagado_en: ahora }).in('id', ids).is('pagado_en', null);
    }
  } else {
    const motivo = motivoDelRechazo();
    ({ error } = await sbAdmin.from('pedidos')
      .update({ estado: 'cancelado', motivo: motivo || null }).in('id', ids));
  }

  btn.disabled = false;
  btn.textContent = texto;

  if (error) {
    console.error(error);
    aviso(`No se pudo guardar: ${error.message}`, 'error');
    return;
  }

  const cual = ids.length > 1
    ? `Compra ${numerosDeCompra(filas)}`
    : `Pedido #${pedido.numero}`;
  aviso(accion !== 'entregar'
    ? `${cual} rechazad${ids.length > 1 ? 'a' : 'o'}`
    : cred
      ? `✓ ${cual} entregado. El cliente ya ve su cuenta en la página`
      : `✓ ${cual} entregad${ids.length > 1 ? 'a' : 'o'} por WhatsApp`, 'ok');

  cerrarMano();
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
      if (payload.eventType === 'INSERT') avisarPedidoNuevo(payload.new);
      // Si todavía no abriste Ventas no hay nada que refrescar: el aviso
      // ya salió, y los datos se cargan cuando entres.
      if (yaCargado) cargarTodo();
    })
    .subscribe();
}


// ============================================================
// 8b. QUE TE ENTERES, ESTÉS DONDE ESTÉS
// ============================================================
// Sin pasarela de pago, un pedido no se entrega solo: alguien lo tiene que
// aprobar. Y hasta ahora el panel te lo decía con un cartelito de 3
// segundos, que solo servía si justo estabas mirando la pantalla de Ventas.
//
// Ahora el pedido nuevo suena, sale como notificación del sistema —esa que
// aparece aunque el panel esté en otra pestaña— y deja el número de
// pendientes en el título, que se ve en la pestaña sin entrar.
//
// OJO CON LO QUE ESTO NO ES: nada de esto llega con el panel cerrado. Para
// que te avise con todo apagado hace falta un servicio aparte (Telegram,
// un correo, o push de verdad). Esto cubre "lo tengo abierto en el
// celular o en otra pestaña", que es donde se perdían los avisos.

// Un bip corto, hecho en el momento: no hay archivo de sonido que cargar.
function sonarCampana() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const ctx = new Audio();
    const nota = (frecuencia, desde, hasta) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, ctx.currentTime + desde);
      vol.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + desde + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + hasta);
      osc.connect(vol).connect(ctx.destination);
      osc.start(ctx.currentTime + desde);
      osc.stop(ctx.currentTime + hasta);
    };
    nota(880, 0, 0.18);      // dos tonos, como una campanita
    nota(1170, 0.16, 0.38);
    setTimeout(() => ctx.close(), 800);
  } catch { /* el navegador puede no dejar sonar todavía: no es grave */ }
}

function avisarPedidoNuevo(p) {
  const plata = `${Number(p.precio || 0).toFixed(2)} Bs`;
  aviso(`🛒 Pedido nuevo #${p.numero}: ${p.producto_nombre} · ${plata}`, 'ok');
  sonarCampana();

  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`🛒 Pedido nuevo #${p.numero}`, {
      body: `${p.producto_nombre} · ${plata}\nEsperando que lo apruebes`,
      // Con el tag, dos avisos del mismo pedido no se apilan
      tag: 'pedido-' + p.id
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* algunos navegadores la niegan en segundo plano */ }
}

// El botón solo se muestra mientras haga falta: pedir el permiso tiene que
// salir de un toque tuyo, el navegador no deja hacerlo solo.
function pintarBotonAvisos() {
  const btn = $('vtAvisos');
  if (!btn) return;
  const estado = ('Notification' in window) ? Notification.permission : 'no-hay';

  btn.hidden = estado !== 'default';
  if (estado === 'denied') {
    // Bloqueado a mano: el navegador ya no vuelve a preguntar, hay que ir
    // a los permisos del sitio. Se dice una vez, en la consola.
    console.warn('Los avisos del sistema están bloqueados para este sitio. ' +
                 'Se activan desde el candado de la barra de direcciones.');
  }
}

$('vtAvisos').addEventListener('click', async () => {
  try {
    await Notification.requestPermission();
    pintarBotonAvisos();
    if (Notification.permission === 'granted') aviso('🔔 Listo, te aviso acá cuando entre un pedido', 'ok');
  } catch { /* nada: el botón se queda como estaba */ }
});

// Los pendientes en el título de la pestaña: "(2) Inicio · Panel Tiago Store".
// Es lo único que se ve del panel cuando está en otra pestaña.
// Van adelante del título de la vista que esté abierta, y el número queda
// en window.pendientesAdmin para que admin/index.html lo conserve al
// cambiar de vista.
function actualizarTitulo(pendientes) {
  // El mismo número, en rojo sobre "Ventas" en el menú
  window.ponerContador?.('ventas', pendientes,
    pendientes === 1 ? '1 pedido por atender' : `${pendientes} pedidos por atender`);
  window.pendientesAdmin = pendientes;
  const base = document.title.replace(/^\(\d+\)\s*/, '');
  document.title = pendientes > 0 ? `(${pendientes}) ${base}` : base;
}


// ============================================================
// 9. ARRANQUE
// ============================================================
document.addEventListener('vista-cambiada', e => {
  if (e.detail.vista !== 'ventas') return;
  pintarBotonAvisos();
  cargarTodo();
});

// Escuchar desde que abrís el panel, sin esperar a que entres a Ventas:
// si estás cargando stock o cambiando un precio y entra un pedido, te
// enterás igual. Antes el aviso solo existía dentro de esa pantalla.
//
// Se pregunta el permiso primero porque sin ser admin la suscripción no
// recibe nada —Realtime respeta las mismas reglas que las consultas— y no
// tiene sentido dejar un canal abierto para nadie.
tengoPermiso().then(r => {
  if (!r.puede) return;
  escuchar();
  // Los pendientes de arranque, para que el título diga la verdad aunque
  // todavía no hayas abierto Ventas.
  cargarTodo();
});

console.log('%c✓ Ventas listo', 'color:#22c55e;font-weight:bold');
