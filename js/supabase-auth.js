// ============================================================
// TIAGO STORE · Login del panel sobre Supabase
// ============================================================
// Exporta las MISMAS funciones que usaba firebase-auth.js:
//
//   signInWithEmailAndPassword · sendPasswordResetEmail · onAuthStateChanged
//   signOut · setPersistence · browserLocalPersistence · browserSessionPersistence
//
// POR QUÉ CON LOS NOMBRES DE FIREBASE
//   admin/login.html tiene 130 líneas de lógica de login ya probada: los
//   mensajes de error en español, el ojito de la contraseña, el
//   "recordarme", el reseteo por correo. Todo eso funciona bien.
//
//   Conservando los nombres, pasar ese archivo a Supabase es cambiar DOS
//   líneas de import. Cero riesgo de romper algo que ya andaba.
//
//   Cuando la mudanza esté asentada y quieras hablarle a Supabase de
//   frente, el reemplazo es directo:
//     signInWithEmailAndPassword(auth, mail, pass)
//       -> sbAdmin.auth.signInWithPassword({ email: mail, password: pass })
// ============================================================

import { sbAdmin, usarPersistencia } from './supabase-config.js';

// En Firebase, "auth" era un objeto que había que pasarle a cada función.
// Acá no hace falta, pero se exporta igual para no tocar las llamadas.
export const auth = sbAdmin.auth;


// ============================================================
// ERRORES: DE SUPABASE A LOS CÓDIGOS QUE YA CONOCE EL PANEL
// ============================================================
// login.html traduce códigos tipo 'auth/invalid-credential' a frases en
// español. Supabase manda otra cosa: un mensaje en inglés y a veces un
// status HTTP. Acá le pegamos el código de Firebase al error para que esa
// tabla de traducciones siga sirviendo tal como está.
function conCodigoFirebase(error) {
  if (!error) return error;

  const texto  = (error.message || '').toLowerCase();
  const codigo = error.code || '';

  let equivalente = null;

  if (texto.includes('invalid login credentials') || codigo === 'invalid_credentials') {
    equivalente = 'auth/invalid-credential';
  } else if (texto.includes('email not confirmed')) {
    equivalente = 'auth/user-not-found';
  } else if (texto.includes('unable to validate email') || texto.includes('invalid email')) {
    equivalente = 'auth/invalid-email';
  } else if (texto.includes('user is banned') || texto.includes('user not found')) {
    equivalente = 'auth/user-disabled';
  } else if (error.status === 429 || texto.includes('rate limit') || texto.includes('too many')) {
    equivalente = 'auth/too-many-requests';
  } else if (texto.includes('failed to fetch') || texto.includes('network')) {
    equivalente = 'auth/network-request-failed';
  } else if (texto.includes('should be at least') || texto.includes('missing password')) {
    equivalente = 'auth/missing-password';
  }

  const e = new Error(error.message || 'Error de autenticación');
  e.code     = equivalente || codigo || 'auth/desconocido';
  e.original = error;   // por si hace falta el error crudo en la consola
  return e;
}


// ============================================================
// PERSISTENCIA ("recordarme")
// ============================================================
// En Firebase eran dos constantes opacas. Acá son dos palabras, y
// setPersistence le avisa al cajón de supabase-config.js cuál usar.
export const browserLocalPersistence   = 'local';
export const browserSessionPersistence = 'session';

/**
 * Elige si la sesión sobrevive al cierre del navegador.
 * Llamar ANTES de signInWithEmailAndPassword, igual que en Firebase.
 */
export async function setPersistence(_auth, persistencia) {
  usarPersistencia(persistencia);
}


// ============================================================
// ENTRAR
// ============================================================
/**
 * @param {*} _auth      se ignora — está para no cambiar las llamadas
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: Object}>}
 */
export async function signInWithEmailAndPassword(_auth, email, password) {
  const { data, error } = await sbAdmin.auth.signInWithPassword({ email, password });
  if (error) throw conCodigoFirebase(error);
  return { user: aUsuario(data.user) };
}


// ============================================================
// SALIR
// ============================================================
export async function signOut(_auth) {
  const { error } = await sbAdmin.auth.signOut();
  if (error) throw conCodigoFirebase(error);
}


// ============================================================
// RECUPERAR CONTRASEÑA
// ============================================================
/**
 * Manda el correo con el link para poner una contraseña nueva.
 *
 * OJO, ESTO HAY QUE CONFIGURARLO EN SUPABASE:
 *   1. Authentication → URL Configuration → Redirect URLs
 *      Agregá la URL del panel. Sin esto, el link del correo no vuelve
 *      a tu sitio y el reseteo no funciona.
 *   2. Con el plan gratis Supabase manda pocos correos por hora y desde
 *      un remitente genérico (van a parar a spam seguido). Para producción:
 *      Authentication → Emails → SMTP, y poné tu propio proveedor.
 */
export async function sendPasswordResetEmail(_auth, email) {
  const { error } = await sbAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('cambiar-clave.html', location.href).href
  });
  if (error) throw conCodigoFirebase(error);
}


// ============================================================
// ¿HAY SESIÓN?
// ============================================================
/**
 * Avisa cuando entra o sale un usuario, y también al arrancar la página.
 *
 * UNA DIFERENCIA IMPORTANTE CON FIREBASE
 *   onAuthStateChanged de Firebase disparaba SIEMPRE al arrancar: primero
 *   con null o con el usuario, y recién ahí sabías si había sesión.
 *
 *   El onAuthStateChange de Supabase, en cambio, puede no decir nada si no
 *   hay sesión guardada — y el panel se quedaría para siempre en
 *   "Verificando…". Por eso acá preguntamos primero con getSession() y
 *   garantizamos ese primer aviso.
 *
 * @param {*} _auth se ignora
 * @param {Function} callback recibe (usuario|null)
 * @returns {Function} para dejar de escuchar
 */
export function onAuthStateChanged(_auth, callback) {
  let cortado    = false;
  let yaAvisamos = false;
  let ultimoId   = null;     // id del último usuario avisado (null = nadie)

  const avisar = usuario => {
    if (cortado) return;
    yaAvisamos = true;
    ultimoId   = usuario?.id ?? null;
    callback(usuario ? aUsuario(usuario) : null);
  };

  // 1. El primer aviso, sí o sí.
  sbAdmin.auth.getSession()
    .then(({ data }) => { if (!yaAvisamos) avisar(data.session?.user ?? null); })
    .catch(err => {
      console.error('❌ No se pudo leer la sesión:', err);
      if (!yaAvisamos) avisar(null);
    });

  // 2. Los avisos siguientes: entrar, salir, token renovado.
  const { data: sub } = sbAdmin.auth.onAuthStateChange((evento, sesion) => {
    const usuario = sesion?.user ?? null;

    // INITIAL_SESSION es la respuesta al arranque: la misma que ya dio
    // getSession() arriba. Sin este filtro el callback corría dos veces
    // seguidas al cargar, y login.html reventaba al borrar por segunda vez
    // el cartel de "Verificando…".
    if (evento === 'INITIAL_SESSION' && yaAvisamos) return;

    // TOKEN_REFRESHED salta solo cada hora, cuando se renueva el token.
    // El usuario es el mismo de antes; si lo dejáramos pasar, el panel se
    // volvería a dibujar entero cada hora sin ningún motivo.
    if (evento === 'TOKEN_REFRESHED' && yaAvisamos) return;

    // supabase-js vuelve a mandar SIGNED_IN cada vez que la pestaña
    // recupera el foco. Firebase no hacía eso. Si es el mismo usuario que
    // ya avisamos, no hay nada nuevo que contar.
    if (yaAvisamos && (usuario?.id ?? null) === ultimoId) return;

    avisar(usuario);
  });

  return function unsubscribe() {
    cortado = true;
    sub?.subscription?.unsubscribe();
  };
}


// ============================================================
// EL USUARIO, CON LA FORMA QUE ESPERA EL PANEL
// ============================================================
// El panel usa usuario.email (para mostrarlo arriba a la derecha) y
// usuario.uid. Supabase los llama email e id.
function aUsuario(u) {
  if (!u) return null;
  return {
    uid:   u.id,
    id:    u.id,
    email: u.email || '',
    // Extra útil que Firebase no daba: sirve para mostrar "entraste por
    // última vez el ..." si algún día lo querés.
    ultimoAcceso: u.last_sign_in_at || null,
    original: u
  };
}


// ============================================================
// ¿ES ADMIN DE VERDAD?
// ============================================================
/**
 * Estar logueado no alcanza: para escribir hay que estar en la tabla
 * "admins" (ver supabase/02-seguridad.sql).
 *
 * Las políticas RLS ya lo impiden del lado del servidor, así que esto no
 * es la seguridad — es la cortesía. Sin esta comprobación, un usuario que
 * no esté en la lista entraría al panel, vería todo, tocaría "Guardar" y
 * recibiría un error crudo de Postgres sin entender por qué.
 *
 * @returns {Promise<boolean>}
 */
export async function esAdmin() {
  const { data, error } = await sbAdmin.rpc('es_admin');
  if (error) {
    console.error('❌ No se pudo comprobar si sos admin:', error);
    return false;
  }
  return data === true;
}
