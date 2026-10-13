// ============================================================
// TIAGO STORE · Ajustes (panel)
// ============================================================
// Dos tarjetas:
//
//   TELEGRAM
//     · Si está conectado (la base le pregunta al bot en el momento)
//     · Los avisos: pedidos nuevos (cada minuto), vencimientos (9:00) y
//       sin pagar desde ayer (9:05), si están prendidos y cuándo corrieron
//     · "Confirmar pagos desde Telegram": prendido, el aviso de pedido
//       nuevo trae "Confirmar y entregar"; apagado (como viene), se
//       confirma solo desde el panel y los botones de avisos viejos no
//       confirman nada (lo frena la base)
//     · "Mandar mensaje de prueba"
//     Todo eso vive en la base: supabase/25-telegram-sin-confirmar.sql.
//     El token y el chat no salen de ahí.
//
//   TU CUENTA
//     Cambiar la contraseña, ver o probar la tienda, cerrar sesión.
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';
import { tengoPermiso, carteSinPermiso } from './admin-permiso.js';

const $ = id => document.getElementById(id);
const aviso = (t, tipo) => (window.avisoAdmin ? window.avisoAdmin(t, tipo) : console.log(t));

const escapar = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ESTADO = null;
let cargando = false;


// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .aj-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (max-width: 1100px) { .aj-grid { grid-template-columns: minmax(0, 1fr); } }

  .aj-caja {
    background: #fff; border: 1px solid var(--separador);
    border-radius: var(--radio); box-shadow: var(--sombra);
  }
  .aj-cab {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 16px 18px; border-bottom: 1px solid var(--separador);
  }
  .aj-cab > div { flex: 1; min-width: 0; }
  .aj-cab h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--tinta); }
  .aj-cab p { margin: 3px 0 0; font-size: 13px; color: var(--tinta-suave); }

  .aj-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 10px; border-radius: 99px;
    font-size: 12px; font-weight: 600; white-space: nowrap;
  }
  .aj-chip::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .aj-chip.ok    { background: #ecfdf3; color: #15803d; }
  .aj-chip.mal   { background: #fef2f2; color: #dc2626; }
  .aj-chip.apag  { background: #f3f4f6; color: #6b7280; }
  .aj-chip.ojo   { background: #fffbeb; color: #b45309; }

  .aj-error { margin: 0; padding: 10px 18px; font-size: 13px; color: #991b1b; background: #fef2f2; border-bottom: 1px solid #fecaca; }

  .aj-lista { list-style: none; margin: 0; padding: 0; }
  .aj-lista li {
    display: grid; grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 12px; align-items: center;
    padding: 12px 18px; border-bottom: 1px solid var(--separador);
  }
  .aj-lista b { font-size: 13.5px; font-weight: 600; color: var(--tinta); }
  .aj-lista small { grid-column: 1; font-size: 12.5px; color: var(--tinta-suave); }
  .aj-lista .aj-chip { grid-row: 1 / span 2; grid-column: 2; }

  .aj-opcion {
    display: flex; align-items: flex-start; gap: 16px;
    padding: 16px 18px; border-bottom: 1px solid var(--separador);
  }
  .aj-opcion > div { flex: 1; min-width: 0; }
  .aj-opcion b { display: block; font-size: 13.5px; font-weight: 600; color: var(--tinta); }
  .aj-opcion p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--tinta-suave); }
  .aj-opcion .sw { padding-top: 2px; }
  .aj-opcion .sw-riel { width: 38px; height: 22px; }
  .aj-opcion .sw-bola { width: 18px; height: 18px; }
  .aj-opcion .sw[aria-checked="true"] .sw-bola { transform: translateX(16px); }

  .aj-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 14px 18px; }
  .aj-resultado { flex: 1 1 100%; margin: 2px 0 0; font-size: 12.5px; color: var(--tinta-suave); }
  .aj-resultado:empty { display: none; }

  .aj-quien { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--separador); }
  .aj-quien .avatar { width: 40px; height: 40px; font-size: 15px; }
  .aj-quien b { display: block; font-size: 13.5px; font-weight: 600; color: var(--tinta); word-break: break-all; }
  .aj-quien small { font-size: 12.5px; color: var(--tinta-suave); }

  .aj-ops { padding: 6px; }
  .aj-op {
    display: flex; align-items: center; gap: 12px; width: 100%;
    padding: 10px 12px; border: none; border-radius: 8px; background: none;
    font: 500 13.5px var(--letra); color: var(--tinta-media);
    text-align: left; text-decoration: none; cursor: pointer;
  }
  .aj-op:hover { background: var(--superficie-2); color: var(--tinta); }
  .aj-op .ico { width: 18px; height: 18px; color: var(--tinta-suave); }
  .aj-op span { flex: 1; min-width: 0; }
  .aj-op small { display: block; font-size: 12px; font-weight: 400; color: var(--tinta-suave); }
  .aj-op.peligro:hover { background: #fef2f2; color: var(--error); }
  .aj-op.peligro:hover .ico { color: var(--error); }

  .aj-vacio { padding: 36px 18px; text-align: center; color: var(--tinta-suave); font-size: 13.5px; }
  .aj-vacio .emo { font-size: 30px; color: var(--tinta-tenue); margin-bottom: 6px; }
  .aj-vacio h3 { margin: 0 0 6px; font-size: 15px; color: var(--tinta); }
  .aj-vacio p { margin: 0; }
  .aj-vacio code { background: var(--superficie-3); padding: 1px 5px; border-radius: 4px; }
`;
document.head.appendChild(css);


// ============================================================
// 2. LA VISTA
// ============================================================
const ICO = {
  enviar:     '<svg class="ico" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  actualizar: '<svg class="ico" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>'
};

$('vistaAjustes').innerHTML = `
  <div class="aj-wrap">
    <div class="aj-grid">

      <section class="aj-caja" aria-labelledby="ajTitTelegram">
        <div class="aj-cab">
          <div>
            <h3 id="ajTitTelegram">Telegram</h3>
            <p id="ajBot">Los avisos que te llegan al celular.</p>
          </div>
          <span class="aj-chip apag" id="ajEstado">Revisando…</span>
        </div>
        <div id="ajCuerpo">
          <div class="aj-vacio"><p>Revisando Telegram…</p></div>
        </div>
      </section>

      <section class="aj-caja" aria-labelledby="ajTitCuenta">
        <div class="aj-cab">
          <div>
            <h3 id="ajTitCuenta">Tu cuenta</h3>
            <p>Con la que entrás al panel.</p>
          </div>
        </div>
        <div class="aj-quien">
          <span class="avatar" data-avatar aria-hidden="true"></span>
          <div><b id="ajEmail">…</b><small>Administrador</small></div>
        </div>
        <div class="aj-ops">
          <a class="aj-op" href="cambiar-clave.html">
            <svg class="ico"><use href="#i-llave"/></svg>
            <span>Cambiar contraseña<small>Elegís una nueva sin cerrar la sesión</small></span>
          </a>
          <a class="aj-op" href="../index.html" target="_blank" rel="noopener">
            <svg class="ico"><use href="#i-tienda"/></svg>
            <span>Ver la tienda<small>Como la ve un cliente</small></span>
          </a>
          <a class="aj-op" href="../index.html" target="_blank" rel="noopener" data-probar hidden>
            <svg class="ico"><use href="#i-probar"/></svg>
            <span>Probar la tienda<small>Lo que compres ahí no cuenta como venta ni avisa por Telegram</small></span>
          </a>
          <button class="aj-op peligro js-salir" type="button">
            <svg class="ico"><use href="#i-salir"/></svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </section>

    </div>
  </div>`;


// ============================================================
// 3. FORMATOS
// ============================================================
const ZONA = 'America/La_Paz';

function cuando(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const hoy  = new Date().toLocaleDateString('en-CA', { timeZone: ZONA });
  const ese  = d.toLocaleDateString('en-CA', { timeZone: ZONA });
  const hora = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA });
  if (ese === hoy) return `hoy ${hora}`;
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: ZONA });
  if (ese === ayer) return `ayer ${hora}`;
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', timeZone: ZONA }) + ` ${hora}`;
}

// pg_cron anda en hora UTC; Bolivia está 4 horas atrás
function horario(cron) {
  if (cron === '* * * * *') return 'Cada minuto';
  const m = /^(\d+) (\d+) \* \* \*$/.exec(cron || '');
  if (m) {
    const h = (Number(m[2]) + 20) % 24;
    return `Todos los días a las ${h}:${String(m[1]).padStart(2, '0')}`;
  }
  return cron || '';
}

const AVISOS = [
  { job: 'avisar-pedidos-nuevos', nombre: 'Pedidos nuevos',
    ultimo: e => e.ultimo_pedido, ultimoTxt: 'último aviso' },
  { job: 'avisar-renovaciones',   nombre: 'Suscripciones por vencer y vencidas',
    ultimo: e => e.ultimo_vence,  ultimoTxt: 'último aviso' },
  { job: 'avisar-sin-pagar',      nombre: 'Sin pagar desde ayer',
    ultimo: () => null,           ultimoTxt: '' }
];


// ============================================================
// 4. CARGAR Y DIBUJAR
// ============================================================
async function cargarCuenta() {
  const { data } = await sbAdmin.auth.getSession();
  const email = data?.session?.user?.email || '';
  $('ajEmail').textContent = email || '—';
  document.querySelectorAll('#vistaAjustes [data-avatar]').forEach(a => { a.textContent = (email || '?').charAt(0); });
}

async function cargar() {
  cargarCuenta();
  if (cargando) return;
  cargando = true;

  const permiso = await tengoPermiso();
  if (!permiso.puede) {
    cargando = false;
    ponerEstado('apag', 'Sin permiso');
    $('ajCuerpo').innerHTML = carteSinPermiso(permiso.motivo, 'aj-vacio');
    return;
  }

  const { data, error } = await sbAdmin.rpc('estado_telegram');
  cargando = false;

  if (error) {
    const falta = error.code === 'PGRST202' || error.code === '42883' ||
                  /could not find the function|does not exist/i.test(error.message || '');
    ponerEstado('apag', 'Sin datos');
    $('ajCuerpo').innerHTML = `<div class="aj-vacio">
      <h3>${falta ? 'Falta preparar la base' : 'No se pudo leer el estado de Telegram'}</h3>
      <p>${falta
        ? 'Corré <code>supabase/25-telegram-sin-confirmar.sql</code> en Supabase → SQL Editor y volvé a abrir Ajustes.'
        : escapar(error.message)}</p></div>`;
    console.error('Ajustes:', error);
    return;
  }

  ESTADO = data || {};
  dibujar();
}

function ponerEstado(clase, texto) {
  $('ajEstado').className = `aj-chip ${clase}`;
  $('ajEstado').textContent = texto;
}

function dibujar() {
  const e = ESTADO;

  if (!e.configurado) ponerEstado('apag', 'Sin configurar');
  else if (e.conectado) ponerEstado('ok', 'Conectado');
  else ponerEstado('mal', 'Sin conexión');

  $('ajBot').textContent = e.conectado && e.bot
    ? `Los avisos llegan a tu chat con @${e.bot}.`
    : 'Los avisos que te llegan al celular.';

  const trabajos = Array.isArray(e.trabajos) ? e.trabajos : null;
  const filas = AVISOS.map(a => {
    const t = trabajos ? trabajos.find(x => x.nombre === a.job) : null;
    let chip, detalle;
    if (!trabajos) {
      chip = '<span class="aj-chip apag">No se pudo ver</span>';
      detalle = 'pg_cron no dejó leer sus horarios';
    } else if (!t) {
      chip = '<span class="aj-chip apag">No programado</span>';
      detalle = 'No está en pg_cron';
    } else {
      const fallo = t.estado === 'failed';
      chip = !t.activo ? '<span class="aj-chip apag">Apagado</span>'
           : fallo     ? '<span class="aj-chip mal">Falló la última vez</span>'
           :             '<span class="aj-chip ok">Prendido</span>';
      const ultimo = a.ultimo(e);
      detalle = [horario(t.horario),
                 ultimo ? `${a.ultimoTxt}: ${cuando(ultimo)}`
                        : t.ultima ? `corrió por última vez ${cuando(t.ultima)}` : 'todavía no corrió']
                .filter(Boolean).join(' · ');
    }
    return `<li><b>${a.nombre}</b><small>${escapar(detalle)}</small>${chip}</li>`;
  });

  // Los botones del chat (los de "Sigue sin pagar", y confirmar si está
  // prendido) necesitan que los toques lleguen a la Edge Function
  filas.push(`<li><b>Botones del chat</b>
    <small>${e.clave_botones
      ? 'Los toques llegan a la base (Cancelar, Dejarlo y, si está prendido, Confirmar)'
      : 'Sin activar: los avisos no traen botones. Desde el SQL Editor: select public.activar_boton_telegram();'}</small>
    ${e.clave_botones ? '<span class="aj-chip ok">Activos</span>' : '<span class="aj-chip ojo">Sin activar</span>'}</li>`);

  $('ajCuerpo').innerHTML = `
    ${e.error ? `<p class="aj-error">${escapar(e.error)}</p>` : ''}
    ${!e.configurado ? `<p class="aj-error" style="background:#f9fafb;color:var(--tinta-media);border-color:var(--separador)">
      Telegram todavía no está configurado. Desde el SQL Editor de Supabase:
      <code>select public.configurar_telegram('TU_TOKEN');</code></p>` : ''}
    <ul class="aj-lista">${filas.join('')}</ul>

    <div class="aj-opcion">
      <div>
        <b id="ajConfirmarTit">Confirmar pagos desde Telegram</b>
        <p>${e.confirmar
          ? 'Prendido: el aviso de pedido nuevo por QR trae <b style="display:inline">Confirmar y entregar</b>, y dos toques en el chat entregan la cuenta.'
          : 'Apagado: el aviso de pedido nuevo llega sin botón y dice que se confirma desde el panel. Si tocás un botón de un aviso viejo, no confirma nada.'}
          Los botones de las 9:05 (Cancelar y Dejarlo) andan igual.</p>
      </div>
      <button type="button" class="sw" role="switch" id="ajConfirmar"
              aria-checked="${e.confirmar ? 'true' : 'false'}" aria-labelledby="ajConfirmarTit">
        <span class="sw-riel"><span class="sw-bola"></span></span>
      </button>
    </div>

    <div class="aj-pie">
      <button class="btn btn-fantasma" type="button" id="ajProbar" ${e.configurado ? '' : 'disabled'}>${ICO.enviar}Mandar mensaje de prueba</button>
      <button class="btn btn-fantasma" type="button" id="ajRefrescar">${ICO.actualizar}Actualizar</button>
      <p class="aj-resultado" id="ajResultado" role="status"></p>
    </div>`;
}


// ============================================================
// 5. LO QUE SE TOCA
// ============================================================
async function cambiarConfirmar(btn) {
  const prender = btn.getAttribute('aria-checked') !== 'true';
  btn.disabled = true;
  btn.setAttribute('aria-checked', String(prender));   // se ve en el acto

  const { data, error } = await sbAdmin.rpc('poner_confirmar_telegram', { p_prendido: prender });
  if (error) {
    btn.setAttribute('aria-checked', String(!prender));
    btn.disabled = false;
    aviso(`No se pudo cambiar: ${error.message}`, 'error');
    return;
  }
  aviso(data || (prender ? 'Prendido' : 'Apagado'), prender && /todavía no anda/.test(data || '') ? 'error' : 'ok');
  await cargar();
}

async function probar(btn) {
  btn.disabled = true;
  const antes = btn.innerHTML;
  btn.textContent = 'Mandando…';
  const { data, error } = await sbAdmin.rpc('probar_telegram_panel');
  btn.disabled = false;
  btn.innerHTML = antes;
  const texto = error ? `No se pudo: ${error.message}` : (data || '');
  const bien = !error && /^Listo/.test(texto);
  $('ajResultado').textContent = texto;
  aviso(bien ? 'Mensaje de prueba enviado' : texto, bien ? 'ok' : 'error');
}

$('vistaAjustes').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.id === 'ajConfirmar') cambiarConfirmar(b);
  if (b.id === 'ajProbar')    probar(b);
  if (b.id === 'ajRefrescar') {
    $('ajCuerpo').innerHTML = '<div class="aj-vacio"><p>Revisando Telegram…</p></div>';
    ponerEstado('apag', 'Revisando…');
    cargar();
  }
});


// ============================================================
// 6. CUÁNDO SE CARGA
// ============================================================
// Al abrir la vista: le pregunta a Telegram en el momento, así que no se
// consulta en segundo plano.
document.addEventListener('vista-cambiada', e => {
  if (e.detail.vista === 'ajustes') cargar();
});

console.log('%c✓ Ajustes listo', 'color:#22c55e;font-weight:bold');
