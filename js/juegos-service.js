// ============================================================
// TIAGO STORE · Servicio de Juegos
// ============================================================
// De acá salen los juegos y sus paquetes para recarga-juegos.html.
// Igual que js/productos-service.js: solo reexporta.
//
// Fue un interruptor entre Firestore y Supabase hasta el 7/9/2026. La
// mudanza terminó y la versión de Firestore se borró; el archivo se queda
// porque recarga-juegos.html importa desde acá.
//
// Para recuperar la de Firestore:
//   git log --diff-filter=D -- js/juegos-service-firebase.js
// ============================================================

export * from './juegos-service-supabase.js';
