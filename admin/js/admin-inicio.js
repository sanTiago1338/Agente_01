// ============================================================
// TIAGO STORE · Inicio del panel
// ============================================================
// La pantalla de entrada: cómo viene la tienda, de un vistazo.
//
//   · Vendido hoy y en los últimos 7 días (con la semana anterior al lado)
//   · Lo que te espera: pagos por confirmar y pedidos para entregar a mano
//   · Ventas por día de las últimas dos semanas
//   · Productos a los que se les acaba el stock
//   · Últimos pedidos y lo más vendido del mes
//
// "Vendido" se cuenta igual que en Ventas: pedidos ENTREGADOS, en el día
// en que se entregaron. Así los dos números nunca se contradicen.
//
// Solo lee. Todo lo que se hace (confirmar, cargar stock) sigue en su
// vista: los botones de acá llevan hasta ahí.
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';
import { tengoPermiso, carteSinPermiso } from './admin-permiso.js';

const $ = id => document.getElementById(id);

// Un producto "se está quedando sin stock" cuando alguna vez tuvo cuentas
// cargadas, sigue a la venta y le quedan estas o menos.
const POCO_STOCK = 2;

// Los mismos colores y nombres de estado que usa Ventas
const ESTADOS = {
  sin_stock:      { txt: 'Sin stock',  color: '#dc2626', bg: 'rgba(220,38,38,.10)' },
  esperando_pago: { txt: 'Esperando',  color: '#b45309', bg: 'rgba(180,83,9,.10)' },
  pagado:         { txt: 'Pagado',     color: '#b45309', bg: 'rgba(180,83,9,.10)' },
  entregado:      { txt: 'Entregado',  color: '#15803d', bg: 'rgba(21,128,61,.10)' },
  vencido:        { txt: 'Vencido',    color: '#767c88', bg: 'rgba(20,22,26,.06)' },
  cancelado:      { txt: 'Cancelado',  color: '#767c88', bg: 'rgba(20,22,26,.06)' }
};


// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .ini-cab { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
  .ini-hola { margin: 0; font-size: 15px; color: var(--tinta-media); }
  .ini-hola b { color: var(--tinta); }
  .ini-actualizado { margin-left: auto; font-size: 12.5px; color: var(--tinta-tenue); }
  .ini-refrescar {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 12px; border-radius: 9px;
    border: 1px solid var(--borde-2); background: #fff;
    font: 600 13px 'Outfit', sans-serif; color: var(--tinta-media); cursor: pointer;
  }
  .ini-refrescar:hover { background: var(--superficie-2); color: var(--tinta); }
  .ini-refrescar:disabled { opacity: .5; cursor: wait; }

  /* ---- Cifras ---- */
  .ini-cifras {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .ini-cifra {
    position: relative;
    background: #fff;
    border: 1px solid var(--borde);
    border-radius: 14px;
    padding: 16px 16px 14px;
    box-shadow: var(--sombra);
    text-align: left;
    font-family: inherit;
    color: inherit;
  }
  button.ini-cifra { cursor: pointer; transition: border-color .15s, transform .15s; }
  button.ini-cifra:hover { border-color: var(--borde-2); transform: translateY(-2px); }
  .ini-cifra-l {
    display: flex; align-items: center; gap: 8px;
    font-size: 12.5px; font-weight: 600; color: var(--tinta-suave);
  }
  .ini-cifra-l .ico { width: 17px; height: 17px; }
  .ini-cifra-n {
    margin-top: 10px;
    font-size: 28px; font-weight: 800; letter-spacing: -.02em;
    color: var(--tinta); font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .ini-cifra-n small { font-size: 15px; font-weight: 700; color: var(--tinta-suave); margin-left: 3px; }
  .ini-cifra-s { margin-top: 6px; font-size: 12.5px; color: var(--tinta-suave); }
  .ini-sube  { color: var(--ok); font-weight: 700; }
  .ini-baja  { color: var(--error); font-weight: 700; }
  /* Lo que espera por vos: la raya de color dice "hay algo", el número
     y el texto dicen qué. Nunca el color solo. */
  .ini-cifra.alerta::before {
    content: ''; position: absolute; left: 0; top: 14px; bottom: 14px;
    width: 3px; border-radius: 0 3px 3px 0; background: var(--warn);
  }
  .ini-cifra.urgente::before { background: var(--error); }
  .ini-ir { position: absolute; top: 14px; right: 14px; color: var(--tinta-tenue); font-size: 15px; }

  /* ---- Tarjetas ---- */
  .ini-fila {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }
  .ini-caja {
    background: #fff;
    border: 1px solid var(--borde);
    border-radius: 14px;
    padding: 16px;
    box-shadow: var(--sombra);
    min-width: 0;
  }
  .ini-caja h3 {
    margin: 0 0 2px;
    font-size: 15px; font-weight: 800; color: var(--tinta);
  }
  .ini-caja .ini-sub { margin: 0 0 14px; font-size: 12.5px; color: var(--tinta-suave); }
  .ini-caja-cab { display: flex; align-items: flex-start; gap: 10px; }
  .ini-caja-cab > div { flex: 1; min-width: 0; }
  .ini-link {
    border: none; background: none; padding: 2px 0;
    font: 700 12.5px 'Outfit', sans-serif; color: var(--rojo); cursor: pointer; white-space: nowrap;
  }
  .ini-link:hover { text-decoration: underline; }

  /* ---- Gráfico de ventas por día ----
     Una sola serie (Bs vendidos): barras finas con la punta redondeada,
     una línea de base y dos guías tenues. El valor exacto de cada día
     sale al pasar el mouse o tocar la barra; arriba solo se rotula el
     día más alto. */
  .ini-graf { position: relative; height: 210px; margin-top: 6px; }
  .ini-graf-plot { position: absolute; left: 42px; right: 0; top: 18px; bottom: 26px; }
  .ini-guia {
    position: absolute; left: 0; right: 0; height: 1px; background: var(--separador);
  }
  .ini-guia span {
    position: absolute; right: calc(100% + 8px); top: -8px;
    font-size: 11px; color: var(--tinta-tenue); white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .ini-base { position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: var(--borde-2); }
  .ini-cols { position: absolute; inset: 0; display: flex; }
  .ini-col {
    flex: 1; position: relative; display: flex; justify-content: center; align-items: flex-end;
    cursor: default; outline: none;
  }
  .ini-barra {
    width: min(24px, 62%);
    background: var(--marca);
    border-radius: 4px 4px 0 0;
    min-height: 0;
    transition: opacity .15s;
  }
  .ini-col.cero .ini-barra { background: transparent; }
  .ini-cols:hover .ini-barra { opacity: .45; }
  .ini-cols .ini-col:hover .ini-barra,
  .ini-cols .ini-col:focus-visible .ini-barra { opacity: 1; }
  .ini-col:hover, .ini-col:focus-visible { background: rgba(20,22,26,.035); border-radius: 6px; }
  .ini-rotulo {
    position: absolute; left: 50%; transform: translateX(-50%);
    font-size: 11.5px; font-weight: 700; color: var(--tinta); white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .ini-dia {
    position: absolute; top: calc(100% + 7px); left: 50%; transform: translateX(-50%);
    font-size: 11px; color: var(--tinta-tenue); white-space: nowrap; text-align: center;
  }
  .ini-col.hoy .ini-dia { color: var(--tinta); font-weight: 700; }
  .ini-tip {
    position: absolute; z-index: 5; pointer-events: none;
    background: var(--tinta); color: #fff;
    font-size: 12px; line-height: 1.4; padding: 7px 10px; border-radius: 8px;
    white-space: nowrap; box-shadow: var(--sombra-alta);
    transform: translate(-50%, calc(-100% - 8px));
  }
  .ini-tip b { font-size: 13px; }
  .ini-tip[hidden] { display: none; }
  .ini-sr {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }

  /* ---- Listas ---- */
  .ini-lista { list-style: none; margin: 0; padding: 0; }
  .ini-lista li {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 0; border-top: 1px solid var(--separador);
    font-size: 13.5px; min-width: 0;
  }
  .ini-lista li:first-child { border-top: none; padding-top: 2px; }
  .ini-lista .nom {
    flex: 1; min-width: 0; color: var(--tinta);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ini-lista .num { font-weight: 800; color: var(--tinta); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ini-pill {
    display: inline-block; padding: 3px 9px; border-radius: 99px;
    font-size: 11.5px; font-weight: 700; white-space: nowrap;
  }
  .ini-pill.cero { background: rgba(220,38,38,.10); color: #b91c1c; }
  .ini-pill.poco { background: rgba(180,83,9,.10);  color: #92400e; }

  /* Lo más vendido: el nombre arriba y una barra fina que dice cuánto */
  .ini-top li { flex-wrap: wrap; row-gap: 6px; }
  .ini-top .bar { flex-basis: 100%; height: 6px; border-radius: 99px; background: var(--superficie-3); overflow: hidden; }
  .ini-top .bar i { display: block; height: 100%; border-radius: 99px; background: var(--marca); }
  .ini-top .cuantos { font-size: 12px; color: var(--tinta-suave); white-space: nowrap; }

  /* ---- Últimos pedidos ---- */
  .ini-tabla { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .ini-tabla th {
    text-align: left; font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--tinta-tenue); font-weight: 700; padding: 0 10px 8px 0;
    border-bottom: 1px solid var(--separador);
  }
  .ini-tabla td { padding: 10px 10px 10px 0; border-bottom: 1px solid var(--separador); color: var(--tinta-media); }
  .ini-tabla tr:last-child td { border-bottom: none; }
  .ini-tabla .n { color: var(--tinta-suave); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ini-tabla .p { color: var(--tinta); font-weight: 600; max-width: 1px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ini-tabla .b { font-weight: 800; color: var(--tinta); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ini-tabla .t { color: var(--tinta-tenue); white-space: nowrap; }
  .ini-tabla th.b { text-align: right; }

  .ini-vacio { padding: 26px 8px; text-align: center; color: var(--tinta-suave); font-size: 13.5px; }
  .ini-vacio b { display: block; color: var(--tinta); font-size: 14.5px; margin-bottom: 3px; }

  .ini-esq { background: var(--superficie-2); border-radius: 8px; animation: iniBrillo 1.2s ease-in-out infinite; }
  @keyframes iniBrillo { 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) { .ini-esq { animation: none; } }

  /* admin/index.html convierte toda tabla en tarjetas en el celular (así
     se lee la de Productos). Esta es chica y se lee bien como tabla. */
  @media (max-width: 820px) {
    #vistaInicio .ini-tabla        { display: table; }
    #vistaInicio .ini-tabla thead  { display: table-header-group; }
    #vistaInicio .ini-tabla tbody  { display: table-row-group; }
    #vistaInicio .ini-tabla tr {
      display: table-row; background: none; border: none;
      border-radius: 0; margin: 0; padding: 0;
    }
    #vistaInicio .ini-tabla th,
    #vistaInicio .ini-tabla td     { display: table-cell; width: auto; }
    #vistaInicio .ini-tabla td {
      padding: 10px 8px 10px 0; border-bottom: 1px solid var(--separador);
    }
    #vistaInicio .ini-tabla tr:last-child td { border-bottom: none; }
    #vistaInicio .ini-tabla td.p   { width: 100%; }
  }

  @media (max-width: 1100px) {
    .ini-cifras { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ini-fila { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 520px) {
    .ini-cifras { gap: 8px; }
    .ini-cifra { padding: 13px 12px 12px; }
    .ini-cifra-n { font-size: 22px; }
    .ini-cifra-n small { font-size: 13px; }
    #vistaInicio .ini-tabla .t { display: none; }
    .ini-dia.impar { display: none; }
    .ini-graf-plot { left: 36px; }
  }
`;
document.head.appendChild(css);


// ============================================================
// 2. ESQUELETO DE LA VISTA
// ============================================================
const ICO = id => `<svg class="ico"><use href="#i-${id}"/></svg>`;

$('vistaInicio').innerHTML = `
  <div class="ini-wrap">
    <div class="ini-cab">
      <p class="ini-hola" id="iniHola">Hola 👋</p>
      <span class="ini-actualizado" id="iniActualizado"></span>
      <button class="ini-refrescar" id="iniRefrescar">↻ Actualizar</button>
    </div>

    <div id="iniPermiso"></div>

    <div id="iniDatos">
    <div class="ini-cifras">
      <div class="ini-cifra">
        <div class="ini-cifra-l">${ICO('ventas')} Vendido hoy</div>
        <div class="ini-cifra-n" id="iniHoy">–</div>
        <div class="ini-cifra-s" id="iniHoyS">&nbsp;</div>
      </div>
      <div class="ini-cifra">
        <div class="ini-cifra-l">${ICO('inicio')} Últimos 7 días</div>
        <div class="ini-cifra-n" id="iniSemana">–</div>
        <div class="ini-cifra-s" id="iniSemanaS">&nbsp;</div>
      </div>
      <button class="ini-cifra" id="iniCajaEsperando" data-ir="ventas">
        <span class="ini-ir" aria-hidden="true">→</span>
        <div class="ini-cifra-l">${ICO('ventas')} Por confirmar</div>
        <div class="ini-cifra-n" id="iniEsperando">–</div>
        <div class="ini-cifra-s">Pagos esperando tu confirmación</div>
      </button>
      <button class="ini-cifra" id="iniCajaAtender" data-ir="ventas">
        <span class="ini-ir" aria-hidden="true">→</span>
        <div class="ini-cifra-l">${ICO('stock')} Para entregar a mano</div>
        <div class="ini-cifra-n" id="iniAtender">–</div>
        <div class="ini-cifra-s">Pagados sin cuenta en stock</div>
      </button>
    </div>

    <div class="ini-fila">
      <section class="ini-caja">
        <h3>Ventas por día</h3>
        <p class="ini-sub" id="iniGrafSub">Últimas dos semanas, en bolivianos</p>
        <div id="iniGraf"><div class="ini-esq" style="height:210px"></div></div>
      </section>

      <section class="ini-caja">
        <div class="ini-caja-cab">
          <div>
            <h3>Stock que se acaba</h3>
            <p class="ini-sub">Productos con ${POCO_STOCK} cuentas o menos</p>
          </div>
          <button class="ini-link" data-ir="stock">Ir a Stock</button>
        </div>
        <ul class="ini-lista" id="iniStock"><li><div class="ini-esq" style="height:90px;flex:1"></div></li></ul>
      </section>
    </div>

    <div class="ini-fila">
      <section class="ini-caja">
        <div class="ini-caja-cab">
          <div>
            <h3>Últimos pedidos</h3>
            <p class="ini-sub">Los más recientes, de todos los estados</p>
          </div>
          <button class="ini-link" data-ir="ventas">Ver todos</button>
        </div>
        <div id="iniPedidos"><div class="ini-esq" style="height:160px"></div></div>
      </section>

      <section class="ini-caja">
        <h3>Lo más vendido</h3>
        <p class="ini-sub">Últimos 30 días, por cantidad</p>
        <ul class="ini-lista ini-top" id="iniTop"><li><div class="ini-esq" style="height:90px;flex:1"></div></li></ul>
      </section>
    </div>
    </div><!-- /iniDatos -->
  </div>`;


// ============================================================
// 3. FORMATOS
// ============================================================
function escapar(t) {
  return String(t ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 1447.5 -> "1.447,50" · 120 -> "120"
function bs(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('es-BO', Number.isInteger(num)
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Día en hora local (la del navegador, que es la de Bolivia): "2026-09-24"
function claveDia(fecha) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function haceCuanto(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1)  return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24)   return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}


// ============================================================
// 4. CARGA
// ============================================================
let cargando = false;

async function cargar() {
  if (cargando) return;
  cargando = true;
  $('iniRefrescar').disabled = true;

  try {
    // Igual que Ventas y Stock: preguntar el permiso ANTES, porque sin él
    // la base devuelve listas vacías y el Inicio diría "no vendiste nada".
    // El cartel va en su propio lugar y el resto se esconde, sin borrarlo:
    // si fue un corte momentáneo ('error'), la próxima vuelta lo recupera.
    const permiso = await tengoPermiso();
    $('iniPermiso').innerHTML = permiso.puede ? '' : carteSinPermiso(permiso.motivo, 'ini-vacio');
    $('iniDatos').hidden = !permiso.puede;
    if (!permiso.puede) return;

    const hace35 = new Date(Date.now() - 35 * 864e5).toISOString();

    const [rPedidos, rEsperando, rAtender, rCuentas, rProductos] = await Promise.all([
      // Cinco semanas alcanzan para "hoy", "7 días contra los 7 anteriores",
      // el gráfico de 14 días y lo más vendido del mes.
      sbAdmin.from('pedidos')
        .select('id, numero, producto_nombre, precio, estado, cliente_nombre, creado_en, entregado_en')
        .gte('creado_en', hace35)
        .order('creado_en', { ascending: false })
        .limit(2000),
      // Los pendientes, de cualquier fecha: uno viejo sin atender también cuenta
      sbAdmin.from('pedidos').select('id', { count: 'exact', head: true })
        .eq('estado', 'esperando_pago'),
      sbAdmin.from('pedidos').select('id', { count: 'exact', head: true })
        .in('estado', ['sin_stock', 'pagado']),
      // Solo producto y estado: las credenciales no hacen falta acá
      sbAdmin.from('cuentas').select('producto_id, estado').neq('estado', 'anulada'),
      sbAdmin.from('productos').select('id, nombre, activo')
    ]);

    const error = [rPedidos, rEsperando, rAtender, rCuentas, rProductos].find(r => r.error)?.error;
    if (error) throw error;

    pintarCifras(rPedidos.data, rEsperando.count ?? 0, rAtender.count ?? 0);
    pintarGrafico(rPedidos.data);
    pintarStock(rCuentas.data, rProductos.data);
    pintarPedidos(rPedidos.data);
    pintarTop(rPedidos.data);

    $('iniActualizado').textContent = 'Actualizado ' +
      new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    console.error('❌ Inicio:', err);
    $('iniActualizado').textContent = 'No se pudo actualizar: ' + (err.message || err);
  } finally {
    cargando = false;
    $('iniRefrescar').disabled = false;
  }
}


// ============================================================
// 5. CIFRAS DE ARRIBA
// ============================================================
function pintarCifras(pedidos, esperando, atender) {
  $('iniHola').innerHTML = `${saludo()} 👋 <b>Así viene la tienda hoy.</b>`;

  const entregados = pedidos.filter(p => p.estado === 'entregado' && p.entregado_en);
  const hoy = claveDia(new Date());

  const deHoy = entregados.filter(p => claveDia(p.entregado_en) === hoy);
  const bsHoy = deHoy.reduce((s, p) => s + Number(p.precio || 0), 0);
  $('iniHoy').innerHTML  = `${bs(bsHoy)}<small>Bs</small>`;
  $('iniHoyS').textContent = deHoy.length === 1 ? '1 pedido entregado' : `${deHoy.length} pedidos entregados`;

  // Últimos 7 días (hoy incluido) contra los 7 de antes
  const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
  const corte7  = inicioDia.getTime() - 6 * 864e5;
  const corte14 = inicioDia.getTime() - 13 * 864e5;
  const suma = (desde, hasta) => entregados
    .filter(p => { const t = new Date(p.entregado_en).getTime(); return t >= desde && t < hasta; })
    .reduce((s, p) => s + Number(p.precio || 0), 0);

  const semana   = suma(corte7, Infinity);
  const anterior = suma(corte14, corte7);
  $('iniSemana').innerHTML = `${bs(semana)}<small>Bs</small>`;

  if (anterior > 0) {
    const cambio = Math.round((semana - anterior) / anterior * 100);
    $('iniSemanaS').innerHTML = cambio === 0
      ? 'Igual que la semana anterior'
      : `<span class="${cambio > 0 ? 'ini-sube' : 'ini-baja'}">${cambio > 0 ? '▲' : '▼'} ${Math.abs(cambio)}%</span> contra la semana anterior`;
  } else {
    $('iniSemanaS').textContent = semana > 0 ? 'La semana anterior no hubo ventas' : 'Sin ventas todavía';
  }

  $('iniEsperando').textContent = esperando;
  $('iniAtender').textContent   = atender;
  $('iniCajaEsperando').classList.toggle('alerta', esperando > 0);
  $('iniCajaAtender').classList.toggle('alerta', atender > 0);
  $('iniCajaAtender').classList.toggle('urgente', atender > 0);
}


// ============================================================
// 6. GRÁFICO: VENTAS POR DÍA
// ============================================================
const DIAS = 14;

// Un tope "redondo" para el eje: 137 -> 150, 1.230 -> 1.500
function topeRedondo(max) {
  if (max <= 0) return 100;
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * paso >= max) return m * paso;
  }
  return 10 * paso;
}

function pintarGrafico(pedidos) {
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const dias = [];
  for (let i = DIAS - 1; i >= 0; i--) {
    const d = new Date(hoy.getTime() - i * 864e5);
    dias.push({ fecha: d, clave: claveDia(d), bs: 0, pedidos: 0 });
  }
  const porClave = new Map(dias.map(d => [d.clave, d]));

  for (const p of pedidos) {
    if (p.estado !== 'entregado' || !p.entregado_en) continue;
    const d = porClave.get(claveDia(p.entregado_en));
    if (d) { d.bs += Number(p.precio || 0); d.pedidos++; }
  }

  const total = dias.reduce((s, d) => s + d.bs, 0);
  if (total === 0) {
    $('iniGraf').innerHTML = `<div class="ini-vacio"><b>Sin ventas en estas dos semanas</b>
      Cuando entregues pedidos, acá vas a ver cuánto entró cada día.</div>`;
    return;
  }
  $('iniGrafSub').textContent = `Últimas dos semanas · ${bs(total)} Bs en total`;

  const max  = Math.max(...dias.map(d => d.bs));
  const tope = topeRedondo(max);
  const iMax = dias.findIndex(d => d.bs === max);
  const letra = new Intl.DateTimeFormat('es-BO', { weekday: 'narrow' });
  const largo = new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'short' });

  const columnas = dias.map((d, i) => {
    const alto = d.bs / tope * 100;
    const esHoy = i === DIAS - 1;
    const texto = `${largo.format(d.fecha)}: ${bs(d.bs)} Bs, ${d.pedidos} ${d.pedidos === 1 ? 'pedido' : 'pedidos'}`;
    return `
      <div class="ini-col${d.bs === 0 ? ' cero' : ''}${esHoy ? ' hoy' : ''}" tabindex="0"
           data-i="${i}" aria-label="${escapar(texto)}">
        <div class="ini-barra" style="height:${alto}%"></div>
        ${i === iMax ? `<span class="ini-rotulo" style="bottom:calc(${alto}% + 4px)">${bs(d.bs)}</span>` : ''}
        <span class="ini-dia${(DIAS - 1 - i) % 2 ? ' impar' : ''}">${esHoy ? 'Hoy' : `${letra.format(d.fecha).toUpperCase()} ${d.fecha.getDate()}`}</span>
      </div>`;
  }).join('');

  $('iniGraf').innerHTML = `
    <div class="ini-graf">
      <div class="ini-graf-plot">
        <div class="ini-guia" style="top:0"><span>${bs(tope)}</span></div>
        <div class="ini-guia" style="top:50%"><span>${bs(tope / 2)}</span></div>
        <div class="ini-base"></div>
        <div class="ini-cols" id="iniCols">${columnas}</div>
        <div class="ini-tip" id="iniTip" hidden></div>
      </div>
    </div>
    <table class="ini-sr">
      <caption>Ventas por día, últimas dos semanas</caption>
      <tr><th>Día</th><th>Bolivianos</th><th>Pedidos</th></tr>
      ${dias.map(d => `<tr><td>${escapar(largo.format(d.fecha))}</td><td>${bs(d.bs)}</td><td>${d.pedidos}</td></tr>`).join('')}
    </table>`;

  // El detalle de cada día, al pasar el mouse, tocar o llegar con Tab
  const tip = $('iniTip');
  const mostrar = col => {
    const d = dias[Number(col.dataset.i)];
    tip.innerHTML = `${escapar(largo.format(d.fecha))}<br><b>${bs(d.bs)} Bs</b> · ${d.pedidos} ${d.pedidos === 1 ? 'pedido' : 'pedidos'}`;
    const plot = col.parentElement.getBoundingClientRect();
    const c = col.getBoundingClientRect();
    const barra = col.querySelector('.ini-barra').getBoundingClientRect();
    tip.hidden = false;
    // Que no se salga por los costados en el celular
    const mitad = tip.offsetWidth / 2;
    const x = Math.min(Math.max(c.left + c.width / 2 - plot.left, mitad), plot.width - mitad);
    tip.style.left = `${x}px`;
    tip.style.top  = `${Math.min(barra.top, c.bottom - 10) - plot.top}px`;
  };
  const cols = $('iniCols');
  cols.addEventListener('pointerover', e => { const col = e.target.closest('.ini-col'); if (col) mostrar(col); });
  cols.addEventListener('pointerleave', () => { tip.hidden = true; });
  cols.addEventListener('focusin', e => { const col = e.target.closest('.ini-col'); if (col) mostrar(col); });
  cols.addEventListener('focusout', () => { tip.hidden = true; });
}


// ============================================================
// 7. STOCK QUE SE ACABA
// ============================================================
function pintarStock(cuentas, productos) {
  const libres = new Map();
  const conStock = new Set();          // productos que alguna vez tuvieron cuentas
  for (const c of cuentas) {
    conStock.add(c.producto_id);
    if (c.estado === 'libre') libres.set(c.producto_id, (libres.get(c.producto_id) || 0) + 1);
  }

  const bajos = productos
    .filter(p => p.activo !== false && conStock.has(p.id))
    .map(p => ({ nombre: p.nombre, libres: libres.get(p.id) || 0 }))
    .filter(p => p.libres <= POCO_STOCK)
    .sort((a, b) => a.libres - b.libres || a.nombre.localeCompare(b.nombre));

  if (bajos.length === 0) {
    $('iniStock').innerHTML = `<li class="ini-vacio" style="display:block;border:none">
      <b>Todo con stock</b>Ningún producto tiene ${POCO_STOCK} cuentas o menos.</li>`;
    return;
  }

  const MAX = 7;
  $('iniStock').innerHTML = bajos.slice(0, MAX).map(p => `
    <li>
      <span class="nom" title="${escapar(p.nombre)}">${escapar(p.nombre)}</span>
      <span class="ini-pill ${p.libres === 0 ? 'cero' : 'poco'}">${
        p.libres === 0 ? 'Sin stock' : p.libres === 1 ? 'Queda 1' : `Quedan ${p.libres}`}</span>
    </li>`).join('') +
    (bajos.length > MAX
      ? `<li><button class="ini-link" data-ir="stock">y ${bajos.length - MAX} más →</button></li>`
      : '');
}


// ============================================================
// 8. ÚLTIMOS PEDIDOS
// ============================================================
function pintarPedidos(pedidos) {
  const ultimos = pedidos.slice(0, 8);
  if (ultimos.length === 0) {
    $('iniPedidos').innerHTML = `<div class="ini-vacio"><b>Todavía no hay pedidos este mes</b>
      Cuando alguien compre, aparece acá.</div>`;
    return;
  }

  $('iniPedidos').innerHTML = `
    <table class="ini-tabla">
      <thead><tr><th>N°</th><th>Producto</th><th>Estado</th><th class="t">Cuándo</th><th class="b">Bs</th></tr></thead>
      <tbody>
        ${ultimos.map(p => {
          const e = ESTADOS[p.estado] || { txt: p.estado, color: '#767c88', bg: 'rgba(20,22,26,.06)' };
          return `
          <tr>
            <td class="n">#${escapar(p.numero)}</td>
            <td class="p" title="${escapar(p.producto_nombre)}">${escapar(p.producto_nombre)}</td>
            <td><span class="ini-pill" style="color:${e.color};background:${e.bg}">${e.txt}</span></td>
            <td class="t">${haceCuanto(p.creado_en)}</td>
            <td class="b">${bs(p.precio)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}


// ============================================================
// 9. LO MÁS VENDIDO
// ============================================================
function pintarTop(pedidos) {
  const desde = Date.now() - 30 * 864e5;
  const cuenta = new Map();
  for (const p of pedidos) {
    if (p.estado !== 'entregado' || !p.entregado_en) continue;
    if (new Date(p.entregado_en).getTime() < desde) continue;
    const c = cuenta.get(p.producto_nombre) || { nombre: p.producto_nombre, n: 0, bs: 0 };
    c.n++; c.bs += Number(p.precio || 0);
    cuenta.set(p.producto_nombre, c);
  }

  const top = [...cuenta.values()].sort((a, b) => b.n - a.n || b.bs - a.bs).slice(0, 5);
  if (top.length === 0) {
    $('iniTop').innerHTML = `<li class="ini-vacio" style="display:block;border:none">
      <b>Sin ventas en 30 días</b>Acá van a aparecer los productos que más salen.</li>`;
    return;
  }

  const max = top[0].n;
  $('iniTop').innerHTML = top.map(p => `
    <li>
      <span class="nom" title="${escapar(p.nombre)}">${escapar(p.nombre)}</span>
      <span class="cuantos"><span class="num">${p.n}</span> · ${bs(p.bs)} Bs</span>
      <span class="bar"><i style="width:${Math.max(4, p.n / max * 100)}%"></i></span>
    </li>`).join('');
}


// ============================================================
// 10. CUÁNDO SE ACTUALIZA
// ============================================================
// Al abrir Inicio, con el botón, y cada minuto mientras está a la vista.
// No consulta en segundo plano si estás en otra vista o en otra pestaña.
document.addEventListener('vista-cambiada', e => {
  if (e.detail.vista === 'inicio') cargar();
});

$('iniRefrescar').addEventListener('click', cargar);

setInterval(() => {
  if (!$('vistaInicio').hidden && document.visibilityState === 'visible') cargar();
}, 60000);

// Las cifras y los "Ir a…" llevan a la vista donde se resuelve cada cosa
$('vistaInicio').addEventListener('click', e => {
  const b = e.target.closest('[data-ir]');
  if (b && window.abrirVistaAdmin) window.abrirVistaAdmin(b.dataset.ir);
});

console.log('%c✓ Inicio listo', 'color:#22c55e;font-weight:bold');
