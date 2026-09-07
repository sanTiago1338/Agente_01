// ============================================================
// TIAGO STORE · Cliente de Supabase para el PANEL
// ============================================================
// El equivalente de firebase-config.js. Acá vive el cliente que SÍ guarda
// sesión, porque el panel tiene login.
//
// Uso:
//   Panel:   import { sbAdmin } from '../js/supabase-config.js';
//   Tienda:  import { sb } from './supabase-base.js';   <- NO desde acá
//
// POR QUÉ SON DOS CLIENTES Y NO UNO
//   supabase-js guarda la sesión en el navegador bajo una llave que depende
//   del proyecto. Dos clientes del MISMO proyecto en el MISMO dominio se
//   pelean por esa llave: la tienda (que no tiene sesión) le puede borrar
//   el token al panel abierto en otra pestaña, y te saca del panel sola.
//
//   La solución son dos clientes con storageKey distinto y persistencia
//   solo en el del panel. Se ve raro tener dos, pero es justamente lo que
//   evita el bug de "se me cierra la sesión sin motivo".
// ============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-base.js';

// Las credenciales salen de supabase-base.js: se completan en UN solo lugar.
export { SUPABASE_URL, SUPABASE_ANON_KEY };


// ============================================================
// "RECORDARME": DÓNDE SE GUARDA LA SESIÓN
// ============================================================
// El login tiene un tilde de "recordarme". Con Firebase eso era
// setPersistence(browserLocal | browserSession) y Firebase se encargaba.
//
// supabase-js solo sabe usar localStorage, y no deja cambiarlo después de
// crear el cliente. Así que le damos nuestro propio cajón: uno que decide
// en el momento si escribe en localStorage (sobrevive al cierre del
// navegador) o en sessionStorage (se borra al cerrar la pestaña).
//
// Para qué sirve la diferencia: si entrás al panel desde una compu
// prestada o un locutorio, destildás "recordarme" y al cerrar la pestaña
// no queda ninguna sesión abierta ahí.

const LLAVE_MODO = 'tiago-store-persistencia';

// El MODO se guarda siempre en localStorage — es solo la palabra "local" o
// "session", no un token. Si se guardara en sessionStorage se olvidaría en
// cada recarga y el "recordarme" nunca funcionaría.
function leerModo() {
  try {
    return localStorage.getItem(LLAVE_MODO) === 'session' ? 'session' : 'local';
  } catch {
    // Navegador con el almacenamiento bloqueado (modo incógnito estricto,
    // cookies de terceros apagadas). No es un error: la sesión va a durar
    // lo que dure la pestaña y ya.
    return 'session';
  }
}

let modo = leerModo();

/**
 * Elige dónde se guarda la sesión. Llamar ANTES de iniciar sesión.
 * @param {'local'|'session'} nuevo
 */
export function usarPersistencia(nuevo) {
  modo = nuevo === 'session' ? 'session' : 'local';
  try { localStorage.setItem(LLAVE_MODO, modo); } catch { /* da igual */ }
}

const cajon = () => {
  try {
    return modo === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

// Cajón de repuesto en memoria, para cuando el navegador no deja guardar
// nada. Sin esto, supabase-js tira una excepción y el login no anda.
const enMemoria = new Map();

const almacenamiento = {
  getItem(llave) {
    const c = cajon();
    try { return c ? c.getItem(llave) : enMemoria.get(llave) ?? null; }
    catch { return enMemoria.get(llave) ?? null; }
  },
  setItem(llave, valor) {
    enMemoria.set(llave, valor);
    const c = cajon();
    try { c?.setItem(llave, valor); } catch { /* queda solo en memoria */ }
  },
  removeItem(llave) {
    enMemoria.delete(llave);
    // Se borra de los DOS lados: al cerrar sesión no puede quedar un token
    // olvidado en el cajón que no estamos usando en este momento.
    try { window.localStorage.removeItem(llave); }   catch { /* ignorar */ }
    try { window.sessionStorage.removeItem(llave); } catch { /* ignorar */ }
  }
};


// ============================================================
// EL CLIENTE DEL PANEL
// ============================================================
export const sbAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    // Los links de "recuperar contraseña" vuelven con el token en el #hash
    // de la URL. Esto es lo que lo lee y abre la sesión sola.
    detectSessionInUrl: true,
    // Llave propia, distinta de la de la tienda. Ver el comentario de arriba.
    storageKey: 'tiago-store-panel',
    storage:    almacenamiento
  },
  global: {
    headers: { 'x-cliente': 'panel' }
  }
});

// Nombre corto, por comodidad — igual que firebase-config.js reexportaba db.
export const sb = sbAdmin;
