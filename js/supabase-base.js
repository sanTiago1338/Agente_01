// ============================================================
// TIAGO STORE · Conexión base con Supabase (solo lectura)
// ============================================================
// El equivalente de firebase-base.js, para la TIENDA PÚBLICA.
// Trae el cliente y nada más: ni login ni subida de imágenes.
//
// DIFERENCIA CON FIREBASE
//   Firebase venía partido en módulos (app, firestore, auth, storage) y por
//   eso hubo que separar firebase-base.js de firebase-config.js: la tienda
//   se estaba bajando 192 KB de login y storage que nunca usaba.
//
//   supabase-js viene en un solo paquete de ~45 KB comprimido, así que ese
//   problema no existe. Igual mantenemos los dos archivos separados, por
//   otra razón: el cliente de la tienda NO debe guardar sesiones.
//   Ver "SIN SESIÓN" más abajo.
// ============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

// ============================================================
// CREDENCIALES
// ============================================================
// Proyecto: Tiago Store · región sa-east-1 (São Paulo)
// Los dos valores salen de: Supabase → Settings → API
//
// Es seguro tener estos valores en el código: son públicos por diseño,
// igual que lo era la config de Firebase. Lo que te protege son las
// políticas RLS de supabase/02-seguridad.sql, no esconder la clave.
//
// ⚠️ LA QUE NO VA ACÁ NUNCA: la "service_role". Esa se saltea TODAS las
//    políticas. Si aparece en un archivo del navegador, cualquiera puede
//    vaciarte la base. Si alguna vez la pegás por error, entrá a
//    Settings → API → Reset y generá una nueva.
export const SUPABASE_URL = "https://doydkjztynjqecwdvoto.supabase.co";

// Esta es la clave "anon" clásica (un JWT). Es la que entiende seguro la
// versión de supabase-js que carga este archivo (2.45.4).
//
// Supabase ya ofrece un formato nuevo para lo mismo, la "publishable key":
//
//     sb_publishable_0ZMWdncgmXFhSRtcXYm9QQ_E2L1jn2Z
//
// Es la recomendada para proyectos nuevos —se puede rotar sola, sin tocar
// las otras claves— pero necesita una versión más reciente del SDK. Cuando
// subas el número de versión en el import de arriba, cambiá esta constante
// por esa y probá la tienda: si el catálogo carga, quedate con la nueva.
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveWRranp0eW5qcWVjd2R2b3RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MTg3NDMsImV4cCI6MjEwNDM5NDc0M30.XN1eL-Vlk5lnGMwVKCMtEqxGCBOB2fS_2UytpGLGXdA";

// ============================================================
// EL CLIENTE
// ============================================================
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // --- SIN SESIÓN ---
    // La tienda no tiene login. Si dejáramos esto prendido, supabase-js
    // escribiría un token en el localStorage de cada cliente y lo andaría
    // renovando en segundo plano, para nada.
    //
    // Además evita un choque feo: el panel vive en el mismo dominio, en
    // /admin. Con los dos clientes guardando en la misma llave, abrir la
    // tienda en otra pestaña podía pisarle la sesión al panel.
    persistSession:   false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  realtime: {
    // Tope de mensajes por segundo. El catálogo cambia cuando vos tocás
    // algo en el panel — un puñado de veces por día. 5 es de sobra y evita
    // que una edición masiva inunde a los clientes conectados.
    params: { eventsPerSecond: 5 }
  },
  global: {
    headers: { 'x-cliente': 'tienda' }   // para reconocerlo en los logs
  }
});

// Aviso temprano si alguien publicó sin completar las credenciales.
// Sin esto el error aparece recién al pedir el catálogo, y es críptico.
if (SUPABASE_URL.includes('TU-PROYECTO') || SUPABASE_ANON_KEY.startsWith('TU-CLAVE')) {
  console.error(
    '%c⚠️ Supabase sin configurar',
    'color:#ef4444;font-weight:bold',
    '\nCompletá SUPABASE_URL y SUPABASE_ANON_KEY en js/supabase-base.js.' +
    '\nLos dos valores están en: Supabase → Settings → API'
  );
} else {
  console.log('%c⚡ Supabase conectado', 'color:#3ecf8e;font-weight:bold', {
    proyecto: SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
  });
}
