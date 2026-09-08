// ============================================================
// TIAGO STORE · Pedido con entrega automática
// ============================================================
// Lo que usa pagar-qr.html para que el cliente reciba su cuenta en la
// misma página, sin WhatsApp de por medio.
//
// EL FLUJO COMPLETO
//   1. El cliente toca "Pagar con QR" en la tienda
//   2. Acá se crea un pedido en Supabase y se guarda su token en la URL
//   3. El cliente paga con el QR y avisa por WhatsApp (como siempre)
//   4. Vos confirmás desde el panel  →  o el webhook, cuando lo tengas
//   5. Esta página, que estaba preguntando cada 4 segundos, muestra la
//      cuenta sola
//
// REGLA DE ORO: SI ALGO FALLA, NO SE ROMPE NADA
//   Todo lo de acá es un agregado. Si Supabase no contesta, si el
//   producto todavía no está migrado, si el cliente tiene el internet
//   cortado — la página sigue funcionando igual que siempre, con su QR y
//   su botón de WhatsApp. Por eso cada función devuelve null en vez de
//   tirar error: el que llama decide seguir sin esto.
//
// LO QUE TODAVÍA NO HACE
//   Un pedido = un producto, una unidad. Un carrito con dos productos
//   distintos, o con cantidad 2, sigue por el camino de WhatsApp de
//   siempre. Es el caso menos común y agregarlo sin necesitarlo todavía
//   habría complicado la entrega, que es la parte que no puede fallar.
// ============================================================

import { sb } from './supabase-base.js';

// Cada cuánto se le pregunta a la base si ya confirmaron el pago.
// 4 segundos es un equilibrio: más rápido no aporta nada (el pago lo
// confirma una persona, no una máquina) y más lento se siente muerto.
const CADA = 4000;

// Después de 3 horas se deja de preguntar. El pedido ya venció y seguir
// consultando desde una pestaña olvidada no le sirve a nadie.
const RENDIRSE_A_LAS = 3 * 60 * 60 * 1000;

// Dónde se recuerda el pedido en curso, por si el cliente cierra la
// pestaña sin querer y vuelve a entrar.
const LLAVE = 'tiago-pedido-en-curso';


// ============================================================
// 1. ¿SE PUEDE ENTREGAR SOLO?
// ============================================================
/**
 * Un carrito sirve para entrega automática solo si es exactamente un
 * producto, una unidad, y trae el id real del producto en la base.
 *
 * El "fid" lo pone la tienda al armar el carrito. Si falta, es que el
 * producto todavía no está migrado a Supabase, o que el carrito viene de
 * la página de recargas de juegos — que no tiene entrega automática, y
 * está bien: una recarga no se entrega dando una cuenta, se le carga
 * saldo al ID de jugador del cliente.
 *
 * @param {Array} items el carrito
 * @returns {Object|null} el item si sirve, null si no
 */
export function itemEntregable(items) {
  if (!Array.isArray(items) || items.length !== 1) return null;

  const item = items[0];
  if (!item || !item.fid) return null;
  if ((item.qty ?? 1) !== 1)  return null;

  // Un uuid tiene 36 caracteres con guiones. Los ids de Firestore son más
  // cortos y sin guiones: si todavía no migraste, esto lo detecta y sigue
  // por el camino de siempre en vez de fallar contra Supabase.
  if (!/^[0-9a-f-]{36}$/i.test(item.fid)) return null;

  return item;
}


// ============================================================
// 2. CREAR EL PEDIDO
// ============================================================
/**
 * @param {Object} item     el del carrito, con fid
 * @param {Object} cliente  { nombre, whatsapp, email }
 * @returns {Promise<Object|null>} { token, numero, precio, producto } o null
 */
export async function crearPedido(item, cliente = {}) {
  try {
    const { data, error } = await sb.rpc('crear_pedido', {
      p_producto_id: item.fid,
      p_nombre:      (cliente.nombre   || '').slice(0, 80),
      p_whatsapp:    (cliente.whatsapp || '').slice(0, 30),
      p_email:       (cliente.email    || '').slice(0, 120)
    });

    if (error) {
      // Errores esperables: el producto no existe todavía en Supabase, o
      // está marcado como agotado. No es un fallo del sitio: es que este
      // producto va por el camino manual.
      console.warn('Pedido automático no disponible:', error.message);
      return null;
    }

    const pedido = Array.isArray(data) ? data[0] : data;
    if (!pedido || !pedido.token) return null;

    recordar(pedido.token, item.fid);
    return pedido;

  } catch (e) {
    console.warn('No se pudo crear el pedido:', e.message);
    return null;
  }
}


// ============================================================
// 3. PREGUNTAR SI YA LO CONFIRMARON
// ============================================================
/**
 * Pregunta cada 4 segundos hasta que el pedido se entregue.
 *
 * POR QUÉ PREGUNTAR Y NO ESCUCHAR EN VIVO
 *   Lo natural sería Realtime, pero no se puede: Realtime respeta las
 *   políticas de la base, y ahí decidimos —bien— que solo un admin puede
 *   leer la tabla de pedidos. El cliente no tiene login, así que no le
 *   llegaría ningún aviso. Aflojar esa política dejaría que cualquiera
 *   listara los pedidos de todos.
 *
 *   Preguntar con el token es una consulta minúscula, solo mientras la
 *   página está abierta, y el token no le sirve a nadie más.
 *
 * @param {string} token
 * @param {Function} onCambio recibe (pedido) cada vez que cambia el estado
 * @returns {Function} llamala para dejar de preguntar
 */
export function seguirPedido(token, onCambio) {
  let cortado  = false;
  let anterior = null;
  let reloj    = null;
  const desde  = Date.now();

  async function preguntar() {
    if (cortado) return;

    // La pestaña está en segundo plano: no gastamos consultas ni batería.
    // Al volver, el listener de abajo pregunta enseguida.
    if (document.hidden) { programar(); return; }

    try {
      const { data, error } = await sb.rpc('ver_mi_pedido', { p_token: token });

      if (!error && data && !data.error) {
        // Solo se avisa cuando el estado CAMBIA. Si no, el que escucha
        // estaría redibujando la pantalla cada 4 segundos para nada.
        if (data.estado !== anterior) {
          anterior = data.estado;
          onCambio(data);
        }

        // Estos son finales: no hay nada más que esperar.
        if (['entregado', 'vencido', 'cancelado'].includes(data.estado)) {
          // Un pedido entregado se SIGUE recordando, a propósito. Si el
          // cliente cierra la pestaña sin copiar la cuenta y vuelve a
          // entrar, este recuerdo es lo que se la devuelve. Se limpia solo
          // a las 24 horas, y no puede confundirse con otra compra porque
          // la página compara el producto antes de retomarlo.
          // Los vencidos y cancelados sí se olvidan: no hay nada que ver.
          if (data.estado !== 'entregado') olvidar();
          cortado = true;
          return;
        }
      }
    } catch {
      // Sin internet. No se avisa nada: el cliente ya ve el QR y su
      // pedido, y molestarlo con un error de red no le sirve. Se
      // reintenta solo en el próximo ciclo.
    }

    if (Date.now() - desde > RENDIRSE_A_LAS) { cortado = true; return; }
    programar();
  }

  const programar = () => { reloj = setTimeout(preguntar, CADA); };

  // Cuando el cliente vuelve a la pestaña —típico: fue a pagar al banco y
  // volvió— se pregunta al instante en vez de esperar el ciclo.
  const alVolver = () => { if (!document.hidden && !cortado) { clearTimeout(reloj); preguntar(); } };
  document.addEventListener('visibilitychange', alVolver);

  preguntar();

  return function parar() {
    cortado = true;
    clearTimeout(reloj);
    document.removeEventListener('visibilitychange', alVolver);
  };
}


/**
 * Una consulta suelta, sin quedarse preguntando.
 * @returns {Promise<Object|null>}
 */
export async function mirarPedido(token) {
  try {
    const { data, error } = await sb.rpc('ver_mi_pedido', { p_token: token });
    if (error || !data || data.error) return null;
    return data;
  } catch {
    return null;
  }
}


// ============================================================
// 4. NO PERDER EL PEDIDO
// ============================================================
// El token es la única llave del cliente a su cuenta. Si lo pierde, no
// hay forma de recuperarlo desde el navegador. Por eso se guarda en tres
// lados a la vez, y con que sobreviva uno alcanza:
//
//   · en la URL (#t=...)  → si copia el link o lo comparte
//   · en localStorage     → si cierra la pestaña y vuelve
//   · en el mensaje de WhatsApp que manda con el comprobante
//
// El de WhatsApp es el más importante: queda en su chat para siempre, y
// es el único que sobrevive a que formatee el celular.

// Junto con el token se guarda DE QUÉ PRODUCTO era. Es lo que permite, al
// arrancar, decidir si el pedido guardado es el de esta compra o el de otra
// sin tener que preguntarle nada a la base primero. (ver_mi_pedido también
// devuelve el producto_id, pero recién después de una consulta; esto
// resuelve antes, y sigue sirviendo aunque esa consulta falle.)
function recordar(token, productoId) {
  try {
    localStorage.setItem(LLAVE, JSON.stringify({ token, fid: productoId, cuando: Date.now() }));
  } catch { /* modo incógnito: queda el de la URL */ }

  // replaceState y no push: que el botón "atrás" del navegador siga
  // llevando a la tienda y no a esta misma página otra vez.
  try {
    history.replaceState(null, '', location.pathname + location.search + '#t=' + token);
  } catch { /* da igual */ }
}

function olvidar() {
  try { localStorage.removeItem(LLAVE); } catch { /* nada */ }
}

/**
 * El token que viene en la URL (#t=...). Es una orden explícita: el
 * cliente entró por SU link, el del chat de WhatsApp. Siempre se respeta.
 * @returns {string|null}
 */
export function tokenDeLaUrl() {
  return (location.hash.match(/[#&]t=([0-9a-f]{32,})/i) || [])[1] || null;
}

/**
 * El último pedido que hizo este navegador, como { token, fid }.
 *
 * ⚠️ ESTE NO SE USA A CIEGAS, Y ES IMPORTANTE.
 *   Al principio la página retomaba este pedido siempre que existiera. El
 *   resultado: comprabas Netflix, volvías a la tienda, comprabas Disney…
 *   y la página de Disney te mostraba la cuenta de Netflix. El pedido
 *   guardado no tiene por qué ser el que estás comprando ahora.
 *
 *   Por eso viene con el fid del producto: el que llama lo compara con lo
 *   que se está comprando antes de retomarlo. Ver el arranque en
 *   pagar-qr.html.
 *
 * @returns {{token: string, fid: string|null}|null}
 */
export function pedidoRecordado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(LLAVE) || 'null');
    if (!guardado || !guardado.token) return null;

    // Más de un día es un pedido viejo que no vale la pena resucitar:
    // si nunca lo pagó, ya venció.
    if (Date.now() - (guardado.cuando || 0) > 24 * 60 * 60 * 1000) {
      olvidar();
      return null;
    }
    return { token: guardado.token, fid: guardado.fid || null };
  } catch {
    return null;
  }
}


// ============================================================
// 5. ¿HAY STOCK? — para poder prometer antes de cobrar
// ============================================================
/**
 * Cuántas cuentas libres hay de un producto. Sirve para decirle al
 * cliente "entrega inmediata" solo cuando es verdad.
 *
 * Prometer entrega instantánea y después no tenerla es peor que no
 * prometer nada: el cliente ya pagó esperando algo que no llega.
 *
 * @returns {Promise<number|null>} null si no se pudo saber
 */
export async function hayStock(productoId) {
  try {
    const { data, error } = await sb.rpc('hay_stock', { p_producto_id: productoId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}


// ============================================================
// 6. EL TEXTO DE LA CUENTA, PARA COPIAR
// ============================================================
/**
 * Arma las credenciales en un texto que el cliente pueda guardar.
 * @param {Object} pedido lo que devolvió ver_mi_pedido
 * @returns {string}
 */
export function credencialesComoTexto(pedido) {
  const c = pedido.credenciales || {};
  return [
    `TIAGO STORE · Pedido #${pedido.numero}`,
    pedido.producto,
    ``,
    c.usuario ? `Usuario: ${c.usuario}` : '',
    c.clave   ? `Clave: ${c.clave}`     : '',
    c.perfil  ? `Perfil: ${c.perfil}`   : '',
    c.pin     ? `PIN: ${c.pin}`         : '',
    c.notas   ? `\n${c.notas}`          : ''
  ].filter(l => l !== '').join('\n');
}
