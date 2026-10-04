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

import { sbAdmin, SUPABASE_URL } from '../../js/supabase-config.js';
import { tengoPermiso, carteSinPermiso } from './admin-permiso.js';
import { agruparCompras, numerosDeCompra, productosDeCompra, nombreDeCompra,
         estadoPrincipal, cuantasCompras } from './admin-compras.js';
import { prepararImagen } from '../../js/subir-imagen.js';

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

// La lista va de a páginas: una fila corta por compra (código, fecha,
// total, estado) y "Ver" para abrirla entera. Antes cada compra era una
// tarjeta larga con todo adentro y la pantalla bajaba sin fin.
const POR_PAGINA = 15;
let pagina = 1;
// La compra abierta con "Ver". Se guarda para mantenerla al día: si la
// confirmás desde ahí, la ventana muestra enseguida lo que se entregó.
let verClave = null;

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
  .vt-plan { font-size: 12.5px; color: var(--gris); margin-top: 3px; }
  .vt-plan strong { color: var(--tinta); }
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

  /* ---------- La lista: una fila por compra ----------
     Código, fecha, total y estado, y "Ver" para abrir la compra entera.
     Toda la fila se puede tocar; el botón está para que se note y para
     llegar con el teclado. */
  .vt-tabla {
    background: var(--panel); border: 1px solid var(--borde);
    border-radius: 14px; overflow: hidden;
  }
  .vt-fila {
    display: grid;
    grid-template-columns: minmax(80px, 1fr) minmax(120px, 1.2fr) minmax(80px, .9fr) minmax(110px, 1.2fr) auto;
    align-items: center; gap: 12px;
    padding: 11px 16px;
    border-top: 1px solid var(--borde);
    cursor: pointer;
  }
  .vt-fila:not(.vt-fila-cab):hover { background: rgba(255,255,255,.45); }
  .vt-fila-cab {
    border-top: none; cursor: default;
    padding-top: 12px; padding-bottom: 9px;
    font-size: 11px; font-weight: 700; letter-spacing: .07em;
    text-transform: uppercase; color: var(--gris-dim);
  }
  /* Lo que te pide algo, marcado al costado sin tener que leerlo */
  .vt-fila.urgente { box-shadow: inset 3px 0 0 #dc2626; background: rgba(220,38,38,.04); }
  .vt-fila.espera  { box-shadow: inset 3px 0 0 #d97706; }
  .vt-f-num {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 14.5px; font-weight: 700; color: var(--tinta);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .vt-f-fecha { font-size: 13px; color: var(--gris); font-variant-numeric: tabular-nums; }
  .vt-f-fecha small { display: block; font-size: 11.5px; color: var(--gris-dim); }
  .vt-f-bs {
    font-size: 14px; font-weight: 700; color: var(--tinta);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  /* Eligió Binance Pay: lo que tiene que llegarte en USDT, debajo del total */
  .vt-f-bs small { display: block; font-size: 11.5px; font-weight: 700; color: #8a6508; }
  .vt-usdt {
    font-size: 12px; font-weight: 700; color: #8a6508; white-space: nowrap;
    background: rgba(183,134,11,.1); padding: 3px 9px; border-radius: 99px;
  }
  .vt-linea.usdt .vt-l-nom, .vt-linea.usdt .vt-l-bs { color: #8a6508; }

  /* ---------- Cobros: el QR de Binance y el tipo de cambio ---------- */
  .vt-cobro-qr { display: flex; gap: 14px; align-items: center; margin-bottom: 4px; }
  .vt-cobro-qr img,
  .vt-cobro-qr .vacio {
    flex: none; width: 104px; height: 104px; border-radius: 10px;
    border: 1px solid var(--borde); background: #fff; object-fit: contain;
  }
  .vt-cobro-qr .vacio {
    display: flex; align-items: center; justify-content: center;
    border-style: dashed; font-size: 12px; color: var(--gris-dim);
  }
  .vt-cobro-btns { display: flex; flex-direction: column; gap: 8px; min-width: 130px; }
  .vt-cobro-btns .btn { justify-content: center; }

  /* Tres secciones: tipo de cambio, Binance Pay y la API */
  .vt-modal.vt-cobros-modal { max-width: 520px; }
  .vt-cobro-sec { border-top: 1px solid var(--borde); padding-top: 16px; margin-top: 16px; }
  .vt-cobro-sec-cab {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    margin-bottom: 4px;
  }
  .vt-cobro-sec-cab h4 { margin: 0; font-size: 14.5px; color: var(--tinta); }
  .vt-cobro-sec > .vt-nota:first-of-type { margin: 0 0 12px; }
  .vt-chip {
    font-size: 11.5px; font-weight: 700; white-space: nowrap;
    padding: 3px 10px; border-radius: 99px;
    background: var(--panel-2); color: var(--gris);
  }
  .vt-chip.ok   { background: rgba(21,128,61,.1);  color: #15803d; }
  .vt-chip.ojo  { background: rgba(180,83,9,.1);   color: #92400e; }
  /* "1 USDT = [10] Bs" en un renglón */
  .vt-cambio { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--tinta); font-size: 14px; }
  .vt-modal .vt-cambio input { width: 110px; margin: 0; text-align: center; font-weight: 700; }
  .vt-api-campos { display: grid; gap: 0 10px; }
  .vt-api-estado { font-size: 12.5px; line-height: 1.5; margin: 8px 0 0; padding: 8px 11px; border-radius: 8px; }
  .vt-api-estado.ok  { background: rgba(21,128,61,.08); color: #166534; }
  .vt-api-estado.mal { background: rgba(180,83,9,.09);  color: #7c3d06; }
  .vt-api-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .vt-api-ayuda { margin-top: 12px; font-size: 12.5px; color: var(--gris); }
  .vt-api-ayuda summary { cursor: pointer; font-weight: 600; color: var(--tinta); }
  .vt-api-ayuda ol { margin: 8px 0 0; padding-left: 18px; line-height: 1.6; }
  .vt-select {
    width: 100%; padding: 10px 12px; margin-bottom: 6px;
    background: var(--panel-2); border: 1px solid var(--borde);
    border-radius: 8px; color: var(--texto); font-size: 14px; font-family: inherit;
  }
  .vt-select:focus { outline: none; border-color: var(--rojo); }
  /* Un texto para copiar (la dirección del webhook, la clave) con su botón */
  .vt-copiable { display: flex; align-items: center; gap: 8px; }
  .vt-copiable code {
    flex: 1; min-width: 0; overflow-wrap: anywhere;
    padding: 9px 11px; border-radius: 8px;
    background: var(--panel-2); border: 1px solid var(--borde);
    font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--tinta);
  }
  .vt-copiable .btn { flex: none; }
  .vt-ver {
    background: none; border: 1px solid var(--borde); color: var(--tinta);
    border-radius: 99px; padding: 6px 13px;
    font: inherit; font-size: 12.5px; font-weight: 700;
    cursor: pointer; white-space: nowrap;
  }
  .vt-ver:hover { border-color: var(--tinta); }

  /* Las páginas: ‹ 1 2 3 … 12 13 › */
  .vt-paginas { display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 16px; }
  .vt-pag {
    min-width: 36px; height: 36px; padding: 0 10px;
    border-radius: 99px; border: 1px solid var(--borde);
    background: none; color: var(--gris);
    font: inherit; font-size: 13.5px; font-weight: 700;
    font-variant-numeric: tabular-nums; cursor: pointer;
  }
  .vt-pag:hover:not(:disabled) { border-color: var(--tinta); color: var(--tinta); }
  .vt-pag.activa { background: var(--tinta); border-color: var(--tinta); color: #fff; }
  .vt-pag:disabled { opacity: .35; cursor: default; }
  .vt-pag-puntos { color: var(--gris-dim); padding: 0 2px; }
  .vt-pag-info { text-align: center; font-size: 12.5px; color: var(--gris-dim); margin-top: 8px; }

  /* ---------- "Ver": la compra entera, en una ventana ---------- */
  .vt-modal.vt-ver-modal { max-width: 860px; padding: 18px 20px 20px; }
  .vt-ver-cab { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .vt-ver-cab h3 { margin: 0; flex: 1; }
  .vt-ver-x {
    background: none; border: none; color: var(--gris);
    font-size: 20px; line-height: 1; cursor: pointer; padding: 4px 6px;
  }
  .vt-ver-x:hover { color: var(--tinta); }
  .vt-ver-modal .vt-pedido { margin-bottom: 0; grid-template-columns: 86px 1fr; }
  /* En la ventana hay menos ancho que en la lista de antes: el precio, el
     estado y los botones van en su propio renglón, así el nombre del
     producto y la fecha se leen enteros */
  .vt-ver-modal .vt-prod { white-space: normal; overflow: visible; }
  /* El número ya está en el título de la ventana ("Pedido #129") */
  .vt-ver-modal .vt-num { display: none; }
  .vt-ver-modal .vt-der { grid-column: 1 / -1; justify-content: flex-end; flex-wrap: wrap; }

  /* ---------- Recordar por WhatsApp al que no pagó ---------- */
  .vt-recordar {
    grid-column: 1 / -1;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 8px 11px; border-radius: 8px;
    background: rgba(34,197,94,.08);
  }
  .vt-recordar .vt-mini { text-decoration: none; color: #15803d; border-color: rgba(21,128,61,.35); }
  .vt-recordar-nota { font-size: 12.5px; color: var(--gris); }

  /* ---------- Exportar a Excel ---------- */
  .vt-excel-resumen {
    margin-top: 12px; padding: 12px 14px; border-radius: 10px;
    background: var(--panel-2); font-size: 13.5px; line-height: 1.6;
    color: var(--gris); min-height: 48px;
  }
  .vt-excel-resumen strong { color: var(--tinta); font-variant-numeric: tabular-nums; }

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

    /* La fila de la lista en dos renglones: código y total arriba, fecha
       y estado abajo, y "Ver" a la derecha de los dos. Los títulos de
       las columnas sobran. */
    .vt-fila {
      grid-template-columns: 1fr auto auto;
      grid-template-areas: "num bs ver" "fecha estado ver";
      gap: 4px 10px; padding: 11px 12px;
    }
    .vt-fila-cab { display: none; }
    .vt-f-num    { grid-area: num; }
    .vt-f-fecha  { grid-area: fecha; }
    .vt-f-fecha small { display: inline; margin-left: 5px; }
    .vt-f-bs     { grid-area: bs; justify-self: end; }
    .vt-f-estado { grid-area: estado; justify-self: end; }
    .vt-ver      { grid-area: ver; }
    .vt-modal.vt-ver-modal { padding: 14px 12px 14px; }
    /* En la ventana, igual que la tarjeta de antes en el celular: el
       número arriba y todo lo demás debajo, a lo ancho */
    .vt-ver-modal .vt-pedido { grid-template-columns: 1fr; }

    /* En el celular la tarjeta dentro de la ventana no lleva su propio
       borde ni relleno: era una caja dentro de otra y le robaba ancho a
       todo. El estado ya lo dice el cartel. */
    body .vt-ver-modal .vt-pedido {
      background: transparent; border: none; box-shadow: none;
      padding: 0; gap: 10px;
      -webkit-backdrop-filter: none; backdrop-filter: none;
    }

    /* Plata y estado en un renglón; "Entrega por WhatsApp" abajo; y los
       botones grandes, a lo ancho, fáciles de tocar con el dedo */
    .vt-ver-modal .vt-der { justify-content: flex-start; gap: 8px 10px; }
    .vt-ver-modal .vt-der .vt-wa-only { flex-basis: 100%; padding: 0; }
    .vt-ver-modal .vt-der .btn,
    .vt-ver-modal .vt-der .vt-mini {
      /* Todo el renglón menos el lugar de la ✕: así "Confirmar pago" o
         "Listo" bajan siempre a su propio renglón, con la ✕ al lado */
      flex: 1 1 calc(100% - 58px); min-height: 44px; padding: 10px 12px;
      font-size: 14px; text-align: center; justify-content: center;
    }
    .vt-ver-modal .vt-der .vt-mini.no { flex: 0 0 48px; padding: 10px 0; font-size: 16px; }

    /* "Recordar por WhatsApp": el botón a lo ancho y la explicación abajo */
    .vt-ver-modal .vt-recordar { flex-direction: column; align-items: stretch; gap: 6px; }
    .vt-ver-modal .vt-recordar .vt-mini { min-height: 44px; padding: 10px 12px; font-size: 14px; text-align: center; }

    /* Las cuentas entregadas: "Copiar para mandar" abajo, a lo ancho */
    .vt-ver-modal .vt-cred { gap: 6px 14px; }
    .vt-ver-modal .vt-cred button { margin-left: 0; flex-basis: 100%; min-height: 40px; }
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
      <button class="vt-filtro activo" data-filtro="atencion">Para atender <span class="n" id="nAtencion"></span></button>
      <button class="vt-filtro" data-filtro="entregado">Entregados <span class="n" id="nEntregado"></span></button>
      <button class="vt-filtro" data-filtro="todos">Todos <span class="n" id="nTodos"></span></button>
      <!-- "El cliente dice que hizo una orden el lunes": con esto se busca
           por el día que él te dice, sin scrollear la lista entera. -->
      <button class="vt-filtro" data-filtro="fecha">Por fecha <span class="n" id="nFecha"></span></button>
      <input type="date" id="vtFecha" class="vt-fecha-sel" style="display:none;">
      <!-- Solo aparece si el navegador todavía no tiene permiso: pedirlo
           hace falta que salga de un toque tuyo, no se puede solo. -->
      <button class="vt-filtro" id="vtAvisos" hidden style="margin-left:auto;">Activar avisos</button>
      <!-- Juntos: si no entran en el renglón, bajan los dos -->
      <span style="margin-left:auto; display:flex; gap:10px;">
        <button class="btn btn-fantasma" id="vtCobros">Cobros</button>
        <button class="btn btn-fantasma" id="vtExportar">Exportar a Excel</button>
        <button class="btn btn-fantasma" id="vtRefrescar">↻ Actualizar</button>
      </span>
    </div>

    <div id="vtLista"></div>
  </div>

  <!-- ===== Ventana: la compra entera ("Ver") =====
       Va ANTES que las otras dos: las tres tienen el mismo z-index, así
       que "Confirmar" o "Listo" se abren por encima de esta y al cerrarlas
       volvés a la compra. -->
  <div class="vt-fondo" id="vtFondoVer">
    <div class="vt-modal vt-ver-modal" role="dialog" aria-modal="true" aria-labelledby="vtVerTitulo">
      <div class="vt-ver-cab">
        <h3 id="vtVerTitulo">Pedido</h3>
        <button class="vt-ver-x" id="vtVerCerrar" aria-label="Cerrar">✕</button>
      </div>
      <div id="vtVerCuerpo"></div>
    </div>
  </div>

  <!-- ===== Ventana: exportar las ventas del mes a Excel ===== -->
  <div class="vt-fondo" id="vtFondoExcel">
    <div class="vt-modal" role="dialog" aria-modal="true" aria-labelledby="vtExcelTitulo">
      <h3 id="vtExcelTitulo">Exportar ventas a Excel</h3>
      <p class="sub">Las ventas pagadas del mes, una por renglón, con su precio. Y una
         segunda hoja con el resumen por producto.</p>
      <label for="vtExcelMes">¿Qué mes?</label>
      <input type="month" id="vtExcelMes">
      <div class="vt-excel-resumen" id="vtExcelResumen"></div>
      <div class="vt-pie">
        <button class="btn btn-fantasma" id="vtExcelCerrar">Cerrar</button>
        <button class="btn btn-primario" id="vtExcelBajar" disabled>Bajar Excel</button>
      </div>
    </div>
  </div>

  <!-- ===== Ventana: cómo te pagan =====
       El QR del banco es el de siempre. Con el de Binance cargado, la
       tienda deja ver los precios en USDT y pagar por Binance Pay. La API
       de Binance (opcional, solo lectura) es para leer desde acá los pagos
       que te entran: ver supabase/16-api-binance.sql. -->
  <div class="vt-fondo" id="vtFondoCobros">
    <div class="vt-modal vt-cobros-modal" role="dialog" aria-modal="true" aria-labelledby="vtCobrosTitulo">
      <h3 id="vtCobrosTitulo">Cobros</h3>
      <p class="sub" style="margin-bottom:0;">Cómo te pagan tus clientes: con el QR del banco en
         bolivianos o con Binance Pay en USDT.</p>

      <!-- Tipo de cambio -->
      <div class="vt-cobro-sec">
        <div class="vt-cobro-sec-cab"><h4>Tipo de cambio</h4></div>
        <p class="vt-nota">Con esto la tienda pasa los precios de Bs a USDT.</p>
        <label class="vt-cambio" for="vtCobroTasa">
          1 USDT = <input type="number" id="vtCobroTasa" min="0.01" max="1000" step="0.01" inputmode="decimal" placeholder="10"> Bs
        </label>
        <p class="vt-nota" id="vtCobroEjemplo"></p>
      </div>

      <!-- Binance Pay: el QR y el Pay ID -->
      <div class="vt-cobro-sec">
        <div class="vt-cobro-sec-cab"><h4>Binance Pay</h4><span class="vt-chip" id="vtCobroChip">Sin QR</span></div>
        <p class="vt-nota">Sin QR, la tienda sigue solo con el del banco.</p>
        <label>Tu QR de Binance Pay</label>
        <div class="vt-cobro-qr">
          <div id="vtCobroVista"><div class="vacio">Sin QR</div></div>
          <div class="vt-cobro-btns">
            <button type="button" class="btn btn-fantasma" id="vtCobroElegir">Subir QR</button>
            <button type="button" class="btn btn-fantasma" id="vtCobroQuitar" style="display:none;">Quitar</button>
          </div>
          <input type="file" id="vtCobroArchivo" accept="image/png,image/jpeg,image/webp" hidden>
        </div>
        <p class="vt-nota" style="margin:0 0 14px;">En la app de Binance: Pay → Recibir → guardá la imagen del QR.</p>

        <label for="vtCobroPayId">Pay ID <span style="font-weight:400;">(opcional)</span></label>
        <input type="text" id="vtCobroPayId" placeholder="Ej: 123456789" autocomplete="off" inputmode="numeric">
        <p class="vt-nota" style="margin:0;">El número que figura en Binance → Pay → Recibir. El cliente lo copia
           si no puede escanear el QR.</p>
      </div>

      <!-- API de Binance (solo lectura) -->
      <div class="vt-cobro-sec">
        <div class="vt-cobro-sec-cab"><h4>API de Binance <span style="font-weight:400; color:var(--gris);">(opcional)</span></h4>
          <span class="vt-chip" id="vtApiChip">Sin conectar</span></div>
        <p class="vt-nota">Con la API conectada, los pagos de Binance Pay se confirman solos y la
           cuenta se entrega sin que toques nada. Usá una API de solo lectura: con ella no se
           puede mover tu dinero.</p>
        <div class="vt-api-campos">
          <label for="vtApiKey">API Key</label>
          <input type="text" id="vtApiKey" autocomplete="off" spellcheck="false" placeholder="Pegá la API Key">
          <label for="vtApiSecret" style="margin-top:8px;">Secret Key</label>
          <input type="password" id="vtApiSecret" autocomplete="new-password" spellcheck="false" placeholder="Pegá la Secret Key">
        </div>
        <div class="vt-api-btns">
          <button type="button" class="btn btn-fantasma" id="vtApiProbar">Probar conexión</button>
          <button type="button" class="btn btn-fantasma" id="vtApiQuitar" style="display:none;">Quitar API</button>
        </div>
        <div class="vt-api-estado" id="vtApiEstado" style="display:none;"></div>
        <p class="vt-nota" id="vtApiAuto" style="display:none; margin-top:10px;"></p>
        <details class="vt-api-ayuda">
          <summary>Cómo crear la API en Binance</summary>
          <ol>
            <li>En Binance: Perfil → Gestión de API → Crear API → "Generada por el sistema".</li>
            <li>Dejá activado solo <strong>Habilitar lectura</strong>. Nada de trading ni retiros.</li>
            <li>Restricción de IP: sin restringir (el servidor no tiene una IP fija).</li>
            <li>Copiá la API Key y la Secret Key acá. La Secret Key Binance la muestra una sola vez.</li>
          </ol>
        </details>
      </div>

      <!-- QR Bolivia automático: la pasarela de QR en Bs (supabase/18-qr-bs-automatico.sql) -->
      <div class="vt-cobro-sec">
        <div class="vt-cobro-sec-cab"><h4>QR Bolivia automático <span style="font-weight:400; color:var(--gris);">(próximamente)</span></h4>
          <span class="vt-chip" id="vtBsChip">Sin configurar</span></div>
        <p class="vt-nota">Cuando tu pasarela de QR en bolivianos esté habilitada, los pagos en Bs
           se confirman solos, igual que Binance. Cargá acá los datos que te den.</p>

        <label for="vtBsProveedor">Pasarela</label>
        <select id="vtBsProveedor" class="vt-select">
          <option value="">Elegí una…</option>
          <option>OpenBCB (Banco Central)</option>
          <option>BCP · QR Simple</option>
          <option>PagosNet</option>
          <option>CUCU</option>
          <option>Otra</option>
        </select>
        <div class="vt-mano-campos" style="margin-top:8px;">
          <div><label for="vtBsUrl">URL de la API</label>
            <input type="url" id="vtBsUrl" placeholder="https://…" autocomplete="off" spellcheck="false"></div>
          <div><label for="vtBsComercio">Código de comercio</label>
            <input type="text" id="vtBsComercio" placeholder="El que te asignen" autocomplete="off" spellcheck="false"></div>
          <div><label for="vtBsKey">API Key</label>
            <input type="text" id="vtBsKey" placeholder="Pegá la API Key" autocomplete="off" spellcheck="false"></div>
          <div><label for="vtBsSecret">Secret Key</label>
            <input type="password" id="vtBsSecret" placeholder="Pegá la Secret Key" autocomplete="new-password" spellcheck="false"></div>
        </div>

        <label style="margin-top:10px;">Dirección de avisos (webhook)</label>
        <div class="vt-copiable">
          <code id="vtBsWebhook"></code>
          <button type="button" class="btn btn-fantasma" id="vtBsCopiarUrl">Copiar</button>
        </div>
        <p class="vt-nota" style="margin:4px 0 10px;">Dásela a la pasarela: ahí te avisa cada pago.</p>

        <label>Clave del webhook</label>
        <div class="vt-api-btns" style="margin-top:0;">
          <button type="button" class="btn btn-fantasma" id="vtBsGenerar">Generar clave</button>
          <button type="button" class="btn btn-fantasma" id="vtBsQuitar" style="display:none;">Quitar datos</button>
        </div>
        <div class="vt-copiable" id="vtBsClaveCaja" style="display:none; margin-top:8px;">
          <code id="vtBsClave"></code>
          <button type="button" class="btn btn-fantasma" id="vtBsCopiarClave">Copiar</button>
        </div>
        <p class="vt-nota" id="vtBsClaveNota" style="margin:6px 0 0;"></p>

        <div class="vt-api-estado" id="vtBsAviso" style="display:none;"></div>

        <details class="vt-api-ayuda">
          <summary>Qué preguntarle a la pasarela</summary>
          <ol>
            <li>¿Me aceptan sin NIT, como persona natural?</li>
            <li>¿Cuánto cobran por transacción?</li>
            <li>¿La plata cae en mi cuenta? ¿En cuántos días?</li>
            <li>¿Me dan un QR por pedido, con monto y referencia propios, y avisos (webhook)?</li>
            <li>¿El aviso manda la clave tal cual, o firma con HMAC?</li>
          </ol>
          <p style="margin:8px 0 0;">Cuando te den el manual, se termina de conectar: cómo se arma el QR
             de cada pedido y cómo se lee su aviso (ver COBROS.md).</p>
        </details>
      </div>

      <div class="vt-alerta ojo" id="vtCobroError" style="display:none; margin:16px 0 0;"></div>

      <div class="vt-pie">
        <button class="btn btn-fantasma" id="vtCobrosCerrar">Cerrar</button>
        <button class="btn btn-primario" id="vtCobrosGuardar">Guardar</button>
      </div>
    </div>
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
        <div class="emo"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
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
        <div class="emo">${filtro === 'atencion' ? '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>' : filtro === 'fecha' ? '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' : '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>'}</div>
        <h3>${filtro === 'atencion' ? 'No hay nada pendiente'
             : filtro === 'fecha'   ? `No hubo pedidos el ${dia ? fechaOrden(`${dia}T00:00:00`).split(' ')[0] : 'ese día'}`
             : 'Todavía no hay pedidos'}</h3>
        <p>${filtro === 'atencion'
             ? 'Todos los pedidos están resueltos.'
             : filtro === 'fecha'
             ? 'Probá con otro día, o mirá "Todos".'
             : 'Van a aparecer acá solos, apenas alguien compre.'}</p>
      </div>`;
    pintarVer();
    return;
  }

  // Si la lista se achicó (se confirmó algo, cambió el filtro) y la página
  // en la que estabas ya no existe, se queda en la última que sí.
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  if (pagina > paginas) pagina = paginas;
  const desde = (pagina - 1) * POR_PAGINA;
  const estas = lista.slice(desde, desde + POR_PAGINA);

  $('vtLista').innerHTML = `
    <div class="vt-tabla">
      <div class="vt-fila vt-fila-cab">
        <span>Código</span><span>Fecha</span><span>Total</span><span>Estado</span><span></span>
      </div>
      ${estas.map(filaCompra).join('')}
    </div>
    ${paginador(paginas, desde, estas.length, lista.length)}`;

  pintarVer();
}

// Una fila de la lista: lo justo para encontrar la compra. Todo lo demás
// (qué se compró, el cliente, las cuentas, los botones) está en "Ver".
function filaCompra(c) {
  const L = c.lineas;
  const principal = estadoPrincipal(L);
  const clase = principal === 'sin_stock' ? 'urgente'
              : principal === 'esperando_pago' || principal === 'pagado' ? 'espera' : '';
  // "19-09-2026 04:04 PM": el día arriba, la hora abajo en chico
  const [dia, ...hora] = fechaOrden(c.primera.creado_en).split(' ');

  return `
    <div class="vt-fila ${clase}" data-ver="${escapar(c.clave)}">
      <span class="vt-f-num">${numerosDeCompra(L)}</span>
      <span class="vt-f-fecha">${dia}<small>${hora.join(' ')}</small></span>
      <span class="vt-f-bs">${bsTxt(c.total)}${usdtDe(c) ? `<small>${usdtDe(c)}</small>` : ''}</span>
      <span class="vt-f-estado">${cartelDe(c)}</span>
      <button class="vt-ver" data-ver="${escapar(c.clave)}">Ver</button>
    </div>`;
}

// ‹ 1 2 3 … 12 13 ›, y debajo "16–30 de 187 compras"
function paginador(paginas, desde, cuantas, total) {
  if (paginas <= 1) return '';
  const botones = numerosDePagina(pagina, paginas).map(n => n === '…'
    ? '<span class="vt-pag-puntos">…</span>'
    : `<button class="vt-pag${n === pagina ? ' activa' : ''}" data-pagina="${n}"
               ${n === pagina ? 'aria-current="page"' : ''}>${n}</button>`).join('');

  return `
    <nav class="vt-paginas" aria-label="Páginas">
      <button class="vt-pag" data-pagina="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
      ${botones}
      <button class="vt-pag" data-pagina="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Página siguiente">›</button>
    </nav>
    <div class="vt-pag-info">${desde + 1}–${desde + cuantas} de ${total} compras</div>`;
}

// Hasta 7 páginas se muestran todas. Con más: las dos primeras, las dos
// últimas y las vecinas de la actual, con "…" en los saltos.
function numerosDePagina(actual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const quedan = [...new Set([1, 2, actual - 1, actual, actual + 1, total - 1, total])]
    .filter(n => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const salida = [];
  quedan.forEach((n, i) => {
    if (i && n - quedan[i - 1] > 1) salida.push('…');
    salida.push(n);
  });
  return salida;
}

// ------------------------------------------------------------
// "Ver": la compra entera en una ventana
// ------------------------------------------------------------
// Es la misma tarjeta de siempre, con todos sus botones: confirmar,
// Listo, ✕, copiar las cuentas. Se busca en TODOS los pedidos y no solo
// en los del filtro: al confirmarla desde acá deja de estar "Para
// atender", pero la ventana tiene que seguir mostrándola, ya entregada.
function compraPorClave(clave) {
  return agruparCompras(PEDIDOS.filter(o => (o.grupo || o.id) === clave))[0] || null;
}

function abrirVer(clave) {
  verClave = clave;
  pintarVer();
  $('vtFondoVer').classList.add('abierto');
  $('vtVerCerrar').focus();
}

function pintarVer() {
  if (!verClave) return;
  const c = compraPorClave(verClave);
  // No está en los pedidos cargados (una vieja abierta desde "Por fecha",
  // y un pedido nuevo recargó los últimos 200): la ventana queda como
  // estaba, en vez de cerrarse sola en la cara.
  if (!c) return;
  $('vtVerTitulo').textContent = `Pedido ${numerosDeCompra(c.lineas)}`;
  $('vtVerCuerpo').innerHTML = pintarCompra(c);
}

function cerrarVer() {
  verClave = null;
  $('vtFondoVer').classList.remove('abierto');
}

const bsTxt = n => `${Number(n || 0).toFixed(2)} Bs`;

// Eligió pagar por Binance Pay: lo que tiene que llegarte, en USDT, con el
// tipo de cambio de cuando lo eligió (el mismo cálculo que la tienda:
// hacia arriba, al centavo). '' si paga con el QR del banco.
function usdtDe(c) {
  const b = c.lineas.find(o => o.metodo_pago === 'binance' && Number(o.usdt_bs) > 0);
  if (!b) return '';
  // El monto único que se le pidió (supabase/17-binance-automatico.sql);
  // los pedidos de antes no lo tienen y se calcula como antes
  const usdt = Number(b.usdt_monto) > 0
    ? Number(b.usdt_monto)
    : Math.ceil(Number((Number(c.total || 0) / Number(b.usdt_bs) * 100).toFixed(6))) / 100;
  return `${usdt.toFixed(2)} USDT`;
}

// Lo confirmó solo el revisor de Binance, no vos desde el panel
const confirmadoSolo = c => c.lineas.some(o => o.confirmado_por === 'Binance automático');

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
// Cuánto tiempo de suscripción compró: los días anotados en el pedido.
// En un plan rebajado son menos que el plan entero (le quedan 21 de 30).
const duracion = o => o && o.plan_dias ? `${o.plan_dias} días` : '';

function detalleCompra(c, { porEstado = false } = {}) {
  const filas = productosDeCompra(c.lineas, porEstado).map(x => `
    <div class="vt-linea">
      <span class="vt-l-cant">${x.cant}×</span>
      <span class="vt-l-nom">${escapar(x.nombre)}<small>${x.lineas.map(o => '#' + o.numero).join(' · ')}${
        duracion(x.lineas[0]) ? ` · ${duracion(x.lineas[0])}` : ''}</small></span>
      ${porEstado ? badgeEstado(x.estado) : ''}
      <span class="vt-l-bs">${bsTxt(x.unitario * x.cant)}</span>
    </div>`).join('');

  const descuento = c.descuento > 0 ? `
    <div class="vt-linea desc">
      <span class="vt-l-cant"></span>
      <span class="vt-l-nom">Descuento combo</span>
      <span class="vt-l-bs">−${bsTxt(c.descuento)}</span>
    </div>` : '';

  const rotulo = c.lineas.some(o => o.estado === 'esperando_pago' || o.estado === 'vencido') ? 'Total a cobrar'
               : c.lineas.every(o => o.estado === 'cancelado') ? 'Total'
               : 'Total pagado';

  // Con Binance, lo que mirás en la app es el monto en USDT
  const usdt = usdtDe(c);
  const tasa = usdt ? Number(c.lineas.find(o => o.metodo_pago === 'binance').usdt_bs) : 0;
  const enUsdt = usdt ? `
      <div class="vt-linea usdt">
        <span class="vt-l-cant"></span>
        <span class="vt-l-nom">Por Binance Pay<small>1 USDT = ${tasa.toFixed(2)} Bs</small></span>
        <span class="vt-l-bs">${usdt}</span>
      </div>` : '';

  return `
    <div class="vt-lineas">
      ${filas}${descuento}
      <div class="vt-linea total">
        <span class="vt-l-cant"></span>
        <span class="vt-l-nom">${rotulo}</span>
        <span class="vt-l-bs">${bsTxt(c.total)}</span>
      </div>${enUsdt}
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
// ------------------------------------------------------------
// Recordarle por WhatsApp al que no pagó
// ------------------------------------------------------------
// Más de la mitad de las compras se empiezan y no se pagan, y muchas
// dejan el WhatsApp. El botón abre el chat del cliente con el mensaje ya
// escrito: si todavía puede pagar (esperando o vencida), con el enlace a
// su QR; si se canceló, invitándolo a volver a la tienda. Al tocarlo se
// anota cuándo (recordado_en), para no escribirle dos veces sin querer.
const NO_PAGADA = ['esperando_pago', 'vencido', 'cancelado'];

// El número tal como lo pide wa.me: con el 591 adelante
function numeroWa(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length === 8 ? '591' + d : d;
}

function mensajeRecordatorio(c) {
  const p = c.primera;
  const nombre = String(p.cliente_nombre || '').trim().split(/\s+/)[0];
  const hola = `Hola${nombre ? ' ' + nombre : ''}, te escribo de Tiago Store.`;
  const que = nombreDeCompra(c.lineas);
  // La tienda está un nivel arriba del panel (/admin/)
  const tienda = new URL('../', location.href).href;

  if (c.lineas.every(o => o.estado === 'cancelado')) {
    return [hola,
      `Vi que no se completó tu pedido ${numerosDeCompra(c.lineas)} de ${que}.`,
      `Si todavía lo querés, lo encontrás acá: ${tienda}`,
      `Cualquier duda, respondeme por acá.`].join('\n');
  }
  const token = c.lineas.find(o => o.token)?.token;
  return [hola,
    `Quedó pendiente tu pedido ${numerosDeCompra(c.lineas)}: ${que} (${bsTxt(c.total)}).`,
    `¿Te ayudo a terminarlo? Podés pagarlo con el QR desde acá: ${tienda}pagar-qr.html#t=${token}`,
    `Si tuviste algún problema con el pago, respondeme y lo vemos.`].join('\n');
}

function filaRecordatorio(c) {
  const wa = numeroWa(c.primera.cliente_whatsapp);
  if (!wa || !c.lineas.every(o => NO_PAGADA.includes(o.estado))) return '';

  const cuando = c.lineas.map(o => o.recordado_en).filter(Boolean).sort().pop();
  const hace = cuando ? cuandoFue(cuando) : '';
  const nota = cuando
    ? `Ya le recordaste ${hace.startsWith('hace') || hace === 'recién' ? hace : 'el ' + hace}.`
    : c.lineas.every(o => o.estado === 'cancelado')
      ? 'Se canceló: el mensaje lo invita a volver a la tienda.'
      : 'Le llega con el enlace a su QR para pagar.';

  return `
    <div class="vt-recordar">
      <a class="vt-mini" href="https://wa.me/${wa}?text=${encodeURIComponent(mensajeRecordatorio(c))}"
         target="_blank" rel="noopener" data-recordar="${escapar(c.clave)}">
        ${cuando ? 'Recordar de nuevo' : 'Recordar por WhatsApp'}</a>
      <span class="vt-recordar-nota">${nota}</span>
    </div>`;
}

async function anotarRecordatorio(clave) {
  const c = compraPorClave(clave);
  if (!c) return;
  const ahora = new Date().toISOString();
  const ids = c.lineas.map(o => o.id);
  const { error } = await sbAdmin.from('pedidos').update({ recordado_en: ahora }).in('id', ids);
  if (error) { console.error(error); return; }     // el chat ya se abrió: no se molesta con un error
  PEDIDOS.forEach(o => { if (ids.includes(o.id)) o.recordado_en = ahora; });
  pintarVer();
}

// El cartel del estado. Con estados mezclados dice cuánto va entregado;
// el color sigue siendo el de lo que falta, que es lo que te pide algo.
function cartelDe(c) {
  const L = c.lineas;
  const principal = estadoPrincipal(L);
  const mixto = new Set(L.map(o => o.estado)).size > 1;
  const entregadas = L.filter(o => o.estado === 'entregado');
  return mixto && entregadas.length
    ? badgeEstado(principal, `${entregadas.length} de ${L.length} entregadas`)
    : badgeEstado(principal);
}

function pintarCompra(c) {
  const L = c.lineas;
  const p = c.primera;
  const n = L.length;

  const principal = estadoPrincipal(L);
  const mixto = new Set(L.map(o => o.estado)).size > 1;

  const clase = principal === 'sin_stock' ? 'urgente'
              : principal === 'esperando_pago' || principal === 'pagado' ? 'espera' : '';

  const entregadas = L.filter(o => o.estado === 'entregado');
  const cartel = cartelDe(c);

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
      ? `<div class="vt-stock-fila">Hay stock para todo: al confirmar se entregan solas las ${cob.de} cuentas.</div>`
      : `<div class="vt-stock-fila parcial">Hay stock para ${cob.hay} de ${cob.de}: al confirmar se
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
        <span>Usuario: ${escapar(cred.usuario || '')}</span>
        ${cred.clave  ? `<span>Clave: ${escapar(cred.clave)}</span>`   : ''}
        ${cred.perfil ? `<span>Perfil: ${escapar(cred.perfil)}</span>`  : ''}
        ${cred.pin    ? `<span># ${escapar(cred.pin)}</span>`      : ''}
        <button data-copiar="${o.id}">Copiar para mandar</button>
      </div>`;
  }).join('') + (conCuenta.length > 1 ? `
      <div class="vt-cred-todas">
        <button class="vt-mini" data-copiar-compra="${c.clave}">Copiar las ${conCuenta.length} en un solo mensaje</button>
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
        <!-- Cuánto tiempo compró. Con varios productos va en cada renglón
             del detalle de abajo, porque cada uno tiene el suyo. -->
        ${n === 1 && duracion(p) ? `<div class="vt-plan">Suscripción: <strong>${duracion(p)}</strong></div>` : ''}
        <div class="vt-cliente">
          ${escapar(p.cliente_nombre || 'Sin nombre')}
          ${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ${escapar(p.cliente_whatsapp)}</a>` : ''}
          ${p.cliente_email ? ` · ${escapar(p.cliente_email)}` : ''}
          ${comprobante ? ` · comprobante ${escapar(comprobante)}` : ''}
        </div>
      </div>

      <div class="vt-der">
        <span class="vt-precio" title="Lo que paga el cliente${c.descuento > 0 ? ', ya con el descuento combo' : ''}">${bsTxt(c.total)}</span>
        ${usdtDe(c) ? `<span class="vt-usdt" title="Eligió pagar por Binance Pay">Binance Pay · ${usdtDe(c)}${
          confirmadoSolo(c) ? ' · confirmado solo' : ''}</span>` : ''}
        ${cartel}
        ${acciones}
      </div>

      ${filaRecordatorio(c)}
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
          Pidió que le avisemos para renovar${vencimientos.length ? ' · ' + vencimientos.join(' · ') : ''}${
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
  pagina = 1;

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
  pagina = 1;
  cargarDia($('vtFecha').value);
});

$('vtRefrescar').addEventListener('click', cargarTodo);

// La lista: cambiar de página, o abrir una compra con "Ver" (o tocando
// cualquier parte de su fila)
$('vtLista').addEventListener('click', e => {
  const pag = e.target.closest('[data-pagina]');
  if (pag) {
    if (pag.disabled) return;
    pagina = Number(pag.dataset.pagina) || 1;
    listar();
    // Que la página nueva arranque desde arriba, no a mitad de la lista
    $('vtLista').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const ver = e.target.closest('[data-ver]');
  if (ver) abrirVer(ver.dataset.ver);
});

// La ventana de "Ver"
$('vtVerCerrar').addEventListener('click', cerrarVer);
$('vtFondoVer').addEventListener('click', e => { if (e.target === $('vtFondoVer')) cerrarVer(); });
// Esc cierra "Ver" solo si no hay otra ventana encima: si estás en
// "Confirmar", el Esc cierra esa y volvés a la compra. Va en captura para
// mirar antes de que los otros Esc cierren la suya.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !verClave) return;
  if ($('vtFondo').classList.contains('abierto') || $('vtFondoMano').classList.contains('abierto')) return;
  cerrarVer();
}, true);

// Los botones de la compra (confirmar, Listo, ✕, copiar) viven en la
// ventana de "Ver"
$('vtVerCuerpo').addEventListener('click', async e => {
  // El enlace abre el chat solo (es un <a>); acá solo se anota cuándo
  const recordar = e.target.closest('[data-recordar]');
  if (recordar) { anotarRecordatorio(recordar.dataset.recordar); return; }

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
    `*TIAGO STORE* · Pedido #${p.numero}`,
    ``,
    `*${p.producto_nombre}*`,
    ``,
    `Usuario: ${cred.usuario || ''}`,
    cred.clave  ? `Clave: ${cred.clave}`   : '',
    cred.perfil ? `Perfil: ${cred.perfil}` : '',
    cred.pin    ? `PIN: ${cred.pin}`       : '',
    cred.notas  ? `\nNota: ${cred.notas}`    : '',
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
      `Usuario: ${cred.usuario || ''}`,
      cred.clave  ? `Clave: ${cred.clave}`   : '',
      cred.perfil ? `Perfil: ${cred.perfil}` : '',
      cred.pin    ? `PIN: ${cred.pin}`       : '',
      cred.notas  ? `Nota: ${cred.notas}`      : ''
    ].filter(Boolean).join('\n');
  });
  if (!bloques.length) return;

  await copiarTexto([
    `*TIAGO STORE* · Pedido ${numerosDeCompra(c.lineas)}`,
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
    : usdtDe(c)
      ? `Confirmá solo si <strong>ya te entraron ${usdtDe(c)}</strong> en tu Binance. ` +
        `Al confirmar, ${entrega}, y no se puede deshacer.`
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
      if (payload.eventType === 'INSERT') anotarParaAvisar(payload.new, true);
      if (payload.eventType === 'UPDATE') anotarParaAvisar(payload.new, false);
      // Si todavía no abriste Ventas no hay nada que refrescar: el aviso
      // ya salió, y los datos se cargan cuando entres.
      if (yaCargado) recargarPronto();
    })
    .subscribe();
}

// Una compra de 3 cuentas llega como 3 INSERT y un UPDATE (el del
// descuento combo), todos casi juntos. Recargar con cada uno eran cuatro
// consultas seguidas para terminar mostrando lo mismo: se espera un
// momento y se recarga una vez.
let esperaRecarga = null;
function recargarPronto() {
  clearTimeout(esperaRecarga);
  esperaRecarga = setTimeout(cargarTodo, 400);
}

// Y lo mismo con el aviso: uno por compra, no uno por cuenta. Se juntan
// las filas nuevas un momento, y los UPDATE de esas mismas filas las
// pisan: así el total del aviso ya trae el descuento combo, que se aplica
// después de insertarlas.
const porAvisar = new Map();     // id del pedido -> la fila más reciente
let esperaAviso = null;

function anotarParaAvisar(p, esNuevo) {
  if (!p?.id) return;
  if (!esNuevo && !porAvisar.has(p.id)) return;   // un cambio de algo viejo
  porAvisar.set(p.id, p);
  if (esNuevo) {
    clearTimeout(esperaAviso);
    esperaAviso = setTimeout(avisarComprasNuevas, 1200);
  }
}

function avisarComprasNuevas() {
  const compras = agruparCompras([...porAvisar.values()]);
  porAvisar.clear();
  if (!compras.length) return;
  sonarCampana();
  compras.forEach(avisarCompraNueva);
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

function avisarCompraNueva(c) {
  const num   = numerosDeCompra(c.lineas);
  const que   = nombreDeCompra(c.lineas);
  const plata = bsTxt(c.total) + (c.descuento > 0 ? ` (combo −${Number(c.descuento).toFixed(0)})` : '');
  aviso(`Pedido nuevo ${num}: ${que} · ${plata}`, 'ok');

  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`Pedido nuevo ${num}`, {
      body: `${que} · ${plata}\nEsperando que lo apruebes`,
      // Con el tag, dos avisos de la misma compra no se apilan
      tag: 'pedido-' + c.clave
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
    if (Notification.permission === 'granted') aviso('Listo, te aviso acá cuando entre un pedido', 'ok');
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
// 8c. EXPORTAR LAS VENTAS DEL MES A EXCEL
// ============================================================
// Para tus cuentas: cada venta pagada del mes con su precio, y una hoja
// con el resumen por producto. Sin costo ni ganancia: el panel dejó de
// pedir lo que costó cada cuenta (30/9/2026).
//
//   · Venta = pedido pagado (entregado, o pagado y esperando cuenta). Su
//     fecha es la del pago: es cuando entró la plata.
//   · Es un .xlsx de verdad (SheetJS): los montos son números y las
//     fechas son fechas, así se pueden sumar y ordenar en Excel. La
//     librería se baja recién al tocar el botón.
const SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const VENDIDOS = ['entregado', 'sin_stock', 'pagado'];
let ventasDelMes = null;   // { mes, filas, totales } de la última lectura

const aDosDec = n => Math.round(Number(n || 0) * 100) / 100;

// "2026-09" -> desde el 1 a las 00:00 hasta el 1 del mes siguiente, en TU
// hora (la base guarda en UTC)
function limitesDelMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return { desde: new Date(a, m - 1, 1), hasta: new Date(a, m, 1) };
}

async function leerVentasDelMes(mes) {
  const { desde, hasta } = limitesDelMes(mes);
  // Un margen de 15 días antes: un pedido armado a fin de mes y pagado el
  // 1ro es venta de este mes. Después se filtra por la fecha del pago.
  const margen = new Date(desde.getTime() - 15 * 864e5);

  const rPed = await sbAdmin.from('pedidos').select('*')
    .in('estado', VENDIDOS)
    .gte('creado_en', margen.toISOString())
    .lt('creado_en', hasta.toISOString())
    .order('creado_en', { ascending: true });
  if (rPed.error) throw rPed.error;

  const filas = rPed.data
    .map(p => ({ p, fecha: new Date(p.pagado_en || p.entregado_en || p.creado_en) }))
    .filter(({ fecha }) => fecha >= desde && fecha < hasta)
    .sort((a, b) => a.fecha - b.fecha)
    .map(({ p, fecha }) => ({
      fecha,
      numero:    p.numero,
      producto:  p.producto_nombre || '',
      dias:      p.plan_dias || null,
      cliente:   p.cliente_nombre || '',
      whatsapp:  p.cliente_whatsapp || '',
      precio:    aDosDec(p.precio),
      descuento: aDosDec(p.descuento),
      estado:    p.estado === 'entregado' ? 'Entregado' : 'Pagado, falta entregar',
      referencia: p.referencia_pago || ''
    }));

  const totales = {
    ventas:  filas.length,
    vendido: aDosDec(filas.reduce((s, f) => s + f.precio, 0))
  };
  return { mes, filas, totales };
}

// "septiembre de 2026"
const nombreDelMes = mes => {
  const { desde } = limitesDelMes(mes);
  return desde.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
};

async function mostrarResumenExcel() {
  const mes = $('vtExcelMes').value;
  const caja = $('vtExcelResumen');
  $('vtExcelBajar').disabled = true;
  ventasDelMes = null;
  if (!mes) { caja.textContent = 'Elegí un mes.'; return; }

  caja.textContent = 'Leyendo las ventas…';
  try {
    const datos = await leerVentasDelMes(mes);
    if ($('vtExcelMes').value !== mes) return;      // cambiaron de mes mientras tanto
    ventasDelMes = datos;
    const t = datos.totales;
    if (!t.ventas) {
      caja.innerHTML = `En ${nombreDelMes(mes)} no hubo ventas pagadas.`;
      return;
    }
    caja.innerHTML = `
      <strong>${t.ventas}</strong> venta${t.ventas === 1 ? '' : 's'} en ${nombreDelMes(mes)} ·
      vendido <strong>${bsTxt(t.vendido)}</strong>`;
    $('vtExcelBajar').disabled = false;
  } catch (err) {
    console.error(err);
    caja.textContent = `No se pudieron leer las ventas: ${err.message || err}`;
  }
}

// Fecha de Excel (días desde el 30/12/1899) con la hora local tal cual:
// así Excel muestra la misma hora que el panel, sin correrla por la zona.
function fechaExcel(d) {
  const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  return (local - Date.UTC(1899, 11, 30)) / 864e5;
}

async function bajarExcel() {
  if (!ventasDelMes || !ventasDelMes.filas.length) return;
  const boton = $('vtExcelBajar');
  boton.disabled = true;
  boton.textContent = 'Armando el Excel…';
  try {
    const XLSX = await import(SHEETJS);
    const { mes, filas, totales } = ventasDelMes;

    // ---- Hoja 1: las ventas, una por renglón ----
    const titulos = ['Fecha', 'Pedido', 'Producto', 'Suscripción (días)', 'Cliente', 'WhatsApp',
                     'Precio cobrado (Bs)', 'Descuento combo (Bs)', 'Estado', 'Nombre en la transferencia'];
    const renglones = filas.map(f => [
      fechaExcel(f.fecha), f.numero, f.producto, f.dias, f.cliente, f.whatsapp,
      f.precio, f.descuento, f.estado, f.referencia
    ]);
    const total = ['Total', '', `${totales.ventas} ventas`, '', '', '',
                   totales.vendido, '', '', ''];
    const hoja = XLSX.utils.aoa_to_sheet([titulos, ...renglones, [], total]);

    // Formatos: la fecha como fecha y la plata con dos decimales
    const ultima = renglones.length + 2;              // fila del total (0-based)
    for (let r = 1; r <= ultima; r++) {
      const fecha = hoja[XLSX.utils.encode_cell({ r, c: 0 })];
      if (fecha && typeof fecha.v === 'number') fecha.z = 'dd/mm/yyyy hh:mm';
      for (const c of [6, 7]) {
        const celda = hoja[XLSX.utils.encode_cell({ r, c })];
        if (celda && typeof celda.v === 'number') celda.z = '#,##0.00';
      }
    }
    hoja['!cols'] = [16, 8, 38, 10, 20, 14, 12, 12, 20, 24].map(wch => ({ wch }));
    hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: renglones.length, c: titulos.length - 1 } }) };

    // ---- Hoja 2: resumen por producto ----
    const porProducto = new Map();
    for (const f of filas) {
      const x = porProducto.get(f.producto) || { unidades: 0, vendido: 0 };
      x.unidades++;
      x.vendido += f.precio;
      porProducto.set(f.producto, x);
    }
    const resumen = [...porProducto.entries()]
      .sort((a, b) => b[1].vendido - a[1].vendido)
      .map(([nombre, x]) => [nombre, x.unidades, aDosDec(x.vendido)]);
    const hoja2 = XLSX.utils.aoa_to_sheet([
      ['Producto', 'Unidades', 'Vendido (Bs)'],
      ...resumen,
      [],
      ['Total', totales.ventas, totales.vendido]
    ]);
    for (let r = 1; r <= resumen.length + 2; r++) {
      const celda = hoja2[XLSX.utils.encode_cell({ r, c: 2 })];
      if (celda && typeof celda.v === 'number') celda.z = '#,##0.00';
    }
    hoja2['!cols'] = [38, 10, 13].map(wch => ({ wch }));

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Ventas');
    XLSX.utils.book_append_sheet(libro, hoja2, 'Por producto');
    XLSX.writeFile(libro, `ventas-tiago-store-${mes}.xlsx`);
    aviso(`✓ Excel de ${nombreDelMes(mes)} descargado`, 'ok');
  } catch (err) {
    console.error(err);
    aviso(`No se pudo armar el Excel: ${err.message || err}`, 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Bajar Excel';
  }
}

function abrirExcel() {
  // Arranca en el mes actual
  if (!$('vtExcelMes').value) $('vtExcelMes').value = diaLocal(new Date().toISOString()).slice(0, 7);
  $('vtFondoExcel').classList.add('abierto');
  mostrarResumenExcel();
}
function cerrarExcel() { $('vtFondoExcel').classList.remove('abierto'); }

$('vtExportar').addEventListener('click', abrirExcel);
$('vtExcelMes').addEventListener('change', mostrarResumenExcel);
$('vtExcelBajar').addEventListener('click', bajarExcel);
$('vtExcelCerrar').addEventListener('click', cerrarExcel);
$('vtFondoExcel').addEventListener('click', e => { if (e.target === $('vtFondoExcel')) cerrarExcel(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('vtFondoExcel').classList.contains('abierto')) cerrarExcel();
});


// ============================================================
// 8b. COBROS: TIPO DE CAMBIO, BINANCE PAY Y LA API DE BINANCE
// ============================================================
// Lo que lee la tienda con datos_de_cobro(). Se guarda con
// guardar_datos_de_cobro(), que solo deja al admin (ver
// supabase/15-pago-binance.sql). La API, con guardar_api_binance() y
// probar_api_binance() (supabase/16-api-binance.sql).
let cobroQr = '';   // la URL guardada, una foto nueva sin subir (data URI) o '' = sin QR

function errorCobro(texto) {
  const el = $('vtCobroError');
  el.textContent = texto || '';
  el.style.display = texto ? '' : 'none';
}

function pintarQrCobro() {
  $('vtCobroVista').innerHTML = cobroQr
    ? `<img src="${escapar(cobroQr)}" alt="Tu QR de Binance Pay">`
    : '<div class="vacio">Sin QR</div>';
  $('vtCobroElegir').textContent = cobroQr ? 'Cambiar QR' : 'Subir QR';
  $('vtCobroQuitar').style.display = cobroQr ? '' : 'none';
  const chip = $('vtCobroChip');
  chip.textContent = cobroQr ? 'Activo en la tienda' : 'Sin QR';
  chip.className = 'vt-chip' + (cobroQr ? ' ok' : '');
}

// ---- La API de Binance (supabase/16-api-binance.sql) ----
// La Secret Key nunca vuelve al panel: solo se sabe si está cargada y
// cómo terminó la última prueba.
let apiEstado = { configurada: false, key_fin: null, prueba: null };

function pintarApi() {
  const e = apiEstado;
  const p = e.prueba;
  const chip = $('vtApiChip');
  chip.textContent = !e.configurada ? 'Sin conectar' : !p ? 'Sin probar' : p.ok ? 'Conectada' : 'Con error';
  chip.className = 'vt-chip' + (e.configurada && p ? (p.ok ? ' ok' : ' ojo') : '');

  $('vtApiKey').placeholder    = e.configurada ? `Guardada · termina en ${e.key_fin || '····'}` : 'Pegá la API Key';
  $('vtApiSecret').placeholder = e.configurada ? 'Guardada · no se muestra' : 'Pegá la Secret Key';
  $('vtApiQuitar').style.display = e.configurada ? '' : 'none';

  const linea = $('vtApiEstado');
  if (e.configurada && p) {
    const cuando = p.en ? new Date(p.en).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }) : '';
    linea.textContent = p.mensaje + (cuando ? ` (probada el ${cuando})` : '');
    linea.className = 'vt-api-estado ' + (p.ok ? 'ok' : 'mal');
    linea.style.display = '';
  } else {
    linea.style.display = 'none';
  }

  // Con la API andando, los pagos de Binance se confirman solos
  // (supabase/17-binance-automatico.sql)
  const auto = $('vtApiAuto');
  if (e.configurada && p && p.ok) {
    const n = Number(e.confirmados) || 0;
    const revisado = e.revisado_en
      ? new Date(e.revisado_en).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })
      : '';
    auto.innerHTML =
      '<strong>Confirmación automática activa.</strong> Mientras haya pedidos esperando pago por ' +
      'Binance, cada minuto se revisan tus pagos: si uno coincide con el monto exacto de un pedido, ' +
      'se confirma y la cuenta se entrega sola. Los que no coinciden te llegan por Telegram para ' +
      'que los confirmes a mano.' +
      `<br>${n === 1 ? '1 pago confirmado solo' : `${n} pagos confirmados solos`}` +
      (revisado ? ` · última revisión: ${escapar(revisado)}` : '');
    auto.style.display = '';
  } else {
    auto.style.display = 'none';
  }
}

// Si pegaste claves nuevas, se guardan. Devuelve true si guardó algo.
async function guardarApiSiCambio() {
  const key    = $('vtApiKey').value.trim();
  const secret = $('vtApiSecret').value.trim();
  if (!key && !secret) return false;
  if (!key) throw new Error(apiEstado.configurada ? 'Pegá también la API Key.' : 'Falta la API Key.');
  if (!secret && !apiEstado.configurada) throw new Error('Falta la Secret Key.');
  const { data, error } = await sbAdmin.rpc('guardar_api_binance', { p_api_key: key, p_api_secret: secret });
  if (error) throw error;
  apiEstado = data;
  $('vtApiKey').value = '';
  $('vtApiSecret').value = '';
  pintarApi();
  return true;
}

async function probarApi() {
  errorCobro('');
  const boton = $('vtApiProbar');
  boton.disabled = true;
  boton.textContent = 'Probando…';
  try {
    await guardarApiSiCambio();
    if (!apiEstado.configurada) throw new Error('Primero pegá la API Key y la Secret Key.');
    const { data, error } = await sbAdmin.rpc('probar_api_binance');
    if (error) throw error;
    apiEstado = { ...apiEstado, prueba: data };
    pintarApi();
  } catch (e) {
    errorCobro(e.message || 'No se pudo probar la conexión.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Probar conexión';
  }
}

// Quitar pide un segundo toque: "Tocá de nuevo para quitar"
let quitarApiHasta = 0;
async function quitarApi() {
  const boton = $('vtApiQuitar');
  if (Date.now() > quitarApiHasta) {
    quitarApiHasta = Date.now() + 4000;
    boton.textContent = 'Tocá de nuevo para quitar';
    setTimeout(() => { if (Date.now() > quitarApiHasta) boton.textContent = 'Quitar API'; }, 4100);
    return;
  }
  quitarApiHasta = 0;
  boton.disabled = true;
  try {
    const { data, error } = await sbAdmin.rpc('guardar_api_binance', { p_api_key: '', p_api_secret: '' });
    if (error) throw error;
    apiEstado = data;
    pintarApi();
    aviso('Se quitó la API de Binance', 'ok');
  } catch (e) {
    errorCobro(e.message || 'No se pudo quitar la API.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Quitar API';
  }
}

// "Un plan de 35 Bs se ve a 3.50 USDT": para ver de un vistazo si el
// número que pusiste es el que querías
function pintarEjemploCobro() {
  const tasa = Number($('vtCobroTasa').value);
  $('vtCobroEjemplo').textContent = tasa > 0
    ? `Ejemplo: un plan de 35 Bs se muestra a ${(Math.ceil(Number((35 / tasa * 100).toFixed(6))) / 100).toFixed(2)} USDT.`
    : 'Poné cuántos bolivianos vale 1 USDT (por ejemplo 10).';
}

// ---- QR Bolivia automático (supabase/18-qr-bs-automatico.sql) ----
// La pasarela de QR en Bs: sus datos, la dirección de avisos (webhook) y
// la clave que manda en cada aviso. La Secret Key nunca vuelve al panel,
// y la clave del webhook se muestra una sola vez, al generarla.
const WEBHOOK_BS = `${SUPABASE_URL}/functions/v1/webhook-pago`;
let bsEstado = { configurada: false, webhook_listo: false, ultimo_aviso: null };

// Qué pasó con el último aviso, en palabras
const MOTIVO_AVISO = {
  no_interpretado:      'llegó, pero todavía no se entiende su formato: falta terminar de conectarla con el manual de la pasarela',
  no_es_pago:           'no era un pago (un QR generado o vencido, por ejemplo)',
  monto_insuficiente:   'pagó de menos: no se entregó',
  pedido_no_encontrado: 'no coincide con ningún pedido'
};

function pintarBsCampos() {
  const e = bsEstado;
  const sel = $('vtBsProveedor');
  // Si la guardada no está en la lista, se agrega para no perderla
  if (e.proveedor && ![...sel.options].some(o => o.value === e.proveedor)) {
    sel.add(new Option(e.proveedor, e.proveedor));
  }
  sel.value          = e.proveedor || '';
  $('vtBsUrl').value      = e.api_url  || '';
  $('vtBsComercio').value = e.comercio || '';
  $('vtBsKey').value    = '';
  $('vtBsSecret').value = '';
  $('vtBsWebhook').textContent = WEBHOOK_BS;
}

function pintarBsEstado() {
  const e = bsEstado;
  const a = e.ultimo_aviso;
  const algo = e.configurada || e.webhook_listo || e.proveedor || e.api_url || e.comercio;

  const chip = $('vtBsChip');
  chip.textContent = !algo ? 'Sin configurar'
    : a ? (a.ok ? 'Recibiendo pagos' : 'Aviso para revisar')
    : e.webhook_listo ? 'Esperando el primer aviso'
    : 'Falta la clave del webhook';
  chip.className = 'vt-chip' + (a ? (a.ok ? ' ok' : ' ojo') : '');

  $('vtBsKey').placeholder    = e.configurada ? `Guardada · termina en ${e.key_fin || '····'}` : 'Pegá la API Key';
  $('vtBsSecret').placeholder = e.configurada ? 'Guardada · no se muestra' : 'Pegá la Secret Key';
  $('vtBsQuitar').style.display = (e.configurada || e.proveedor || e.api_url || e.comercio) ? '' : 'none';
  $('vtBsGenerar').textContent = e.webhook_listo ? 'Generar otra clave' : 'Generar clave';
  if ($('vtBsClaveCaja').style.display === 'none') {
    $('vtBsClaveNota').textContent = e.webhook_listo
      ? `Ya hay una clave guardada (termina en ${e.webhook_fin || '····'}). Si la perdiste, generá otra y cargásela de nuevo a la pasarela.`
      : 'Todavía no hay clave: hasta que la generes, la dirección de avisos rechaza todo.';
  }

  const linea = $('vtBsAviso');
  if (a) {
    const cuando = a.en ? new Date(a.en).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const que = a.ok
      ? `pago confirmado${a.numero ? ` del pedido #${a.numero}` : ''}${a.estado === 'sin_stock' ? ' (no había stock: entregalo a mano)' : ''}`
      : (MOTIVO_AVISO[a.motivo] || a.motivo || 'sin detalle');
    linea.textContent = `Último aviso${cuando ? ` (${cuando})` : ''}: ${que}.`;
    linea.className = 'vt-api-estado ' + (a.ok ? 'ok' : 'mal');
    linea.style.display = '';
  } else {
    linea.style.display = 'none';
  }
}

// Guarda los datos de la pasarela si cambiaron. Devuelve true si guardó.
async function guardarBsSiCambio() {
  const e = bsEstado;
  const datos = {
    p_proveedor:  $('vtBsProveedor').value,
    p_api_url:    $('vtBsUrl').value.trim(),
    p_comercio:   $('vtBsComercio').value.trim(),
    p_api_key:    $('vtBsKey').value.trim(),
    p_api_secret: $('vtBsSecret').value.trim()
  };
  const cambio = datos.p_proveedor !== (e.proveedor || '') ||
                 datos.p_api_url   !== (e.api_url   || '') ||
                 datos.p_comercio  !== (e.comercio  || '') ||
                 datos.p_api_key !== '' || datos.p_api_secret !== '';
  if (!cambio) return false;
  if (!e.configurada && datos.p_api_key && !datos.p_api_secret) throw new Error('QR Bolivia: falta la Secret Key.');
  if (!e.configurada && datos.p_api_secret && !datos.p_api_key) throw new Error('QR Bolivia: falta la API Key.');
  const { data, error } = await sbAdmin.rpc('guardar_api_bs', datos);
  if (error) throw error;
  bsEstado = data;
  pintarBsCampos();
  pintarBsEstado();
  return true;
}

// Copia un texto y lo dice en el mismo botón
async function copiarConAviso(texto, boton) {
  try {
    await navigator.clipboard.writeText(texto);
    const antes = boton.textContent;
    boton.textContent = 'Copiado';
    setTimeout(() => { boton.textContent = antes; }, 1500);
  } catch (e) {
    errorCobro('No se pudo copiar: seleccionalo y copialo a mano.');
  }
}

// Generar otra clave deja sin efecto la anterior: pide un segundo toque
let generarBsHasta = 0;
async function generarClaveBs() {
  const boton = $('vtBsGenerar');
  if (bsEstado.webhook_listo && Date.now() > generarBsHasta) {
    generarBsHasta = Date.now() + 4000;
    boton.textContent = 'La anterior deja de valer: tocá de nuevo';
    setTimeout(() => { if (Date.now() > generarBsHasta) pintarBsEstado(); }, 4100);
    return;
  }
  generarBsHasta = 0;
  boton.disabled = true;
  try {
    const { data, error } = await sbAdmin.rpc('generar_clave_webhook_bs');
    if (error) throw error;
    $('vtBsClave').textContent = data;
    $('vtBsClaveCaja').style.display = '';
    $('vtBsClaveNota').textContent = 'Copiala ahora y cargala en la pasarela: por seguridad no se vuelve a mostrar.';
    bsEstado = { ...bsEstado, webhook_listo: true, webhook_fin: String(data).slice(-4) };
    pintarBsEstado();
  } catch (e) {
    errorCobro(e.message || 'No se pudo generar la clave.');
  } finally {
    boton.disabled = false;
  }
}

// Quitar los datos de la pasarela (la clave del webhook se queda)
let quitarBsHasta = 0;
async function quitarBs() {
  const boton = $('vtBsQuitar');
  if (Date.now() > quitarBsHasta) {
    quitarBsHasta = Date.now() + 4000;
    boton.textContent = 'Tocá de nuevo para quitar';
    setTimeout(() => { if (Date.now() > quitarBsHasta) boton.textContent = 'Quitar datos'; }, 4100);
    return;
  }
  quitarBsHasta = 0;
  boton.disabled = true;
  try {
    const { data, error } = await sbAdmin.rpc('guardar_api_bs', {
      p_proveedor: '', p_api_url: '', p_comercio: '', p_api_key: '', p_api_secret: '', p_quitar: true });
    if (error) throw error;
    bsEstado = data;
    pintarBsCampos();
    pintarBsEstado();
    aviso('Se quitaron los datos de la pasarela', 'ok');
  } catch (e) {
    errorCobro(e.message || 'No se pudieron quitar los datos.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Quitar datos';
  }
}

async function abrirCobros() {
  errorCobro('');
  $('vtCobrosGuardar').disabled = true;
  $('vtApiKey').value = '';
  $('vtApiSecret').value = '';
  $('vtFondoCobros').classList.add('abierto');
  $('vtBsClaveCaja').style.display = 'none';
  const [cobro, api, bs] = await Promise.all([
    sbAdmin.rpc('datos_de_cobro'),
    sbAdmin.rpc('estado_api_binance'),
    sbAdmin.rpc('estado_api_bs')
  ]);
  // Las APIs son aparte: si no se pudieron leer, lo demás se edita igual
  if (!api.error && api.data) apiEstado = api.data;
  pintarApi();
  if (!bs.error && bs.data) bsEstado = bs.data;
  pintarBsCampos();
  pintarBsEstado();
  const { data, error } = cobro;
  if (error || !data) {
    errorCobro('No se pudieron leer los datos de cobro. Probá de nuevo.');
    return;
  }
  $('vtCobroTasa').value  = Number(data.usdt_bs) > 0 ? Number(data.usdt_bs) : 10;
  $('vtCobroPayId').value = data.binance_pay_id || '';
  cobroQr = data.binance_qr || '';
  pintarQrCobro();
  pintarEjemploCobro();
  $('vtCobrosGuardar').disabled = false;
}
function cerrarCobros() { $('vtFondoCobros').classList.remove('abierto'); }

// La foto del QR, de hasta 1200 px y en PNG: un QR comprimido en JPG se
// escanea peor. El fondo blanco es para las imágenes con transparencia.
function qrComoImagen(archivo) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onerror = () => mal(new Error('No se pudo leer la imagen.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => mal(new Error('Esa imagen no se puede abrir. Probá con una PNG o JPG.'));
      img.onload = () => {
        const escala = Math.min(1, 1200 / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width  = Math.round(img.width  * escala);
        lienzo.height = Math.round(img.height * escala);
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
        ok(lienzo.toDataURL('image/png'));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

async function guardarCobros() {
  const tasa = Number($('vtCobroTasa').value);
  if (!(tasa > 0 && tasa <= 1000)) {
    errorCobro('El tipo de cambio tiene que ser un número mayor a 0, por ejemplo 10.');
    $('vtCobroTasa').focus();
    return;
  }
  errorCobro('');
  const boton = $('vtCobrosGuardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    // Una foto nueva se sube al depósito y se guarda su URL, no la imagen entera
    const qr = await prepararImagen(cobroQr, 'qr-binance');
    const { error } = await sbAdmin.rpc('guardar_datos_de_cobro', {
      p_usdt_bs:        tasa,
      p_binance_pay_id: $('vtCobroPayId').value.trim(),
      p_binance_qr:     qr
    });
    if (error) throw error;
    cobroQr = qr;
    pintarQrCobro();

    // Los datos de la pasarela del QR en Bs, si cambiaron
    await guardarBsSiCambio();

    // Claves nuevas de la API: se guardan y se prueban, y la ventana queda
    // abierta para que veas si Binance las aceptó
    if (await guardarApiSiCambio()) {
      const prueba = await sbAdmin.rpc('probar_api_binance');
      if (!prueba.error && prueba.data) apiEstado = { ...apiEstado, prueba: prueba.data };
      pintarApi();
      aviso('Cobros guardados', 'ok');
      return;
    }

    cerrarCobros();
    aviso(qr ? 'Cobros guardados: la tienda acepta Binance Pay' : 'Cobros guardados: la tienda queda solo con el QR del banco', 'ok');
  } catch (e) {
    errorCobro(e.message || 'No se pudo guardar.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

$('vtCobros').addEventListener('click', abrirCobros);
$('vtCobroTasa').addEventListener('input', pintarEjemploCobro);
$('vtCobroElegir').addEventListener('click', () => $('vtCobroArchivo').click());
$('vtCobroArchivo').addEventListener('change', async e => {
  const archivo = e.target.files && e.target.files[0];
  e.target.value = '';   // así se puede volver a elegir la misma
  if (!archivo) return;
  try {
    cobroQr = await qrComoImagen(archivo);
    errorCobro('');
    pintarQrCobro();
  } catch (err) {
    errorCobro(err.message);
  }
});
$('vtCobroQuitar').addEventListener('click', () => { cobroQr = ''; pintarQrCobro(); });
$('vtApiProbar').addEventListener('click', probarApi);
$('vtApiQuitar').addEventListener('click', quitarApi);
$('vtBsGenerar').addEventListener('click', generarClaveBs);
$('vtBsQuitar').addEventListener('click', quitarBs);
$('vtBsCopiarUrl').addEventListener('click', e => copiarConAviso(WEBHOOK_BS, e.currentTarget));
$('vtBsCopiarClave').addEventListener('click', e => copiarConAviso($('vtBsClave').textContent, e.currentTarget));
$('vtCobrosGuardar').addEventListener('click', guardarCobros);
$('vtCobrosCerrar').addEventListener('click', cerrarCobros);
$('vtFondoCobros').addEventListener('click', e => { if (e.target === $('vtFondoCobros')) cerrarCobros(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('vtFondoCobros').classList.contains('abierto')) cerrarCobros();
});


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
