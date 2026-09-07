// ============================================================
// TIAGO STORE · Configuración de Firebase para el PANEL
// ============================================================
// La app y Firestore viven en firebase-base.js; acá solo se agrega
// lo que necesita el panel de admin y NO la tienda del cliente:
//
//   auth     -> el login del panel        (firebase-auth.js,    147 KB)
//   storage  -> la subida de imágenes     (firebase-storage.js,  45 KB)
//
// Importar la app desde firebase-base.js (y no volver a llamar a
// initializeApp) es lo que garantiza que haya UNA sola instancia de
// Firebase aunque el panel cargue los dos archivos.
//
// Uso:
//   Panel:   import { db, auth, storage } from '../js/firebase-config.js';
//   Tienda:  import { db } from './firebase-base.js';   <- NO desde acá,
//            o el cliente se baja 192 KB de JS que no usa.
// ============================================================

import { getAuth }    from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { app, db }    from './firebase-base.js';

export { db };                              // Se reexporta por comodidad
export const auth    = getAuth(app);        // Login del admin
export const storage = getStorage(app);     // Subida de imágenes
