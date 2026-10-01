// ============================================================
// TIAGO STORE · "¿Tengo permiso?" — para las vistas de Supabase
// ============================================================
// EL PROBLEMA QUE RESUELVE, QUE NO ES OBVIO
//
//   RLS no da error cuando no te deja leer algo: FILTRA las filas y te
//   devuelve una lista vacía. Es lo correcto —no le cuenta a un extraño
//   cuántas filas hay que no puede ver— pero para el panel es una trampa:
//
//       "no tenés permiso"   →   []
//       "no hay pedidos"     →   []
//
//   Las dos cosas llegan igual. Sin distinguirlas, el panel le dice
//   "✅ No hay nada pendiente" a alguien que en realidad tiene 40 pedidos
//   esperando y simplemente no los puede ver. Eso es peor que un error:
//   es una mentira tranquilizadora.
//
//   Por eso, antes de dibujar un "no hay nada", hay que preguntar si el
//   vacío es de verdad.
//
// Lo usan admin-ventas.js y admin-stock.js. El CRUD de productos y juegos
// no lo necesita: esos pasan por el puente js/panel-datos.js, que avisa del
// error de permiso por su cuenta.
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';

// La respuesta no cambia mientras dure la sesión, así que se pregunta una
// sola vez. Si se cierra sesión, la página se recarga igual (lo maneja el
// guard de admin/index.html) y esto se olvida solo.
let recordado = null;

/**
 * @returns {Promise<{puede: boolean, motivo: string}>}
 *   puede  = tiene sesión Y está en la tabla admins
 *   motivo = 'ok' | 'sin_sesion' | 'no_es_admin' | 'error'
 */
export async function tengoPermiso() {
  if (recordado) return recordado;

  const { data: { session } } = await sbAdmin.auth.getSession();

  if (!session) {
    recordado = { puede: false, motivo: 'sin_sesion' };
    return recordado;
  }

  let { data, error } = await sbAdmin.rpc('es_admin');

  // "JWT issued at future" (PGRST303): la sesión se acaba de renovar y el
  // reloj de la base quedó un par de segundos atrás del que firmó el token.
  // Se arregla solo esperando: un reintento corto y el panel entra normal,
  // en vez de mostrar "no se pudo comprobar tu permiso" al abrir.
  if (error && error.code === 'PGRST303') {
    await new Promise(r => setTimeout(r, 2000));
    ({ data, error } = await sbAdmin.rpc('es_admin'));
  }

  if (error) {
    // No se recuerda un error: puede ser un corte de internet momentáneo
    // y la próxima vez sí funcionar.
    console.error('❌ No se pudo comprobar el permiso:', error);
    return { puede: false, motivo: 'error' };
  }

  recordado = data === true
    ? { puede: true,  motivo: 'ok' }
    : { puede: false, motivo: 'no_es_admin' };

  return recordado;
}

/**
 * El cartel que se dibuja cuando no hay permiso. Explica qué pasa y qué
 * hacer, en vez de dejar a la vista mintiendo que no hay datos.
 *
 * @param {string} motivo el que devolvió tengoPermiso()
 * @param {string} claseVacio la clase del contenedor vacío de esa vista
 */
export function carteSinPermiso(motivo, claseVacio = 'st-vacio') {
  const textos = {
    sin_sesion: {
      emo: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
      titulo: 'No hay sesión abierta',
      cuerpo: 'Volvé a entrar al panel.'
    },
    no_es_admin: {
      emo: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
      titulo: 'Tu usuario no está en la lista de admins',
      cuerpo: 'Podés mirar el catálogo, pero no las ventas ni el stock.<br>' +
              'Se arregla agregándote a la tabla <code>admins</code>: ' +
              'está explicado en <code>supabase/02-seguridad.sql</code>.'
    },
    error: {
      emo: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 20 0M5 12.9a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0"/><path d="M12 20h.01"/></svg>',
      titulo: 'No se pudo comprobar tu permiso',
      cuerpo: 'Puede ser la conexión. Probá con <strong>↻ Actualizar</strong>.'
    }
  };

  const t = textos[motivo] || textos.error;

  return `
    <div class="${claseVacio}">
      <div class="emo">${t.emo}</div>
      <h3>${t.titulo}</h3>
      <p>${t.cuerpo}</p>
    </div>`;
}
