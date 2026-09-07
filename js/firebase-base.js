// ============================================================
// TIAGO STORE · Conexión base con Firebase (solo lectura)
// ============================================================
// Lo mínimo que necesita la TIENDA PÚBLICA: la app y Firestore.
// Nada de login ni de subida de imágenes.
//
// Por qué está separado de firebase-config.js:
//   Antes la tienda importaba firebase-config.js, que trae también
//   firebase-auth.js (147 KB) y firebase-storage.js (45 KB). Como los
//   módulos ES se descargan enteros aunque no los uses, cada cliente
//   bajaba y parseaba 192 KB de JavaScript que la tienda nunca toca:
//   el login y la subida de fotos son cosa del panel, no del cliente.
//
//   Ahora:
//     tienda  ->  firebase-base.js    (app + firestore)
//     panel   ->  firebase-config.js  (lo de arriba + auth + storage)
//
//   firebase-config.js importa la app DESDE ACÁ, así que sigue habiendo
//   una sola instancia de Firebase aunque el panel cargue las dos.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Es seguro tener estos valores en el código: son públicos por diseño.
// La seguridad real está en las reglas de Firestore y en Authentication.
const firebaseConfig = {
  apiKey:            "AIzaSyDW0IhqEodu0DjNyUix2QciYLpqieUThyA",
  authDomain:        "tiagostore-f09bd.firebaseapp.com",
  projectId:         "tiagostore-f09bd",
  storageBucket:     "tiagostore-f09bd.firebasestorage.app",
  messagingSenderId: "1088551521240",
  appId:             "1:1088551521240:web:dd63dbdb48357f871c80ad",
  measurementId:     "G-6LTS64QJZJ"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);   // Productos, juegos, categorías

console.log('%c🔥 Firebase conectado', 'color:#e50914;font-weight:bold', {
  proyecto: firebaseConfig.projectId
});
