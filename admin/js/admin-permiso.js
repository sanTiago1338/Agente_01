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

  const { data, error } = await sbAdmin.rpc('es_admin');

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
      emo: '🔒',
      titulo: 'No hay sesión abierta',
      cuerpo: 'Volvé a entrar al panel.'
    },
    no_es_admin: {
      emo: '🚫',
      titulo: 'Tu usuario no está en la lista de admins',
      cuerpo: 'Podés mirar el catálogo, pero no las ventas ni el stock.<br>' +
              'Se arregla agregándote a la tabla <code>admins</code>: ' +
              'está explicado en <code>supabase/02-seguridad.sql</code>.'
    },
    error: {
      emo: '📡',
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
