// ============================================================
// TIAGO STORE · Servicio de Juegos — EL INTERRUPTOR
// ============================================================
// Igual que js/productos-service.js: acá solo se elige la base.
// recarga-juegos.html importa siempre desde este archivo.
//
// Los dos interruptores son independientes a propósito: podés pasar los
// juegos a Supabase, mirar unos días que ande todo, y recién ahí mover el
// catálogo de productos. Si algo sale mal, el que rompe es uno solo.
// ============================================================

// --- FIRESTORE (lo de antes) ---------------------------------
// export * from './juegos-service-firebase.js';

// --- SUPABASE (desde el 7/9/2026) ----------------------------
export * from './juegos-service-supabase.js';
