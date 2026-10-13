// ============================================================
// TIAGO STORE · Ajustes (panel)
// ============================================================
//   · Telegram: si el bot está conectado, qué avisos te llegan, y el
//     interruptor "Confirmar pagos desde Telegram" (apagado desde el
//     13/10/2026, ver supabase/25-telegram-sin-confirmar.sql).
//     "Mandar mensaje de prueba" para ver que llega.
//   · Registro de clientes en la tienda (Usuario + WhatsApp).
//   · Tu cuenta: cambiar la contraseña y cerrar sesión.
//
// El token y el chat de Telegram nunca llegan al navegador: la base solo
// dice si están (estado_telegram()).
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';
import { auth, signOut } from '../../js/panel-auth.js';
import { tengoPermiso, carteSinPermiso } from './admin-permiso.js';

const $ = id => document.getElementById(id);
const aviso = (t, tipo) => (window.avisoAdmin ? window.avisoAdmin(t, tipo) : console.log(t));
const escapar = t => String(t ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ESTADO = null;
let cargando = false;


// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .aj-grilla { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .aj-col { display: grid; gap: 16px; min-width: 0; }
  .aj-caja {
    background: #fff; border: 1px solid var(--borde); border-radius: var(--radio, 12px);
    box-shadow: var(--sombra); overflow: hidden;
  }
  .aj-cab { display: flex; align-items: center; gap: 12px; padding: 18px 20px 14px; }
  .aj-cab-ico {
    width: 40px; height: 40px; flex: none; display: grid; place-items: center;
    border-radius: 10px; color: #fff;
  }
  .aj-cab-ico svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .aj-cab h3 { margin: 0; font-size: 15.5px; font-weight: 700; color: var(--tinta); letter-spacing: -.01em; }
  .aj-cab p { margin: 2px 0 0; font-size: 13px; color: var(--tinta-suave); }
  .aj-cab .aj-estado { margin-left: auto; }
  .aj-fila {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 20px; border-top: 1px solid var(--borde);
  }
  .aj-fila > div { flex: 1; min-width: 0; }
  .aj-fila b { display: block; font-size: 14px; font-weight: 600; color: var(--tinta); }
  .aj-fila small { display: block; margin-top: 2px; font-size: 12.5px; line-height: 1.5; color: var(--tinta-suave); }
  .aj-estado {
    display: inline-flex; align-items: center; gap: 6px; flex: none;
    padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; white-space: nowrap;
  }
  .aj-estado::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .aj-estado.si  { background: rgba(21,128,61,.10); color: #15803d; }
  .aj-estado.no  { background: rgba(20,22,26,.06);  color: var(--tinta-suave); }
  .aj-estado.mal { background: rgba(220,38,38,.10); color: #b91c1c; }
  .aj-pie { display: flex; gap: 10px; flex-wrap: wrap; padding: 14px 20px 18px; border-top: 1px solid var(--borde); background: var(--superficie-2); }
  .aj-nota {
    margin: 0; padding: 12px 20px; border-top: 1px solid var(--borde);
    font-size: 12.5px; line-height: 1.55; color: var(--tinta-suave); background: var(--superficie-2);
  }
  .aj-nota code { background: var(--superficie-3); padding: 1px 5px; border-radius: 5px; font-size: 12px; }
  .aj-falta {
    margin: 0 20px 16px; padding: 12px 14px; border-radius: 10px;
    border: 1px solid rgba(180,83,9,.25); background: #fffbeb; color: #78350f; font-size: 13px; line-height: 1.5;
  }
  .aj-falta code { background: rgba(120,53,15,.08); padding: 1px 5px; border-radius: 5px; }

  /* Interruptor grande, el mismo dibujo que los de Productos */
  .aj-sw {
    position: relative; flex: none; width: 46px; height: 26px; padding: 0;
    border: none; border-radius: 99px; background: var(--separador-2); cursor: pointer;
    transition: background .15s;
  }
  .aj-sw::after {
    content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
    border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(16,24,40,.3);
    transition: transform .15s;
  }
  .aj-sw[aria-checked="true"] { background: var(--ok); }
  .aj-sw[aria-checked="true"]::after { transform: translateX(20px); }
  .aj-sw:disabled { opacity: .5; cursor: wait; }
  @media (prefers-reduced-motion: reduce) { .aj-sw, .aj-sw::after { transition: none; } }

  .aj-cuenta { display: flex; align-items: center; gap: 12px; padding: 4px 20px 16px; }
  .aj-cuenta .avatar { width: 44px; height: 44px; font-size: 15px; }
  .aj-cuenta b { display: block; font-size: 14px; color: var(--tinta); }
  .aj-cuenta small { display: block; font-size: 12.5px; color: var(--tinta-suave); overflow: hidden; text-overflow: ellipsis; }
  .aj-enlaces { display: grid; }
  .aj-enlace {
    display: flex; align-items: center; gap: 12px; padding: 13px 20px;
    border-top: 1px solid var(--borde); color: var(--tinta-media); text-decoration: none;
    font-size: 14px; font-weight: 500; background: none; border-left: 0; border-right: 0; border-bottom: 0;
    width: 100%; text-align: left; cursor: pointer; font-family: inherit;
  }
  .aj-enlace:hover { background: var(--superficie-2); color: var(--tinta); }
  .aj-enlace svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; color: var(--tinta-suave); }
  .aj-enlace .flecha { margin-left: auto; }
  .aj-enlace.peligro { color: #b91c1c; }
  .aj-enlace.peligro svg { color: #b91c1c; }

  @media (max-width: 1023px) { .aj-grilla { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 600px) {
    .aj-cab, .aj-fila, .aj-pie { padding-left: 14px; padding-right: 14px; }
    .aj-pie .btn { flex: 1 1 100%; justify-content: center; }
  }
`;
document.head.appendChild(css);


// ============================================================
// 2. LA PANTALLA
// ============================================================
const SVG = {
  telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  usuario:  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/></svg>',
  llave:    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
  tienda:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  probar:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/></svg>',
  salir:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>',
  flecha:   '<svg viewBox="0 0 24 24" class="flecha" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  enviar:   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  personas: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

$('vistaAjustes').innerHTML = `
  <div class="aj-wrap">
    <div id="ajPermiso"></div>
    <div class="aj-grilla">
      <div class="aj-col">
        <section class="aj-caja" aria-labelledby="ajTgTitulo">
          <div class="aj-cab">
            <span class="aj-cab-ico" style="background:linear-gradient(135deg,#2aabee,#1d8fd1)">${SVG.telegram}</span>
            <div>
              <h3 id="ajTgTitulo">Telegram</h3>
              <p>Los avisos que te llegan al celular</p>
            </div>
            <span class="aj-estado no" id="ajTgEstado">Revisando…</span>
          </div>
          <div id="ajTgFalta"></div>

          <div class="aj-fila">
            <div>
              <b>Avisos de pedidos nuevos</b>
              <small>Cada compra te llega al minuto, con el total, el método de pago y el WhatsApp del cliente.</small>
            </div>
            <span class="aj-estado no" id="ajTgPedidos">—</span>
          </div>
          <div class="aj-fila">
            <div>
              <b>Avisos de vencimiento</b>
              <small>Todos los días a las 9:00: lo que vence mañana y lo que venció, con el botón
                <i>Enviar por WhatsApp</i> que abre el chat del cliente con el mensaje ya escrito.</small>
            </div>
            <span class="aj-estado no" id="ajTgRenov">—</span>
          </div>
          <div class="aj-fila">
            <div>
              <b>Compras sin pagar desde ayer</b>
              <small>Todos los días a las 9:05, con <i>Cancelar: nunca pagó / duplicado</i> o <i>Dejarlo</i>.</small>
            </div>
            <span class="aj-estado no" id="ajTgSinPagar">—</span>
          </div>
          <div class="aj-fila">
            <div>
              <b>Confirmar pagos desde Telegram</b>
              <small id="ajConfirmarTxt">Apagado: los pagos por QR se confirman desde el panel, en Ventas.</small>
            </div>
            <button type="button" class="aj-sw" id="ajConfirmar" role="switch" aria-checked="false"
                    aria-label="Confirmar pagos desde Telegram" aria-describedby="ajConfirmarTxt" disabled></button>
          </div>

          <div class="aj-pie">
            <button class="btn btn-fantasma" id="ajProbar" disabled>${SVG.enviar}Mandar mensaje de prueba</button>
          </div>
        </section>

        <section class="aj-caja" aria-labelledby="ajRegTitulo">
          <div class="aj-cab">
            <span class="aj-cab-ico" style="background:linear-gradient(135deg,#ff1f2b,#b8070f)">${SVG.usuario}</span>
            <div>
              <h3 id="ajRegTitulo">Registro de clientes</h3>
              <p>Usuario y WhatsApp, en la tienda</p>
            </div>
            <span class="aj-estado no" id="ajRegEstado">—</span>
          </div>
          <p class="aj-nota">
            La tienda se ve normal. A quien todavía no se registró, a los segundos le aparece una ventana que
            pide <b>Usuario</b> y <b>WhatsApp</b> (puede tocar "Ahora no" y se le vuelve a pedir en la próxima
            visita). Con eso, al pagar el WhatsApp ya viene escrito y los avisos lo saludan por su usuario.
            En la barra de abajo de la tienda, <b>Usuario</b> abre sus datos para cambiarlos.
          </p>
          <div class="aj-pie">
            <button class="btn btn-fantasma" data-ir-vista="clientes">${SVG.personas}Ver clientes</button>
          </div>
        </section>
      </div>

      <div class="aj-col">
        <section class="aj-caja" aria-labelledby="ajCuentaTitulo">
          <div class="aj-cab">
            <span class="aj-cab-ico" style="background:linear-gradient(135deg,#1f2937,#0b0f17)">${SVG.llave}</span>
            <div>
              <h3 id="ajCuentaTitulo">Tu cuenta</h3>
              <p>Con la que entrás al panel</p>
            </div>
          </div>
          <div class="aj-cuenta">
            <span class="avatar" id="ajAvatar" aria-hidden="true"></span>
            <div style="min-width:0"><b id="ajNombre">Administrador</b><small id="ajEmail"></small></div>
          </div>
          <div class="aj-enlaces">
            <a class="aj-enlace" href="cambiar-clave.html">${SVG.llave}Cambiar contraseña${SVG.flecha}</a>
            <a class="aj-enlace" href="../index.html" target="_blank" rel="noopener">${SVG.tienda}Ver la tienda${SVG.flecha}</a>
            <a class="aj-enlace" href="../index.html" target="_blank" rel="noopener" data-probar hidden
               title="Lo que compres ahí no cuenta como venta ni te avisa por Telegram">${SVG.probar}Probar la tienda (no cuenta como venta)${SVG.flecha}</a>
            <button type="button" class="aj-enlace peligro" id="ajSalir">${SVG.salir}Cerrar sesión</button>
          </div>
        </section>
      </div>
    </div>
  </div>`;


// ============================================================
// 3. TELEGRAM
// ============================================================
const marcar = (id, clase, texto) => { const el = $(id); el.className = `aj-estado ${clase}`; el.textContent = texto; };

function pintarTelegram() {
  const e = ESTADO || {};
  const conectado = !!e.configurado;
  marcar('ajTgEstado', conectado ? 'si' : 'mal', conectado ? 'Conectado' : 'Sin conectar');
  marcar('ajTgPedidos', conectado ? 'si' : 'no', conectado ? 'Prendido' : 'Apagado');
  const cron = (v) => v === undefined ? ['no', '—'] : v ? ['si', 'Prendido'] : ['mal', 'Apagado'];
  marcar('ajTgRenov', ...(conectado ? cron(e.renovaciones) : ['no', 'Apagado']));
  marcar('ajTgSinPagar', ...(conectado ? cron(e.sin_pagar) : ['no', 'Apagado']));

  const sw = $('ajConfirmar');
  sw.setAttribute('aria-checked', String(!!e.confirmar));
  sw.disabled = !conectado || !ESTADO;
  $('ajConfirmarTxt').textContent = e.confirmar
    ? 'Prendido: el aviso de pedido nuevo por QR trae el botón "Confirmar y entregar".'
    : 'Apagado: los pagos por QR se confirman desde el panel, en Ventas. Los botones de avisos viejos no confirman nada.';
  $('ajProbar').disabled = !conectado;
}

async function cargar() {
  if (cargando) return;
  cargando = true;
  try {
    const permiso = await tengoPermiso();
    if (!permiso.puede) {
      $('ajPermiso').innerHTML = carteSinPermiso(permiso.motivo, 'cl-vacio');
      return;
    }

    const [rTg, rReg] = await Promise.all([
      sbAdmin.rpc('estado_telegram'),
      sbAdmin.from('clientes').select('id', { count: 'exact', head: true })
    ]);

    if (rTg.error) {
      ESTADO = null;
      const falta = /estado_telegram|function|PGRST202|42883/i.test(`${rTg.error.message} ${rTg.error.code}`);
      $('ajTgFalta').innerHTML = `<div class="aj-falta">${falta
        ? 'Falta correr <code>supabase/25-telegram-sin-confirmar.sql</code> en Supabase → SQL Editor. Hasta entonces, Telegram sigue como estaba (con el botón de confirmar).'
        : 'No se pudo leer el estado de Telegram: ' + escapar(rTg.error.message)}</div>`;
      marcar('ajTgEstado', 'no', 'Sin datos');
    } else {
      ESTADO = rTg.data || {};
      $('ajTgFalta').innerHTML = '';
      pintarTelegram();
    }

    if (rReg.error) marcar('ajRegEstado', 'mal', 'Falta el SQL 26');
    else marcar('ajRegEstado', 'si', `${rReg.count ?? 0} registrado${rReg.count === 1 ? '' : 's'}`);
  } catch (err) {
    console.error('❌ Ajustes:', err);
    aviso('No se pudieron leer los ajustes', 'error');
  } finally {
    cargando = false;
  }
}

$('ajConfirmar').addEventListener('click', async () => {
  const sw = $('ajConfirmar');
  const prender = sw.getAttribute('aria-checked') !== 'true';
  if (prender && !confirm('¿Prender "Confirmar pagos desde Telegram"?\n\nEl aviso de cada pedido nuevo por QR va a traer el botón "Confirmar y entregar": con un toque (y "Sí, ya cobré") se entrega la cuenta.')) return;
  sw.disabled = true;
  const { data, error } = await sbAdmin.rpc('guardar_confirmar_telegram', { p_confirmar: prender });
  if (error) {
    aviso('No se pudo guardar: ' + error.message, 'error');
    sw.disabled = false;
    return;
  }
  ESTADO = { ...(ESTADO || {}), ...(data || {}) };
  pintarTelegram();
  aviso(prender ? 'Confirmar desde Telegram: prendido' : 'Confirmar desde Telegram: apagado', 'ok');
  if (data && data.aviso) aviso(data.aviso);
});

$('ajProbar').addEventListener('click', async () => {
  const b = $('ajProbar');
  b.disabled = true;
  const { data, error } = await sbAdmin.rpc('probar_telegram_panel');
  b.disabled = false;
  if (error) { aviso('No se pudo mandar: ' + error.message, 'error'); return; }
  aviso(String(data || 'Listo'), /^Listo/.test(String(data)) ? 'ok' : '');
});


// ============================================================
// 4. TU CUENTA
// ============================================================
(async () => {
  const { data } = await sbAdmin.auth.getSession();
  const email = data?.session?.user?.email || '';
  const nombre = email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || 'Administrador';
  $('ajNombre').textContent = nombre;
  $('ajEmail').textContent = email;
  $('ajAvatar').textContent = nombre.split(' ').map(p => p.charAt(0)).join('').slice(0, 2) || '?';
})();

$('ajSalir').addEventListener('click', async () => {
  await signOut(auth);
  location.replace('login.html');
});


// ============================================================
// 5. CUÁNDO SE ACTUALIZA
// ============================================================
document.addEventListener('vista-cambiada', e => {
  if (e.detail.vista === 'ajustes') cargar();
});

console.log('%c✓ Ajustes listo', 'color:#22c55e;font-weight:bold');
