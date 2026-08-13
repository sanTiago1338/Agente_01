// ============================================================
// ZONA VIP · Servicio de Juegos (solo lectura)
// ============================================================
// Acceso a la colección "juegos" de Firestore.
//
// Un juego guarda sus paquetes de recarga dentro del mismo
// documento, en el campo "paquetes" (un array). Firestore lo
// permite y así una sola lectura trae el juego completo.
//
// El CRUD del admin vive en: admin/js/admin-juegos.js
// ============================================================

import { db } from './firebase-config.js';
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const juegosRef = collection(db, 'juegos');

function docToJuego(docSnap) {
  return { id: docSnap.id, ...docSnap.data() };
}

function ordenarJuegos(juegos) {
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
  return onSnapshot(
    juegosRef,
    snapshot => {
      const juegos = ordenarJuegos(snapshot.docs.map(docToJuego))
        .filter(j => j.activo !== false);

      // Los paquetes también respetan su propio orden
      juegos.forEach(j => {
        if (Array.isArray(j.paquetes)) {
          j.paquetes.sort((a, b) => (a.orden ?? 999999) - (b.orden ?? 999999));
        }
      });

      onCambio(juegos);
    },
    error => {
      console.error('❌ Error escuchando juegos:', error);
      if (onError) onError(error);
    }
  );
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
