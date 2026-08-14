// ============================================================
// TIAGO STORE · Configuración de Firebase
// ============================================================
// Punto único de conexión con Firebase.
// Todos los demás archivos JS importan desde acá.
//
// SDK: Firebase Modular v10 (via CDN, sin build step)
// Docs: https://firebase.google.com/docs/web/setup
// ============================================================

// -----------------------------------------------------------
// 1. Imports desde el CDN de Firebase
// -----------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth }      from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getStorage }   from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

// -----------------------------------------------------------
// 2. Configuración de TU proyecto Firebase
// -----------------------------------------------------------
//
//   ⚠️ ACCIÓN REQUERIDA ⚠️
//   Reemplazá los 6 valores de abajo con los de TU proyecto.
//   Los sacás de: Firebase Console → Project settings (⚙️)
//                 → Tus apps → Configuración SDK → Config
//
//   Es seguro tenerlos en el código: son públicos por diseño.
//   La seguridad real está en las reglas de Firestore (que ya pusimos)
//   y en Firebase Authentication.
//
const firebaseConfig = {
  apiKey:            "AIzaSyDW0IhqEodu0DjNyUix2QciYLpqieUThyA",
  authDomain:        "tiagostore-f09bd.firebaseapp.com",
  projectId:         "tiagostore-f09bd",
  storageBucket:     "tiagostore-f09bd.firebasestorage.app",
  messagingSenderId: "1088551521240",
  appId:             "1:1088551521240:web:dd63dbdb48357f871c80ad",
  measurementId:     "G-6LTS64QJZJ"
};

// -----------------------------------------------------------
// 3. Inicialización
// -----------------------------------------------------------
const app = initializeApp(firebaseConfig);

// -----------------------------------------------------------
// 4. Servicios exportados
// -----------------------------------------------------------
//    Uso desde otro archivo:
//      import { db, auth, storage } from './firebase-config.js';
//
export const db      = getFirestore(app);   // Base de datos (productos, categorías)
export const auth    = getAuth(app);        // Login del admin
export const storage = getStorage(app);     // Subida de imágenes

// -----------------------------------------------------------
// 5. Log de confirmación (solo en desarrollo)
// -----------------------------------------------------------
console.log('%c🔥 Firebase conectado', 'color:#e50914;font-weight:bold', {
  proyecto: firebaseConfig.projectId
});
