// ============================================================
// TIAGO STORE · Administración de juegos de recarga
// ============================================================
// Construye la vista "🎮 Juegos" del panel y permite editar los
// juegos y los precios de sus paquetes sin tocar código.
//
// Un juego guarda sus paquetes dentro del mismo documento, en el
// array "paquetes". Editar un precio = actualizar ese array.
// ============================================================

import { db } from '../../js/firebase-config.js';
import {
  collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const juegosRef = collection(db, 'juegos');
const aviso = (t, tipo) => (window.avisoAdmin ? window.avisoAdmin(t, tipo) : console.log(t));

let JUEGOS = [];
let editando = null;      // juego abierto en el editor
let paquetesEdit = [];    // copia de trabajo de los paquetes
let borrando = null;

// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .jg-wrap { max-width:1280px; margin:0 auto; padding:24px 20px 80px; }

  .jg-lista {
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(230px, 1fr));
    gap:12px;
  }
  .jg-card {
    background:#141414; border:1px solid #2a2a2a; border-radius:12px;
    padding:14px; display:flex; flex-direction:column; gap:10px;
  }
  .jg-card.inactivo { opacity:.5; }
  .jg-top { display:flex; align-items:center; gap:11px; }
  .jg-logo {
    width:46px; height:46px; border-radius:9px; object-fit:cover;
    flex-shrink:0; background:#232323;
  }
  .jg-nombre { font-weight:700; font-size:14.5px; line-height:1.25; }
  .jg-meta { font-size:11.5px; color:#6b6b6b; margin-top:2px; }
  .jg-chips { display:flex; gap:4px; flex-wrap:wrap; }
  .jg-chip {
    font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
    padding:2px 7px; border-radius:20px;
  }
  .jg-chip.pop  { background:rgba(255,215,0,.13);  color:#ffd700; }
  .jg-chip.new  { background:rgba(34,197,94,.13);  color:#22c55e; }
  .jg-chip.off  { background:rgba(239,68,68,.13);  color:#ef4444; }
  .jg-chip.pk   { background:#232323;              color:#9a9a9a; }
  .jg-acciones { display:flex; gap:6px; margin-top:auto; }
  .jg-acciones button { flex:1; }

  /* ---- Editor ---- */
  .jg-fondo {
    position:fixed; inset:0; background:rgba(0,0,0,.72); backdrop-filter:blur(3px);
    z-index:60; display:none; overflow-y:auto; padding:24px 16px;
  }
  .jg-fondo.abierto { display:block; }
  .jg-modal {
    max-width:760px; margin:0 auto; background:#141414;
    border:1px solid #2a2a2a; border-radius:15px;
    box-shadow:0 26px 80px rgba(0,0,0,.7);
  }
  .jg-modal.chico { max-width:430px; }
  .jg-cab {
    display:flex; align-items:center; gap:12px; padding:18px 22px;
    border-bottom:1px solid #2a2a2a; position:sticky; top:0;
    background:#141414; border-radius:15px 15px 0 0; z-index:2;
  }
  .jg-cab h2 { margin:0; font-size:18px; font-weight:700; }
  .jg-cerrar {
    margin-left:auto; background:none; border:none; color:#6b6b6b;
    font-size:22px; cursor:pointer; padding:4px 8px; border-radius:6px; line-height:1;
  }
  .jg-cerrar:hover { color:#f5f5f5; background:#232323; }
  .jg-cuerpo { padding:20px 22px; }

  .jg-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:20px; }
  .jg-ancho { grid-column:1/-1; }
  @media (max-width:640px) { .jg-grid { grid-template-columns:1fr; } }

  .jg-campo label { display:block; font-size:12.5px; font-weight:600; color:#9a9a9a; margin-bottom:6px; }
  .jg-campo .ayuda { font-weight:400; color:#6b6b6b; font-size:11.5px; }
  .jg-campo input[type=text], .jg-campo input[type=number], .jg-campo select {
    width:100%; padding:10px 12px; background:#1c1c1c; border:1px solid #2a2a2a;
    border-radius:8px; color:#f5f5f5; font-size:14.5px; font-family:inherit;
  }
  .jg-campo input:focus, .jg-campo select:focus {
    outline:none; border-color:#e50914; box-shadow:0 0 0 3px rgba(229,9,20,.13);
  }
  .jg-campo.malo input { border-color:#ef4444; }
  .jg-error { display:none; color:#ff8f8f; font-size:12px; margin-top:5px; }
  .jg-campo.malo .jg-error { display:block; }

  .jg-switches { display:flex; flex-wrap:wrap; gap:8px; }
  .jg-sw {
    display:flex; align-items:center; gap:8px; padding:9px 13px;
    background:#1c1c1c; border:1px solid #2a2a2a; border-radius:8px;
    font-size:13.5px; color:#9a9a9a; cursor:pointer; user-select:none;
  }
  .jg-sw.on { color:#f5f5f5; border-color:#444; background:#212121; }
  .jg-sw input { width:15px; height:15px; accent-color:#e50914; cursor:pointer; }

  /* ---- Paquetes ---- */
  .jg-pk-cab {
    display:flex; align-items:center; gap:10px; margin:4px 0 10px;
    padding-top:16px; border-top:1px solid #2a2a2a;
  }
  .jg-pk-cab h3 { margin:0; font-size:15px; }
  .jg-pk-cab .cuenta { font-size:12px; color:#6b6b6b; }
  .jg-pk-cab button { margin-left:auto; }

  .jg-pk-lista { display:flex; flex-direction:column; gap:7px; max-height:340px; overflow-y:auto; padding-right:4px; }
  .jg-pk {
    display:grid; grid-template-columns:38px 1fr 108px 118px 34px;
    gap:7px; align-items:center;
    background:#1c1c1c; border:1px solid #2a2a2a; border-radius:8px; padding:7px;
  }
  .jg-pk input, .jg-pk select {
    width:100%; padding:7px 9px; background:#141414; border:1px solid #2a2a2a;
    border-radius:6px; color:#f5f5f5; font-size:13px; font-family:inherit;
  }
  .jg-pk input:focus, .jg-pk select:focus { outline:none; border-color:#e50914; }
  .jg-pk .icono { text-align:center; }
  .jg-pk .precio { font-variant-numeric:tabular-nums; }
  .jg-pk .quitar {
    background:none; border:none; color:#6b6b6b; cursor:pointer;
    font-size:15px; padding:5px; border-radius:5px;
  }
  .jg-pk .quitar:hover { color:#fff; background:#ef4444; }
  .jg-pk.consulta .precio { opacity:.4; }
  @media (max-width:640px) {
    .jg-pk { grid-template-columns:38px 1fr 34px; }
    .jg-pk .precio, .jg-pk .grupo { grid-column:2; }
  }

  .jg-pie {
    display:flex; gap:10px; justify-content:flex-end; padding:16px 22px;
    border-top:1px solid #2a2a2a; position:sticky; bottom:0;
    background:#141414; border-radius:0 0 15px 15px; flex-wrap:wrap;
  }
  .jg-btn {
    padding:10px 18px; border-radius:8px; border:1px solid transparent;
    font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;
  }
  .jg-btn:hover:not(:disabled) { filter:brightness(1.16); }
  .jg-btn:disabled { opacity:.5; cursor:not-allowed; }
  .jg-btn.rojo { background:#e50914; color:#fff; }
  .jg-btn.gris { background:transparent; color:#9a9a9a; border-color:#383838; }
  .jg-btn.gris:hover { color:#f5f5f5; background:#1c1c1c; }
  .jg-btn.borrar { background:#ef4444; color:#fff; }
  .jg-btn.chico { padding:7px 13px; font-size:13px; }

  .jg-confirmar { padding:22px; text-align:center; }
  .jg-confirmar img { width:66px; height:66px; border-radius:12px; object-fit:cover; background:#232323; margin-bottom:14px; }
  .jg-confirmar h3 { margin:0 0 7px; font-size:16.5px; }
  .jg-confirmar p { margin:0; color:#9a9a9a; font-size:13.5px; line-height:1.55; }
  .jg-confirmar .peligro { color:#ff8f8f; margin-top:11px; font-size:12.5px; }

  .jg-vacio { padding:60px 20px; text-align:center; }
  .jg-vacio .emo { font-size:40px; margin-bottom:12px; }
  .jg-vacio h3 { margin:0 0 6px; font-size:17px; }
  .jg-vacio p { margin:0; color:#6b6b6b; font-size:13.5px; line-height:1.6; }
  .jg-vacio code { background:#1c1c1c; padding:2px 6px; border-radius:4px; color:#ffd700; font-size:12.5px; }
`;
document.head.appendChild(css);

// ============================================================
// 2. ESTRUCTURA DE LA VISTA
// ============================================================
const vista = document.getElementById('vistaJuegos');
vista.innerHTML = `
  <div class="jg-wrap">
    <section class="resumen" style="margin-bottom:22px;">
      <div class="metrica"><div class="metrica-n"        id="jgTotal">–</div><div class="metrica-l">Juegos</div></div>
      <div class="metrica"><div class="metrica-n ok"     id="jgPaquetes">–</div><div class="metrica-l">Paquetes</div></div>
      <div class="metrica"><div class="metrica-n dorado" id="jgPopulares">–</div><div class="metrica-l">Populares</div></div>
      <div class="metrica"><div class="metrica-n warn"   id="jgConsulta">–</div><div class="metrica-l">A consultar</div></div>
    </section>

    <div class="herramientas">
      <div class="buscador" id="jgCajaBuscador">
        <span class="lupa">🔍</span>
        <input type="search" id="jgBuscar" placeholder="Buscar juego…" autocomplete="off">
      </div>
      <button class="btn btn-rojo" id="jgNuevo">+ Nuevo juego</button>
    </div>

    <div class="jg-lista" id="jgLista"></div>
  </div>

  <!-- Editor -->
  <div class="jg-fondo" id="jgFondoEditor">
    <div class="jg-modal" role="dialog" aria-modal="true">
      <div class="jg-cab">
        <h2 id="jgTitulo">Editar juego</h2>
        <button class="jg-cerrar" data-jg-cerrar aria-label="Cerrar">✕</button>
      </div>
      <form id="jgForm">
        <div class="jg-cuerpo">
          <div class="jg-grid">
            <div class="jg-campo jg-ancho" id="jgcNombre">
              <label for="jgfNombre">Nombre del juego</label>
              <input type="text" id="jgfNombre" placeholder="Free Fire" autocomplete="off">
              <div class="jg-error">Escribí un nombre.</div>
            </div>

            <div class="jg-campo">
              <label for="jgfUnidad">Unidad <span class="ayuda">— qué se recarga</span></label>
              <input type="text" id="jgfUnidad" placeholder="Diamantes" autocomplete="off">
            </div>

            <div class="jg-campo">
              <label for="jgfEtiqueta">Etiqueta <span class="ayuda">— badge</span></label>
              <input type="text" id="jgfEtiqueta" placeholder="PROMO" autocomplete="off">
            </div>

            <div class="jg-campo jg-ancho">
              <label for="jgfLogo">Logo <span class="ayuda">— ruta o URL</span></label>
              <input type="text" id="jgfLogo" placeholder="Img/Free%20fire.jpg" autocomplete="off">
            </div>

            <div class="jg-campo">
              <label for="jgfColor1">Color inicial</label>
              <input type="text" id="jgfColor1" placeholder="#ff4500" autocomplete="off">
            </div>
            <div class="jg-campo">
              <label for="jgfColor2">Color final</label>
              <input type="text" id="jgfColor2" placeholder="#8b0000" autocomplete="off">
            </div>

            <div class="jg-campo">
              <label for="jgfOrden">Orden <span class="ayuda">— menor va antes</span></label>
              <input type="number" id="jgfOrden" step="1" min="0" placeholder="10">
            </div>

            <div class="jg-campo jg-ancho">
              <label>Opciones</label>
              <div class="jg-switches">
                <label class="jg-sw" id="jgswActivo"><input type="checkbox" id="jgfActivo" checked> Visible</label>
                <label class="jg-sw" id="jgswPopular"><input type="checkbox" id="jgfPopular"> ⭐ Popular</label>
                <label class="jg-sw" id="jgswNuevo"><input type="checkbox" id="jgfNuevo"> Nuevo</label>
                <label class="jg-sw" id="jgswServer"><input type="checkbox" id="jgfServer"> Pide ID + servidor</label>
                <label class="jg-sw" id="jgswCuenta"><input type="checkbox" id="jgfCuenta"> Pide cuenta</label>
              </div>
            </div>
          </div>

          <div class="jg-pk-cab">
            <h3>Paquetes</h3>
            <span class="cuenta" id="jgPkCuenta">0</span>
            <button type="button" class="jg-btn gris chico" id="jgAddPk">+ Agregar paquete</button>
          </div>
          <div class="jg-pk-lista" id="jgPkLista"></div>
        </div>

        <div class="jg-pie">
          <button type="button" class="jg-btn gris" data-jg-cerrar>Cancelar</button>
          <button type="submit" class="jg-btn rojo" id="jgGuardar">Guardar cambios</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Confirmar borrado -->
  <div class="jg-fondo" id="jgFondoBorrar">
    <div class="jg-modal chico" role="alertdialog" aria-modal="true">
      <div class="jg-confirmar">
        <img id="jgBorrarImg" alt="">
        <h3>¿Eliminar este juego?</h3>
        <p id="jgBorrarNombre"></p>
        <p class="peligro">⚠️ Se borran también todos sus paquetes. No se puede deshacer.</p>
      </div>
      <div class="jg-pie">
        <button type="button" class="jg-btn gris" data-jg-cerrar>Cancelar</button>
        <button type="button" class="jg-btn borrar" id="jgConfirmarBorrar">Sí, eliminar</button>
      </div>
    </div>
  </div>
`;

// ============================================================
// 3. UTILIDADES
// ============================================================
const $ = id => document.getElementById(id);

const escapar = s => String(s || '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function urlLogo(logo, nombre) {
  const s = String(logo || '').trim();
  if (!s) return logoPorDefecto(nombre);
  if (s.startsWith('http') || s.startsWith('data:') || s.startsWith('../')) return s;
  return '../' + s;
}

function logoPorDefecto(nombre = '?') {
  // [...cadena] corta por caracteres de verdad: con nombre[0] un emoji
  // quedaba partido al medio y encodeURIComponent tiraba "URI malformed".
  const letra = ([...String(nombre).trim()][0] || '?').toUpperCase();
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="10" fill="#2a2a2a"/>
      <text x="32" y="33" font-family="Arial" font-size="26" font-weight="bold"
            fill="#6b6b6b" text-anchor="middle" dominant-baseline="central">${letra}</text>
    </svg>`);
}

// ============================================================
// 4. SUSCRIPCIÓN
// ============================================================
onSnapshot(juegosRef,
  snapshot => {
    JUEGOS = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.orden ?? 999999) - (b.orden ?? 999999));
    JUEGOS.forEach(j => {
      if (Array.isArray(j.paquetes)) j.paquetes.sort((a, b) => (a.orden ?? 999999) - (b.orden ?? 999999));
    });
    metricas();
    listar();
  },
  error => {
    console.error(error);
    $('jgLista').innerHTML = `
      <div class="jg-vacio" style="grid-column:1/-1;">
        <div class="emo">🔒</div>
        <h3>No se pudo leer la colección "juegos"</h3>
        <p>${escapar(error.code || error.message)}<br>
           Revisá que las reglas de Firestore incluyan <code>match /juegos/{juegoId}</code>.</p>
      </div>`;
  }
);

function metricas() {
  const paquetes = JUEGOS.reduce((s, j) => s + (j.paquetes?.length || 0), 0);
  const consulta = JUEGOS.reduce((s, j) => s + (j.paquetes || []).filter(p => p.consultar).length, 0);
  $('jgTotal').textContent     = JUEGOS.length;
  $('jgPaquetes').textContent  = paquetes;
  $('jgPopulares').textContent = JUEGOS.filter(j => j.popular).length;
  $('jgConsulta').textContent  = consulta;
}

// ============================================================
// 5. LISTADO
// ============================================================
function listar() {
  const q = ($('jgBuscar').value || '').trim().toLowerCase();
  const lista = JUEGOS.filter(j => !q || (j.nombre || '').toLowerCase().includes(q));

  if (lista.length === 0) {
    $('jgLista').innerHTML = `
      <div class="jg-vacio" style="grid-column:1/-1;">
        <div class="emo">${JUEGOS.length ? '🔍' : '🎮'}</div>
        <h3>${JUEGOS.length ? 'Sin resultados' : 'Todavía no hay juegos'}</h3>
        <p>${JUEGOS.length
              ? 'Probá con otro nombre'
              : 'Corré <code>backup/migrar-juegos.html</code> para subir los 27 juegos.'}</p>
      </div>`;
    return;
  }

  $('jgLista').innerHTML = lista.map(j => {
    const n = j.paquetes?.length || 0;
    return `
    <div class="jg-card${j.activo === false ? ' inactivo' : ''}">
      <div class="jg-top">
        <img class="jg-logo" src="${escapar(urlLogo(j.logo, j.nombre))}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${logoPorDefecto(j.nombre)}'">
        <div style="min-width:0;">
          <div class="jg-nombre">${escapar(j.nombre || '(sin nombre)')}</div>
          <div class="jg-meta">${escapar(j.unidad || 'sin unidad')}</div>
        </div>
      </div>
      <div class="jg-chips">
        <span class="jg-chip pk">${n} paquete${n === 1 ? '' : 's'}</span>
        ${j.popular ? '<span class="jg-chip pop">⭐ Popular</span>' : ''}
        ${j.nuevo ? '<span class="jg-chip new">Nuevo</span>' : ''}
        ${j.activo === false ? '<span class="jg-chip off">Oculto</span>' : ''}
      </div>
      <div class="jg-acciones">
        <button class="btn-icono" data-jg="editar" data-id="${j.id}" title="Editar">✏️ Editar</button>
        <button class="btn-icono peligro" data-jg="borrar" data-id="${j.id}" title="Eliminar">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

let debounceJg;
$('jgBuscar').addEventListener('input', () => {
  clearTimeout(debounceJg);
  debounceJg = setTimeout(listar, 180);
});

$('jgLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-jg]');
  if (!btn) return;
  const juego = JUEGOS.find(j => j.id === btn.dataset.id);
  if (!juego) return;
  if (btn.dataset.jg === 'editar') abrirEditor(juego);
  if (btn.dataset.jg === 'borrar') pedirBorrado(juego);
});

$('jgNuevo').addEventListener('click', () => abrirEditor(null));

// ============================================================
// 6. EDITOR
// ============================================================
function abrir(fondo) {
  fondo.classList.add('abierto');
  document.body.style.overflow = 'hidden';
}
function cerrar() {
  document.querySelectorAll('.jg-fondo.abierto').forEach(f => f.classList.remove('abierto'));
  document.body.style.overflow = '';
  editando = null;
  borrando = null;
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-jg-cerrar]')) { cerrar(); return; }
  if (e.target.classList.contains('jg-fondo')) cerrar();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.jg-fondo.abierto')) cerrar();
});

function pintarSwitches() {
  [['jgswActivo','jgfActivo'], ['jgswPopular','jgfPopular'], ['jgswNuevo','jgfNuevo'],
   ['jgswServer','jgfServer'], ['jgswCuenta','jgfCuenta']]
    .forEach(([sw, chk]) => $(sw).classList.toggle('on', $(chk).checked));
}
['jgfActivo','jgfPopular','jgfNuevo','jgfServer','jgfCuenta']
  .forEach(id => $(id).addEventListener('change', pintarSwitches));

function siguienteOrden() {
  const o = JUEGOS.map(j => j.orden).filter(n => typeof n === 'number');
  return o.length ? Math.max(...o) + 10 : 10;
}

function abrirEditor(j) {
  editando = j;
  document.querySelectorAll('.jg-campo.malo').forEach(c => c.classList.remove('malo'));

  $('jgTitulo').textContent  = j ? 'Editar juego' : 'Nuevo juego';
  $('jgGuardar').textContent = j ? 'Guardar cambios' : 'Crear juego';

  $('jgfNombre').value   = j?.nombre   ?? '';
  $('jgfUnidad').value   = j?.unidad   ?? '';
  $('jgfEtiqueta').value = j?.etiqueta ?? '';
  $('jgfLogo').value     = j?.logo     ?? '';
  $('jgfColor1').value   = j?.color1   ?? '#333333';
  $('jgfColor2').value   = j?.color2   ?? '#666666';
  $('jgfOrden').value    = j?.orden    ?? siguienteOrden();
  $('jgfActivo').checked  = j ? j.activo !== false : true;
  $('jgfPopular').checked = j?.popular === true;
  $('jgfNuevo').checked   = j?.nuevo === true;
  $('jgfServer').checked  = j?.necesitaServerId === true;
  $('jgfCuenta').checked  = j?.necesitaCuenta === true;

  paquetesEdit = (j?.paquetes || []).map(p => ({ ...p }));
  pintarSwitches();
  pintarPaquetes();
  abrir($('jgFondoEditor'));
  setTimeout(() => $('jgfNombre').focus(), 60);
}

// ---- Paquetes ----
function pintarPaquetes() {
  $('jgPkCuenta').textContent = `${paquetesEdit.length} paquete${paquetesEdit.length === 1 ? '' : 's'}`;

  const grupos = [...new Set(paquetesEdit.map(p => p.grupo).filter(Boolean))];

  const unidad = $('jgfUnidad').value.trim() || 'unidades';

  $('jgPkLista').innerHTML = paquetesEdit.map((p, i) => {
    // Algunos paquetes no tienen nombre y se identifican por cantidad
    // (los Robux de Roblox se muestran en la tienda como "40 Robux").
    // Los mostramos como sugerencia para que se entienda qué son.
    const porCantidad = !(p.nombre || '').trim() && p.cantidad != null;
    const sugerencia  = porCantidad
      ? `${Number(p.cantidad).toLocaleString('es-BO')} ${unidad}`
      : '100+10 Diamantes';

    return `
    <div class="jg-pk${p.consultar ? ' consulta' : ''}" data-i="${i}">
      <input class="icono" data-campo="icono" value="${escapar(p.icono)}" placeholder="💎" maxlength="4">
      <input data-campo="nombre" value="${escapar(p.nombre)}" placeholder="${escapar(sugerencia)}"
             ${porCantidad ? 'style="font-style:italic;" title="Se muestra como &quot;' + escapar(sugerencia) + '&quot;. Si escribís un nombre, reemplaza a ese texto."' : ''}>
      <input class="precio" data-campo="precio" type="number" step="0.01" min="0"
             value="${p.consultar ? '' : (p.precio ?? '')}" placeholder="Bs." ${p.consultar ? 'disabled' : ''}>
      <input class="grupo" data-campo="grupo" value="${escapar(p.grupo)}" placeholder="Grupo" list="jgGrupos">
      <button type="button" class="quitar" data-quitar="${i}" title="Quitar">✕</button>
    </div>`;
  }).join('') +
    `<datalist id="jgGrupos">${grupos.map(g => `<option value="${escapar(g)}">`).join('')}</datalist>`;
}

$('jgAddPk').addEventListener('click', () => {
  const ultimo = paquetesEdit[paquetesEdit.length - 1];
  paquetesEdit.push({
    nombre: '', icono: ultimo?.icono || '', precio: 0,
    grupo: ultimo?.grupo || '', consultar: false, necesitaEmail: false,
    cantidad: null, orden: (paquetesEdit.length + 1) * 10
  });
  pintarPaquetes();
  const inputs = $('jgPkLista').querySelectorAll('[data-campo="nombre"]');
  inputs[inputs.length - 1]?.focus();
});

$('jgPkLista').addEventListener('input', e => {
  const campo = e.target.dataset.campo;
  if (!campo) return;
  const i = Number(e.target.closest('.jg-pk').dataset.i);
  paquetesEdit[i][campo] = campo === 'precio' ? parseFloat(e.target.value) || 0 : e.target.value;
});

$('jgPkLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-quitar]');
  if (!btn) return;
  paquetesEdit.splice(Number(btn.dataset.quitar), 1);
  pintarPaquetes();
});

// ---- Guardar ----
$('jgForm').addEventListener('submit', async e => {
  e.preventDefault();
  document.querySelectorAll('.jg-campo.malo').forEach(c => c.classList.remove('malo'));

  const nombre = $('jgfNombre').value.trim();
  if (!nombre) { $('jgcNombre').classList.add('malo'); $('jgfNombre').focus(); return; }

  const datos = {
    nombre,
    unidad:           $('jgfUnidad').value.trim(),
    etiqueta:         $('jgfEtiqueta').value.trim(),
    logo:             $('jgfLogo').value.trim(),
    color1:           $('jgfColor1').value.trim() || '#333333',
    color2:           $('jgfColor2').value.trim() || '#666666',
    orden:            parseInt($('jgfOrden').value, 10) || siguienteOrden(),
    activo:           $('jgfActivo').checked,
    popular:          $('jgfPopular').checked,
    nuevo:            $('jgfNuevo').checked,
    necesitaServerId: $('jgfServer').checked,
    necesitaCuenta:   $('jgfCuenta').checked,
    // Ojo: hay paquetes sin nombre que se identifican por "cantidad"
    // (los Robux de Roblox, por ejemplo, se muestran como "40 Robux").
    // Si filtráramos solo por nombre, esos paquetes se borrarían al guardar.
    paquetes: paquetesEdit
      .filter(p => (p.nombre || '').trim() !== '' || p.cantidad != null)
      .map((p, i) => ({
        nombre:        String(p.nombre).trim(),
        icono:         String(p.icono || '').trim(),
        precio:        p.consultar ? 0 : (Number(p.precio) || 0),
        grupo:         String(p.grupo || '').trim(),
        consultar:     p.consultar === true,
        necesitaEmail: p.necesitaEmail === true,
        cantidad:      p.cantidad ?? null,
        orden:         (i + 1) * 10
      })),
    fechaActualizacion: serverTimestamp()
  };

  $('jgGuardar').disabled = true;
  $('jgGuardar').textContent = 'Guardando…';
  try {
    if (editando) {
      await updateDoc(doc(db, 'juegos', editando.id), datos);
      aviso(`✓ "${nombre}" actualizado`, 'ok');
    } else {
      await addDoc(juegosRef, {
        ...datos,
        autoRegion: false,
        etiquetasId: [],
        fechaCreacion: serverTimestamp()
      });
      aviso(`✓ "${nombre}" creado`, 'ok');
    }
    cerrar();
  } catch (err) {
    console.error(err);
    aviso(`No se pudo guardar: ${err.message}`, 'error');
  } finally {
    $('jgGuardar').disabled = false;
    $('jgGuardar').textContent = editando ? 'Guardar cambios' : 'Crear juego';
  }
});

// ---- Borrar ----
function pedirBorrado(j) {
  borrando = j;
  $('jgBorrarImg').src = urlLogo(j.logo, j.nombre);
  $('jgBorrarImg').onerror = function () { this.onerror = null; this.src = logoPorDefecto(j.nombre); };
  $('jgBorrarNombre').textContent =
    `${j.nombre} · ${j.paquetes?.length || 0} paquetes`;
  abrir($('jgFondoBorrar'));
}

$('jgConfirmarBorrar').addEventListener('click', async () => {
  if (!borrando) return;
  const j = borrando;
  const btn = $('jgConfirmarBorrar');
  btn.disabled = true;
  btn.textContent = 'Eliminando…';
  try {
    await deleteDoc(doc(db, 'juegos', j.id));
    aviso(`🗑️ "${j.nombre}" eliminado`, 'ok');
    cerrar();
  } catch (err) {
    console.error(err);
    aviso(`No se pudo eliminar: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sí, eliminar';
  }
});

console.log('%c✓ Admin de juegos listo', 'color:#22c55e;font-weight:bold');
