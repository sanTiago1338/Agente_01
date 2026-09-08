// ============================================================
// TIAGO STORE · Datos del panel
// ============================================================
// De acá salen db, collection, doc, addDoc, updateDoc, deleteDoc,
// onSnapshot y serverTimestamp para todo el CRUD del panel.
//
// Los nombres son los de Firestore aunque por detrás haya Supabase: el
// panel son 1.600 líneas de interfaz de las que solo 13 hablan con la base,
// así que se tradujo la base y no la interfaz. La traducción vive en
// js/supabase-compat.js, y ahí está explicado en detalle.
//
// Es un puente, no un destino: las llamadas se pueden ir pasando a Supabase
// nativo de a una, sin apuro, y las dos formas conviven sin problema.
//
// Fue un interruptor entre Firestore y Supabase hasta el 7/9/2026. Para
// recuperar la versión de Firestore:
//   git log --diff-filter=D -- js/panel-datos-firebase.js
// ============================================================

export * from './supabase-compat.js';
