// ============================================================
// TIAGO STORE · Servicio de Juegos sobre Supabase (solo lectura)
// ============================================================
// Misma API que la versión de Firestore:
//   subscribeJuegos · precioDesde
//
// recarga-juegos.html no cambia ni una línea. El que elige entre una
// versión y la otra es js/juegos-service.js.
//
// Los paquetes de recarga viven dentro del juego, en la columna jsonb
// "paquetes", igual que vivían dentro del documento en Firestore. Una sola
// lectura trae el juego completo.
// ============================================================

import { sb } from './supabase-base.js';
import { filaAJuego } from './mapeo.js';

const TABLA = 'juegos';

function ordenar(juegos) {
  return juegos.sort((a, b) => (a.orden ?? 999999) - (b.orden ?? 999999));
}

/**
 * Suscripción EN TIEMPO REAL al catálogo de juegos.
 * Cuando cambiás el precio de un paquete desde el panel, la página
 * de recargas se actualiza sola, sin recargar ni republicar.
 *
 * @param {Function} onCambio recibe (juegos: Array) en cada cambio
 * @param {Function} [onError] recibe (error) si falla la conexión
 * @returns {Function} unsubscribe
 */
export function subscribeJuegos(onCambio, onError) {
  const cache = new Map();

  let cortado        = false;
  let generacion     = 0;
  let tocadosDurante = null;
  let yaHuboConexion = false;

  const fallo = (error, donde) => {
    console.error(`❌ Error ${donde} juegos:`, error);
    if (!cortado && onError) onError(error);
  };

  // -----------------------------------------------------------
  // Lo que sale a la página
  // -----------------------------------------------------------
  // Los juegos apagados se filtran ACÁ y no en el SELECT, a propósito.
  //
  // Si filtráramos en la consulta (.eq('activo', true)), al apagar un juego
  // desde el panel llegaría un UPDATE de una fila que ya no cumple el
  // filtro, y habría que acordarse de sacarla a mano de la cache. Trayendo
  // todo y filtrando al final, apagar y prender un juego "simplemente
  // funciona" en las dos direcciones.
  //
  // Son 27 juegos: traer los apagados no cuesta nada. Es la misma decisión
  // que tomaba la versión de Firestore.
  const emitir = () => {
    if (cortado) return;

    const juegos = ordenar([...cache.values()]).filter(j => j.activo !== false);

    // Los paquetes también respetan su propio orden
    juegos.forEach(j => {
      if (Array.isArray(j.paquetes)) {
        j.paquetes.sort((a, b) => (a.orden ?? 999999) - (b.orden ?? 999999));
      }
    });

    onCambio(juegos);
  };

  // -----------------------------------------------------------
  // Carga completa (al arrancar y en cada reconexión)
  // -----------------------------------------------------------
  async function cargarTodo() {
    const miGeneracion = ++generacion;
    tocadosDurante = new Set();

    const { data, error } = await sb
      .from(TABLA)
      .select('*')
      .order('orden', { ascending: true });

    if (cortado || miGeneracion !== generacion) return;
    if (error) { fallo(error, 'cargando'); return; }

    const tocados = tocadosDurante;
    tocadosDurante = null;

    for (const [id] of cache) {
      if (!tocados.has(id)) cache.delete(id);
    }
    for (const fila of data) {
      if (!tocados.has(fila.id)) cache.set(fila.id, filaAJuego(fila));
    }

    emitir();
  }

  // -----------------------------------------------------------
  // Cambios sueltos
  // -----------------------------------------------------------
  function aplicarCambio(payload) {
    if (cortado) return;

    const id = payload.new?.id ?? payload.old?.id;
    if (!id) return;

    if (payload.eventType === 'DELETE') cache.delete(id);
    else                                cache.set(id, filaAJuego(payload.new));

    if (tocadosDurante) tocadosDurante.add(id);
    emitir();
  }

  const canal = sb
    .channel('juegos-tienda')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, aplicarCambio)
    .subscribe(estado => {
      if (estado === 'SUBSCRIBED') {
        if (yaHuboConexion) cargarTodo();   // resincronizar tras una caída
        yaHuboConexion = true;
        return;
      }
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
        console.warn(`⚠️ Realtime de juegos: ${estado}. Reintentando…`);
      }
    });

  cargarTodo();

  return function unsubscribe() {
    cortado = true;
    sb.removeChannel(canal);
  };
}

/**
 * Precio más bajo de un juego — para mostrar "desde X Bs".
 * Ignora los paquetes marcados "a consultar".
 * @param {Object} juego
 * @returns {number|null} null si no tiene ningún precio
 */
export function precioDesde(juego) {
  const precios = (juego.paquetes || [])
    .filter(p => !p.consultar && p.precio > 0)
    .map(p => p.precio);
  return precios.length ? Math.min(...precios) : null;
}
