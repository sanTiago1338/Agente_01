// ============================================================
// TIAGO STORE · Stock de cuentas (panel)
// ============================================================
// La vista 🔑 Stock: las cuentas compradas por lote que esperan comprador.
// Es de donde confirmar_pago() saca lo que le entrega al cliente.
//
// POR QUÉ ESTE MÓDULO NO PASA POR js/panel-datos.js
//   Los otros módulos del panel importan del interruptor, porque productos
//   y juegos existen en las dos bases. Las cuentas NO: son una tabla que
//   solo existe en Supabase. Un interruptor que solo tiene un lado no es
//   un interruptor, así que este archivo le habla a Supabase de frente.
//
// SOLO PLATAFORMAS, NO JUEGOS
//   Esta vista lista productos y nunca juegos. Una plataforma se entrega
//   dando una cuenta (usuario y clave), y eso se puede tener guardado
//   esperando comprador. Una recarga de juego no: ahí se le carga saldo a
//   la cuenta del cliente con SU ID de jugador, que recién se sabe cuando
//   el cliente lo escribe. No hay stock posible de eso.
//   Las recargas siguen con su flujo de WhatsApp en recarga-juegos.html.
//
// LO MÁS IMPORTANTE DE ACÁ
//   Esta pantalla muestra contraseñas reales en la pantalla de alguien.
//   Por eso las credenciales van tapadas por defecto y hay que tocar para
//   verlas: alcanza con que alguien te mire el monitor de reojo.
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';
import { tengoPermiso, carteSinPermiso } from './admin-permiso.js';

const $ = id => document.getElementById(id);
const aviso = (t, tipo) => (window.avisoAdmin ? window.avisoAdmin(t, tipo) : console.log(t));

const escapar = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Lo que se lee de la base en cada refresco
let PRODUCTOS = [];   // [{ id, nombre }]  (sin imagen: pesa demasiado, ver cargar())
let CUENTAS   = [];   // [{ id, producto_id, estado, ... }]
let abierto   = null; // qué producto está desplegado en la lista


// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .st-wrap { max-width: 1180px; margin: 0 auto; padding: 22px 20px 60px; }

  .st-barra {
    display: flex; align-items: center; gap: 12px;
    flex-wrap: wrap; margin-bottom: 20px;
  }
  .st-barra .buscador { flex: 1; min-width: 200px; }

  /* ---------- Filas por producto ---------- */
  .st-prod {
    background: var(--panel);
    border: 1px solid var(--borde);
    border-radius: 12px;
    margin-bottom: 10px;
    overflow: hidden;
  }
  .st-cab {
    display: flex; align-items: center; gap: 14px;
    padding: 13px 16px;
    cursor: pointer;
    user-select: none;
  }
  .st-cab:hover { background: var(--panel-2); }
  .st-cab img {
    width: 38px; height: 38px; flex: none;
    border-radius: 8px; object-fit: cover;
    background: var(--panel-2);
  }
  .st-nombre { flex: 1; min-width: 0; font-weight: 600; color: var(--tinta);
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .st-pill {
    font-size: 12px; font-weight: 700;
    padding: 3px 9px; border-radius: 99px;
    font-variant-numeric: tabular-nums;
    flex: none;
  }
  .st-pill.libre  { background: rgba(21,128,61,.11);  color: #15803d; }
  .st-pill.cero   { background: rgba(220,38,38,.10);  color: #dc2626; }
  .st-pill.dadas  { background: var(--panel-2);        color: var(--gris); }

  .st-flecha { color: var(--gris-dim); font-size: 13px; flex: none; transition: transform .15s; }
  .st-prod.abierto .st-flecha { transform: rotate(90deg); }

  /* ---------- Cuentas de un producto ---------- */
  .st-cuentas { border-top: 1px solid var(--borde); padding: 6px 0; }
  .st-cuenta {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 16px 9px 68px;
    font-size: 13.5px;
    border-bottom: 1px solid var(--borde);
  }
  .st-cuenta:last-child { border-bottom: none; }
  .st-cuenta .usuario {
    flex: 1; min-width: 0;
    font-family: ui-monospace, Consolas, monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .st-estado { font-size: 11.5px; font-weight: 700; letter-spacing: .04em;
               text-transform: uppercase; flex: none; }
  .st-estado.libre     { color: #15803d; }
  .st-estado.entregada { color: var(--gris-dim); }
  .st-estado.anulada   { color: #dc2626; text-decoration: line-through; }

  /* La contraseña tapada hasta que la pidan */
  .st-clave {
    font-family: ui-monospace, Consolas, monospace;
    background: var(--panel-2);
    padding: 2px 8px; border-radius: 6px;
    cursor: pointer; flex: none;
    border: 1px solid var(--borde);
    font-size: 12.5px;
  }
  .st-clave.tapada { color: transparent; text-shadow: 0 0 7px rgba(20,22,26,.55); }
  .st-clave:hover  { border-color: var(--rojo); }

  .st-mini {
    background: none; border: 1px solid var(--borde);
    color: var(--gris); border-radius: 7px;
    padding: 4px 9px; font-size: 12px; cursor: pointer;
    font-family: inherit; flex: none;
  }
  .st-mini:hover { border-color: var(--rojo); color: var(--rojo); }

  .st-vacio { padding: 46px 20px; text-align: center; color: var(--gris-dim); }
  .st-vacio .emo { font-size: 40px; margin-bottom: 10px; }

  /* ---------- Modal de carga ---------- */
  .st-fondo {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(20,22,26,.42); backdrop-filter: blur(3px);
    display: none; overflow-y: auto; padding: 24px 16px;
  }
  .st-fondo.abierto { display: block; }
  .st-modal {
    max-width: 660px; margin: 0 auto;
    background: var(--panel); border: 1px solid var(--borde);
    border-radius: 15px; box-shadow: var(--sombra-alta);
  }
  .st-modal h3 { margin: 0; font-size: 17px; color: var(--tinta); }
  .st-mcab {
    display: flex; align-items: center; gap: 12px;
    padding: 18px 22px; border-bottom: 1px solid var(--borde);
  }
  .st-mcuerpo { padding: 20px 22px; }
  .st-mpie {
    display: flex; gap: 10px; justify-content: flex-end;
    padding: 16px 22px; border-top: 1px solid var(--borde);
  }
  .st-campo { margin-bottom: 15px; }
  .st-campo label {
    display: block; font-size: 12.5px; font-weight: 600;
    color: var(--gris); margin-bottom: 6px;
  }
  .st-campo input, .st-campo select, .st-campo textarea {
    width: 100%; padding: 10px 12px;
    background: var(--panel-2); border: 1px solid var(--borde);
    border-radius: 8px; color: var(--texto);
    font-size: 14px; font-family: inherit;
  }
  .st-campo textarea {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 13px; min-height: 150px; resize: vertical; line-height: 1.6;
  }
  .st-campo input:focus, .st-campo select:focus, .st-campo textarea:focus {
    outline: none; border-color: var(--rojo);
  }
  .st-fila2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .st-ayuda { font-size: 12.5px; color: var(--gris-dim); margin-top: 5px; line-height: 1.5; }

  /* Vista previa de lo que se va a cargar */
  .st-previa {
    border: 1px solid var(--borde); border-radius: 9px;
    max-height: 210px; overflow-y: auto; margin-top: 4px;
  }
  .st-previa table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .st-previa th {
    position: sticky; top: 0; background: var(--panel-2);
    text-align: left; padding: 7px 10px; font-size: 11px;
    text-transform: uppercase; letter-spacing: .06em; color: var(--gris-dim);
  }
  .st-previa td {
    padding: 6px 10px; border-top: 1px solid var(--borde);
    font-family: ui-monospace, Consolas, monospace;
    max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .st-previa tr.mala td { background: rgba(220,38,38,.06); color: #dc2626; }

  .st-resumen-previa { font-size: 13px; margin-top: 9px; font-weight: 600; }
  .st-resumen-previa .bien { color: #15803d; }
  .st-resumen-previa .mal  { color: #dc2626; }

  @media (max-width: 640px) {
    .st-cuenta { padding-left: 16px; flex-wrap: wrap; }
    .st-fila2  { grid-template-columns: 1fr; }
  }
`;
document.head.appendChild(css);


// ============================================================
// 2. LA VISTA
// ============================================================
$('vistaStock').innerHTML = `
  <div class="st-wrap">
    <section class="resumen" style="margin-bottom:22px;">
      <div class="metrica"><div class="metrica-n ok"   id="stLibres">–</div><div class="metrica-l">Cuentas libres</div></div>
      <div class="metrica"><div class="metrica-n"      id="stDadas">–</div><div class="metrica-l">Entregadas</div></div>
      <div class="metrica"><div class="metrica-n warn" id="stSinStock">–</div><div class="metrica-l">Productos sin stock</div></div>
      <div class="metrica"><div class="metrica-n"      id="stInvertido">–</div><div class="metrica-l">Invertido en stock</div></div>
    </section>

    <div class="st-barra">
      <div class="buscador">
        <span class="lupa">🔍</span>
        <input type="search" id="stBuscar" placeholder="Buscar producto…" autocomplete="off">
      </div>
      <button class="btn btn-fantasma" id="stRefrescar">↻ Actualizar</button>
      <button class="btn btn-primario" id="stCargar">+ Cargar cuentas</button>
    </div>

    <div id="stLista"></div>
  </div>

  <!-- ===== Modal: cargar cuentas de a muchas ===== -->
  <div class="st-fondo" id="stFondo">
    <div class="st-modal">
      <div class="st-mcab">
        <h3>Cargar cuentas</h3>
      </div>
      <div class="st-mcuerpo">
        <div class="st-campo">
          <label for="stProducto">¿De qué producto son?</label>
          <select id="stProducto"></select>
        </div>

        <div class="st-fila2">
          <div class="st-campo">
            <label for="stSeparador">Separador</label>
            <select id="stSeparador">
              <option value="|">Barra vertical   a@b.com | clave</option>
              <option value=":">Dos puntos       a@b.com : clave</option>
              <option value=",">Coma             a@b.com , clave</option>
              <option value="	">Tabulación (pegado de Excel)</option>
            </select>
            <div class="st-ayuda">
              Elegí uno que tus contraseñas NO tengan adentro.
              Mirá la vista previa para confirmar que partió bien.
            </div>
          </div>
          <div class="st-campo">
            <label for="stCosto">Costo por cuenta (opcional)</label>
            <input type="number" id="stCosto" step="0.01" min="0" placeholder="Ej: 45">
            <div class="st-ayuda">Lo que te costó cada una. Sirve para saber si ganás.</div>
          </div>
        </div>

        <div class="st-campo">
          <label for="stVence">Vencen el (opcional)</label>
          <input type="date" id="stVence">
          <div class="st-ayuda">
            Para cuentas renovables. Las que vencen antes se entregan primero,
            así no se te quedan venciendo en el cajón.
          </div>
        </div>

        <div class="st-campo">
          <label for="stTexto">Una cuenta por línea</label>
          <textarea id="stTexto" spellcheck="false"
                    placeholder="usuario | clave | perfil | pin | nota&#10;&#10;juan@correo.com | Abc12345 | Perfil 1 | 1234&#10;maria@correo.com | Xyz98765 | Perfil 2"></textarea>
          <div class="st-ayuda">
            Solo <strong>usuario</strong> y <strong>clave</strong> son obligatorios.
            Perfil, PIN y nota son opcionales: dejá el hueco vacío si no aplican.
          </div>
        </div>

        <div class="st-campo" style="margin-bottom:0;">
          <label>Vista previa</label>
          <div class="st-previa" id="stPrevia"></div>
          <div class="st-resumen-previa" id="stResumenPrevia"></div>
        </div>
      </div>
      <div class="st-mpie">
        <button class="btn btn-fantasma" id="stCancelar">Cancelar</button>
        <button class="btn btn-primario" id="stGuardar" disabled>Cargar</button>
      </div>
    </div>
  </div>
`;


// ============================================================
// 3. LEER DE LA BASE
// ============================================================
async function cargarTodo() {
  // Igual que en ventas: RLS filtra en silencio, así que sin este chequeo
  // un usuario sin permiso vería "todavía no cargaste ninguna cuenta"
  // teniendo el stock lleno.
  const permiso = await tengoPermiso();
  if (!permiso.puede) {
    $('stLista').innerHTML = carteSinPermiso(permiso.motivo, 'st-vacio');
    ['stLibres','stDadas','stSinStock','stInvertido'].forEach(id => { $(id).textContent = '–'; });
    return;
  }

  $('stRefrescar').disabled = true;

  const [rProd, rCuentas] = await Promise.all([
    // Sin la columna imagen a propósito: entre todas pesan 17 MB y la
    // consulta se cortaba por tiempo. Acá alcanza con el nombre.
    sbAdmin.from('productos').select('id, nombre').order('orden'),
    sbAdmin.from('cuentas').select('*').order('creada_en', { ascending: false })
  ]);

  $('stRefrescar').disabled = false;

  if (rProd.error)    { fallo(rProd.error);    return; }
  if (rCuentas.error) { fallo(rCuentas.error); return; }

  PRODUCTOS = rProd.data;
  CUENTAS   = rCuentas.data;

  llenarSelectorProductos();
  metricas();
  listar();
}

function fallo(error) {
  console.error(error);
  const rls = (error.message || '').toLowerCase().includes('permission')
           || error.code === '42501';
  $('stLista').innerHTML = `
    <div class="st-vacio">
      <div class="emo">🔒</div>
      <h3>No se pudo leer el stock</h3>
      <p>${escapar(error.message)}</p>
      ${rls ? '<p>Tu usuario no está en la tabla <code>admins</code>. Está explicado en <code>supabase/02-seguridad.sql</code>.</p>' : ''}
    </div>`;
}


// ============================================================
// 4. MÉTRICAS
// ============================================================
function metricas() {
  const libres = CUENTAS.filter(c => c.estado === 'libre');
  const dadas  = CUENTAS.filter(c => c.estado === 'entregada');

  // Un producto "sin stock" es uno que ya vendiste alguna vez y se quedó
  // sin cuentas. Los que nunca tuvieron no cuentan: no todos los productos
  // se entregan con stock (Spotify va a correo del cliente, por ejemplo).
  const conHistoria = new Set(CUENTAS.map(c => c.producto_id));
  const conLibres   = new Set(libres.map(c => c.producto_id));
  const secos       = [...conHistoria].filter(id => !conLibres.has(id));

  const invertido = libres.reduce((s, c) => s + (Number(c.costo) || 0), 0);

  $('stLibres').textContent   = libres.length;
  $('stDadas').textContent    = dadas.length;
  $('stSinStock').textContent = secos.length;
  $('stInvertido').textContent = invertido > 0 ? `${invertido.toFixed(0)} Bs` : '–';
}


// ============================================================
// 5. LA LISTA
// ============================================================
function listar() {
  const filtro = ($('stBuscar').value || '').trim().toLowerCase();

  // Solo se listan los productos que tienen alguna cuenta, más los que
  // coincidan con la búsqueda. Mostrar los 226 productos con "0 libres"
  // sería una pared de ceros: la mayoría no se entrega con stock.
  const conAlgo = new Set(CUENTAS.map(c => c.producto_id));

  const lista = PRODUCTOS.filter(p => {
    if (filtro) return p.nombre.toLowerCase().includes(filtro);
    return conAlgo.has(p.id);
  });

  if (PRODUCTOS.length === 0) {
    $('stLista').innerHTML = `
      <div class="st-vacio">
        <div class="emo">📦</div>
        <h3>Todavía no hay productos en Supabase</h3>
        <p>El stock se carga contra un producto, así que primero hay que
           copiar el catálogo.<br>Es el <strong>paso 5</strong> de
           <code>MUDANZA-SUPABASE.md</code>.</p>
      </div>`;
    return;
  }

  if (lista.length === 0) {
    $('stLista').innerHTML = `
      <div class="st-vacio">
        <div class="emo">${filtro ? '🔍' : '🔑'}</div>
        <h3>${filtro ? 'Ningún producto con ese nombre' : 'Todavía no cargaste ninguna cuenta'}</h3>
        <p>${filtro
             ? 'Probá con otras letras.'
             : 'Tocá <strong>+ Cargar cuentas</strong> y pegá las que compraste.'}</p>
      </div>`;
    return;
  }

  $('stLista').innerHTML = lista.map(p => {
    const suyas  = CUENTAS.filter(c => c.producto_id === p.id);
    const libres = suyas.filter(c => c.estado === 'libre').length;
    const dadas  = suyas.filter(c => c.estado === 'entregada').length;
    const desplegado = abierto === p.id;

    // La inicial del nombre como miniatura, igual que en la tabla de
    // productos: las imágenes ya no se traen en esta vista (ver arriba).
    const letra   = ([...String(p.nombre || '').trim()][0] || '?').toUpperCase();
    const inicial = 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#eceef1"/><text x="32" y="33" font-family="Arial" font-size="26" font-weight="bold" fill="#9aa0ab" text-anchor="middle" dominant-baseline="central">${letra}</text></svg>`);

    return `
      <div class="st-prod ${desplegado ? 'abierto' : ''}" data-prod="${p.id}">
        <div class="st-cab">
          <img src="${inicial}" alt="">
          <span class="st-nombre">${escapar(p.nombre)}</span>
          <span class="st-pill ${libres > 0 ? 'libre' : 'cero'}">${libres} libre${libres === 1 ? '' : 's'}</span>
          ${dadas ? `<span class="st-pill dadas">${dadas} entregada${dadas === 1 ? '' : 's'}</span>` : ''}
          <button class="st-mini" data-cargar="${p.id}">+ Cargar</button>
          <span class="st-flecha">▸</span>
        </div>
        ${desplegado ? filasDeCuentas(suyas) : ''}
      </div>`;
  }).join('');
}

function filasDeCuentas(cuentas) {
  if (cuentas.length === 0) {
    return `<div class="st-cuentas"><div class="st-cuenta">Sin cuentas cargadas.</div></div>`;
  }

  return `<div class="st-cuentas">` + cuentas.map(c => {
    const cred  = c.credenciales || {};
    const clave = cred.clave || cred.password || '';
    return `
      <div class="st-cuenta">
        <span class="usuario">${escapar(cred.usuario || cred.email || '(sin usuario)')}</span>
        ${clave ? `<span class="st-clave tapada" data-clave title="Tocar para ver / copiar">${escapar(clave)}</span>` : ''}
        ${cred.perfil ? `<span style="color:var(--gris-dim);font-size:12.5px;">${escapar(cred.perfil)}</span>` : ''}
        ${c.vence_en ? `<span style="color:var(--gris-dim);font-size:12px;">vence ${escapar(c.vence_en)}</span>` : ''}
        <span class="st-estado ${c.estado}">${c.estado}</span>
        ${c.estado === 'libre'
          ? `<button class="st-mini" data-anular="${c.id}">Anular</button>`
          : ''}
      </div>`;
  }).join('') + `</div>`;
}

// Los productos guardan rutas relativas a la raíz del sitio, y el panel
// vive en /admin/. Igual que en admin-productos.js.
function urlImagen(img) {
  const s = String(img || '');
  if (!s) return '';
  if (s.startsWith('http') || s.startsWith('data:')) return s;
  return '../' + s;
}


// ============================================================
// 6. INTERACCIÓN DE LA LISTA
// ============================================================
$('stLista').addEventListener('click', async e => {
  // --- Ver / copiar una contraseña ---
  const clave = e.target.closest('[data-clave]');
  if (clave) {
    if (clave.classList.contains('tapada')) {
      clave.classList.remove('tapada');
    } else {
      try {
        await navigator.clipboard.writeText(clave.textContent);
        aviso('Contraseña copiada', 'ok');
      } catch {
        // Sin permiso de portapapeles (pasa en http:// que no sea localhost).
        // No es grave: queda destapada y se copia a mano.
        clave.classList.remove('tapada');
      }
    }
    return;
  }

  // --- Cargar cuentas de este producto ---
  const cargar = e.target.closest('[data-cargar]');
  if (cargar) {
    abrirModal(cargar.dataset.cargar);
    return;
  }

  // --- Anular una cuenta ---
  const anular = e.target.closest('[data-anular]');
  if (anular) {
    await anularCuenta(anular.dataset.anular);
    return;
  }

  // --- Desplegar / plegar el producto ---
  const cab = e.target.closest('.st-cab');
  if (cab) {
    const id = cab.closest('[data-prod]').dataset.prod;
    abierto = (abierto === id) ? null : id;
    listar();
  }
});

$('stBuscar').addEventListener('input', listar);
$('stRefrescar').addEventListener('click', cargarTodo);
$('stCargar').addEventListener('click', () => abrirModal(null));

// Anular = "esta cuenta se cayó, no la vendas". No se borra: si ya se
// entregó, el pedido tiene que seguir apuntando a algo.
async function anularCuenta(id) {
  const { error } = await sbAdmin.from('cuentas')
    .update({ estado: 'anulada' }).eq('id', id);

  if (error) { aviso(`No se pudo anular: ${error.message}`, 'error'); return; }
  aviso('Cuenta anulada: ya no se va a entregar', 'ok');
  await cargarTodo();
}


// ============================================================
// 7. EL MODAL DE CARGA
// ============================================================
function llenarSelectorProductos() {
  $('stProducto').innerHTML = PRODUCTOS
    .map(p => `<option value="${p.id}">${escapar(p.nombre)}</option>`)
    .join('');
}

function abrirModal(productoId) {
  if (PRODUCTOS.length === 0) {
    aviso('Primero hay que copiar el catálogo a Supabase (paso 5)', 'error');
    return;
  }
  if (productoId) $('stProducto').value = productoId;
  $('stTexto').value = '';
  $('stCosto').value = '';
  $('stVence').value = '';
  refrescarPrevia();
  $('stFondo').classList.add('abierto');
  $('stTexto').focus();
}

function cerrarModal() { $('stFondo').classList.remove('abierto'); }

$('stCancelar').addEventListener('click', cerrarModal);
$('stFondo').addEventListener('click', e => { if (e.target === $('stFondo')) cerrarModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('stFondo').classList.contains('abierto')) cerrarModal();
});

$('stTexto').addEventListener('input', refrescarPrevia);
$('stSeparador').addEventListener('change', refrescarPrevia);


// ------------------------------------------------------------
// Interpretar el texto pegado
// ------------------------------------------------------------
// La vista previa es la red de seguridad de todo esto. Elegir separador
// siempre puede salir mal —una contraseña con "|" adentro, por ejemplo—
// y ningún parser lo va a adivinar. Lo que sí se puede es MOSTRAR cómo
// quedó partido antes de guardar, para que el error se vea a tiempo.
function interpretar() {
  const sep    = $('stSeparador').value;
  const lineas = $('stTexto').value.split('\n');

  return lineas
    .map((linea, i) => ({ linea: linea.trim(), n: i + 1 }))
    .filter(x => x.linea !== '')
    .map(({ linea, n }) => {
      const partes = linea.split(sep).map(p => p.trim());
      const [usuario, clave, perfil, pin, nota] = partes;

      const cred = { usuario: usuario || '' };
      if (clave)  cred.clave  = clave;
      if (perfil) cred.perfil = perfil;
      if (pin)    cred.pin    = pin;
      if (nota)   cred.notas  = nota;

      // Una línea sin usuario o sin clave no sirve para entregar nada.
      // Se muestra en rojo en la previa y no se carga.
      const mala = !usuario || !clave;

      return { n, cred, mala, partes: partes.length };
    });
}

function refrescarPrevia() {
  const filas  = interpretar();
  const buenas = filas.filter(f => !f.mala);
  const malas  = filas.filter(f => f.mala);

  if (filas.length === 0) {
    $('stPrevia').innerHTML = `<div style="padding:22px;text-align:center;color:var(--gris-dim);font-size:13px;">
      Pegá las cuentas arriba y acá vas a ver cómo quedaron partidas.</div>`;
    $('stResumenPrevia').textContent = '';
    $('stGuardar').disabled = true;
    return;
  }

  $('stPrevia').innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Usuario</th><th>Clave</th><th>Perfil</th><th>PIN</th></tr></thead>
      <tbody>
        ${filas.map(f => `
          <tr class="${f.mala ? 'mala' : ''}">
            <td>${f.n}</td>
            <td>${escapar(f.cred.usuario) || '<em>falta</em>'}</td>
            <td>${escapar(f.cred.clave)   || '<em>falta</em>'}</td>
            <td>${escapar(f.cred.perfil || '')}</td>
            <td>${escapar(f.cred.pin || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  $('stResumenPrevia').innerHTML =
    `<span class="bien">${buenas.length} cuenta${buenas.length === 1 ? '' : 's'} para cargar</span>` +
    (malas.length
      ? ` · <span class="mal">${malas.length} línea${malas.length === 1 ? '' : 's'} sin usuario o sin clave (no se cargan)</span>`
      : '');

  $('stGuardar').disabled = buenas.length === 0;
}


// ------------------------------------------------------------
// Guardar
// ------------------------------------------------------------
$('stGuardar').addEventListener('click', async () => {
  const buenas = interpretar().filter(f => !f.mala);
  if (buenas.length === 0) return;

  const productoId = $('stProducto').value;
  const costo      = parseFloat($('stCosto').value);
  const vence      = $('stVence').value || null;

  const filas = buenas.map(f => ({
    producto_id:  productoId,
    credenciales: f.cred,
    costo:        Number.isFinite(costo) ? costo : null,
    vence_en:     vence
  }));

  $('stGuardar').disabled = true;
  $('stGuardar').textContent = 'Cargando…';

  const { error } = await sbAdmin.from('cuentas').insert(filas);

  $('stGuardar').disabled = false;
  $('stGuardar').textContent = 'Cargar';

  if (error) {
    console.error(error);
    aviso(`No se pudo cargar: ${error.message}`, 'error');
    return;
  }

  const nombre = PRODUCTOS.find(p => p.id === productoId)?.nombre || '';
  aviso(`✓ ${filas.length} cuenta${filas.length === 1 ? '' : 's'} de "${nombre}" en stock`, 'ok');
  cerrarModal();
  abierto = productoId;      // dejarlo desplegado para que se vean
  await cargarTodo();
});


// ============================================================
// 8. ARRANQUE
// ============================================================
// No se carga nada hasta que abras la pestaña. Son dos consultas que la
// mayoría de las veces del día no vas a mirar, y el panel abre en
// Productos.
let yaCargado = false;
document.addEventListener('vista-cambiada', e => {
  if (e.detail.vista !== 'stock') return;
  if (!yaCargado) { yaCargado = true; cargarTodo(); }
});

console.log('%c✓ Stock de cuentas listo', 'color:#22c55e;font-weight:bold');
