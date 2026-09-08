// ============================================================
// TIAGO STORE · Login del panel
// ============================================================
// De acá salen auth, signInWithEmailAndPassword, onAuthStateChanged,
// signOut, sendPasswordResetEmail, setPersistence y las dos constantes de
// persistencia, para admin/login.html y admin/index.html.
//
// Igual que js/panel-datos.js, los nombres son los de Firebase y por detrás
// hay Supabase. La traducción está en js/supabase-auth.js.
//
// Fue un interruptor entre Firebase y Supabase hasta el 7/9/2026. Para
// recuperar la versión de Firebase:
//   git log --diff-filter=D -- js/panel-auth-firebase.js
// ============================================================

export * from './supabase-auth.js';
