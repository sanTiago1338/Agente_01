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
// COMPRAS DE VARIOS PRODUCTOS
//   Un carrito con varios productos, o con cantidad 2, también se entrega
//   solo. La base arma un pedido por CADA cuenta a entregar, todos atados
//   a un mismo grupo (ver crear_compra en supabase/05-cobros.sql).
//
//   Si de un producto no hay stock, se entrega lo que sí hay y se avisa
//   por lo que falta. Media compra entregada es mejor que ninguna.
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
// Un uuid tiene 36 caracteres con guiones. Los ids de Firestore eran más
// cortos y sin guiones: esto distingue un producto de la base de cualquier
// otra cosa que venga en el carrito, como los juegos, que no tienen
// entrega automática. Una recarga no se entrega dando una cuenta: se le
// carga saldo al ID de jugador del cliente.
const esIdDeProducto = fid => typeof fid === 'string' && /^[0-9a-f-]{36}$/i.test(fid);

/**
 * Las líneas del carrito que se pueden pedir a la base.
 *
 * Antes esto exigía UN producto y UNA unidad, y cualquier otro carrito se
 * iba por el flujo viejo de WhatsApp: sin número, sin seguimiento y sin
 * entrega automática, aunque hubiera stock de todo.
 *
 * Ahora se aceptan varios productos y varias unidades. La base arma un
 * pedido por cada cuenta a entregar, todos atados a un mismo grupo.
 *
 * Se exige que TODAS las líneas sirvan. Si una no —un juego mezclado, por
 * ejemplo— se devuelve null y la compra entera sigue por WhatsApp. Es a
 * propósito: media compra automática y media a mano sería peor que
 * cualquiera de las dos enteras, para el cliente y para vos.
 *
 * @param {Array} items el carrito
 * @returns {Array|null} [{producto_id, cantidad}] o null
 */
export function lineasEntregables(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (items.length > 20) return null;          // el mismo tope que la base

  const lineas = [];
  for (const item of items) {
    if (!item || !esIdDeProducto(item.fid)) return null;
    lineas.push({
      producto_id: item.fid,
      cantidad: Math.max(1, Math.min(10, Number(item.qty) || 1))
    });
  }
  return lineas;
}


// ============================================================
// 2. CREAR EL PEDIDO
// ============================================================
/**
 * @param {Object} item     el del carrito, con fid
 * @param {Object} cliente  { nombre, whatsapp, email }
 * @returns {Promise<Object|null>} { token, numero, precio, producto } o null
 */
export async function crearCompra(lineas, cliente = {}) {
  try {
    const { data, error } = await sb.rpc('crear_compra', {
      p_items:    lineas,
      p_nombre:   (cliente.nombre   || '').slice(0, 80),
      p_whatsapp: (cliente.whatsapp || '').slice(0, 30),
      p_email:    (cliente.email    || '').slice(0, 120)
    });

    if (error) {
      // Errores esperables: un producto que todavía no está en la base, o
      // marcado como agotado. No es un fallo del sitio: es que esa compra
      // va por el camino manual.
      console.warn('Compra automática no disponible:', error.message);
      return null;
    }

    const compra = Array.isArray(data) ? data[0] : data;
    if (!compra || !compra.token) return null;

    // Se recuerda con la huella del carrito, no con un producto: así al
    // volver se sabe si el carrito de ahora es el mismo de antes.
    recordar(compra.token, huellaDeCarrito(lineas));
    return compra;

  } catch (e) {
    console.warn('No se pudo crear la compra:', e.message);
    return null;
  }
}

/**
 * Una huella corta del carrito, para poder comparar dos carritos.
 *
 * Antes se guardaba el id del único producto, y con eso alcanzaba para
 * saber si el pedido recordado era el que se está comprando ahora. Con
 * varios productos hace falta comparar el conjunto: mismos productos y
 * mismas cantidades. Se ordena para que el orden en que los agregó al
 * carrito no cambie la huella.
 */
export function huellaDeCarrito(lineas) {
  return (lineas || [])
    .map(l => `${l.producto_id}x${l.cantidad}`)
    .sort()
    .join('|');
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
/**
 * El estado de la compra ENTERA, sacado de sus líneas.
 *
 * Una compra de varios productos puede quedar a medias: se entregan dos y
 * el tercero se quedó sin stock. Eso no es un error —la base lo hace a
 * propósito, entregar lo que se pueda es mejor que no entregar nada— pero
 * la pantalla necesita un solo estado para saber qué mostrar.
 *
 *   entregado   todas entregadas
 *   parcial     algunas sí, otras no. La pantalla muestra las que llegaron
 *               y avisa por las que faltan
 *   sin_stock   se pagó y no había ninguna
 *   esperando   todavía falta confirmar el pago (manda sobre las demás:
 *               mientras haya una esperando, la compra está en curso)
 *   vencido     nadie pagó y pasó el tiempo
 */
export function resumirCompra(compra) {
  const lineas = (compra && compra.lineas) || [];
  if (lineas.length === 0) return { estado: 'vacio', lineas: [], entregadas: [] };

  const cuenta = e => lineas.filter(l => l.estado === e).length;

  const entregadas = lineas.filter(l => l.estado === 'entregado');
  const esperando  = cuenta('esperando_pago') + cuenta('pagado');
  const sinStock   = cuenta('sin_stock');
  const vencidas   = cuenta('vencido');

  let estado;
  if (esperando > 0)                          estado = 'esperando_pago';
  else if (entregadas.length === lineas.length) estado = 'entregado';
  else if (entregadas.length > 0)               estado = 'parcial';
  else if (sinStock > 0)                        estado = 'sin_stock';
  else if (vencidas === lineas.length)          estado = 'vencido';
  else                                          estado = 'cancelado';

  return {
    estado,
    lineas,
    entregadas,
    faltan: lineas.length - entregadas.length,
    numero: compra.numero,
    total:  compra.total
  };
}

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
      const { data, error } = await sb.rpc('ver_mi_compra', { p_token: token });

      if (!error && data && !data.error) {
        // El estado sale del resumen de las líneas, no del pedido: una
        // compra de varios productos no tiene un estado propio.
        const resumen = resumirCompra(data);

        // Solo se avisa cuando el estado CAMBIA. Si no, el que escucha
        // estaría redibujando la pantalla cada 4 segundos para nada.
        //
        // Se compara también cuántas van entregadas: en una compra de tres,
        // pasar de una entregada a dos no cambia el estado ("parcial" en
        // los dos casos) pero sí cambia lo que hay que mostrar.
        const firma = `${resumen.estado}:${resumen.entregadas.length}`;
        if (firma !== anterior) {
          anterior = firma;
          onCambio(data, resumen);
        }

        data.estado = resumen.estado;   // para los cortes de abajo

        // Estos son finales: no hay nada más que esperar.
        //
        // "vencido" NO está en la lista, aunque suene a final. Vencer es
        // una etiqueta interna para que el panel no se llene de pedidos
        // abandonados; la plata puede llegar igual y confirmar_pago()
        // acepta un pedido vencido sin problema. Si dejáramos de preguntar,
        // el cliente que pagó tarde no vería nunca su cuenta aparecer.
        // De todos modos se corta solo a las 3 horas (RENDIRSE_A_LAS).
        if (['entregado', 'cancelado'].includes(data.estado)) {
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
    const { data, error } = await sb.rpc('ver_mi_compra', { p_token: token });
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

// Junto con el token se guarda la HUELLA DEL CARRITO: qué productos y en
// qué cantidades. Es lo que permite, al arrancar, decidir si la compra
// guardada es la de este carrito o la de otro, sin preguntarle nada a la
// base primero — y sigue sirviendo aunque esa consulta falle.
function recordar(token, huella) {
  try {
    localStorage.setItem(LLAVE, JSON.stringify({ token, huella, cuando: Date.now() }));
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
 * La última compra que hizo este navegador, como { token, huella }.
 *
 * ⚠️ ESTA NO SE USA A CIEGAS, Y ES IMPORTANTE.
 *   Al principio la página retomaba la compra guardada siempre que
 *   existiera. El resultado: comprabas Netflix, volvías a la tienda,
 *   comprabas Disney… y la página de Disney te mostraba la cuenta de
 *   Netflix. Lo guardado no tiene por qué ser lo que estás comprando ahora.
 *
 *   Por eso viene con la huella del carrito: el que llama la compara con
 *   huellaDeCarrito() de lo que se está comprando, antes de retomarla.
 *   Ver el arranque en pagar-qr.html.
 *
 * @returns {{token: string, huella: string|null}|null}
 */
export function compraRecordada() {
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
export function credencialesComoTexto(compra) {
  const entregadas = ((compra && compra.lineas) || [])
    .filter(l => l.estado === 'entregado' && l.credenciales);

  if (entregadas.length === 0) return '';

  const bloque = l => {
    const c = l.credenciales || {};
    return [
      l.producto,
      c.usuario ? `Usuario: ${c.usuario}` : '',
      c.clave   ? `Clave: ${c.clave}`     : '',
      c.perfil  ? `Perfil: ${c.perfil}`   : '',
      c.pin     ? `PIN: ${c.pin}`         : '',
      c.notas   ? c.notas                 : ''
    ].filter(Boolean).join('\n');
  };

  // Con una sola cuenta no se numera: "1)" para un solo item queda raro.
  const cuerpo = entregadas.length === 1
    ? bloque(entregadas[0])
    : entregadas.map((l, i) => `${i + 1}) ${bloque(l)}`).join('\n\n');

  return `TIAGO STORE · Pedido #${compra.numero}\n\n${cuerpo}`;
}
