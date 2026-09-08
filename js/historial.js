// ============================================================
// TIAGO STORE · Historial de compras del cliente
// ============================================================
// La lista de lo que compró, guardada SOLO en su navegador.
//
// POR QUÉ EN EL NAVEGADOR Y NO EN LA BASE
//   Se decidió no hacer login para comprar: pedir usuario y contraseña
//   antes de dejar pagar espanta ventas, y el soporte —"no me llega el
//   correo", "olvidé mi clave"— cae sobre el dueño.
//
//   Sin login no hay a quién atarle un historial del lado del servidor.
//   Pero el navegador ya es una identidad: el que compró desde este
//   teléfono es el que vuelve a abrirlo. Alcanza, y no cuesta nada.
//
//   Lo que se pierde: si cambia de celular o borra los datos del
//   navegador, pierde la lista. Se avisa en la propia página para que no
//   sea una sorpresa.
//
// LO QUE SE GUARDA, Y LO QUE NO
//   Se guarda el TOKEN del pedido, no las credenciales. "Abrir mi cuenta"
//   las vuelve a pedir a la base con ese token.
//
//   Es a propósito: así no quedan contraseñas de Netflix escritas en el
//   navegador, y si alguna vez tenés que cambiar una cuenta entregada, el
//   cliente ve la nueva y no una copia vieja.
//
// SOLO LO ENTREGADO
//   Un pedido que todavía no se pagó no es una compra: es un intento. Si
//   entrara al historial, el cliente vería una lista llena de cosas que
//   nunca compró. Solo entran los que ya tienen cuenta entregada.
// ============================================================

const LLAVE = 'tiago-mis-compras';

// Tope de compras guardadas. Es una tienda de cuentas, no un supermercado:
// con 50 sobra, y evita que el localStorage crezca sin fin.
const TOPE = 50;


function leerCrudo() {
  try {
    const v = JSON.parse(localStorage.getItem(LLAVE) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    // Modo incógnito, almacenamiento bloqueado, o basura guardada por una
    // versión vieja. Se devuelve vacío: mejor sin historial que roto.
    return [];
  }
}

function escribir(lista) {
  try {
    localStorage.setItem(LLAVE, JSON.stringify(lista.slice(0, TOPE)));
  } catch { /* no se pudo: el historial no es imprescindible */ }
}


/**
 * Guarda una compra entregada.
 *
 * Es idempotente: si ya estaba, se actualiza en su lugar en vez de
 * duplicarse. Hace falta porque la página de pago llama a esto cada vez
 * que repinta, y una compra a medias puede pasar de 1 cuenta entregada a
 * 2 sin dejar de ser la misma compra.
 *
 * @param {string} token  el del pedido, la llave para volver a abrirla
 * @param {Object} compra lo que devolvió ver_mi_compra
 */
export function guardarCompra(token, compra) {
  if (!token || !compra) return;

  const entregadas = (compra.lineas || []).filter(l => l.estado === 'entregado');
  if (entregadas.length === 0) return;   // todavía no es una compra

  const entrada = {
    token,
    numero: compra.numero,
    // Cuándo se entregó la primera. Si no viene, ahora.
    fecha: entregadas[0].entregado_en || new Date().toISOString(),
    // Solo los nombres, para poder listar sin consultar la base. Se
    // repiten si compró dos del mismo: es lo que efectivamente compró.
    productos: entregadas.map(l => l.producto),
    total: Number(compra.total) || null,
    // Cuántas de las que pagó siguen sin entregarse, para poder avisarlo
    // en la lista sin tener que abrir cada una.
    faltan: (compra.lineas || []).length - entregadas.length
  };

  const lista = leerCrudo().filter(c => c.token !== token);
  lista.unshift(entrada);              // la más nueva primero
  escribir(lista);
}


/**
 * Las compras guardadas, de la más nueva a la más vieja.
 * @returns {Array}
 */
export function misCompras() {
  return leerCrudo()
    .filter(c => c && c.token && c.numero)
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}


/**
 * Saca una compra de la lista.
 *
 * Solo borra el recuerdo local: la compra sigue existiendo en la base y el
 * dueño la sigue viendo en su panel. Es para que el cliente pueda limpiar
 * su propia pantalla, no para deshacer nada.
 */
export function olvidarCompra(token) {
  escribir(leerCrudo().filter(c => c.token !== token));
}


/** Vacía el historial de este navegador. */
export function olvidarTodo() {
  try { localStorage.removeItem(LLAVE); } catch { /* nada */ }
}


/** El link para volver a ver una compra. */
export function linkDeCompra(token) {
  return `pagar-qr.html#t=${token}`;
}
