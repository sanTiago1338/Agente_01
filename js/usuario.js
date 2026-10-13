// ============================================================
// TIAGO STORE · Usuario del cliente (Usuario + WhatsApp)
// ============================================================
// La tienda se ve igual que siempre. Si este navegador todavía no se
// registró, a los segundos aparece una ventanita que pide dos datos:
//   · Usuario  (su nombre o como quiera que lo llamemos)
//   · WhatsApp (celular de Bolivia, 8 números)
// Puede tocar "Ahora no" y seguir mirando: se le vuelve a pedir la
// próxima vez que entre (no en cada página de la misma visita).
//
// Cualquier botón con [data-usuario] abre la misma ventana con sus datos,
// para cambiarlos ("Usuario" en la barra de abajo).
//
// DÓNDE QUEDA
//   · En este navegador ('tiago-usuario'), y el WhatsApp también en
//     'tiago-whatsapp': el que ya usa el carrito, así al pagar viene
//     escrito.
//   · En la base, con registrar_cliente() (supabase/26-registro-de-
//     clientes.sql). Si la base no contesta, queda guardado igual y se
//     vuelve a mandar en la próxima visita: el cliente no se entera.
//
// No es un login: sin contraseña ni correo. Ver el SQL 26.
// ============================================================

import { sb } from './supabase-base.js';

const LLAVE      = 'tiago-usuario';
const LLAVE_WA   = 'tiago-whatsapp';        // la misma de js/tienda.js
const LLAVE_NO   = 'tiago-usuario-despues'; // "Ahora no", por esta visita
const ESPERA_MS  = 1800;                    // que primero vea la tienda

// ---------- Lo guardado ----------
function leer() {
  try {
    const u = JSON.parse(localStorage.getItem(LLAVE) || 'null');
    return u && u.nombre && /^[67]\d{7}$/.test(u.wa) ? u : null;
  } catch { return null; }
}
function guardar(u) {
  try {
    localStorage.setItem(LLAVE, JSON.stringify(u));
    localStorage.setItem(LLAVE_WA, u.wa);
  } catch { /* sin almacenamiento: igual queda en la base */ }
}
function waGuardado() {
  try { return (localStorage.getItem(LLAVE_WA) || '').replace(/\D/g, '').slice(-8); } catch { return ''; }
}
function pidioDespues() {
  try { return sessionStorage.getItem(LLAVE_NO) === '1'; } catch { return false; }
}

// Para las otras páginas (pagar-qr.html le pone el usuario al pedido)
window.usuarioTienda = leer;

// ---------- Validación (la misma que hace la base) ----------
const limpiarNombre = t => String(t || '').replace(/\s+/g, ' ').replace(/[<>"`]/g, '').trim();
const nombreValido  = t => { const n = limpiarNombre(t); return n.length >= 2 && n.length <= 40; };
const waValido      = t => /^[67]\d{7}$/.test(t);

// ---------- Mandarlo a la base ----------
async function registrarEnLaBase(u) {
  try {
    const { error } = await sb.rpc('registrar_cliente', { p_nombre: u.nombre, p_whatsapp: '591' + u.wa });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Registro: quedó guardado en este navegador, se reintenta en la próxima visita.', e.message || e);
    return false;
  }
}

// ---------- Estilos ----------
const css = document.createElement('style');
css.textContent = `
  .us-fondo {
    position: fixed; inset: 0; z-index: 9000;
    display: grid; place-items: center;
    padding: 16px;
    background: rgba(12,14,18,.46);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    opacity: 0; transition: opacity .2s ease;
  }
  .us-fondo.abierto { opacity: 1; }
  .us-caja {
    position: relative;
    width: min(400px, 100%);
    max-height: calc(100vh - 32px); overflow: auto;
    padding: 26px 22px 20px;
    border-radius: 22px;
    background: #fff;
    color: #14161a;
    font-family: 'Outfit', system-ui, -apple-system, sans-serif;
    box-shadow: 0 24px 60px rgba(12,14,18,.28), 0 2px 8px rgba(12,14,18,.08);
    transform: translateY(14px) scale(.98); transition: transform .22s ease;
  }
  .us-fondo.abierto .us-caja { transform: none; }
  .us-cerrar {
    position: absolute; top: 12px; right: 12px;
    width: 34px; height: 34px; display: grid; place-items: center;
    border: 0; border-radius: 50%; background: #f1f2f4; color: #4b515c;
    font-size: 18px; line-height: 1; cursor: pointer;
  }
  .us-cerrar:hover { background: #e6e8eb; color: #14161a; }
  .us-ico {
    width: 52px; height: 52px; display: grid; place-items: center;
    margin-bottom: 14px; border-radius: 16px;
    background: linear-gradient(135deg, #e50914, #b8070f); color: #fff;
    box-shadow: 0 8px 20px rgba(229,9,20,.28);
  }
  .us-ico svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .us-titulo { margin: 0 0 6px; font-size: 1.32rem; font-weight: 900; letter-spacing: -.01em; }
  .us-sub { margin: 0 0 18px; font-size: .9rem; line-height: 1.5; color: #4b515c; }
  .us-campo { display: block; margin-bottom: 12px; }
  .us-campo > span { display: block; margin-bottom: 6px; font-size: .78rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #4b515c; }
  .us-input, .us-tel {
    display: flex; align-items: stretch;
    border: 1.5px solid #dfe0e5; border-radius: 12px; background: #fff; overflow: hidden;
    transition: border-color .15s, box-shadow .15s;
  }
  .us-input:focus-within, .us-tel:focus-within { border-color: #e50914; box-shadow: 0 0 0 3px rgba(229,9,20,.12); }
  .us-input.mal, .us-tel.mal { border-color: #dc2626; }
  .us-input input, .us-tel input {
    flex: 1; min-width: 0; border: 0; background: transparent; outline: none;
    padding: 12px 13px; font: inherit; font-size: 1rem; color: #14161a;
  }
  .us-tel b { display: flex; align-items: center; padding: 0 12px; font-size: .9rem; color: #4b515c; background: #f4f5f7; }
  .us-tel input { letter-spacing: .06em; }
  .us-error { min-height: 1.2em; margin: 2px 0 10px; font-size: .8rem; color: #dc2626; }
  .us-btn {
    width: 100%; padding: 13px 16px; border: 0; border-radius: 12px;
    background: #e50914; color: #fff; font: 800 1rem 'Outfit', system-ui, sans-serif;
    cursor: pointer; box-shadow: 0 6px 16px rgba(229,9,20,.25);
  }
  .us-btn:hover { background: #cc0812; }
  .us-btn:disabled { opacity: .6; cursor: wait; }
  .us-despues {
    display: block; width: 100%; margin-top: 8px; padding: 10px;
    border: 0; background: none; color: #4b515c; font: 600 .9rem 'Outfit', system-ui, sans-serif; cursor: pointer;
  }
  .us-despues:hover { color: #14161a; text-decoration: underline; }
  .us-nota { display: flex; gap: 8px; margin: 14px 0 0; font-size: .76rem; line-height: 1.45; color: #656b77; }
  .us-nota svg { flex: none; width: 15px; height: 15px; margin-top: 1px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .us-listo { text-align: center; padding: 8px 0 4px; }
  .us-listo .us-ico { margin: 0 auto 14px; background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 8px 20px rgba(21,128,61,.25); }
  /* El punto verde en "Usuario" cuando ya se registró. :where() no suma
     peso: un botón que ya se ubica solo (el de Mis compras) no se mueve. */
  :where([data-usuario]) { position: relative; }
  [data-usuario].us-registrado .nav-icon::after,
  [data-usuario].us-registrado.us-punto::after {
    content: ''; position: absolute; top: 2px; right: -3px;
    width: 9px; height: 9px; border-radius: 50%;
    background: #16a34a; box-shadow: 0 0 0 2px #fff;
  }
  :where([data-usuario]) .nav-icon { position: relative; }
  @media (prefers-reduced-motion: reduce) { .us-fondo, .us-caja { transition: none; } }
`;
document.head.appendChild(css);

const ICONO_USUARIO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/></svg>';
const ICONO_OK      = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const ICONO_CANDADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const escapar = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- La ventana ----------
let abierta = null;
let focoAntes = null;

function cerrar({ despues = false } = {}) {
  if (!abierta) return;
  if (despues) { try { sessionStorage.setItem(LLAVE_NO, '1'); } catch { /* da igual */ } }
  const fondo = abierta;
  abierta = null;
  fondo.classList.remove('abierto');
  setTimeout(() => fondo.remove(), 200);
  document.removeEventListener('keydown', teclas);
  if (focoAntes && focoAntes.focus) focoAntes.focus();
}

function teclas(e) {
  if (e.key === 'Escape') cerrar({ despues: !leer() });
}

function abrir() {
  if (abierta) return;
  const u = leer();
  const editando = !!u;
  focoAntes = document.activeElement;

  const fondo = document.createElement('div');
  fondo.className = 'us-fondo';
  fondo.innerHTML = `
    <div class="us-caja" role="dialog" aria-modal="true" aria-labelledby="usTitulo">
      <button type="button" class="us-cerrar" aria-label="Cerrar">✕</button>
      <form class="us-form" novalidate>
        <div class="us-ico">${ICONO_USUARIO}</div>
        <h2 class="us-titulo" id="usTitulo">${editando ? 'Tu usuario' : 'Registrate en Tiago Store'}</h2>
        <p class="us-sub">${editando
          ? 'Estos son tus datos. Si cambiaste de número, actualizalo para que te lleguen los avisos.'
          : 'Solo dos datos y listo. Por tu WhatsApp te avisamos antes de que venza tu cuenta y te damos soporte.'}</p>

        <label class="us-campo">
          <span>Usuario</span>
          <div class="us-input">
            <input type="text" name="nombre" maxlength="40" autocomplete="nickname"
                   placeholder="Tu nombre o usuario" value="${escapar(u ? u.nombre : '')}" required>
          </div>
        </label>

        <label class="us-campo">
          <span>WhatsApp</span>
          <div class="us-tel">
            <b>+591</b>
            <input type="tel" name="wa" inputmode="numeric" maxlength="14" autocomplete="tel-national"
                   placeholder="7 123 4567" value="${escapar(u ? u.wa : waGuardado())}" required>
          </div>
        </label>

        <p class="us-error" role="alert"></p>
        <button type="submit" class="us-btn">${editando ? 'Guardar cambios' : 'Registrarme'}</button>
        ${editando ? '' : '<button type="button" class="us-despues">Ahora no</button>'}
        <p class="us-nota">${ICONO_CANDADO}<span>Solo lo usamos para tus pedidos y avisos. Nada de publicidad.</span></p>
      </form>
    </div>`;
  document.body.appendChild(fondo);
  abierta = fondo;
  requestAnimationFrame(() => fondo.classList.add('abierto'));
  document.addEventListener('keydown', teclas);

  const form   = fondo.querySelector('form');
  const nombre = form.elements.nombre;
  const wa     = form.elements.wa;
  const error  = fondo.querySelector('.us-error');
  const boton  = fondo.querySelector('.us-btn');

  // Solo los 8 números; si pega el 591 adelante, se saca
  wa.addEventListener('input', () => {
    let d = wa.value.replace(/\D/g, '');
    if (d.length > 8 && d.startsWith('591')) d = d.slice(3);
    d = d.slice(0, 8);
    if (d !== wa.value) wa.value = d;
    wa.closest('.us-tel').classList.remove('mal');
    error.textContent = '';
  });
  nombre.addEventListener('input', () => {
    nombre.closest('.us-input').classList.remove('mal');
    error.textContent = '';
  });

  fondo.querySelector('.us-cerrar').addEventListener('click', () => cerrar({ despues: !editando }));
  fondo.querySelector('.us-despues')?.addEventListener('click', () => cerrar({ despues: true }));
  fondo.addEventListener('click', e => { if (e.target === fondo) cerrar({ despues: !editando }); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const n = limpiarNombre(nombre.value);
    const w = wa.value.replace(/\D/g, '');
    if (!nombreValido(n)) {
      error.textContent = 'Escribí tu usuario: de 2 a 40 letras.';
      nombre.closest('.us-input').classList.add('mal');
      nombre.focus();
      return;
    }
    if (!waValido(w)) {
      error.textContent = w ? 'Tu WhatsApp tiene que tener 8 números y empezar con 6 o 7.'
                            : 'Escribí tu WhatsApp: 8 números que empiezan con 6 o 7.';
      wa.closest('.us-tel').classList.add('mal');
      wa.focus();
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Guardando…';
    const datos = { nombre: n, wa: w, en: new Date().toISOString(), base: false };
    guardar(datos);
    datos.base = await registrarEnLaBase(datos);
    guardar(datos);
    marcarBotones();

    // Listo: un momento con el ✓ y se cierra sola
    form.innerHTML = `
      <div class="us-listo">
        <div class="us-ico">${ICONO_OK}</div>
        <h2 class="us-titulo" id="usTitulo">${editando ? 'Datos guardados' : `¡Listo, ${escapar(n.split(' ')[0])}!`}</h2>
        <p class="us-sub" style="margin:0">${editando ? 'Ya quedó tu número nuevo.' : 'Ya estás registrado. Al pagar, tu WhatsApp ya viene escrito.'}</p>
      </div>`;
    setTimeout(() => cerrar(), 1600);
  });

  setTimeout(() => (editando ? nombre : (nombre.value ? wa : nombre)).focus({ preventScroll: true }), 60);
}

// El punto verde en los botones de Usuario
function marcarBotones() {
  const u = leer();
  document.querySelectorAll('[data-usuario]').forEach(b => {
    b.classList.toggle('us-registrado', !!u);
    b.title = u ? `Usuario: ${u.nombre}` : 'Registrarme';
  });
}

function empezar() {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-usuario]');
    if (!b) return;
    e.preventDefault();
    abrir();
  });
  marcarBotones();

  const u = leer();
  if (u) {
    // Quedó guardado pero la base no contestó aquella vez: se reintenta
    if (!u.base) registrarEnLaBase(u).then(ok => { if (ok) guardar({ ...u, base: true }); });
    return;
  }
  // Sin registrar: todo normal primero, y después se le pide
  if (!pidioDespues()) setTimeout(() => { if (!leer()) abrir(); }, ESPERA_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', empezar);
else empezar();
