// ============================================================
// TIAGO STORE · Datos del panel sobre Firestore
// ============================================================
// Junta en un solo lugar lo que el CRUD del panel le pedía a Firebase:
// el objeto db y las funciones de Firestore.
//
// Antes cada archivo del panel hacía estos dos imports por su cuenta:
//
//   import { db } from '../../js/firebase-config.js';
//   import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp }
//     from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
//
// Ahora los dos salen de js/panel-datos.js, que es el interruptor. Así
// pasar el panel a Supabase no obliga a tocar cada archivo del panel: se
// cambia una línea en el interruptor y listo.
// ============================================================

export { db } from './firebase-config.js';

export {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
