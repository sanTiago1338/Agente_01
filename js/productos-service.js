// ============================================================
// TIAGO STORE · Servicio de Productos
// ============================================================
// De acá salen los productos para index.html, planes.html y el panel.
// Este archivo no tiene lógica: solo reexporta la implementación.
//
// Exporta: subscribeProductos · precioFinal · formatBs · porcentajeDescuento
//
// POR QUÉ EXISTE SI NO HACE NADA
//   Hasta el 7/9/2026 era un interruptor: tenía dos líneas, una de Firestore
//   y otra de Supabase, y se cambiaba de base moviendo un comentario. La
//   mudanza terminó y la de Firestore se borró, pero el archivo se queda:
//   las tres páginas importan desde acá, así que sigue siendo el único lugar
//   donde tocar si algún día la implementación cambia de nombre o de lugar.
//
//   Si hace falta volver a Firestore, está entero en el historial:
//     git log --diff-filter=D -- js/productos-service-firebase.js
// ============================================================

export * from './productos-service-supabase.js';
