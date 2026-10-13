// ============================================================
// TIAGO STORE · Clientes (panel)
// ============================================================
// Quién te compra, por WhatsApp: una fila por número.
//
//   · Los REGISTRADOS: los que dejaron su usuario y su WhatsApp en la
//     ventana de la tienda (js/usuario.js), aunque todavía no compraron.
//   · Los que COMPRARON sin registrarse: el WhatsApp que dejaron al pagar.
//
// De cada uno: cuántas compras, cuánto gastó, la última compra y cómo
// está su suscripción (activa, vence en X días, vencida). Tocando la
// fila se abre el detalle con todos sus pedidos.
//
// Los datos los arma la base en una sola llamada, clientes_panel() (ver
// supabase/26-registro-de-clientes.sql): junta los pedidos por WhatsApp
// aunque estén escritos distinto ("71234567", "+591 7123 4567"), y una
// suscripción que se renovó cuenta por la renovación, no como vencida.
// Las compras de prueba no cuentan.
//
// Se puede: buscar, filtrar, ordenar, escribirle por WhatsApp, copiar
// el número, borrar el registro (sus compras no se tocan) y exportar la
// lista a Excel (CSV).
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';
import { tengoPermiso, carteSinPermiso } from './admin-permiso.js';

const $ = id => document.getElementById(id);
const aviso = (t, tipo) => (window.avisoAdmin ? window.avisoAdmin(t, tipo) : console.log(t));

const escapar = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const POR_PAGINA = 50;
// "Por vencer": le quedan estos días o menos (0 = vence hoy)
const POR_VENCER = 3;

let CLIENTES = [];
let cargado  = false;
let cargando = false;
let pagina   = 1;
let abierto  = null;      // el WhatsApp con el detalle abierto

// Los mismos nombres y colores de estado que Ventas e Inicio
const ESTADOS = {
  sin_stock:      { txt: 'Sin stock',  color: '#dc2626', bg: '#fef2f2' },
  esperando_pago: { txt: 'Esperando',  color: '#b45309', bg: '#fffbeb' },
  pagado:         { txt: 'Pagado',     color: '#b45309', bg: '#fffbeb' },
  entregado:      { txt: 'Entregado',  color: '#15803d', bg: '#ecfdf3' },
  vencido:        { txt: 'Vencido',    color: '#6b7280', bg: '#f3f4f6' },
  cancelado:      { txt: 'Cancelado',  color: '#6b7280', bg: '#f3f4f6' }
};


// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  /* Las cifras de arriba son botones: filtran la lista */
  #vistaClientes button.metrica {
    width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer;
    transition: border-color .12s, box-shadow .12s;
  }
  #vistaClientes button.metrica:hover { border-color: var(--separador-2); }
  #vistaClientes button.metrica.on { border-color: var(--tinta); box-shadow: 0 0 0 1px var(--tinta); }

  #vistaClientes .buscador { flex-basis: 220px; }
  .cl-solo-ico { padding: 8px 10px; }
  .cl-tabla td { vertical-align: top; }
  .cl-fila { cursor: pointer; }
  .cl-fila.abierta > td { background: var(--superficie-2); }
  .cl-nombre { font-weight: 600; color: var(--tinta); }
  .cl-sub { margin-top: 2px; font-size: 12px; color: var(--tinta-suave); }
  .cl-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cl-der { text-align: right; }
  .cl-flecha { display: inline-block; margin-right: 6px; color: var(--tinta-tenue); transition: transform .15s; }
  .cl-fila.abierta .cl-flecha { transform: rotate(90deg); }

  .cl-chip {
    display: inline-block; padding: 2px 8px; border-radius: 99px;
    font-size: 11.5px; font-weight: 600; white-space: nowrap;
  }
  .cl-chip.reg      { background: #ecfdf3; color: #15803d; }
  .cl-chip.noreg    { background: #f3f4f6; color: #6b7280; }
  .cl-chip.activa   { background: #ecfdf3; color: #15803d; }
  .cl-chip.porvencer{ background: #fffbeb; color: #b45309; }
  .cl-chip.vencida  { background: #fef2f2; color: #dc2626; }
  .cl-chip.ninguna  { background: none; color: var(--tinta-tenue); padding-left: 0; }

  .cl-acc { white-space: nowrap; text-align: right; }
  .cl-acc .accion-btn .ico { width: 16px; height: 16px; }
  .cl-acc .accion-btn.wa:hover { color: #fff; background: #16a34a; border-color: #16a34a; }

  /* ---- El detalle ---- */
  .cl-detalle > td { padding: 0 !important; background: var(--superficie-2); cursor: default; }
  .cl-det { padding: 14px 18px 18px; border-top: 1px dashed var(--separador); }
  .cl-det-datos {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px; margin-bottom: 14px;
  }
  .cl-det-datos div {
    background: rgba(255,255,255,.8); border: 1px solid var(--capa-canto, var(--separador)); border-radius: 8px; padding: 9px 11px;
  }
  .cl-det-datos span { display: block; font-size: 11.5px; color: var(--tinta-suave); }
  .cl-det-datos b { display: block; margin-top: 2px; font-size: 13.5px; font-weight: 600; color: var(--tinta); }
  .cl-det h4 { margin: 0 0 8px; font-size: 12.5px; font-weight: 600; color: var(--tinta-media); }
  .cl-subs { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 6px; }
  .cl-subs li {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    background: rgba(255,255,255,.8); border: 1px solid var(--capa-canto, var(--separador)); border-radius: 8px; padding: 8px 11px;
    font-size: 13px;
  }
  .cl-subs li b { color: var(--tinta); font-weight: 600; }
  .cl-subs li .cl-chip { margin-left: auto; }
  .cl-ped-caja { background: rgba(255,255,255,.8); border: 1px solid var(--capa-canto, var(--separador)); border-radius: 8px; overflow-x: auto; }
  .cl-ped { font-size: 13px; }
  .cl-ped th { background: rgba(249,250,251,.6); }
  .cl-ped td, .cl-ped th { padding: 8px 11px; }
  .cl-ped tbody tr:hover td { background: transparent; }
  .cl-estado { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
  .cl-det-pie { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .cl-vacio { padding: 48px 20px; text-align: center; color: var(--tinta-suave); }
  .cl-vacio .emo { font-size: 34px; margin-bottom: 8px; color: var(--tinta-tenue); }
  .cl-vacio h3 { margin: 0 0 6px; font-size: 16px; color: var(--tinta); }
  .cl-vacio p { margin: 0; font-size: 13.5px; }
  .cl-vacio code { background: var(--superficie-3); padding: 1px 5px; border-radius: 4px; }

  /* ---- Celular: cada cliente es una tarjeta ---- */
  @media (max-width: 820px) {
    #vistaClientes .tabla-caja { background: none; border: none; box-shadow: none; overflow: visible; }
    #vistaClientes .tabla-scroll { overflow: visible; }
    .cl-tabla, .cl-tabla > tbody { display: block; width: 100%; }
    .cl-tabla > thead { display: none; }
    .cl-tabla > tbody > tr.cl-fila {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "cli gas" "wa com" "ult ult" "sub sub" "acc acc";
      gap: 4px 10px;
      margin-top: 8px; padding: 12px;
      background: rgba(255,255,255,.8); border: 1px solid var(--capa-canto, var(--separador)); border-radius: var(--radio);
      box-shadow: var(--sombra);
    }
    .cl-tabla > tbody > tr.cl-fila.abierta { border-radius: var(--radio) var(--radio) 0 0; }
    .cl-tabla > tbody > tr.cl-fila > td { display: block; padding: 0; border: none; background: none !important; }
    .cl-tabla td.c-cli { grid-area: cli; min-width: 0; }
    .cl-tabla td.c-gas { grid-area: gas; text-align: right; font-weight: 600; color: var(--tinta); }
    .cl-tabla td.c-wa  { grid-area: wa;  font-size: 13px; color: var(--tinta-media); }
    .cl-tabla td.c-com { grid-area: com; text-align: right; font-size: 13px; color: var(--tinta-suave); }
    .cl-tabla td.c-ult { grid-area: ult; font-size: 12.5px; color: var(--tinta-suave); }
    .cl-tabla td.c-sub { grid-area: sub; padding-top: 4px; }
    .cl-tabla td.c-acc {
      grid-area: acc; text-align: left;
      margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--separador);
    }
    .cl-tabla td .solo-movil { display: inline; }
    .cl-tabla > tbody > tr.cl-detalle { display: block; }
    .cl-tabla > tbody > tr.cl-detalle > td {
      display: block; border: 1px solid var(--separador); border-top: none;
      border-radius: 0 0 var(--radio) var(--radio);
    }
    .cl-det { padding: 12px; border-top: none; }
    .cl-acc .accion-btn { width: auto; height: 34px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; }
    .cl-acc .accion-btn .accion-txt { display: inline; }
  }
  .solo-movil { display: none; }
`;
document.head.appendChild(css);


// ============================================================
// 2. LA VISTA
// ============================================================
const ICO = {
  wa:     '<svg class="ico" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.9 7.1L3 20l1.4-4.9A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  copiar: '<svg class="ico" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  borrar: '<svg class="ico"><use href="#i-borrar"/></svg>',
  bajar:  '<svg class="ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
  actualizar: '<svg class="ico" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  personas: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

$('vistaClientes').innerHTML = `
  <div class="cl-wrap">
    <section class="resumen" aria-label="Resumen de clientes">
      <button type="button" class="metrica" data-filtro="registrados">
        <div class="metrica-n" id="clMReg">–</div><div class="metrica-l">Registrados</div></button>
      <button type="button" class="metrica" data-filtro="sin-registro">
        <div class="metrica-n info" id="clMSin">–</div><div class="metrica-l">Compraron sin registrarse</div></button>
      <button type="button" class="metrica" data-filtro="activas">
        <div class="metrica-n ok" id="clMAct">–</div><div class="metrica-l">Con suscripción activa</div></button>
      <button type="button" class="metrica" data-filtro="por-vencer">
        <div class="metrica-n warn" id="clMPor">–</div><div class="metrica-l">Por vencer (${POR_VENCER} días)</div></button>
      <button type="button" class="metrica" data-filtro="vencidas">
        <div class="metrica-n rojo" id="clMVen">–</div><div class="metrica-l">Con suscripción vencida</div></button>
    </section>

    <section class="herramientas">
      <div class="buscador" id="clCajaBuscar">
        <span class="lupa"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>
        <input type="search" id="clBuscar" placeholder="Buscar por nombre, usuario o WhatsApp…" autocomplete="off">
        <button class="limpiar" id="clLimpiar" type="button" aria-label="Limpiar búsqueda">✕</button>
      </div>
      <select id="clFiltro" aria-label="Filtrar clientes">
        <option value="">Todos los clientes</option>
        <option value="registrados">Registrados</option>
        <option value="sin-registro">Compraron sin registrarse</option>
        <option value="activas">Con suscripción activa</option>
        <option value="por-vencer">Por vencer (${POR_VENCER} días)</option>
        <option value="vencidas">Con suscripción vencida</option>
      </select>
      <select id="clOrden" aria-label="Ordenar">
        <option value="ultima">Última compra</option>
        <option value="gastado">Más gastado</option>
        <option value="compras">Más compras</option>
        <option value="vence">Vence primero</option>
        <option value="registro">Recién registrados</option>
        <option value="nombre">Nombre (A-Z)</option>
      </select>
      <button class="btn btn-fantasma" id="clExportar" type="button">${ICO.bajar}Exportar a Excel</button>
      <button class="btn btn-fantasma cl-solo-ico" id="clActualizar" type="button"
              title="Actualizar: volver a leer los clientes" aria-label="Actualizar">${ICO.actualizar}</button>
    </section>

    <section class="tabla-caja">
      <div class="tabla-scroll">
        <table class="cl-tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>WhatsApp</th>
              <th class="cl-der">Compras</th>
              <th class="cl-der">Gastado</th>
              <th>Última compra</th>
              <th>Suscripción</th>
              <th style="width:130px"></th>
            </tr>
          </thead>
          <tbody id="clCuerpo"></tbody>
        </table>
      </div>
      <div id="clPaginacion"></div>
    </section>
  </div>`;


// ============================================================
// 3. FORMATOS
// ============================================================
const ZONA = 'America/La_Paz';

/** "13/10/2026" de una fecha con hora (timestamptz) */
function fecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-BO',
    { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA });
}

/** "13/10/2026" de un día suelto ('2026-10-13') */
function dia(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return `${d}/${m}/${y}`;
}

/** Cuántos días pasaron, contados en días de Bolivia */
function diasDesde(iso) {
  if (!iso) return null;
  const enBolivia = d => d.toLocaleDateString('en-CA', { timeZone: ZONA });   // "2026-10-13"
  const a = new Date(enBolivia(new Date(iso)) + 'T00:00:00Z');
  const b = new Date(enBolivia(new Date()) + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

function haceCuanto(iso) {
  const n = diasDesde(iso);
  if (n === null) return '';
  if (n <= 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n < 60) return `hace ${n} días`;
  const meses = Math.round(n / 30);
  return `hace ${meses} meses`;
}

const bs = n => {
  const v = Number(n || 0);
  return 'Bs ' + (Number.isInteger(v) ? v : v.toFixed(2));
};

/** "+591 7123 4567" */
function telLindo(wa) {
  const d = String(wa || '');
  if (/^591\d{8}$/.test(d)) return `+591 ${d.slice(3, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return d ? '+' + d : '—';
}

const sinTildes = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Cómo se lo llama: el usuario del registro, o el nombre de su último pedido */
const nombreDe = c => c.usuario || c.nombre || '';
const primerNombre = c => (nombreDe(c).trim().split(/\s+/)[0] || '');


// ============================================================
// 4. LA SUSCRIPCIÓN DE CADA UNO
// ============================================================
// La base manda la última de cada producto con los días que le quedan
// (negativo = vencida). Se resume en una: la que más atención pide.
function resumirSuscripcion(subs) {
  const lista     = Array.isArray(subs) ? subs : [];
  const porVencer = lista.filter(s => s.dias >= 0 && s.dias <= POR_VENCER).sort((a, b) => a.dias - b.dias);
  const activas   = lista.filter(s => s.dias > POR_VENCER).sort((a, b) => a.dias - b.dias);
  const vencidas  = lista.filter(s => s.dias < 0).sort((a, b) => b.dias - a.dias);

  const r = {
    porVencer: porVencer.length,
    activas:   porVencer.length + activas.length,
    vencidas:  vencidas.length,
    total:     lista.length,
    principal: null, clase: 'ninguna', texto: 'Sin suscripción',
    // Para "Vence primero": los días que le quedan a la más próxima
    orden: Infinity
  };

  if (porVencer.length) {
    const s = porVencer[0];
    Object.assign(r, { principal: s, clase: 'porvencer', orden: s.dias,
      texto: s.dias === 0 ? 'Vence hoy' : s.dias === 1 ? 'Vence mañana' : `Vence en ${s.dias} días` });
  } else if (activas.length) {
    const s = activas[0];
    Object.assign(r, { principal: s, clase: 'activa', orden: s.dias,
      texto: `Activa · vence ${dia(s.vence)}` });
  } else if (vencidas.length) {
    const s = vencidas[0];
    const n = -s.dias;
    Object.assign(r, { principal: s, clase: 'vencida', orden: 10000 + n,
      texto: `Vencida hace ${n} día${n === 1 ? '' : 's'}` });
  }
  return r;
}

function chipSuscripcion(s) {
  return `<span class="cl-chip ${s.clase}">${escapar(s.texto)}</span>`;
}


// ============================================================
// 5. CARGAR
// ============================================================
async function cargar() {
  if (cargando) return;
  cargando = true;
  $('clActualizar').disabled = true;
  if (!cargado) esqueletos();

  const permiso = await tengoPermiso();
  if (!permiso.puede) {
    cargando = false;
    $('clActualizar').disabled = false;
    $('clCuerpo').innerHTML = `<tr><td colspan="7">${carteSinPermiso(permiso.motivo, 'cl-vacio')}</td></tr>`;
    $('clPaginacion').innerHTML = '';
    return;
  }

  const { data, error } = await sbAdmin.rpc('clientes_panel');
  cargando = false;
  $('clActualizar').disabled = false;

  if (error) {
    // La función (o la tabla) todavía no existe: falta correr el SQL 26
    const falta = error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' ||
                  /could not find the function|does not exist/i.test(error.message || '');
    $('clCuerpo').innerHTML = `<tr><td colspan="7"><div class="cl-vacio">
      <div class="emo">${ICO.personas}</div>
      <h3>${falta ? 'Falta preparar la base' : 'No se pudieron leer los clientes'}</h3>
      <p>${falta
        ? 'Corré <code>supabase/26-registro-de-clientes.sql</code> en Supabase → SQL Editor y tocá Actualizar.'
        : escapar(error.message)}</p></div></td></tr>`;
    $('clPaginacion').innerHTML = '';
    console.error('Clientes:', error);
    return;
  }

  CLIENTES = (data || []).map(c => {
    const sub = resumirSuscripcion(c.suscripciones);
    return {
      ...c,
      gastado: Number(c.gastado || 0),
      compras: Number(c.compras || 0),
      _sub: sub,
      _busca: sinTildes([c.usuario, c.nombre, c.whatsapp, String(c.whatsapp || '').slice(3)].join(' '))
    };
  });
  cargado = true;
  contar();
  render();
}

function esqueletos() {
  $('clCuerpo').innerHTML = Array.from({ length: 6 }, () => `
    <tr class="fila-esqueleto">
      <td><div class="esq" style="width:70%"></div></td>
      <td><div class="esq" style="width:100px"></div></td>
      <td><div class="esq" style="width:24px;margin-left:auto"></div></td>
      <td><div class="esq" style="width:50px;margin-left:auto"></div></td>
      <td><div class="esq" style="width:80px"></div></td>
      <td><div class="esq" style="width:110px"></div></td>
      <td></td>
    </tr>`).join('');
}


// ============================================================
// 6. FILTRAR, ORDENAR, DIBUJAR
// ============================================================
const FILTROS = {
  'registrados':  c => !!c.usuario,
  'sin-registro': c => !c.usuario && c.compras > 0,
  'activas':      c => c._sub.activas > 0,
  'por-vencer':   c => c._sub.porVencer > 0,
  'vencidas':     c => c._sub.vencidas > 0
};

function contar() {
  const n = f => CLIENTES.filter(FILTROS[f]).length;
  $('clMReg').textContent = n('registrados');
  $('clMSin').textContent = n('sin-registro');
  $('clMAct').textContent = n('activas');
  $('clMPor').textContent = n('por-vencer');
  $('clMVen').textContent = n('vencidas');
}

function visibles() {
  const q = sinTildes($('clBuscar').value.trim());
  const qNum = q.replace(/\D/g, '');
  const filtro = FILTROS[$('clFiltro').value];

  const lista = CLIENTES.filter(c => {
    if (filtro && !filtro(c)) return false;
    if (q && !(c._busca.includes(q) || (qNum.length >= 3 && String(c.whatsapp).includes(qNum)))) return false;
    return true;
  });

  const tiempo = s => (s ? new Date(s).getTime() : 0);
  const orden = $('clOrden').value;
  const por = {
    // Los que todavía no compraron van al final, del más nuevo al más viejo
    ultima:   (a, b) => tiempo(b.ultima_compra) - tiempo(a.ultima_compra) ||
                        tiempo(b.registrado_en) - tiempo(a.registrado_en),
    gastado:  (a, b) => b.gastado - a.gastado || b.compras - a.compras,
    compras:  (a, b) => b.compras - a.compras || b.gastado - a.gastado,
    vence:    (a, b) => a._sub.orden - b._sub.orden,
    registro: (a, b) => tiempo(b.registrado_en) - tiempo(a.registrado_en),
    nombre:   (a, b) => (nombreDe(a) || '~').localeCompare(nombreDe(b) || '~', 'es')
  }[orden];
  return por ? [...lista].sort(por) : lista;
}

function enlaceWa(c) {
  const nombre = primerNombre(c);
  const texto = `Hola${nombre ? ' ' + nombre : ''}, te escribimos de Tiago Store.`;
  return `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(texto)}`;
}

function render() {
  if (!cargado) return;

  document.querySelectorAll('#vistaClientes button.metrica').forEach(b =>
    b.classList.toggle('on', b.dataset.filtro === $('clFiltro').value));

  const lista = visibles();
  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (pagina > paginas) pagina = 1;
  const desde = (pagina - 1) * POR_PAGINA;

  if (total === 0) {
    const buscando = $('clBuscar').value.trim();
    $('clCuerpo').innerHTML = `<tr><td colspan="7"><div class="cl-vacio">
      <div class="emo">${ICO.personas}</div>
      <h3>${CLIENTES.length ? 'Sin resultados' : 'Todavía no hay clientes'}</h3>
      <p>${CLIENTES.length
        ? (buscando ? `Nadie coincide con «${escapar(buscando)}».` : 'Probá con otro filtro.')
        : 'Acá van a aparecer los que se registren en la tienda y los que compren dejando su WhatsApp.'}</p>
      </div></td></tr>`;
    $('clPaginacion').innerHTML = '';
    return;
  }

  $('clCuerpo').innerHTML = lista.slice(desde, desde + POR_PAGINA).map(fila).join('');
  paginacion(paginas, total, desde, Math.min(POR_PAGINA, total - desde));
}

function fila(c) {
  const nombre = nombreDe(c);
  const s = c._sub;
  const abiertaAca = abierto === c.whatsapp;
  const otraLinea = c.usuario && c.nombre && sinTildes(c.nombre) !== sinTildes(c.usuario)
    ? `En los pedidos: ${escapar(c.nombre)}` : '';

  return `
    <tr class="cl-fila${abiertaAca ? ' abierta' : ''}" data-wa="${escapar(c.whatsapp)}"
        aria-expanded="${abiertaAca}" tabindex="0">
      <td class="c-cli">
        <div class="cl-nombre"><span class="cl-flecha" aria-hidden="true">›</span>${nombre ? escapar(nombre) : '<span style="color:var(--tinta-tenue)">Sin nombre</span>'}</div>
        <div class="cl-sub">
          ${c.usuario
            ? `<span class="cl-chip reg">Registrado</span>`
            : `<span class="cl-chip noreg">Sin registrarse</span>`}
          ${otraLinea ? ` · ${otraLinea}` : ''}
        </div>
      </td>
      <td class="c-wa cl-num">${escapar(telLindo(c.whatsapp))}</td>
      <td class="c-com cl-der cl-num">${c.compras}<span class="solo-movil"> ${c.compras === 1 ? 'compra' : 'compras'}</span></td>
      <td class="c-gas cl-der cl-num">${c.compras ? bs(c.gastado) : '—'}</td>
      <td class="c-ult">
        ${c.ultima_compra
          ? `<span class="solo-movil">Última compra: </span>${fecha(c.ultima_compra)}<div class="cl-sub">${haceCuanto(c.ultima_compra)}</div>`
          : `<span style="color:var(--tinta-tenue)">Todavía no compró</span>`}
      </td>
      <td class="c-sub">
        ${chipSuscripcion(s)}
        ${s.principal ? `<div class="cl-sub">${escapar(s.principal.producto)}${s.total > 1 ? ` · +${s.total - 1} más` : ''}</div>` : ''}
      </td>
      <td class="c-acc cl-acc">
        <a class="accion-btn wa" data-accion="wa" href="${enlaceWa(c)}" target="_blank" rel="noopener"
           title="Escribirle por WhatsApp" aria-label="Escribirle por WhatsApp">${ICO.wa}<span class="accion-txt">WhatsApp</span></a>
        <button class="accion-btn" type="button" data-accion="copiar" title="Copiar el número" aria-label="Copiar el número">${ICO.copiar}<span class="accion-txt">Copiar</span></button>
        ${c.usuario ? `<button class="accion-btn peligro" type="button" data-accion="borrar" title="Borrar el registro" aria-label="Borrar el registro">${ICO.borrar}<span class="accion-txt">Borrar</span></button>` : ''}
      </td>
    </tr>
    ${abiertaAca ? `<tr class="cl-detalle"><td colspan="7">${detalle(c)}</td></tr>` : ''}`;
}

function detalle(c) {
  const subs = [...(c.suscripciones || [])].sort((a, b) => a.dias - b.dias);
  const peds = c.pedidos || [];

  const datos = [
    ['Registrado', c.registrado_en ? fecha(c.registrado_en) : 'No'],
    ['Primera compra', c.primera_compra ? fecha(c.primera_compra) : '—'],
    ['Compras', c.compras ? `${c.compras} · ${bs(c.gastado)}` : '0'],
    ['WhatsApp', telLindo(c.whatsapp)]
  ];

  return `
    <div class="cl-det">
      <div class="cl-det-datos">
        ${datos.map(([k, v]) => `<div><span>${k}</span><b>${escapar(v)}</b></div>`).join('')}
      </div>

      ${subs.length ? `
        <h4>Suscripciones (la última de cada producto)</h4>
        <ul class="cl-subs">
          ${subs.map(s => {
            const r = resumirSuscripcion([s]);
            return `<li><b>${escapar(s.producto)}</b> <span style="color:var(--tinta-suave)">Pedido #${s.numero} · vence ${dia(s.vence)}</span>${chipSuscripcion(r)}</li>`;
          }).join('')}
        </ul>` : ''}

      <h4>Pedidos (${peds.length})</h4>
      ${peds.length ? `
        <div class="cl-ped-caja">
          <table class="cl-ped">
            <thead><tr><th>N°</th><th>Fecha</th><th>Producto</th><th class="cl-der">Precio</th><th>Estado</th><th>Vence</th></tr></thead>
            <tbody>
              ${peds.map(p => {
                const e = ESTADOS[p.estado] || { txt: p.estado, color: '#6b7280', bg: '#f3f4f6' };
                return `<tr>
                  <td class="cl-num">#${p.numero}</td>
                  <td class="cl-num">${fecha(p.fecha)}</td>
                  <td>${escapar(p.producto)}</td>
                  <td class="cl-der cl-num">${bs(p.precio)}</td>
                  <td><span class="cl-estado" style="color:${e.color};background:${e.bg}">${escapar(e.txt)}</span></td>
                  <td class="cl-num">${p.vence ? dia(p.vence) : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : `<p style="margin:0;color:var(--tinta-suave);font-size:13px">Se registró y todavía no compró.</p>`}

      <div class="cl-det-pie">
        <a class="btn btn-fantasma" href="${enlaceWa(c)}" target="_blank" rel="noopener">${ICO.wa}Escribirle por WhatsApp</a>
      </div>
    </div>`;
}

function paginacion(paginas, total, desde, enPagina) {
  if (paginas <= 1) {
    $('clPaginacion').innerHTML =
      `<div class="paginacion"><span class="pag-info">${total} cliente${total === 1 ? '' : 's'}</span></div>`;
    return;
  }
  let html = `<div class="paginacion">
    <span class="pag-info">${desde + 1}–${desde + enPagina} de ${total}</span>
    <button class="pag-btn" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= paginas; i++) {
    if (i === 1 || i === paginas || Math.abs(i - pagina) <= 1) {
      html += `<button class="pag-btn ${i === pagina ? 'activo' : ''}" data-pag="${i}">${i}</button>`;
    } else if (Math.abs(i - pagina) === 2) {
      html += `<span style="color:var(--tinta-tenue)">…</span>`;
    }
  }
  html += `<button class="pag-btn" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''}>›</button></div>`;
  $('clPaginacion').innerHTML = html;
}


// ============================================================
// 7. ACCIONES
// ============================================================
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Sin permiso para el portapapeles (http, navegador viejo): a la antigua
    const t = document.createElement('textarea');
    t.value = texto;
    t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  aviso(`Copiado: ${texto}`, 'ok');
}

async function borrarRegistro(c) {
  const quien = `${nombreDe(c) || 'este cliente'} (${telLindo(c.whatsapp)})`;
  if (!confirm(`¿Borrar el registro de ${quien}?\n\nSus compras no se tocan. Si vuelve a la tienda, ` +
               `su celular lo sigue teniendo guardado y no se le vuelve a preguntar.`)) return;

  const { data, error } = await sbAdmin.from('clientes').delete().eq('whatsapp', c.whatsapp).select('whatsapp');
  if (error) { aviso(`No se pudo borrar: ${error.message}`, 'error'); return; }
  if (!data || data.length === 0) { aviso('No se borró: revisá que tu usuario sea admin.', 'error'); return; }

  aviso('Registro borrado', 'ok');
  cargar();
}

$('clCuerpo').addEventListener('click', e => {
  const tr = e.target.closest('tr.cl-fila');
  if (!tr) return;
  const c = CLIENTES.find(x => x.whatsapp === tr.dataset.wa);
  if (!c) return;

  const btn = e.target.closest('[data-accion]');
  if (btn) {
    if (btn.dataset.accion === 'copiar') copiar('+' + c.whatsapp);
    if (btn.dataset.accion === 'borrar') borrarRegistro(c);
    return;   // el de WhatsApp es un enlace: se abre solo
  }

  abierto = abierto === c.whatsapp ? null : c.whatsapp;
  render();
});

// Con el teclado: Enter o espacio sobre la fila abre el detalle
$('clCuerpo').addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.cl-fila')) {
    e.preventDefault();
    const wa = e.target.dataset.wa;
    abierto = abierto === wa ? null : wa;
    render();
    document.querySelector(`#clCuerpo tr.cl-fila[data-wa="${wa}"]`)?.focus();
  }
});

let espera;
$('clBuscar').addEventListener('input', e => {
  $('clCajaBuscar').classList.toggle('con-texto', e.target.value !== '');
  clearTimeout(espera);
  espera = setTimeout(() => { pagina = 1; render(); }, 160);
});
$('clLimpiar').addEventListener('click', () => {
  $('clBuscar').value = '';
  $('clCajaBuscar').classList.remove('con-texto');
  pagina = 1;
  render();
  $('clBuscar').focus();
});
['clFiltro', 'clOrden'].forEach(id => $(id).addEventListener('change', () => { pagina = 1; render(); }));

// Las cifras de arriba filtran; tocar la que ya está elegida lo saca
document.querySelectorAll('#vistaClientes button.metrica').forEach(b => b.addEventListener('click', () => {
  $('clFiltro').value = $('clFiltro').value === b.dataset.filtro ? '' : b.dataset.filtro;
  pagina = 1;
  render();
}));

$('clPaginacion').addEventListener('click', e => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  pagina = Number(b.dataset.pag);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('clActualizar').addEventListener('click', cargar);


// ============================================================
// 8. EXPORTAR A EXCEL (CSV)
// ============================================================
// La lista tal como se ve (con el filtro, la búsqueda y el orden), todas
// las páginas. Separado con punto y coma y con la marca UTF-8 adelante:
// así el Excel en español la abre en columnas y con las tildes bien.
function exportar() {
  if (!cargado) return;
  const lista = visibles();
  if (!lista.length) { aviso('No hay clientes para exportar con este filtro', 'error'); return; }

  const celda = v => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const numero = n => String(Number(n || 0).toFixed(2)).replace('.', ',');

  const filas = [
    ['Cliente', 'Usuario registrado', 'Nombre en los pedidos', 'WhatsApp', 'Registrado el',
     'Compras', 'Gastado (Bs)', 'Primera compra', 'Última compra',
     'Suscripción', 'Producto', 'Vence el', 'Pedidos']
  ];
  for (const c of lista) {
    const s = c._sub;
    filas.push([
      nombreDe(c),
      c.usuario || '',
      c.nombre || '',
      '+' + c.whatsapp,
      c.registrado_en ? fecha(c.registrado_en) : '',
      c.compras,
      numero(c.gastado),
      c.primera_compra ? fecha(c.primera_compra) : '',
      c.ultima_compra ? fecha(c.ultima_compra) : '',
      s.principal ? s.texto : '',
      s.principal ? s.principal.producto : '',
      s.principal ? dia(s.principal.vence) : '',
      (c.pedidos || []).map(p => '#' + p.numero).join(' ')
    ]);
  }

  const csv = String.fromCharCode(0xFEFF) + filas.map(f => f.map(celda).join(';')).join('\r\n');
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: ZONA });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `clientes-tiago-store-${hoy}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  aviso(`Exportados ${lista.length} cliente${lista.length === 1 ? '' : 's'}`, 'ok');
}
$('clExportar').addEventListener('click', exportar);


// ============================================================
// 9. CUÁNDO SE CARGA
// ============================================================
// Al abrir la vista (y con "Actualizar"). No consulta en segundo plano.
document.addEventListener('vista-cambiada', e => {
  if (e.detail.vista === 'clientes') cargar();
});

console.log('%c✓ Clientes listo', 'color:#22c55e;font-weight:bold');
