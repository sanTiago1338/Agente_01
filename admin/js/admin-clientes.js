// ============================================================
// TIAGO STORE · Clientes (panel)
// ============================================================
// Los que se registraron en la tienda (Usuario + WhatsApp, ver
// js/usuario.js y supabase/26-registro-de-clientes.sql) y los que te
// compraron dejando su WhatsApp aunque no se hayan registrado.
//
// Por cliente: su usuario, su WhatsApp, cuántas compras, cuánto gastó,
// la última compra y cómo está su suscripción (activa, por vencer o
// vencida). Con un toque, su WhatsApp.
//
// El cliente es su WhatsApp: el mismo número en el registro y en los
// pedidos es la misma persona, esté escrito como esté ("7230 9304",
// "59172309304"…). Una compra de 3 productos es una compra, no tres.
//
// Solo lee, salvo "Borrar registro" (borra el usuario de la tabla
// clientes; sus pedidos no se tocan).
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';
import { tengoPermiso, carteSinPermiso } from './admin-permiso.js';

const $ = id => document.getElementById(id);
const aviso = (t, tipo) => (window.avisoAdmin ? window.avisoAdmin(t, tipo) : console.log(t));

const POR_PAGINA = 25;
const DIAS_POR_VENCER = 7;

let CLIENTES = [];
let pagina = 1;
let abierto = null;       // el WhatsApp del cliente con el detalle abierto
let cargando = false;
let sinTabla = false;     // todavía no se corrió el SQL 26


// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .cl-aviso {
    display: flex; gap: 10px; align-items: flex-start;
    margin-bottom: 16px; padding: 12px 14px;
    border: 1px solid rgba(180,83,9,.25); border-radius: var(--radio, 12px);
    background: #fffbeb; color: #78350f; font-size: 13.5px; line-height: 1.5;
  }
  .cl-aviso code { background: rgba(120,53,15,.08); padding: 1px 5px; border-radius: 5px; }
  .cl-herr { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
  .cl-herr .buscador { flex: 1 1 280px; }
  .cl-cliente { display: flex; align-items: center; gap: 11px; min-width: 0; }
  .cl-ava {
    width: 36px; height: 36px; flex: none; display: grid; place-items: center;
    border-radius: 50%; font-size: 13px; font-weight: 700; color: #fff; text-transform: uppercase;
  }
  .cl-nom { font-weight: 600; color: var(--tinta); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cl-sub { font-size: 12px; color: var(--tinta-tenue); white-space: nowrap; }
  .cl-sub.reg { color: var(--ok); }
  .cl-wa { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--tinta-media); }
  .cl-num { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--tinta); white-space: nowrap; }
  .cl-gastado { font-variant-numeric: tabular-nums; color: var(--tinta-suave); white-space: nowrap; }
  #clTabla th { white-space: nowrap; }
  #clTabla td { white-space: nowrap; }
  #clTabla td.cl-celda-cliente { white-space: normal; }
  /* Compu angosta: sin "Última compra" y WhatsApp solo con el ícono */
  @media (min-width: 821px) and (max-width: 1279px) {
    #clTabla .cl-col-ultima { display: none; }
    .cl-btn.wa { width: 32px; padding: 0; justify-content: center; }
    .cl-btn.wa .txt { display: none; }
  }
  .cl-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 9px; border-radius: 99px;
    font-size: 12px; font-weight: 600; white-space: nowrap;
  }
  .cl-chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .cl-chip.activa  { background: rgba(21,128,61,.10);  color: #15803d; }
  .cl-chip.pronto  { background: rgba(180,83,9,.11);   color: #b45309; }
  .cl-chip.vencida { background: rgba(220,38,38,.10);  color: #b91c1c; }
  .cl-chip.nada    { background: var(--superficie-3);  color: var(--tinta-suave); }
  .cl-chip.nada::before { display: none; }
  .cl-acc { display: flex; gap: 6px; justify-content: flex-end; }
  .cl-btn {
    display: inline-flex; align-items: center; gap: 6px;
    height: 32px; padding: 0 11px;
    border: 1px solid var(--borde-2); border-radius: 8px; background: #fff;
    font: 600 12.5px var(--fuente); color: var(--tinta-media); cursor: pointer; text-decoration: none; white-space: nowrap;
  }
  .cl-btn:hover { background: var(--superficie-2); color: var(--tinta); }
  .cl-btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .cl-btn.wa { border-color: rgba(21,128,61,.3); color: #15803d; }
  .cl-btn.wa:hover { background: rgba(21,128,61,.07); }
  .cl-btn.solo { width: 32px; padding: 0; justify-content: center; }
  .cl-btn.peligro:hover { background: var(--error); border-color: var(--error); color: #fff; }
  tr.cl-fila { cursor: pointer; }
  tr.cl-fila.abierta td { background: var(--superficie-2); }
  tr.cl-detalle td { background: var(--superficie-2); padding: 0 14px 14px !important; }
  .cl-compras { margin: 0; padding: 12px 14px; list-style: none; background: #fff; border: 1px solid var(--borde); border-radius: 10px; }
  .cl-compras li { display: flex; gap: 12px; align-items: center; padding: 7px 0; border-top: 1px solid var(--borde); font-size: 13px; }
  .cl-compras li:first-child { border-top: none; }
  .cl-compras .p { flex: 1; min-width: 0; color: var(--tinta); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cl-compras .f { color: var(--tinta-tenue); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .cl-compras .b { font-weight: 600; color: var(--tinta); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .cl-vacio { padding: 56px 20px; text-align: center; }
  .cl-vacio .emo { font-size: 36px; color: var(--tinta-tenue); margin-bottom: 10px; }
  .cl-vacio h3 { margin: 0 0 6px; font-size: 16px; color: var(--tinta); }
  .cl-vacio p { margin: 0; color: var(--tinta-suave); font-size: 13.5px; }

  @media (max-width: 820px) {
    .cl-herr select { flex: 1 1 calc(50% - 5px); min-width: 0; }
    .cl-herr .btn { flex: 1 1 calc(50% - 5px); justify-content: center; }
    #clTabla tbody tr.cl-fila { padding: 12px 13px; }
    #clTabla td { padding: 2px 0 !important; }
    #clTabla td[data-l]::before {
      content: attr(data-l); display: inline-block; min-width: 108px;
      font-size: 11.5px; font-weight: 600; color: var(--tinta-tenue);
    }
    #clTabla td.cl-celda-cliente { padding-bottom: 8px !important; }
    #clTabla td.cl-celda-acc { padding-top: 10px !important; margin-top: 8px; border-top: 1px solid var(--borde); }
    .cl-acc { justify-content: flex-start; flex-wrap: wrap; }
    tr.cl-detalle { padding: 0 !important; box-shadow: none !important; border: none !important; background: transparent !important; margin-top: -6px !important; }
    tr.cl-detalle td { padding: 0 !important; background: transparent; }
  }
`;
document.head.appendChild(css);


// ============================================================
// 2. LA PANTALLA
// ============================================================
const ICO = {
  wa:     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.9 7.1L3 20l1.4-4.9A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  borrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  bajar:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
  recargar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  personas: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

$('vistaClientes').innerHTML = `
  <div class="cl-wrap">
    <div id="clPermiso"></div>
    <div id="clAviso"></div>

    <section class="resumen" aria-label="Resumen de clientes">
      <div class="metrica"><div class="metrica-n" id="clReg">–</div><div class="metrica-l">Registrados</div></div>
      <div class="metrica"><div class="metrica-n info" id="clNuevos">–</div><div class="metrica-l">Nuevos en 7 días</div></div>
      <div class="metrica"><div class="metrica-n ok" id="clActivos">–</div><div class="metrica-l">Con suscripción activa</div></div>
      <div class="metrica"><div class="metrica-n warn" id="clPronto">–</div><div class="metrica-l">Vencen en ${DIAS_POR_VENCER} días</div></div>
    </section>

    <section class="cl-herr">
      <div class="buscador" id="clCajaBuscar">
        <span class="lupa"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>
        <input type="search" id="clBuscar" placeholder="Buscar por usuario o WhatsApp…" autocomplete="off">
        <button class="limpiar" id="clLimpiar" aria-label="Limpiar búsqueda">✕</button>
      </div>
      <select id="clFiltro" aria-label="Filtrar clientes">
        <option value="">Todos los clientes</option>
        <option value="registrados">Registrados</option>
        <option value="sinregistro">Compraron sin registrarse</option>
        <option value="sincompras">Registrados sin compras</option>
        <option value="activas">Con suscripción activa</option>
        <option value="pronto">Vencen en ${DIAS_POR_VENCER} días</option>
        <option value="vencidas">Vencidas (para recuperar)</option>
      </select>
      <select id="clOrden" aria-label="Ordenar">
        <option value="reciente">Actividad reciente</option>
        <option value="compras">Más compras</option>
        <option value="gastado">Más gastado</option>
        <option value="vence">Próximos a vencer</option>
        <option value="nombre">Usuario (A-Z)</option>
      </select>
      <button class="btn btn-fantasma" id="clExportar" title="Bajar la lista filtrada como planilla (CSV)">${ICO.bajar}Exportar</button>
      <button class="btn btn-fantasma" id="clRefrescar">${ICO.recargar}Actualizar</button>
    </section>

    <section class="tabla-caja">
      <div class="tabla-scroll">
        <table id="clTabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>WhatsApp</th>
              <th>Compras</th>
              <th class="cl-col-ultima">Última compra</th>
              <th>Suscripción</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="clCuerpo"></tbody>
        </table>
      </div>
      <div id="clPaginas"></div>
    </section>
  </div>`;


// ============================================================
// 3. FORMATOS
// ============================================================
const escapar = t => String(t ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Como wa_normalizado() en la base: siempre con el 591 adelante
function numeroWa(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length === 8 ? '591' + d : d;
}
// "59172309304" -> "+591 7230 9304"
function waLindo(wa) {
  return /^591\d{8}$/.test(wa) ? `+591 ${wa.slice(3, 7)} ${wa.slice(7)}` : wa;
}
function bs(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('es-BO', Number.isInteger(num)
    ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const fecha = d => d ? new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
// "2026-10-20" (fecha sola, de la base) en hora de Bolivia, sin correrse un día
const diaLocal = s => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
function hoyLocal() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function haceCuanto(iso) {
  if (!iso) return '—';
  const dias = Math.floor((hoyLocal() - new Date(new Date(iso).setHours(0, 0, 0, 0))) / 864e5);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return fecha(iso);
}

// Un color fijo por cliente, para el círculo con sus iniciales
const COLORES = ['#e50914', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#4f46e5'];
function colorDe(t) {
  let h = 0;
  for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}
function iniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
}


// ============================================================
// 4. CARGA
// ============================================================
async function cargar() {
  if (cargando) return;
  cargando = true;
  $('clRefrescar').disabled = true;
  esqueletos();

  try {
    const permiso = await tengoPermiso();
    if (!permiso.puede) {
      $('clPermiso').innerHTML = carteSinPermiso(permiso.motivo, 'cl-vacio');
      $('clCuerpo').innerHTML = '';
      return;
    }

    const [rReg, rPed] = await Promise.all([
      sbAdmin.from('clientes').select('id, nombre, whatsapp, creado_en, actualizado_en')
        .order('creado_en', { ascending: false }).limit(5000),
      // Lo comprado de verdad (pagado), sin las compras de prueba
      sbAdmin.from('pedidos')
        .select('id, grupo, numero, producto_nombre, precio, estado, cliente_nombre, cliente_whatsapp, creado_en, entregado_en, suscripcion_vence_en')
        .in('estado', ['entregado', 'sin_stock', 'pagado'])
        .eq('prueba', false)
        .order('creado_en', { ascending: false })
        .limit(5000)
    ]);

    // Sin la tabla (falta el SQL 26): igual se ven los que compraron
    sinTabla = !!rReg.error && /clientes|relation|does not exist|42P01|PGRST205/i.test(
      `${rReg.error.message} ${rReg.error.code}`);
    if (rReg.error && !sinTabla) throw rReg.error;
    if (rPed.error) throw rPed.error;

    $('clAviso').innerHTML = sinTabla ? `
      <div class="cl-aviso">
        <span>⚠</span>
        <span>Falta correr <code>supabase/26-registro-de-clientes.sql</code> en Supabase → SQL Editor.
        Hasta entonces se ven solo los que compraron dejando su WhatsApp.</span>
      </div>` : '';

    CLIENTES = juntar(sinTabla ? [] : rReg.data, rPed.data);
    pintarMetricas();
    pintar();
  } catch (err) {
    console.error('❌ Clientes:', err);
    $('clCuerpo').innerHTML = `<tr><td colspan="6"><div class="cl-vacio">
      <div class="emo">⚠</div><h3>No se pudieron leer los clientes</h3><p>${escapar(err.message || err)}</p>
    </div></td></tr>`;
    $('clPaginas').innerHTML = '';
  } finally {
    cargando = false;
    $('clRefrescar').disabled = false;
  }
}

// Un cliente por WhatsApp, con sus compras
function juntar(registrados, pedidos) {
  const hoy = hoyLocal();
  const pronto = new Date(hoy.getTime() + DIAS_POR_VENCER * 864e5);
  const mapa = new Map();
  const de = wa => {
    if (!mapa.has(wa)) mapa.set(wa, {
      wa, usuario: '', registrado: null, idRegistro: null, nombrePedido: '',
      compras: new Set(), gastado: 0, ultima: null, lineas: [],
      proxima: null, vencida: null, activas: 0
    });
    return mapa.get(wa);
  };

  for (const r of registrados || []) {
    const c = de(numeroWa(r.whatsapp));
    c.usuario = r.nombre;
    c.registrado = r.creado_en;
    c.idRegistro = r.id;
  }

  for (const p of pedidos || []) {
    const wa = numeroWa(p.cliente_whatsapp);
    if (!/^591\d{8}$/.test(wa)) continue;   // sin número no se sabe quién es
    const c = de(wa);
    if (!c.nombrePedido && String(p.cliente_nombre || '').trim()) c.nombrePedido = p.cliente_nombre.trim();
    c.compras.add(p.grupo || p.id);
    c.gastado += Number(p.precio || 0);
    const cuando = p.entregado_en || p.creado_en;
    if (!c.ultima || cuando > c.ultima) c.ultima = cuando;
    c.lineas.push(p);
    if (p.suscripcion_vence_en) {
      const v = diaLocal(p.suscripcion_vence_en);
      if (v >= hoy) {
        c.activas++;
        if (!c.proxima || v < c.proxima) c.proxima = v;
      } else if (!c.vencida || v > c.vencida) {
        c.vencida = v;
      }
    }
  }

  for (const c of mapa.values()) {
    c.nombre = c.usuario || c.nombrePedido || 'Sin nombre';
    c.estado = c.activas
      ? (c.proxima <= pronto ? 'pronto' : 'activa')
      : (c.vencida ? 'vencida' : 'nada');
    c.actividad = [c.registrado, c.ultima].filter(Boolean).sort().pop() || '';
  }
  return [...mapa.values()];
}


// ============================================================
// 5. PINTAR
// ============================================================
function pintarMetricas() {
  const hace7 = new Date(Date.now() - 7 * 864e5).toISOString();
  $('clReg').textContent     = sinTabla ? '—' : CLIENTES.filter(c => c.registrado).length;
  $('clNuevos').textContent  = sinTabla ? '—' : CLIENTES.filter(c => c.registrado && c.registrado >= hace7).length;
  $('clActivos').textContent = CLIENTES.filter(c => c.activas > 0).length;
  $('clPronto').textContent  = CLIENTES.filter(c => c.estado === 'pronto').length;
}

function visibles() {
  const q = $('clBuscar').value.trim().toLowerCase();
  const qNum = q.replace(/\D/g, '');
  const filtro = $('clFiltro').value;
  const hace30 = new Date(hoyLocal().getTime() - 30 * 864e5);

  const lista = CLIENTES.filter(c => {
    if (q && !(c.nombre.toLowerCase().includes(q) || c.usuario.toLowerCase().includes(q) ||
               (qNum.length >= 3 && c.wa.includes(qNum)))) return false;
    if (filtro === 'registrados' && !c.registrado) return false;
    if (filtro === 'sinregistro' && (c.registrado || !c.compras.size)) return false;
    if (filtro === 'sincompras'  && (!c.registrado || c.compras.size)) return false;
    if (filtro === 'activas'     && !c.activas) return false;
    if (filtro === 'pronto'      && c.estado !== 'pronto') return false;
    if (filtro === 'vencidas'    && !(c.estado === 'vencida' && c.vencida >= hace30)) return false;
    return true;
  });

  const orden = $('clOrden').value;
  const lejos = new Date(8.64e15);
  lista.sort({
    reciente: (a, b) => b.actividad.localeCompare(a.actividad),
    compras:  (a, b) => b.compras.size - a.compras.size || b.gastado - a.gastado,
    gastado:  (a, b) => b.gastado - a.gastado,
    vence:    (a, b) => (a.proxima || lejos) - (b.proxima || lejos),
    nombre:   (a, b) => a.nombre.localeCompare(b.nombre, 'es')
  }[orden] || (() => 0));
  return lista;
}

function chipSuscripcion(c) {
  const hoy = hoyLocal();
  if (c.estado === 'activa' || c.estado === 'pronto') {
    const dias = Math.round((c.proxima - hoy) / 864e5);
    const txt = dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`;
    return `<span class="cl-chip ${c.estado}" title="Vence el ${fecha(c.proxima)}">${c.estado === 'activa' ? `Activa · ${fecha(c.proxima)}` : txt}</span>`;
  }
  if (c.estado === 'vencida') {
    const dias = Math.round((hoy - c.vencida) / 864e5);
    return `<span class="cl-chip vencida" title="Venció el ${fecha(c.vencida)}">Venció ${dias <= 1 ? (dias === 0 ? 'hoy' : 'ayer') : `hace ${dias} días`}</span>`;
  }
  return '<span class="cl-chip nada">Sin suscripción</span>';
}

function fila(c) {
  const sub = c.registrado
    ? `<div class="cl-sub reg">Registrado ${haceCuanto(c.registrado)}</div>`
    : '<div class="cl-sub">Sin registrar</div>';
  const filaHtml = `
    <tr class="cl-fila${abierto === c.wa ? ' abierta' : ''}" data-wa="${c.wa}" title="Ver sus compras">
      <td class="cl-celda-cliente">
        <div class="cl-cliente">
          <span class="cl-ava" style="background:${colorDe(c.wa)}">${escapar(iniciales(c.nombre))}</span>
          <div style="min-width:0">
            <div class="cl-nom">${escapar(c.nombre)}</div>
            ${sub}
          </div>
        </div>
      </td>
      <td data-l="WhatsApp"><span class="cl-wa">${escapar(waLindo(c.wa))}</span></td>
      <td data-l="Compras"><span class="cl-num">${c.compras.size}</span>${c.compras.size
        ? ` <span class="cl-gastado">· ${bs(c.gastado)} Bs</span>` : ''}</td>
      <td data-l="Última compra" class="cl-col-ultima">${c.ultima ? haceCuanto(c.ultima) : '—'}</td>
      <td data-l="Suscripción">${chipSuscripcion(c)}</td>
      <td class="cl-celda-acc">
        <div class="cl-acc">
          <a class="cl-btn wa" href="https://wa.me/${c.wa}" target="_blank" rel="noopener" data-no-abrir
             title="Abrir su WhatsApp" aria-label="Abrir su WhatsApp">${ICO.wa}<span class="txt">WhatsApp</span></a>
          <button class="cl-btn solo" data-copiar="${c.wa}" title="Copiar el número" aria-label="Copiar el número">${ICO.copiar}</button>
          ${c.idRegistro ? `<button class="cl-btn solo peligro" data-borrar="${c.idRegistro}" title="Borrar el registro (sus pedidos no se tocan)" aria-label="Borrar el registro">${ICO.borrar}</button>` : ''}
        </div>
      </td>
    </tr>`;
  if (abierto !== c.wa) return filaHtml;

  const lineas = [...c.lineas].sort((a, b) => b.creado_en.localeCompare(a.creado_en)).slice(0, 12);
  const detalle = lineas.length ? lineas.map(p => {
    const v = p.suscripcion_vence_en ? diaLocal(p.suscripcion_vence_en) : null;
    return `<li>
      <span class="f">#${p.numero}</span>
      <span class="p" title="${escapar(p.producto_nombre)}">${escapar(p.producto_nombre)}</span>
      <span class="f">${fecha(p.entregado_en || p.creado_en)}</span>
      <span class="f">${v ? (v >= hoyLocal() ? 'vence ' : 'venció ') + fecha(v) : ''}</span>
      <span class="b">${bs(p.precio)} Bs</span>
    </li>`;
  }).join('') : '<li><span class="p" style="color:var(--tinta-suave)">Todavía no compró nada.</span></li>';
  return filaHtml + `<tr class="cl-detalle"><td colspan="6"><ul class="cl-compras">${detalle}</ul></td></tr>`;
}

function pintar() {
  const lista = visibles();
  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (pagina > paginas) pagina = 1;
  const desde = (pagina - 1) * POR_PAGINA;

  if (!total) {
    const hay = CLIENTES.length > 0;
    $('clCuerpo').innerHTML = `<tr><td colspan="6"><div class="cl-vacio">
      <div class="emo">${ICO.personas}</div>
      <h3>${hay ? 'Sin resultados' : 'Todavía no hay clientes'}</h3>
      <p>${hay ? 'Probá con otra búsqueda o cambiá el filtro.'
               : 'Cuando alguien se registre en la tienda o te compre dejando su WhatsApp, aparece acá.'}</p>
    </div></td></tr>`;
    $('clPaginas').innerHTML = '';
    return;
  }

  $('clCuerpo').innerHTML = lista.slice(desde, desde + POR_PAGINA).map(fila).join('');

  let html = `<div class="paginacion"><span class="pag-info">${paginas > 1 ? `${desde + 1}–${Math.min(desde + POR_PAGINA, total)} de ` : ''}${total} cliente${total === 1 ? '' : 's'}</span>`;
  if (paginas > 1) {
    html += `<button class="pag-btn" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>`;
    for (let i = 1; i <= paginas; i++) {
      if (i === 1 || i === paginas || Math.abs(i - pagina) <= 1) {
        html += `<button class="pag-btn ${i === pagina ? 'activo' : ''}" data-pag="${i}">${i}</button>`;
      } else if (Math.abs(i - pagina) === 2) {
        html += '<span style="color:var(--gris-dim)">…</span>';
      }
    }
    html += `<button class="pag-btn" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Siguiente">›</button>`;
  }
  $('clPaginas').innerHTML = html + '</div>';
}

function esqueletos() {
  $('clCuerpo').innerHTML = Array.from({ length: 6 }, () => `
    <tr class="fila-esqueleto">
      <td><div class="esq" style="width:60%"></div></td><td><div class="esq" style="width:110px"></div></td>
      <td><div class="esq" style="width:70px"></div></td><td class="cl-col-ultima"><div class="esq" style="width:80px"></div></td>
      <td><div class="esq" style="width:110px"></div></td><td></td>
    </tr>`).join('');
}


// ============================================================
// 6. ACCIONES
// ============================================================
let espera;
$('clBuscar').addEventListener('input', e => {
  $('clCajaBuscar').classList.toggle('con-texto', e.target.value !== '');
  clearTimeout(espera);
  espera = setTimeout(() => { pagina = 1; pintar(); }, 160);
});
$('clLimpiar').addEventListener('click', () => {
  $('clBuscar').value = '';
  $('clCajaBuscar').classList.remove('con-texto');
  pagina = 1; pintar(); $('clBuscar').focus();
});
['clFiltro', 'clOrden'].forEach(id => $(id).addEventListener('change', () => { pagina = 1; pintar(); }));
$('clRefrescar').addEventListener('click', cargar);

$('clPaginas').addEventListener('click', e => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  pagina = Number(b.dataset.pag);
  pintar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('clCuerpo').addEventListener('click', async e => {
  if (e.target.closest('[data-no-abrir]')) return;

  const copiar = e.target.closest('[data-copiar]');
  if (copiar) {
    try {
      await navigator.clipboard.writeText('+' + copiar.dataset.copiar);
      aviso('Número copiado', 'ok');
    } catch { aviso('No se pudo copiar: ' + waLindo(copiar.dataset.copiar)); }
    return;
  }

  const borrar = e.target.closest('[data-borrar]');
  if (borrar) {
    const c = CLIENTES.find(x => x.idRegistro === borrar.dataset.borrar);
    if (!c || !confirm(`¿Borrar el registro de ${c.nombre} (${waLindo(c.wa)})?\n\nSus pedidos no se tocan. Si vuelve a entrar a la tienda, se le pide registrarse de nuevo.`)) return;
    borrar.disabled = true;
    const { error } = await sbAdmin.from('clientes').delete().eq('id', c.idRegistro);
    if (error) { borrar.disabled = false; aviso('No se pudo borrar: ' + error.message, 'error'); return; }
    aviso('Registro borrado', 'ok');
    cargar();
    return;
  }

  const filaClic = e.target.closest('tr.cl-fila');
  if (filaClic) {
    abierto = abierto === filaClic.dataset.wa ? null : filaClic.dataset.wa;
    pintar();
  }
});

// La lista que se ve (con el filtro y la búsqueda), como planilla
$('clExportar').addEventListener('click', () => {
  const lista = visibles();
  if (!lista.length) { aviso('No hay clientes para exportar'); return; }
  const celda = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = [['Usuario', 'WhatsApp', 'Registrado', 'Compras', 'Gastado (Bs)', 'Última compra', 'Suscripción', 'Vence']];
  for (const c of lista) {
    filas.push([
      c.nombre, '+' + c.wa, c.registrado ? fecha(c.registrado) : 'No', c.compras.size,
      c.gastado.toFixed(2).replace('.', ','), c.ultima ? fecha(c.ultima) : '',
      { activa: 'Activa', pronto: 'Por vencer', vencida: 'Vencida', nada: 'Sin suscripción' }[c.estado],
      c.proxima ? fecha(c.proxima) : (c.vencida ? fecha(c.vencida) : '')
    ]);
  }
  // ; y el BOM: así lo abre bien el Excel en español
  const csv = '﻿' + filas.map(f => f.map(celda).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `clientes-tiago-store-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});


// ============================================================
// 7. CUÁNDO SE ACTUALIZA
// ============================================================
// Al abrir la vista y con el botón. No consulta en segundo plano.
document.addEventListener('vista-cambiada', e => {
  if (e.detail.vista === 'clientes') cargar();
});

console.log('%c✓ Clientes listo', 'color:#22c55e;font-weight:bold');
