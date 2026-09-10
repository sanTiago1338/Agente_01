// ============================================================
// TIAGO STORE · Datos del panel
// ============================================================
// De acá salen db, collection, doc, addDoc, updateDoc, deleteDoc,
// onSnapshot y serverTimestamp para todo el CRUD del panel.
//
// POR QUÉ EL PANEL HABLA CON ESOS NOMBRES
//   Son los de Firestore, la base con la que se escribió el panel
//   originalmente. Cuando se pasó a Supabase se tradujo la base y no la
//   interfaz: de las 1.600 líneas del panel, 13 hablaban con la base. La
//   traducción vive en js/supabase-compat.js y está explicada ahí.
//
//   Es un puente, no un destino: las llamadas se pueden ir pasando a
//   Supabase nativo de a una, sin apuro, y las dos formas conviven.
// ============================================================

export * from './supabase-compat.js';
