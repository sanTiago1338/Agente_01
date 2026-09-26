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
let PRODUCTOS = [];   // [{ id, nombre, imagen, descripcion, categoria, activo, rebaja_auto, precio, ... }]
let CUENTAS   = [];   // [{ id, producto_id, estado, costo, ... }]
let VENDIDAS  = new Map();   // producto_id -> unidades pagadas en los últimos 30 días
let REBAJAS   = new Map();   // producto_id -> Bs que baja hoy (solo los que bajan algo)
let abierto   = null; // qué producto está desplegado en la lista

// Lo último que te costó una cuenta de este producto, o null si nunca lo
// anotaste. CUENTAS viene de la más nueva a la más vieja, así que la
// primera con costo es la más reciente.
function ultimoCosto(productoId) {
  const c = CUENTAS.find(x => x.producto_id === productoId && x.costo != null);
  return c ? Number(c.costo) : null;
}


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

  /* Las pastillas y el botón viajan juntos. En una pantalla ancha se ven
     igual que cuando eran hermanos sueltos; en uno angosto se bajan de
     renglón los tres de una vez, en vez de robarle el ancho al nombre. */
  .st-acciones { display: flex; align-items: center; gap: 10px; flex: none; }

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
  .st-mini.seguro, .st-mini.seguro:hover { background: #dc2626; border-color: #dc2626; color: #fff; }

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

  /* ---------- Te conviene cargar ----------
     Lo que más se vende y no tiene cuentas: ahí es donde la entrega
     automática rinde más. */
  .st-sugerir {
    background: var(--panel); border: 1px solid var(--borde);
    border-radius: 12px; padding: 14px 16px 6px; margin-bottom: 18px;
  }
  .st-sugerir h3 { margin: 0; font-size: 15px; color: var(--tinta); }
  .st-sugerir .sub { margin: 3px 0 8px; font-size: 12.5px; color: var(--gris-dim); line-height: 1.5; }
  .st-sug {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 0; border-top: 1px solid var(--borde); font-size: 13.5px;
  }
  .st-sug .nom {
    flex: 1; min-width: 0; font-weight: 600; color: var(--tinta);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .st-sug .vendidas { color: var(--gris); font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .st-sugerir .bien { padding: 10px 0 12px; border-top: 1px solid var(--borde); font-size: 13px; color: #15803d; }

  /* ---------- El costo ----------
     Sin costo el panel no puede decir cuánto ganás, y la rebaja automática
     no sabe hasta dónde puede bajar (se queda en la mitad del precio). */
  .st-aviso-costo {
    padding: 11px 14px; border-radius: 10px; margin-bottom: 14px;
    background: rgba(180,83,9,.09); border: 1px solid rgba(180,83,9,.28);
    color: #7c3d06; font-size: 13px; line-height: 1.5;
  }
  .st-pill.sincosto { background: rgba(180,83,9,.10); color: #b45309; }
  .st-costo-fila {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 16px 10px 68px;
    background: rgba(180,83,9,.06); border-bottom: 1px solid var(--borde);
    font-size: 13px; color: #7c3d06;
  }
  .st-costo-fila input {
    width: 110px; padding: 6px 9px;
    border: 1px solid var(--borde); border-radius: 7px;
    background: var(--panel); color: var(--texto); font: inherit;
  }
  .st-costo-fila input:focus { outline: none; border-color: var(--rojo); }
  .st-cuenta .costo { color: var(--gris-dim); font-size: 12px; flex: none; font-variant-numeric: tabular-nums; }
  .st-cuenta .costo.falta { color: #b45309; }
  .st-ayuda.falta { color: #b45309; font-weight: 600; }

  /* ---------- Rebaja automática ----------
     Se prende desde acá porque depende del stock: baja el precio mientras
     queden cuentas sin vender (ver supabase/05-cobros.sql, sección 13). */
  .st-rebaja {
    display: inline-flex; align-items: center; gap: 6px; flex: none;
    background: none; border: 1px solid var(--borde); color: var(--gris);
    border-radius: 99px; padding: 3px 11px 3px 4px;
    font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .st-rebaja:hover { border-color: rgba(21,128,61,.45); }
  .st-rebaja.on { color: #15803d; border-color: rgba(21,128,61,.35); background: rgba(21,128,61,.1); }
  .st-rebaja:disabled { opacity: .6; cursor: wait; }
  /* El interruptor, a la izquierda de la palabra: gris apagado, verde prendido */
  .st-rebaja .knob, .st-switch .knob {
    position: relative; flex: none;
    width: 24px; height: 14px; border-radius: 99px;
    background: rgba(20,22,26,.2); transition: background .15s;
  }
  .st-rebaja .knob::after, .st-switch .knob::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 10px; height: 10px; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25);
    transition: transform .15s;
  }
  .st-rebaja.on .knob, .st-switch input:checked + .knob { background: #16a34a; }
  .st-rebaja.on .knob::after, .st-switch input:checked + .knob::after { transform: translateX(10px); }

  .st-rebaja-fila {
    padding: 10px 16px 10px 68px;
    background: rgba(21,128,61,.06); border-bottom: 1px solid var(--borde);
    font-size: 13px; line-height: 1.5; color: #14532d;
  }
  .st-rebaja-fila .falta { color: #b45309; font-weight: 600; }

  /* El interruptor del modal de carga */
  .st-campo label.st-switch {
    display: flex; align-items: center; gap: 9px; margin: 0;
    font-size: 13.5px; font-weight: 700; color: var(--tinta); cursor: pointer;
  }
  .st-campo .st-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; padding: 0; }
  .st-switch input:focus-visible + .knob { outline: 2px solid #16a34a; outline-offset: 2px; }

  @media (max-width: 640px) {
    .st-rebaja-fila { padding-left: 16px; }
    .st-acciones { flex-wrap: wrap; row-gap: 8px; }
    .st-costo-fila { padding-left: 16px; }
    .st-sug { flex-wrap: wrap; gap: 6px 12px; }
    .st-sug .nom { flex: 1 1 100%; white-space: normal; }
    .st-cuenta { padding-left: 16px; flex-wrap: wrap; }
    .st-fila2  { grid-template-columns: 1fr; }

    /* El nombre del producto se lleva el primer renglón entero y puede
       ocupar dos líneas; las pastillas y el botón bajan al segundo.
       Antes competían por el mismo renglón y al nombre le quedaban 76 px:
       "Claude I…" — o directamente nada cuando había dos pastillas. */
    .st-cab { flex-wrap: wrap; gap: 9px 12px; padding: 12px 14px; }
    .st-nombre { white-space: normal; overflow: visible; line-height: 1.3; }
    .st-flecha { order: 2; margin-left: auto; }
    .st-acciones { order: 3; flex: 1 1 100%; padding-left: 50px; }
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

    <section class="st-sugerir" id="stSugerir" hidden></section>
    <div class="st-aviso-costo" id="stAvisoCosto" hidden></div>

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
            <label for="stCosto">Costo por cuenta (Bs)</label>
            <input type="number" id="stCosto" step="0.01" min="0" placeholder="Ej: 45">
            <!-- Se llena solo con el último costo que anotaste de este
                 producto: casi siempre es el mismo proveedor y el mismo
                 precio, y así no hay que acordarse. -->
            <div class="st-ayuda" id="stCostoAyuda">
              Lo que te costó cada una. Con esto el Inicio te muestra cuánto
              ganás, y la rebaja automática nunca baja de acá.
            </div>
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

        <!-- Arranca como está el producto: si ya la tenía prendida, sigue.
             Se guarda junto con las cuentas, al tocar "Cargar". -->
        <div class="st-campo">
          <label class="st-switch" for="stRebaja">
            <input type="checkbox" id="stRebaja">
            <span class="knob"></span>
            Rebaja automática para este producto
          </label>
          <div class="st-ayuda">
            Mientras queden cuentas sin vender, el precio baja <strong>2 Bs cada 3 días</strong>
            (contando desde la más vieja) y nunca baja del costo. En la tienda se ve como
            oferta. Cuando se venden, vuelve a su precio.
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

  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [rProd, rCuentas, rVendidas, rRebajas] = await Promise.all([
    // La imagen vuelve a viajar acá: desde que están en Storage es una URL
    // de unos 100 bytes. Cuando eran base64 sumaban 17 MB y esta misma
    // consulta se cortaba por tiempo.
    // Alfabético, no por "orden".
    //
    // "orden" es el que manda en la TIENDA: define qué producto va primero
    // en la vidriera, y ahí tiene todo el sentido. Pero acá vos no estás
    // vendiendo, estás buscando: tenés 226 productos y querés encontrar
    // "Netflix" para cargarle cuentas. Buscar por orden comercial en una
    // lista de 226 es imposible; alfabético es donde el ojo ya sabe mirar.
    //
    // El order() de Postgres ordena por bytes, así que "Ángel" caería
    // después de "Zulu". Se reordena en JavaScript más abajo, con
    // localeCompare, que sí entiende tildes y ñ.
    //
    // descripcion, categoria y activo son para "Te conviene cargar": los
    // que piden el correo del cliente o son seguidores no se entregan con
    // stock, y los apagados no se venden.
    //
    // rebaja_auto y los precios son para el interruptor de la rebaja
    // automática y para mostrar a cuánto se vende hoy.
    sbAdmin.from('productos')
      .select('id, nombre, imagen, descripcion, categoria, activo, rebaja_auto, precio, precio_oferta, oferta')
      .order('nombre'),
    sbAdmin.from('cuentas').select('*').order('creada_en', { ascending: false }),
    // Lo que se vendió (pagado) en el último mes, una fila por cuenta
    sbAdmin.from('pedidos').select('producto_id').gte('pagado_en', hace30),
    // Cuánto le toca hoy a cada producto con la rebaja prendida. La cuenta
    // la hace la base, que es la que cobra: acá solo se muestra.
    sbAdmin.rpc('rebajas_vigentes')
  ]);

  $('stRefrescar').disabled = false;

  if (rProd.error)    { fallo(rProd.error);    return; }
  if (rCuentas.error) { fallo(rCuentas.error); return; }

  // Si falla lo vendido no se corta nada: solo no hay sugerencias
  VENDIDAS = new Map();
  if (!rVendidas.error) {
    for (const p of rVendidas.data || []) {
      if (p.producto_id) VENDIDAS.set(p.producto_id, (VENDIDAS.get(p.producto_id) || 0) + 1);
    }
  }
  // Tampoco si falla la rebaja de hoy: el interruptor anda igual
  REBAJAS = new Map();
  if (!rRebajas.error) {
    for (const r of rRebajas.data || []) REBAJAS.set(r.producto_id, Number(r.rebaja) || 0);
  }

  // El orden alfabético de verdad lo hace acá localeCompare, no Postgres:
  // con 'es' entiende que la Á va con la A y que la Ñ va después de la N,
  // que es como lo busca una persona.
  PRODUCTOS = rProd.data.sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base', numeric: true })
  );
  // Las 'anuladas' son restos de antes: desde que "Anular" borra la fila no
  // se crea ninguna nueva, pero las viejas quedaron ensuciando la lista de
  // cada producto. Se van de la vista acá y de la base en borrarAnuladas(),
  // así en el stock quedan solo las libres y las entregadas.
  const anuladas = rCuentas.data.filter(c => c.estado === 'anulada');
  CUENTAS        = rCuentas.data.filter(c => c.estado !== 'anulada');
  if (anuladas.length) borrarAnuladas(anuladas.map(c => c.id));

  llenarSelectorProductos();
  metricas();
  sugerencias();
  avisoDeCosto();
  listar();
}

// Borra de la base las anuladas que quedaron de antes. No se espera el
// resultado: la pantalla ya las sacó, y si el borrado falla (RLS, sin red)
// lo único que pasa es que siguen escondidas y se reintenta la próxima vez.
async function borrarAnuladas(ids) {
  const { error } = await sbAdmin.from('cuentas').delete().in('id', ids);
  if (error) console.error('No se pudieron borrar las cuentas anuladas:', error);
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

  // Para que el contador rojo de "Stock" en el menú se ponga al día
  // (lo calcula admin-inicio.js, con la misma regla de la lista del Inicio)
  document.dispatchEvent(new CustomEvent('stock-cambiado'));
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
    const sinCostoLibres = suyas.filter(c => c.estado === 'libre' && c.costo == null).length;
    const desplegado = abierto === p.id;

    // Si la foto no carga se muestra la inicial del nombre, igual que en la
    // tabla de productos, en vez de un cuadrito roto.
    const letra   = ([...String(p.nombre || '').trim()][0] || '?').toUpperCase();
    const inicial = 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#eceef1"/><text x="32" y="33" font-family="Arial" font-size="26" font-weight="bold" fill="#9aa0ab" text-anchor="middle" dominant-baseline="central">${letra}</text></svg>`);

    return `
      <div class="st-prod ${desplegado ? 'abierto' : ''}" data-prod="${p.id}">
        <div class="st-cab">
          <img src="${escapar(urlImagen(p.imagen) || inicial)}" alt="" loading="lazy"
               onerror="this.onerror=null;this.src='${inicial}'">
          <span class="st-nombre">${escapar(p.nombre)}</span>
          <span class="st-acciones">
            <span class="st-pill ${libres > 0 ? 'libre' : 'cero'}">${libres} libre${libres === 1 ? '' : 's'}</span>
            ${dadas ? `<span class="st-pill dadas">${dadas} entregada${dadas === 1 ? '' : 's'}</span>` : ''}
            ${sinCostoLibres ? `<span class="st-pill sincosto" title="Cuentas libres sin costo anotado">sin costo</span>` : ''}
            ${botonRebaja(p)}
            <button class="st-mini" data-cargar="${p.id}">+ Cargar</button>
          </span>
          <span class="st-flecha">▸</span>
        </div>
        ${desplegado ? filaDeRebaja(p, suyas) + filasDeCuentas(suyas, p.id) : ''}
      </div>`;
  }).join('');
}

function filasDeCuentas(cuentas, productoId) {
  if (cuentas.length === 0) {
    return `<div class="st-cuentas"><div class="st-cuenta">Sin cuentas cargadas.</div></div>`;
  }

  // Las que no tienen costo (libres o ya entregadas) se completan de una:
  // así la ganancia del Inicio cuenta también lo que ya vendiste, y la
  // rebaja automática sabe hasta dónde puede bajar.
  const sinCosto = cuentas.filter(c => c.costo == null).length;
  const sugerido = ultimoCosto(productoId);
  const filaCosto = sinCosto ? `
    <div class="st-costo-fila">
      <span>${sinCosto} cuenta${sinCosto === 1 ? '' : 's'} sin costo anotado. ¿Cuánto te costó cada una?</span>
      <input type="number" step="0.01" min="0" placeholder="Bs" data-costo-de="${productoId}"
             value="${sugerido != null ? sugerido : ''}" aria-label="Costo por cuenta en bolivianos">
      <button class="st-mini" data-poner-costo="${productoId}">Guardar costo</button>
    </div>` : '';

  return `<div class="st-cuentas">` + filaCosto + cuentas.map(c => {
    const cred  = c.credenciales || {};
    const clave = cred.clave || cred.password || '';
    return `
      <div class="st-cuenta">
        <span class="usuario">${escapar(cred.usuario || cred.email || '(sin usuario)')}</span>
        ${clave ? `<span class="st-clave tapada" data-clave title="Tocar para ver / copiar">${escapar(clave)}</span>` : ''}
        ${cred.perfil ? `<span style="color:var(--gris-dim);font-size:12.5px;">${escapar(cred.perfil)}</span>` : ''}
        ${c.vence_en ? `<span style="color:var(--gris-dim);font-size:12px;">vence ${escapar(c.vence_en)}</span>` : ''}
        ${c.costo != null
          ? `<span class="costo">costo ${Number(c.costo).toFixed(2)} Bs</span>`
          : `<span class="costo falta">sin costo</span>`}
        <span class="st-estado ${c.estado}">${c.estado}</span>
        ${c.estado === 'libre'
          ? `<button class="st-mini" data-anular="${c.id}">Anular</button>`
          : ''}
      </div>`;
  }).join('') + `</div>`;
}

// ------------------------------------------------------------
// Rebaja automática
// ------------------------------------------------------------
// El interruptor vive en el stock y no en el producto porque es del
// stock: baja el precio mientras queden cuentas sin vender, contando desde
// la más vieja. Lo natural es prenderlo cuando cargás.
function botonRebaja(p) {
  const on  = p.rebaja_auto === true;
  const hoy = REBAJAS.get(p.id) || 0;
  // El interruptor y la palabra, nada más. Lo de hoy va en el título y
  // en la franja que aparece al desplegar el producto.
  const titulo = on
    ? `Rebaja automática prendida${hoy ? ` (hoy baja ${fmtBs(hoy)} Bs)` : ''}: tocá para apagarla y volver al precio normal`
    : 'Rebaja automática: mientras queden cuentas sin vender, el precio baja 2 Bs cada 3 días. Tocá para prenderla';
  return `<button class="st-rebaja ${on ? 'on' : ''}" data-rebaja="${p.id}" title="${titulo}" aria-pressed="${on}"><span class="knob"></span>Rebaja</button>`;
}

// Al desplegar un producto con la rebaja prendida: cuánto baja hoy, a
// cuánto se vende y hasta dónde puede llegar. Mismas reglas que la base.
function filaDeRebaja(p, cuentas) {
  if (p.rebaja_auto !== true) return '';

  const base   = (p.oferta && Number(p.precio_oferta) > 0) ? Number(p.precio_oferta) : Number(p.precio);
  const libres = cuentas.filter(c => c.estado === 'libre');
  const costos = libres.filter(c => c.costo != null).map(c => Number(c.costo));
  const hoy    = REBAJAS.get(p.id) || 0;

  let texto = '<strong>Rebaja automática prendida.</strong> ';
  if (!libres.length) {
    texto += 'Sin cuentas libres no baja nada: se vende a su precio.';
  } else if (hoy) {
    texto += `Hoy baja ${fmtBs(hoy)} Bs y se vende a <strong>${fmtBs(base - hoy)} Bs</strong> (precio normal ${fmtBs(base)} Bs).`;
  } else {
    texto += 'Hoy todavía no baja: empieza cuando la cuenta más vieja cumple 3 días sin venderse.';
  }

  if (libres.length && base > 0) {
    texto += costos.length
      ? ` Nunca baja de ${fmtBs(Math.max(...costos))} Bs, tu costo.`
      : ` <span class="falta">Sin costo anotado puede bajar hasta ${fmtBs(Math.round(base * 50) / 100)} Bs, la mitad del precio.</span>`;
  }
  return `<div class="st-rebaja-fila">${texto}</div>`;
}

// 12 -> "12" · 12.5 -> "12.50"
const fmtBs = n => Number.isInteger(n) ? String(n) : n.toFixed(2);

// Prende o apaga la rebaja de un producto. Devuelve true si se guardó.
async function guardarRebaja(productoId, prender) {
  // El select() es para saber si tocó la fila: con RLS, un update sin
  // permiso no da error, vuelve vacío.
  const { data, error } = await sbAdmin.from('productos')
    .update({ rebaja_auto: prender })
    .eq('id', productoId)
    .select('id');

  if (error || !(data || []).length) {
    aviso(`No se pudo ${prender ? 'prender' : 'apagar'} la rebaja: ${error ? error.message : 'sin permiso'}`, 'error');
    return false;
  }
  const p = PRODUCTOS.find(x => x.id === productoId);
  if (p) p.rebaja_auto = prender;
  return true;
}

async function alternarRebaja(productoId, boton) {
  const p = PRODUCTOS.find(x => x.id === productoId);
  if (!p || boton.disabled) return;
  const prender = p.rebaja_auto !== true;

  boton.disabled = true;
  const ok = await guardarRebaja(productoId, prender);
  boton.disabled = false;
  if (!ok) return;

  const sinCosto = CUENTAS.some(c => c.producto_id === productoId && c.estado === 'libre')
                && !CUENTAS.some(c => c.producto_id === productoId && c.estado === 'libre' && c.costo != null);
  aviso(prender
    ? `Rebaja automática prendida en "${p.nombre}"` +
      (sinCosto ? '. Anotá el costo: sin él puede bajar hasta la mitad del precio' : '')
    : `Rebaja automática apagada en "${p.nombre}": vuelve a su precio`, 'ok');
  await cargarTodo();
}

// ------------------------------------------------------------
// Te conviene cargar
// ------------------------------------------------------------
// Casi todos los productos se entregan por WhatsApp porque no tienen
// cuentas cargadas: cada venta pasa por vos. Esta lista dice dónde rinde
// más cargar: lo que más se vendió en el último mes y no tiene stock, o
// le quedan menos cuentas de las que se venden en una semana.
// Quedan afuera los que no se entregan con stock: los que piden el correo
// del cliente (se activan sobre SU cuenta), los seguidores y los apagados.
const MAX_SUGERENCIAS = 8;

function sugerencias() {
  const caja = $('stSugerir');
  // Sin ventas en el mes (o si no se pudieron leer) no hay nada que sugerir
  if (!VENDIDAS.size) { caja.hidden = true; return; }

  const libresDe  = id => CUENTAS.filter(c => c.producto_id === id && c.estado === 'libre').length;
  const noSeCarga = p => (p.descripcion || '').toLowerCase().includes('correo de cliente')
                      || p.categoria === 'seguidores' || p.activo === false;

  const lista = PRODUCTOS
    .filter(p => VENDIDAS.get(p.id) && !noSeCarga(p))
    .map(p => {
      const vendidas = VENDIDAS.get(p.id);
      return { p, vendidas, libres: libresDe(p.id), porSemana: Math.max(1, Math.ceil(vendidas / 4)) };
    })
    .filter(x => x.libres < x.porSemana)
    // Primero los que no tienen nada, y dentro de cada grupo los que más salen
    .sort((a, b) => (a.libres === 0) !== (b.libres === 0)
      ? (a.libres === 0 ? -1 : 1)
      : b.vendidas - a.vendidas)
    .slice(0, MAX_SUGERENCIAS);

  caja.hidden = false;
  caja.innerHTML = `
    <h3>Te conviene cargar</h3>
    <p class="sub">Lo que más vendiste en los últimos 30 días y no tiene cuentas (o le quedan
       menos de las que se venden en una semana). Con stock, esas ventas se entregan solas.</p>
    ${lista.length ? lista.map(x => `
      <div class="st-sug">
        <span class="nom">${escapar(x.p.nombre)}</span>
        <span class="vendidas">vendiste ${x.vendidas} en 30 días</span>
        <span class="st-pill ${x.libres ? 'libre' : 'cero'}">${x.libres ? `quedan ${x.libres}` : 'sin stock'}</span>
        <button class="st-mini" data-cargar="${x.p.id}">+ Cargar</button>
      </div>`).join('')
    : `<div class="bien">✓ Todo lo que más vendés tiene stock para una semana.</div>`}`;
}

// El aviso de arriba de la lista: cuántas cuentas libres no tienen costo
function avisoDeCosto() {
  const caja = $('stAvisoCosto');
  const n = CUENTAS.filter(c => c.estado === 'libre' && c.costo == null).length;
  caja.hidden = n === 0;
  if (!n) return;
  caja.innerHTML = `⚠️ <strong>${n} cuenta${n === 1 ? '' : 's'} libre${n === 1 ? '' : 's'} sin costo anotado.</strong>
    Abrí los productos que dicen "sin costo" y anotalo: sin costo no se ve cuánto ganás,
    y la rebaja automática puede bajar hasta la mitad del precio.`;
}

// Anota el costo en todas las cuentas de un producto que no lo tenían,
// libres y entregadas (así la ganancia cuenta también lo ya vendido).
async function ponerCosto(productoId, boton) {
  const campo = document.querySelector(`[data-costo-de="${productoId}"]`);
  const costo = parseFloat(campo && campo.value);
  if (!Number.isFinite(costo) || costo < 0) {
    aviso('Escribí el costo de cada cuenta en Bs (por ejemplo 45)', 'error');
    if (campo) campo.focus();
    return;
  }

  boton.disabled = true;
  const { data, error } = await sbAdmin.from('cuentas')
    .update({ costo })
    .eq('producto_id', productoId)
    .is('costo', null)
    .select('id');
  boton.disabled = false;

  if (error) { aviso(`No se pudo guardar el costo: ${error.message}`, 'error'); return; }
  const n = (data || []).length;
  aviso(`✓ Costo de ${costo.toFixed(2)} Bs anotado en ${n} cuenta${n === 1 ? '' : 's'}`, 'ok');
  await cargarTodo();
}

// Los productos guardan rutas relativas a la raíz del sitio, y el panel
// vive en /admin/. Igual que en admin-productos.js.
//
// Y las locales apuntan a Img/, que ya no existe: los originales se
// borraron por peso y quedaron solo las livianas de Img/opt. La tienda
// redirige en imgOptimizada(); acá hacía falta lo mismo, si no el panel
// muestra la letra gris en vez del logo.
function urlImagen(img) {
  const s = String(img || '');
  if (!s) return '';
  if (s.startsWith('http') || s.startsWith('data:')) return s;
  return '../' + aOptimizada(s);
}

// "Img/Claude.jpg" -> "Img/opt/Claude.jpg" · "Img/iQIYI VIP.png" -> ".../iQIYI VIP.jpg"
// Lo que ya apunta a Img/opt, o no es png/jpg (los .svg), pasa de largo.
function aOptimizada(ruta) {
  if (/^Img\/opt\//i.test(ruta)) return ruta;
  return ruta.replace(/^Img\/(.+)\.(png|jpe?g)$/i, 'Img/opt/$1.jpg');
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

  // --- Prender / apagar la rebaja automática ---
  const rebaja = e.target.closest('[data-rebaja]');
  if (rebaja) {
    await alternarRebaja(rebaja.dataset.rebaja, rebaja);
    return;
  }

  // --- Anotar el costo de las cuentas que no lo tienen ---
  const costo = e.target.closest('[data-poner-costo]');
  if (costo) {
    await ponerCosto(costo.dataset.ponerCosto, costo);
    return;
  }
  // Tocar el campo del costo no pliega el producto
  if (e.target.closest('.st-costo-fila')) return;

  // --- Anular una cuenta ---
  const anular = e.target.closest('[data-anular]');
  if (anular) {
    if (pedirAnular(anular)) await anularCuenta(anular.dataset.anular);
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

// "+ Cargar" en la lista de "Te conviene cargar"
$('stSugerir').addEventListener('click', e => {
  const cargar = e.target.closest('[data-cargar]');
  if (cargar) abrirModal(cargar.dataset.cargar);
});

// Enter en el campo del costo = "Guardar costo"
$('stLista').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const campo = e.target.closest('[data-costo-de]');
  if (!campo) return;
  const boton = document.querySelector(`[data-poner-costo="${campo.dataset.costoDe}"]`);
  if (boton) ponerCosto(campo.dataset.costoDe, boton);
});

// Anular = "esta cuenta se cayó, no la vendas", y se BORRA de la base.
// Antes quedaba marcada 'anulada' y el stock se llenaba de filas tachadas
// que no servían para nada. Lo que sí se guarda son las entregadas: esas
// tienen un pedido y un cliente apuntándoles.
//
// Borrar no tiene vuelta atrás, así que pide dos toques: el primero pone
// el botón en rojo y el segundo borra. Si no confirmás, vuelve solo.
function pedirAnular(btn) {
  if (btn.disabled) return false;
  if (btn.classList.contains('seguro')) { btn.disabled = true; return true; }

  btn.classList.add('seguro');
  btn.textContent = '¿Borrar?';
  setTimeout(() => {
    btn.classList.remove('seguro');
    btn.textContent = 'Anular';
  }, 4000);
  return false;
}

async function anularCuenta(id) {
  // Solo si sigue libre: entre que abriste la lista y tocaste, pudo
  // venderse. Una entregada no se borra nunca.
  // El select() es para saber cuántas borró de verdad: con RLS, un delete
  // que no alcanza a nadie no da error, vuelve vacío.
  const { data, error } = await sbAdmin.from('cuentas')
    .delete().eq('id', id).eq('estado', 'libre').select('id');

  if (error) { aviso(`No se pudo anular: ${error.message}`, 'error'); return; }
  if (!data.length) {
    aviso('No se borró: la cuenta ya no estaba libre (¿se acaba de vender?)', 'error');
  } else {
    aviso('Cuenta anulada y borrada del stock', 'ok');
  }
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
  $('stVence').value = '';
  costoTocado = false;
  sinCostoConfirmado = false;
  sugerirCosto();
  rebajaDelProducto();
  refrescarPrevia();
  $('stFondo').classList.add('abierto');
  $('stTexto').focus();
}

// ------------------------------------------------------------
// El costo al cargar
// ------------------------------------------------------------
// Se llena solo con lo último que anotaste de ese producto (casi siempre
// es el mismo proveedor y el mismo precio), mientras no lo cambies a mano.
// Y si queda vacío, "Cargar" pide confirmación una vez: sin costo no se ve
// la ganancia y la rebaja automática no sabe hasta dónde bajar.
let costoTocado = false;
let sinCostoConfirmado = false;

const AYUDA_COSTO = 'Lo que te costó cada una. Con esto el Inicio te muestra cuánto ' +
                    'ganás, y la rebaja automática nunca baja de acá.';

function sugerirCosto() {
  if (costoTocado) return;
  const c = ultimoCosto($('stProducto').value);
  $('stCosto').value = c != null ? c : '';
  pintarPedidoDeCosto(false);
}

function pintarPedidoDeCosto(pedir) {
  const ayuda = $('stCostoAyuda');
  ayuda.classList.toggle('falta', pedir);
  ayuda.textContent = pedir
    ? 'Falta el costo: sin él no vas a ver cuánto ganás con estas cuentas. ' +
      'Escribilo, o tocá "Cargar sin costo" si no lo sabés.'
    : AYUDA_COSTO;
  $('stGuardar').textContent = pedir ? 'Cargar sin costo' : 'Cargar';
}

// El interruptor de la rebaja arranca como está el producto elegido
function rebajaDelProducto() {
  const p = PRODUCTOS.find(x => x.id === $('stProducto').value);
  $('stRebaja').checked = p?.rebaja_auto === true;
}

$('stProducto').addEventListener('change', () => {
  sinCostoConfirmado = false;
  sugerirCosto();
  rebajaDelProducto();
});
$('stCosto').addEventListener('input', () => {
  costoTocado = true;
  sinCostoConfirmado = false;
  pintarPedidoDeCosto(false);
});

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

  // Sin costo: la primera vez se avisa, la segunda se carga igual
  if (!Number.isFinite(costo) && !sinCostoConfirmado) {
    sinCostoConfirmado = true;
    pintarPedidoDeCosto(true);
    $('stCosto').focus();
    return;
  }

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

  const producto = PRODUCTOS.find(p => p.id === productoId);
  let mensaje = `✓ ${filas.length} cuenta${filas.length === 1 ? '' : 's'} de "${producto?.nombre || ''}" en stock`;

  // La rebaja se guarda recién ahora, con las cuentas ya cargadas. Si
  // falla, guardarRebaja avisa aparte y las cuentas quedan igual.
  const conRebaja = $('stRebaja').checked;
  if (producto && conRebaja !== (producto.rebaja_auto === true)
      && await guardarRebaja(productoId, conRebaja)) {
    mensaje += conRebaja ? ' · rebaja automática prendida' : ' · rebaja automática apagada';
  }
  aviso(mensaje, 'ok');
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
