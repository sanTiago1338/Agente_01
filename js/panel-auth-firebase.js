// ============================================================
// TIAGO STORE · Login del panel sobre Firebase
// ============================================================
// Junta lo que admin/login.html y admin/index.html le pedían a Firebase
// Auth, para que los dos importen de un solo lugar (js/panel-auth.js).
// ============================================================

export { auth } from './firebase-config.js';

export {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// En Firebase, cualquiera que se logueaba podía escribir: la regla de
// Firestore miraba solo que hubiera sesión. La versión de Supabase agrega
// una lista de admins aparte, y el panel pregunta con esta función.
//
// Acá devuelve true siempre, para que admin/index.html pueda llamarla en
// las dos bases sin preguntar en cuál está corriendo.
export async function esAdmin() {
  return true;
}
