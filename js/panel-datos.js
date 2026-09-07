// ============================================================
// TIAGO STORE · Datos del panel — EL INTERRUPTOR
// ============================================================
// De acá salen db, collection, doc, addDoc, updateDoc, deleteDoc,
// onSnapshot y serverTimestamp para todo el CRUD del panel.
//
// Cambiar de base = mover el comentario de una línea a la otra.
//
// ⚠️ ESTE INTERRUPTOR Y EL DE js/panel-auth.js VAN JUNTOS.
//    Si los datos apuntan a Supabase y el login a Firebase, el panel entra
//    con un usuario de Firebase y después escribe con un cliente de
//    Supabase que no tiene sesión: RLS lo rebota y todo tira "sin permiso".
//    Se cambian los dos o ninguno.
// ============================================================

// --- FIRESTORE (lo de siempre) -------------------------------
export * from './panel-datos-firebase.js';

// --- SUPABASE (lo nuevo) -------------------------------------
// export * from './supabase-compat.js';
