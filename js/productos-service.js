// ============================================================
// TIAGO STORE · Servicio de Productos
// ============================================================
// De acá salen los productos para index.html, planes.html y el panel.
// Este archivo no tiene lógica: solo reexporta la implementación.
//
// Exporta: subscribeProductos · precioFinal · formatBs · porcentajeDescuento
//
// POR QUÉ EXISTE SI NO HACE NADA
//   Es el único lugar del que importan las tres páginas. Mientras siga
//   siendo así, cambiar de dónde salen los productos —otro archivo, otro
//   nombre, otra base— se hace tocando esta línea y nada más.
// ============================================================

export * from './productos-service-supabase.js';
