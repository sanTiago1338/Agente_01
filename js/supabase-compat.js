// ============================================================
// TIAGO STORE · Puente entre el CRUD del panel y Supabase
// ============================================================
// Expone las MISMAS funciones que el panel le pedía a Firestore:
//
//   collection · doc · addDoc · updateDoc · deleteDoc · onSnapshot
//   serverTimestamp
//
// POR QUÉ UN PUENTE Y NO REESCRIBIR EL PANEL
//   admin-productos.js y admin-juegos.js son 1.600 líneas, y casi todas son
//   interfaz: modales, formularios, validaciones, avisos. De base de datos
//   hay 13 llamadas contadas.
//
//   Reescribir los 1.600 renglones para cambiar esas 13 es cambiar mucha
//   superficie para arreglar poca. Con este puente el panel entero se muda
//   tocando UNA línea de import por archivo, y todo lo demás —los modales,
//   el orden, la búsqueda, el compresor de imágenes— queda igual de probado
//   que ayer.
//
// ESTO ES UN PUENTE, NO UN DESTINO
//   Hablar en idioma Firestore contra Postgres tiene un límite: no vas a
//   poder usar lo bueno de SQL (joins, filtros, transacciones) mientras el
//   panel siga pidiendo colecciones y documentos.
//
//   El puente sirve para que la mudanza sea de un día y sin sustos. Cuando
//   esté asentada, cada llamada se cambia sola, sin apuro:
//
//     await updateDoc(doc(db, 'productos', id), { precio: 99 });
//     ->  await sbAdmin.from('productos').update({ precio: 99 }).eq('id', id);
//
//   Se pueden ir cambiando de a una: el puente y las llamadas nativas
//   conviven sin problema.
// ============================================================

import { sbAdmin } from './supabase-config.js';
import {
  filaAProducto, filaAJuego,
  productoAFila, juegoAFila
} from './mapeo.js';


// ============================================================
// 1. REFERENCIAS
// ============================================================
// En Firestore, collection() y doc() devolvían objetos con vida propia.
// Acá son dos etiquetas: "de qué tabla hablamos" y "de qué fila".

// Firestore pedía el objeto db en cada llamada. Acá no hace falta, pero se
// exporta para no tocar las llamadas del panel.
export const db = { supabase: true };

/** collection(db, 'productos') -> referencia a la tabla */
export function collection(_db, tabla) {
  return { tabla };
}

/** doc(db, 'productos', id) -> referencia a una fila */
export function doc(_db, tabla, id) {
  return { tabla, id };
}

/**
 * Marcador de "poné la fecha del servidor".
 *
 * En Supabase no hace falta y se descarta: fecha_creacion tiene default
 * now() y fecha_actualizacion la escribe un trigger en cada UPDATE
 * (ver supabase/01-esquema.sql). La base no se puede olvidar; el panel sí
 * podía. Se mantiene la función para no tocar las llamadas.
 */
export function serverTimestamp() {
  return SELLO_DE_FECHA;
}
const SELLO_DE_FECHA = Symbol('serverTimestamp');


// ============================================================
// 2. TRADUCTORES POR TABLA
// ============================================================
const TRADUCTORES = {
  productos: { deLaBase: filaAProducto, aLaBase: productoAFila },
  juegos:    { deLaBase: filaAJuego,    aLaBase: juegoAFila }
};

function traductor(tabla) {
  const t = TRADUCTORES[tabla];
  if (!t) {
    throw new Error(
      `Tabla desconocida: "${tabla}". Agregá su traductor en js/supabase-compat.js ` +
      `y sus campos en js/mapeo.js.`
    );
  }
  return t;
}


// ============================================================
// 3. ERRORES EN CASTELLANO
// ============================================================
// El panel muestra err.message tal cual en el aviso rojo. Los errores de
// Supabase vienen en inglés y algunos son crípticos justo cuando más
// importa entenderlos.
//
// El caso más común de todos: escribir sin estar en la tabla "admins".
// Postgres contesta "new row violates row-level security policy", que no
// le dice nada a nadie.
function aErrorClaro(error, quePasaba) {
  const texto = (error?.message || '').toLowerCase();

  let mensaje;

  if (texto.includes('row-level security') || error?.code === '42501') {
    mensaje =
      'Tu usuario no tiene permiso para escribir. Entrá a Supabase → SQL Editor ' +
      'y agregate a la tabla "admins" (está explicado en supabase/02-seguridad.sql).';
  } else if (error?.code === '23505') {
    mensaje = 'Ya existe otro registro con ese valor único.';
  } else if (error?.code === '23502') {
    mensaje = 'Falta un campo obligatorio.';
  } else if (error?.code === '22P02') {
    mensaje = 'Uno de los valores tiene el tipo equivocado (por ejemplo, texto donde va un número).';
  } else if (texto.includes('jwt') || texto.includes('expired')) {
    mensaje = 'Se venció tu sesión. Recargá la página y volvé a entrar.';
  } else if (texto.includes('failed to fetch') || texto.includes('network')) {
    mensaje = 'Sin conexión con Supabase. Revisá tu internet.';
  } else {
    mensaje = error?.message || 'Error desconocido';
  }

  const e = new Error(mensaje);
  e.code     = error?.code;
  e.original = error;
  console.error(`❌ ${quePasaba}:`, error);
  return e;
}


// ============================================================
// 4. ESCRITURAS
// ============================================================

/**
 * addDoc(collection(db,'productos'), datos) -> crea una fila.
 * @returns {Promise<{id: string}>} igual que Firestore
 */
export async function addDoc(ref, datos) {
  const { aLaBase } = traductor(ref.tabla);

  const { data, error } = await sbAdmin
    .from(ref.tabla)
    .insert(aLaBase(sinSellos(datos)))
    .select('id')
    .single();

  if (error) throw aErrorClaro(error, `creando en ${ref.tabla}`);
  return { id: data.id };
}

/**
 * updateDoc(doc(db,'productos',id), cambios) -> edita una fila.
 *
 * Solo se mandan los campos que vinieron: si el panel manda { precio },
 * se toca el precio y nada más. Es la misma semántica que updateDoc.
 */
export async function updateDoc(ref, cambios) {
  const { aLaBase } = traductor(ref.tabla);
  const fila = aLaBase(sinSellos(cambios));

  // Un update sin columnas es un error de PostgREST. Puede pasar si lo
  // único que mandaron fue serverTimestamp(), que descartamos. En ese caso
  // no hay nada que hacer y decirlo en voz alta ayuda a encontrarlo.
  if (Object.keys(fila).length === 0) {
    console.warn(`⚠️ updateDoc a ${ref.tabla}/${ref.id} sin ningún campo que guardar. Se ignora.`);
    return;
  }

  const { error } = await sbAdmin
    .from(ref.tabla)
    .update(fila)
    .eq('id', ref.id);

  if (error) throw aErrorClaro(error, `editando ${ref.tabla}/${ref.id}`);
}

/** deleteDoc(doc(db,'productos',id)) -> borra una fila. */
export async function deleteDoc(ref) {
  const { error } = await sbAdmin
    .from(ref.tabla)
    .delete()
    .eq('id', ref.id);

  if (error) throw aErrorClaro(error, `borrando ${ref.tabla}/${ref.id}`);
}

// Saca los serverTimestamp() antes de traducir. En realidad mapeo.js ya
// los ignoraría (fechaActualizacion no está en su lista de campos), pero
// dejarlo explícito acá evita que alguien se vuelva loco el día que agregue
// esa columna al mapeo y empiece a mandar un Symbol a Postgres.
function sinSellos(datos) {
  const limpio = {};
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor !== SELLO_DE_FECHA) limpio[clave] = valor;
  }
  return limpio;
}


// ============================================================
// 5. LECTURA EN VIVO
// ============================================================
/**
 * onSnapshot(ref, onNext, onError) -> escucha una tabla entera.
 *
 * Devuelve algo con la forma de un QuerySnapshot de Firestore, porque así
 * lo usa el panel:
 *     snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
 *     snapshot.size
 *
 * @returns {Function} unsubscribe
 */
export function onSnapshot(ref, onNext, onError) {
  const { deLaBase } = traductor(ref.tabla);
  const cache = new Map();

  let cortado        = false;
  let generacion     = 0;
  let tocadosDurante = null;
  let yaHuboConexion = false;

  const emitir = () => {
    if (cortado) return;

    const objetos = [...cache.values()];
    onNext({
      size: objetos.length,
      empty: objetos.length === 0,
      docs: objetos.map(obj => ({
        id: obj.id,
        data: () => obj,
        exists: () => true
      })),
      forEach(fn) { this.docs.forEach(fn); }
    });
  };

  async function cargarTodo() {
    const miGeneracion = ++generacion;
    tocadosDurante = new Set();

    const { data, error } = await sbAdmin
      .from(ref.tabla)
      .select('*')
      .order('orden', { ascending: true });

    if (cortado || miGeneracion !== generacion) return;

    if (error) {
      const e = aErrorClaro(error, `leyendo ${ref.tabla}`);
      if (onError) onError(e);
      return;
    }

    // Las filas que cambiaron mientras el SELECT viajaba son más nuevas
    // que la respuesta: no se pisan.
    const tocados = tocadosDurante;
    tocadosDurante = null;

    for (const [id] of cache) {
      if (!tocados.has(id)) cache.delete(id);
    }
    for (const fila of data) {
      if (!tocados.has(fila.id)) cache.set(fila.id, deLaBase(fila));
    }

    emitir();
  }

  const canal = sbAdmin
    .channel(`${ref.tabla}-panel`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: ref.tabla },
        payload => {
          if (cortado) return;

          const id = payload.new?.id ?? payload.old?.id;
          if (!id) return;

          if (payload.eventType === 'DELETE') cache.delete(id);
          else                                cache.set(id, deLaBase(payload.new));

          if (tocadosDurante) tocadosDurante.add(id);
          emitir();
        })
    .subscribe(estado => {
      if (estado === 'SUBSCRIBED') {
        if (yaHuboConexion) cargarTodo();   // resincronizar tras una caída
        yaHuboConexion = true;
        return;
      }
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
        console.warn(`⚠️ Realtime de ${ref.tabla}: ${estado}. Reintentando…`);
      }
    });

  cargarTodo();

  return function unsubscribe() {
    cortado = true;
    sbAdmin.removeChannel(canal);
  };
}


// ============================================================
// 6. EXTRAS QUE FIRESTORE NO PODÍA DAR
// ============================================================
// Estos no son puente: son de Supabase. El panel los calcula hoy en
// JavaScript mirando el catálogo que tiene en memoria, y eso se pisa si
// dos personas crean un producto al mismo tiempo. La base no se pisa.

/** El "orden" que le toca al próximo producto (el último + 10). */
export async function siguienteOrdenProducto() {
  const { data, error } = await sbAdmin.rpc('siguiente_orden_producto');
  if (error) throw aErrorClaro(error, 'calculando el orden');
  return data;
}

/** El "orden" que le toca al próximo juego. */
export async function siguienteOrdenJuego() {
  const { data, error } = await sbAdmin.rpc('siguiente_orden_juego');
  if (error) throw aErrorClaro(error, 'calculando el orden');
  return data;
}

/** El próximo idLegacy libre. */
export async function siguienteIdLegacy() {
  const { data, error } = await sbAdmin.rpc('siguiente_id_legacy');
  if (error) throw aErrorClaro(error, 'calculando el id');
  return data;
}
