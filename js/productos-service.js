// ============================================================
// TIAGO STORE · Servicio de Productos (solo lectura)
// ============================================================
// Capa única de acceso a la colección "productos" de Firestore.
// Todas las funciones que necesita la tienda pública viven acá.
//
// El CRUD del admin (crear/editar/eliminar) va en:
//   admin/js/admin-productos.js
//
// NOTA SOBRE "activo":
//   activo = false  ->  el producto SE MUESTRA pero como AGOTADO
//                       (botón gris, no se puede comprar)
//   No se oculta. Así funciona hoy tu tienda y así lo mantenemos.
// ============================================================

import { db } from './firebase-config.js';
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// -----------------------------------------------------------
// Referencia a la colección
// -----------------------------------------------------------
const productosRef = collection(db, 'productos');

// -----------------------------------------------------------
// Helper: convierte un DocumentSnapshot en producto plano
// -----------------------------------------------------------
// Firestore devuelve objetos con .id y .data(). Los aplanamos a:
//   { id: "abc123", nombre: "Netflix", precio: 109, ... }
function docToProducto(docSnap) {
  return {
    id: docSnap.id,
    ...docSnap.data()
  };
}

// -----------------------------------------------------------
// Helper: ordena por el campo "orden" (menor = primero)
// Si un producto no tiene "orden", va al final.
// -----------------------------------------------------------
function ordenarProductos(productos) {
  return productos.sort((a, b) => (a.orden ?? 999999) - (b.orden ?? 999999));
}

// ============================================================
// FUNCIONES PÚBLICAS
// ============================================================

/**
 * Suscripción EN TIEMPO REAL al catálogo completo.
 *
 * Cada vez que cambia algo en Firestore (el admin edita un precio, agrega un
 * producto, lo marca como agotado...), el callback se dispara con la lista
 * actualizada. La tienda NO necesita recargarse: se actualiza sola.
 *
 * @param {Function} onCambio recibe (productos: Array) en cada cambio
 * @param {Function} [onError] recibe (error) si falla la conexión
 * @returns {Function} unsubscribe — llamala para dejar de escuchar
 *
 * @example
 *   const parar = subscribeProductos(productos => renderProducts(productos));
 *   // más tarde:  parar();
 */
export function subscribeProductos(onCambio, onError) {
  return onSnapshot(
    productosRef,
    snapshot => onCambio(ordenarProductos(snapshot.docs.map(docToProducto))),
    error => {
      console.error('❌ Error escuchando productos:', error);
      if (onError) onError(error);
    }
  );
}

// ============================================================
// HELPERS DE PRESENTACIÓN
// ============================================================

/**
 * Precio final que paga el cliente (respeta la oferta si está activa).
 * @param {Object} p producto
 * @returns {number}
 */
export function precioFinal(p) {
  return (p.oferta && p.precioOferta > 0) ? p.precioOferta : p.precio;
}

/**
 * Formatea un precio para mostrar: 84.9 -> "84.90Bs" · 109 -> "109Bs"
 * @param {number} n
 * @returns {string}
 */
export function formatBs(n) {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? `${num}Bs` : `${num.toFixed(2)}Bs`;
}

/**
 * Porcentaje de descuento de una oferta. 0 si no está en oferta.
 * @param {Object} p producto
 * @returns {number} ej. 27 (significa -27%)
 */
export function porcentajeDescuento(p) {
  if (!p.oferta || !(p.precioOferta > 0) || !(p.precio > 0)) return 0;
  return Math.round((1 - p.precioOferta / p.precio) * 100);
}
