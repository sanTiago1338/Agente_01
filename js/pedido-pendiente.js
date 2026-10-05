// ============================================================
// TIAGO STORE · "Tenés un pedido esperando el pago"
// ============================================================
// Si este navegador armó un pedido y no lo pagó, al volver a la tienda (o
// a Mis compras) le sale abajo un aviso con ese mismo pedido y "Ver QR",
// que lo lleva al QR de ESE pedido (pagar-qr.html#t=...), sin armar otro.
//
// Antes no había forma de volver: el que salía a buscar la billetera y
// volvía a la tienda armaba un pedido nuevo, y el primero quedaba
// esperando para siempre.
//
// Solo sale si la base dice que sigue esperando el pago: uno que ya se
// pagó o que cancelaste no se muestra. El pedido se recuerda 24 horas
// (compraRecordada en js/pedido-automatico.js). Con ✕ no vuelve a salir
// para ese pedido.
// ============================================================

import { compraRecordada, mirarPedido } from './pedido-automatico.js';

const LLAVE_CERRADO = 'tiago-pendiente-cerrado';   // el último pedido que cerraron con ✕
const DEMORA = 1200;                               // que primero vean la página

const escapar = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cerradoPara(token) {
  try { return localStorage.getItem(LLAVE_CERRADO) === token; } catch { return false; }
}
function anotarCerrado(token) {
  try { localStorage.setItem(LLAVE_CERRADO, token); } catch { /* vuelve a salir: no es grave */ }
}

// "42 Bs", o "3.50 USDT" si eligió pagar con Binance
function montoDe(compra) {
  if (['binance', 'bsc'].includes(compra.metodo) && Number(compra.usdt_monto) > 0) {
    return `${Number(compra.usdt_monto).toFixed(2)} USDT`;
  }
  const n = Number(compra.total) || 0;
  return `${Number.isInteger(n) ? n : n.toFixed(2)} Bs`;
}

// "Netflix", "Netflix ×2" o "Netflix y 1 más"
function queDe(compra) {
  const lineas  = compra.lineas || [];
  const nombres = [...new Set(lineas.map(l => l.producto).filter(Boolean))];
  if (nombres.length === 0) return '';
  if (nombres.length > 1)   return `${nombres[0]} y ${nombres.length - 1} más`;
  return lineas.length > 1 ? `${nombres[0]} ×${lineas.length}` : nombres[0];
}

const ICONO_QR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg>`;

function estilos() {
  const css = document.createElement('style');
  css.textContent = `
    /* Abajo, arriba de la burbuja de WhatsApp, igual que el aviso de
       instalar la app (que mientras tanto se esconde: este es más importante) */
    .pendiente-aviso {
      position: fixed;
      left: 10px; right: 10px;
      bottom: calc(16px + env(safe-area-inset-bottom));
      z-index: 96;
      display: flex; align-items: center; gap: .65rem;
      padding: .6rem .5rem .6rem .65rem;
      border-radius: 20px;
      /* Casi opaco: pasa por encima de las fotos del catálogo y se tiene
         que leer igual */
      background: rgba(255,255,255,.96);
      -webkit-backdrop-filter: blur(14px);
      backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,.9);
      box-shadow: 0 14px 34px rgba(20,22,26,.18), 0 0 0 .5px rgba(20,22,26,.08);
      transform: translateY(20px); opacity: 0; pointer-events: none;
      transition: transform .35s cubic-bezier(.3,.7,.4,1.2), opacity .25s ease;
    }
    .pendiente-aviso.con-barra { bottom: calc(var(--barra-h, 76px) + 76px + env(safe-area-inset-bottom)); }
    .pendiente-aviso.visible { transform: none; opacity: 1; pointer-events: auto; }
    @media (min-width: 701px) {
      .pendiente-aviso,
      .pendiente-aviso.con-barra {
        left: 50%; right: auto;
        width: min(480px, calc(100% - 20px));
        transform: translate(-50%, 20px);
      }
      .pendiente-aviso.con-barra { bottom: calc(var(--barra-h, 76px) + 14px); }
      .pendiente-aviso.visible { transform: translateX(-50%); }
    }
    .pendiente-ico {
      flex: none; width: 38px; height: 38px; border-radius: 12px;
      display: grid; place-items: center;
      background: rgba(245,158,11,.16); color: #b45309;
    }
    .pendiente-ico svg { width: 21px; height: 21px; }
    .pendiente-txt { flex: 1; min-width: 0; line-height: 1.3; }
    .pendiente-txt b { display: block; font-size: .88rem; color: var(--tinta, #14161a); }
    .pendiente-txt span {
      display: block; margin-top: 1px;
      font-size: .76rem; color: var(--tinta-suave, #5b616e);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .pendiente-ver {
      flex: none;
      padding: .5rem .95rem;
      border-radius: 999px;
      background: var(--marca, #e50914); color: #fff;
      font-size: .82rem; font-weight: 800; text-decoration: none;
      box-shadow: 0 4px 12px rgba(229,9,20,.25);
    }
    .pendiente-no {
      flex: none; width: 30px; height: 30px;
      border: none; border-radius: 50%;
      background: transparent; color: var(--tinta-suave, #5b616e);
      font: inherit; font-size: 1rem; cursor: pointer;
    }
    body.con-pendiente .app-aviso { display: none; }
    @media (prefers-reduced-motion: reduce) { .pendiente-aviso { transition: none; } }
  `;
  document.head.appendChild(css);
}

function mostrar(compra, token) {
  estilos();
  const a = document.createElement('div');
  a.className = 'pendiente-aviso' + (document.querySelector('.bottom-nav') ? ' con-barra' : '');
  a.setAttribute('role', 'status');
  a.innerHTML = `
    <span class="pendiente-ico">${ICONO_QR}</span>
    <div class="pendiente-txt">
      <b>Tenés un pedido esperando el pago</b>
      <span>Pedido #${escapar(compra.numero)} · ${montoDe(compra)} · ${escapar(queDe(compra))}</span>
    </div>
    <a class="pendiente-ver" href="pagar-qr.html#t=${encodeURIComponent(token)}">Ver QR</a>
    <button type="button" class="pendiente-no" aria-label="No mostrar más">✕</button>`;

  a.querySelector('.pendiente-no').addEventListener('click', () => {
    anotarCerrado(token);
    a.classList.remove('visible');
    document.body.classList.remove('con-pendiente');
  });

  document.body.appendChild(a);
  document.body.classList.add('con-pendiente');
  requestAnimationFrame(() => requestAnimationFrame(() => a.classList.add('visible')));
}

async function revisar() {
  const recordada = compraRecordada();
  if (!recordada || cerradoPara(recordada.token)) return;

  const compra = await mirarPedido(recordada.token);
  if (!compra) return;
  // Basta una línea esperando: es la compra entera la que falta pagar
  if (!(compra.lineas || []).some(l => l.estado === 'esperando_pago')) return;

  mostrar(compra, recordada.token);
}

setTimeout(revisar, DEMORA);
