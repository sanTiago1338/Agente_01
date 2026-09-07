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
// ⚠️ COMPLETAR ANTES DE USAR. Los dos valores salen de:
//    Supabase → tu proyecto → Settings → API
//
//      SUPABASE_URL      = "Project URL"
//      SUPABASE_ANON_KEY = "Project API keys" → anon / public
//
// Es seguro tener estos valores en el código: son públicos por diseño,
// igual que lo era la config de Firebase. Lo que te protege son las
// políticas RLS de supabase/02-seguridad.sql, no esconder la clave.
//
// ⚠️ LA QUE NO VA ACÁ NUNCA: la "service_role". Esa se saltea TODAS las
//    políticas. Si aparece en un archivo del navegador, cualquiera puede
//    vaciarte la base. Si alguna vez la pegás por error, entrá a
//    Settings → API → Reset y generá una nueva.
export const SUPABASE_URL      = "https://TU-PROYECTO.supabase.co";
export const SUPABASE_ANON_KEY = "TU-CLAVE-ANON-AQUI";

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
