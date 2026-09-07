// ============================================================
// TIAGO STORE · Servicio de Productos — EL INTERRUPTOR
// ============================================================
// Este archivo no tiene lógica. Solo decide de dónde salen los productos.
//
//   index.html y planes.html importan SIEMPRE desde acá, así que cambiar
//   de base es mover el comentario de una línea a la otra. Nada más.
//
// POR QUÉ ASÍ Y NO CON UN if
//   Un if obligaría a importar las dos versiones, y cada cliente se bajaría
//   el SDK de Firebase Y el de Supabase para usar uno solo. Con "export *"
//   el navegador descarga únicamente la línea que está activa.
//
// ⚠️ ESTE ARCHIVO LO USAN TRES PÁGINAS, NO DOS
//    index.html · planes.html · y TAMBIÉN admin/index.html, que saca de acá
//    la lista de productos del panel.
//
//    O sea: este interruptor va junto con js/panel-datos.js. Si el panel
//    escribe en Supabase pero lee de Firestore, guardás un precio, no lo
//    ves cambiar, lo guardás otra vez… y la lista nunca se actualiza porque
//    la estás leyendo de la base equivocada.
//
//    Los cuatro interruptores se mueven de una sola vez:
//      js/productos-service.js · js/juegos-service.js
//      js/panel-datos.js       · js/panel-auth.js
//
// PARA VOLVER ATRÁS
//   Comentás la de Supabase, descomentás la de Firebase, guardás. Listo.
//   La base vieja de Firestore sigue intacta: la mudanza copia, no mueve.
// ============================================================

// --- FIRESTORE (lo de siempre) -------------------------------
export * from './productos-service-firebase.js';

// --- SUPABASE (lo nuevo) -------------------------------------
// export * from './productos-service-supabase.js';
