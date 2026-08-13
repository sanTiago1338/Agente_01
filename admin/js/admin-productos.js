// ============================================================
// ZONA VIP · CRUD de productos (panel de administración)
// ============================================================
// Este módulo se trae su propia interfaz: al cargarse inyecta
// su CSS y sus modales en la página. Por eso admin/index.html
// solo necesita una línea para usarlo.
//
// Expone:  window.accionProducto(accion, producto)
//   accion: 'nuevo' | 'editar' | 'agotar' | 'borrar'
// ============================================================

import { db } from '../../js/firebase-config.js';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const productosRef = collection(db, 'productos');

// Avisos tipo toast — los define admin/index.html
const aviso = (txt, tipo) =>
  (window.avisoAdmin ? window.avisoAdmin(txt, tipo) : console.log(txt));

// Catálogo ya cargado en memoria por el dashboard
const catalogo = () => (window.catalogoAdmin ? window.catalogoAdmin() : []);

// ============================================================
// 1. ESTILOS
// ============================================================
const estilos = document.createElement('style');
estilos.textContent = `
  .zv-fondo {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.72);
    backdrop-filter: blur(3px);
    z-index: 60;
    display: none;
    overflow-y: auto;
    padding: 24px 16px;
  }
  .zv-fondo.abierto { display: block; }

  .zv-modal {
    max-width: 620px;
    margin: 0 auto;
    background: #141414;
    border: 1px solid #2a2a2a;
    border-radius: 15px;
    box-shadow: 0 26px 80px rgba(0,0,0,.7);
    animation: zvEntrar .2s ease-out;
  }
  .zv-modal.chico { max-width: 430px; }
  @keyframes zvEntrar { from { opacity: 0; transform: translateY(14px); } }
  @media (prefers-reduced-motion: reduce) { .zv-modal { animation: none; } }

  .zv-cab {
    display: flex; align-items: center; gap: 12px;
    padding: 18px 22px;
    border-bottom: 1px solid #2a2a2a;
    position: sticky; top: 0;
    background: #141414;
    border-radius: 15px 15px 0 0;
    z-index: 2;
  }
  .zv-cab h2 {
    margin: 0; font-size: 18px; font-weight: 700;
    font-family: 'Outfit', system-ui, sans-serif;
  }
  .zv-cerrar {
    margin-left: auto;
    background: none; border: none;
    color: #6b6b6b; font-size: 22px;
    cursor: pointer; line-height: 1;
    padding: 4px 8px; border-radius: 6px;
  }
  .zv-cerrar:hover { color: #f5f5f5; background: #232323; }

  .zv-cuerpo { padding: 20px 22px; }

  .zv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .zv-ancho { grid-column: 1 / -1; }
  @media (max-width: 560px) { .zv-grid { grid-template-columns: 1fr; } }

  .zv-campo label {
    display: block; font-size: 12.5px; font-weight: 600;
    color: #9a9a9a; margin-bottom: 6px;
  }
  .zv-campo .ayuda { font-weight: 400; color: #6b6b6b; font-size: 11.5px; }

  .zv-campo input[type=text],
  .zv-campo input[type=number],
  .zv-campo input[type=url],
  .zv-campo textarea,
  .zv-campo select {
    width: 100%;
    padding: 10px 12px;
    background: #1c1c1c;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    color: #f5f5f5;
    font-size: 14.5px;
    font-family: 'Outfit', system-ui, sans-serif;
  }
  .zv-campo textarea { resize: vertical; min-height: 74px; line-height: 1.45; }
  .zv-campo input:focus, .zv-campo textarea:focus, .zv-campo select:focus {
    outline: none; border-color: #e50914;
    box-shadow: 0 0 0 3px rgba(229,9,20,.13);
  }
  .zv-campo.malo input, .zv-campo.malo textarea { border-color: #ef4444; }
  .zv-error {
    display: none; color: #ff8f8f; font-size: 12px; margin-top: 5px;
  }
  .zv-campo.malo .zv-error { display: block; }

  .zv-switches {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-top: 4px;
  }
  .zv-sw {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 13px;
    background: #1c1c1c;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    font-size: 13.5px; color: #9a9a9a;
    cursor: pointer; user-select: none;
  }
  .zv-sw:hover { border-color: #383838; }
  .zv-sw input { width: 15px; height: 15px; accent-color: #e50914; cursor: pointer; }
  .zv-sw.on { color: #f5f5f5; border-color: #444; background: #212121; }

  .zv-previa {
    display: flex; align-items: center; gap: 13px;
    padding: 11px;
    background: #1c1c1c;
    border: 1px solid #2a2a2a;
    border-radius: 9px;
    margin-top: 9px;
  }
  .zv-previa img {
    width: 52px; height: 52px; border-radius: 9px;
    object-fit: cover; background: #232323; flex-shrink: 0;
  }
  .zv-previa span { font-size: 12px; color: #6b6b6b; line-height: 1.45; word-break: break-all; }

  .zv-pie {
    display: flex; gap: 10px; justify-content: flex-end;
    padding: 16px 22px;
    border-top: 1px solid #2a2a2a;
    position: sticky; bottom: 0;
    background: #141414;
    border-radius: 0 0 15px 15px;
    flex-wrap: wrap;
  }
  .zv-btn {
    padding: 10px 18px; border-radius: 8px; border: 1px solid transparent;
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .zv-btn:hover:not(:disabled) { filter: brightness(1.16); }
  .zv-btn:disabled { opacity: .5; cursor: not-allowed; }
  .zv-btn.rojo   { background: #e50914; color: #fff; }
  .zv-btn.gris   { background: transparent; color: #9a9a9a; border-color: #383838; }
  .zv-btn.gris:hover { color: #f5f5f5; background: #1c1c1c; }
  .zv-btn.borrar { background: #ef4444; color: #fff; }

  .zv-confirmar { padding: 22px; text-align: center; }
  .zv-confirmar img {
    width: 66px; height: 66px; border-radius: 12px;
    object-fit: cover; background: #232323; margin-bottom: 14px;
  }
  .zv-confirmar h3 { margin: 0 0 7px; font-size: 16.5px; }
  .zv-confirmar p  { margin: 0; color: #9a9a9a; font-size: 13.5px; line-height: 1.55; }
  .zv-confirmar .peligro { color: #ff8f8f; margin-top: 11px; font-size: 12.5px; }
`;
document.head.appendChild(estilos);

// ============================================================
// 2. HTML DE LOS MODALES
// ============================================================
const contenedor = document.createElement('div');
contenedor.innerHTML = `
  <!-- ===== Editor de producto ===== -->
  <div class="zv-fondo" id="zvFondoEditor">
    <div class="zv-modal" role="dialog" aria-modal="true" aria-labelledby="zvTitulo">
      <div class="zv-cab">
        <h2 id="zvTitulo">Editar producto</h2>
        <button class="zv-cerrar" data-cerrar aria-label="Cerrar">✕</button>
      </div>

      <form id="zvForm" novalidate>
        <div class="zv-cuerpo">
          <div class="zv-grid">

            <div class="zv-campo zv-ancho" id="cNombre">
              <label for="fNombre">Nombre del producto</label>
              <input type="text" id="fNombre" placeholder="Netflix Premium 4K (1 pantalla)" autocomplete="off">
              <div class="zv-error">Escribí un nombre.</div>
            </div>

            <div class="zv-campo" id="cCategoria">
              <label for="fCategoria">Categoría <span class="ayuda">— elegí una o escribí otra</span></label>
              <input type="text" id="fCategoria" list="zvCategorias" placeholder="streaming" autocomplete="off">
              <datalist id="zvCategorias"></datalist>
              <div class="zv-error">Escribí una categoría.</div>
            </div>

            <div class="zv-campo" id="cPrecio">
              <label for="fPrecio">Precio normal (Bs.)</label>
              <input type="number" id="fPrecio" step="0.01" min="0" placeholder="29.90">
              <div class="zv-error">El precio tiene que ser mayor a 0.</div>
            </div>

            <div class="zv-campo zv-ancho">
              <label>Estado y visibilidad</label>
              <div class="zv-switches">
                <label class="zv-sw" id="swActivo">
                  <input type="checkbox" id="fActivo" checked> Disponible
                </label>
                <label class="zv-sw" id="swDestacado">
                  <input type="checkbox" id="fDestacado"> ★ Destacado
                </label>
                <label class="zv-sw" id="swOferta">
                  <input type="checkbox" id="fOferta"> En oferta
                </label>
              </div>
            </div>

            <div class="zv-campo zv-ancho" id="cOferta" style="display:none">
              <label for="fPrecioOferta">Precio de oferta (Bs.) <span class="ayuda">— el que va a pagar el cliente</span></label>
              <input type="number" id="fPrecioOferta" step="0.01" min="0" placeholder="19.90">
              <div class="zv-error">Tiene que ser mayor a 0 y menor al precio normal.</div>
            </div>

            <div class="zv-campo zv-ancho">
              <label for="fDescripcion">Descripción</label>
              <textarea id="fDescripcion" placeholder="1 pantalla Netflix 4K. Renovable mensualmente."></textarea>
            </div>

            <div class="zv-campo zv-ancho">
              <label for="fImagen">Imagen <span class="ayuda">— pegá una URL (la subida de archivos llega en C5)</span></label>
              <input type="text" id="fImagen" placeholder="Img/Netflix.jpg  ·  https://…" autocomplete="off">
              <div class="zv-previa">
                <img id="fPrevia" alt="">
                <span id="fPreviaTxt">Sin imagen — se genera un logo con el nombre</span>
              </div>
            </div>

            <div class="zv-campo">
              <label for="fEtiqueta">Etiqueta <span class="ayuda">— badge</span></label>
              <input type="text" id="fEtiqueta" placeholder="OFERTA · TOP · NUEVO" autocomplete="off">
            </div>

            <div class="zv-campo">
              <label for="fEstrellas">Estrellas</label>
              <select id="fEstrellas">
                <option value="5">★★★★★ (5)</option>
                <option value="4">★★★★☆ (4)</option>
                <option value="3">★★★☆☆ (3)</option>
                <option value="2">★★☆☆☆ (2)</option>
                <option value="1">★☆☆☆☆ (1)</option>
              </select>
            </div>

            <div class="zv-campo">
              <label for="fTipo">Tipo <span class="ayuda">— filtros de la tienda</span></label>
              <input type="text" id="fTipo" placeholder="1-pantalla,mensual" autocomplete="off">
            </div>

            <div class="zv-campo">
              <label for="fOrden">Orden <span class="ayuda">— menor aparece antes</span></label>
              <input type="number" id="fOrden" step="1" min="0" placeholder="100">
            </div>

          </div>
        </div>

        <div class="zv-pie">
          <button type="button" class="zv-btn gris" data-cerrar>Cancelar</button>
          <button type="submit" class="zv-btn rojo" id="zvGuardar">Guardar cambios</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ===== Confirmar borrado ===== -->
  <div class="zv-fondo" id="zvFondoBorrar">
    <div class="zv-modal chico" role="alertdialog" aria-modal="true">
      <div class="zv-confirmar">
        <img id="zvBorrarImg" alt="">
        <h3>¿Eliminar este producto?</h3>
        <p id="zvBorrarNombre"></p>
        <p class="peligro">⚠️ No se puede deshacer. Desaparece de la tienda al instante.</p>
      </div>
      <div class="zv-pie">
        <button type="button" class="zv-btn gris" data-cerrar>Cancelar</button>
        <button type="button" class="zv-btn borrar" id="zvConfirmarBorrar">Sí, eliminar</button>
      </div>
    </div>
  </div>
`;
document.body.appendChild(contenedor);

// ============================================================
// 3. ATAJOS
// ============================================================
const $ = id => document.getElementById(id);
let editando = null;   // producto en edición, o null si es nuevo
let borrando = null;

// ============================================================
// 4. IMÁGENES
// ============================================================
function urlImagen(src, nombre) {
  const s = (src || '').trim();
  if (!s) return logoPorDefecto(nombre);
  if (s.startsWith('http') || s.startsWith('data:') || s.startsWith('../')) return s;
  return '../' + s;
}

function logoPorDefecto(nombre = '?') {
  const letra = (String(nombre).trim()[0] || '?').toUpperCase();
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="10" fill="#2a2a2a"/>
      <text x="32" y="33" font-family="Arial" font-size="26" font-weight="bold"
            fill="#6b6b6b" text-anchor="middle" dominant-baseline="central">${letra}</text>
    </svg>`);
}

// ============================================================
// 5. ABRIR / CERRAR
// ============================================================
function abrir(fondo) {
  fondo.classList.add('abierto');
  document.body.style.overflow = 'hidden';
}
function cerrarTodo() {
  document.querySelectorAll('.zv-fondo.abierto').forEach(f => f.classList.remove('abierto'));
  document.body.style.overflow = '';
  editando = null;
  borrando = null;
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-cerrar]')) { cerrarTodo(); return; }
  // Click en el fondo (fuera del modal) cierra
  if (e.target.classList.contains('zv-fondo')) cerrarTodo();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarTodo();
});

// ============================================================
// 6. FORMULARIO
// ============================================================
function limpiarErrores() {
  document.querySelectorAll('.zv-campo.malo').forEach(c => c.classList.remove('malo'));
}

function pintarSwitches() {
  [['swActivo','fActivo'], ['swDestacado','fDestacado'], ['swOferta','fOferta']]
    .forEach(([sw, chk]) => $(sw).classList.toggle('on', $(chk).checked));
  $('cOferta').style.display = $('fOferta').checked ? '' : 'none';
}

['fActivo','fDestacado','fOferta'].forEach(id =>
  $(id).addEventListener('change', pintarSwitches));

// Previsualización de la imagen mientras escribís la URL
$('fImagen').addEventListener('input', actualizarPrevia);
$('fNombre').addEventListener('input', () => { if (!$('fImagen').value.trim()) actualizarPrevia(); });

function actualizarPrevia() {
  const src = $('fImagen').value.trim();
  const nombre = $('fNombre').value.trim();
  $('fPrevia').src = urlImagen(src, nombre);
  $('fPrevia').onerror = () => {
    $('fPrevia').onerror = null;
    $('fPrevia').src = logoPorDefecto(nombre);
    $('fPreviaTxt').textContent = '⚠️ No se pudo cargar esa imagen. Revisá la ruta.';
  };
  $('fPreviaTxt').textContent = src
    ? src
    : 'Sin imagen — se genera un logo con el nombre';
}

function llenarCategorias() {
  const cats = [...new Set(catalogo().map(p => p.categoria).filter(Boolean))].sort();
  $('zvCategorias').innerHTML = cats.map(c => `<option value="${c}">`).join('');
}

// ============================================================
// 7. ACCIÓN PRINCIPAL (la llama admin/index.html)
// ============================================================
window.accionProducto = function (accion, producto) {
  if (accion === 'nuevo')   return abrirEditor(null);
  if (accion === 'editar')  return abrirEditor(producto);
  if (accion === 'agotar')  return alternarDisponible(producto);
  if (accion === 'borrar')  return pedirConfirmacionBorrado(producto);
};

// ------------------------------------------------------------
// 7a. Abrir el editor
// ------------------------------------------------------------
function abrirEditor(p) {
  editando = p;
  limpiarErrores();
  llenarCategorias();

  $('zvTitulo').textContent  = p ? 'Editar producto' : 'Nuevo producto';
  $('zvGuardar').textContent = p ? 'Guardar cambios' : 'Crear producto';

  $('fNombre').value       = p?.nombre        ?? '';
  $('fCategoria').value    = p?.categoria     ?? '';
  $('fPrecio').value       = p?.precio        ?? '';
  $('fPrecioOferta').value = p?.precioOferta  ?? '';
  $('fDescripcion').value  = p?.descripcion   ?? '';
  $('fImagen').value       = p?.imagen        ?? '';
  $('fEtiqueta').value     = p?.etiqueta      ?? '';
  $('fEstrellas').value    = String(p?.estrellas ?? 5);
  $('fTipo').value         = p?.tipo          ?? '';
  $('fOrden').value        = p?.orden         ?? siguienteOrden();
  $('fActivo').checked     = p ? p.activo !== false : true;
  $('fDestacado').checked  = p?.destacado === true;
  $('fOferta').checked     = p?.oferta === true;

  pintarSwitches();
  actualizarPrevia();
  abrir($('zvFondoEditor'));
  setTimeout(() => $('fNombre').focus(), 60);
}

function siguienteOrden() {
  const ordenes = catalogo().map(p => p.orden).filter(n => typeof n === 'number');
  return ordenes.length ? Math.max(...ordenes) + 10 : 10;
}

// Los productos nuevos necesitan un idLegacy numérico:
// la tienda lo usa en onclick="openProduct(12)".
function siguienteIdLegacy() {
  const ids = catalogo().map(p => p.idLegacy).filter(n => typeof n === 'number');
  return ids.length ? Math.max(...ids) + 1 : 1;
}

// ------------------------------------------------------------
// 7b. Guardar (crear o actualizar)
// ------------------------------------------------------------
$('zvForm').addEventListener('submit', async e => {
  e.preventDefault();
  limpiarErrores();

  const nombre    = $('fNombre').value.trim();
  const categoria = $('fCategoria').value.trim().toLowerCase();
  const precio    = parseFloat($('fPrecio').value);
  const enOferta  = $('fOferta').checked;
  const oferta    = parseFloat($('fPrecioOferta').value);

  // --- Validación ---
  let hayError = false;
  if (!nombre)                  { $('cNombre').classList.add('malo');    hayError = true; }
  if (!categoria)               { $('cCategoria').classList.add('malo'); hayError = true; }
  if (!(precio > 0))            { $('cPrecio').classList.add('malo');    hayError = true; }
  if (enOferta && !(oferta > 0 && oferta < precio)) {
    $('cOferta').classList.add('malo'); hayError = true;
  }
  if (hayError) {
    document.querySelector('.zv-campo.malo input')?.focus();
    return;
  }

  const datos = {
    nombre,
    categoria,
    precio,
    precioOferta: enOferta ? oferta : null,
    oferta:       enOferta,
    descripcion:  $('fDescripcion').value.trim(),
    imagen:       $('fImagen').value.trim(),
    etiqueta:     $('fEtiqueta').value.trim(),
    estrellas:    parseInt($('fEstrellas').value, 10),
    tipo:         $('fTipo').value.trim(),
    orden:        parseInt($('fOrden').value, 10) || siguienteOrden(),
    activo:       $('fActivo').checked,
    destacado:    $('fDestacado').checked,
    fechaActualizacion: serverTimestamp()
  };

  $('zvGuardar').disabled = true;
  $('zvGuardar').textContent = 'Guardando…';

  try {
    if (editando) {
      await updateDoc(doc(db, 'productos', editando.id), datos);
      aviso(`✓ "${recortar(nombre)}" actualizado`, 'ok');
    } else {
      await addDoc(productosRef, {
        ...datos,
        idLegacy:      siguienteIdLegacy(),
        imagenColor:   '#333333,#666666',
        imagenTexto:   nombre,
        imagenFill:    false,
        fechaCreacion: serverTimestamp()
      });
      aviso(`✓ "${recortar(nombre)}" creado`, 'ok');
    }
    cerrarTodo();
  } catch (err) {
    console.error(err);
    aviso(`No se pudo guardar: ${err.message}`, 'error');
  } finally {
    $('zvGuardar').disabled = false;
    $('zvGuardar').textContent = editando ? 'Guardar cambios' : 'Crear producto';
  }
});

// ------------------------------------------------------------
// 7c. Agotar / reponer — sin confirmación, es reversible
// ------------------------------------------------------------
async function alternarDisponible(p) {
  const nuevoEstado = p.activo === false;   // si estaba agotado, lo reponemos
  try {
    await updateDoc(doc(db, 'productos', p.id), {
      activo: nuevoEstado,
      fechaActualizacion: serverTimestamp()
    });
    aviso(nuevoEstado
      ? `📦 "${recortar(p.nombre)}" vuelve a estar disponible`
      : `🚫 "${recortar(p.nombre)}" marcado como agotado`, 'ok');
  } catch (err) {
    console.error(err);
    aviso(`No se pudo cambiar el estado: ${err.message}`, 'error');
  }
}

// ------------------------------------------------------------
// 7d. Eliminar — con confirmación, es irreversible
// ------------------------------------------------------------
function pedirConfirmacionBorrado(p) {
  borrando = p;
  $('zvBorrarImg').src = urlImagen(p.imagen, p.nombre);
  $('zvBorrarImg').onerror = function () { this.onerror = null; this.src = logoPorDefecto(p.nombre); };
  $('zvBorrarNombre').textContent = p.nombre || '(sin nombre)';
  abrir($('zvFondoBorrar'));
}

$('zvConfirmarBorrar').addEventListener('click', async () => {
  if (!borrando) return;
  const p = borrando;
  const btn = $('zvConfirmarBorrar');
  btn.disabled = true;
  btn.textContent = 'Eliminando…';

  try {
    await deleteDoc(doc(db, 'productos', p.id));
    aviso(`🗑️ "${recortar(p.nombre)}" eliminado`, 'ok');
    cerrarTodo();
  } catch (err) {
    console.error(err);
    aviso(`No se pudo eliminar: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sí, eliminar';
  }
});

// ============================================================
// 8. UTILIDADES
// ============================================================
function recortar(txt = '', max = 34) {
  const s = String(txt);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

console.log('%c✓ CRUD de productos listo', 'color:#22c55e;font-weight:bold');
