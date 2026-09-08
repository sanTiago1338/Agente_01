// ============================================================
// TIAGO STORE · Servicio de Productos sobre Supabase (solo lectura)
// ============================================================
// Misma API que la versión de Firestore, exportación por exportación:
//   subscribeProductos · precioFinal · formatBs · porcentajeDescuento
//
// index.html y planes.html no cambian ni una línea. El que elige entre una
// versión y la otra es js/productos-service.js.
//
// CÓMO SE IMITA onSnapshot
//   Firestore tenía onSnapshot(): una función que te da la lista entera y
//   te la vuelve a dar cada vez que algo cambia.
//
//   Supabase Realtime no funciona así. Te manda cambios sueltos:
//   "se insertó esta fila", "se actualizó esta otra". Nunca te da la lista.
//
//   Así que la lista la mantenemos acá: una tabla en memoria que arranca
//   con un SELECT y después se va parcheando con cada aviso. El resultado
//   para quien lo usa es idéntico a onSnapshot.
// ============================================================

import { sb } from './supabase-base.js';
import { filaAProducto } from './mapeo.js';

const TABLA = 'productos';

// Firestore no sabía ordenar sin índice y ordenábamos en JavaScript.
// Postgres sí sabe, y encima tiene el índice productos_orden_idx.
// Igual dejamos el ordenar() de abajo, porque las filas que llegan por
// realtime hay que meterlas en su lugar.
function ordenar(productos) {
  return productos.sort((a, b) => (a.orden ?? 999999) - (b.orden ?? 999999));
}

/**
 * Suscripción EN TIEMPO REAL al catálogo completo.
 *
 * Cada vez que cambia algo (el admin edita un precio, agrega un producto,
 * lo marca como agotado...), el callback se dispara con la lista entera y
 * actualizada. La tienda NO necesita recargarse.
 *
 * @param {Function} onCambio recibe (productos: Array) en cada cambio
 * @param {Function} [onError] recibe (error) si falla la conexión
 * @returns {Function} unsubscribe — llamala para dejar de escuchar
 *
 * @example
 *   const parar = subscribeProductos(productos => renderProducts(productos));
 *   // más tarde:  parar();
 */
export function subscribeProductos(onCambio, onError) {
  // La lista viva, indexada por id para poder parchear una fila sola.
  const cache = new Map();

  let cortado         = false;   // ya llamaron al unsubscribe
  let generacion      = 0;       // para descartar respuestas de un SELECT viejo
  let tocadosDurante  = null;    // ids que cambiaron mientras el SELECT viajaba
  let yaHuboConexion  = false;   // false = es la primera vez que conecta

  const emitir = () => {
    if (!cortado) onCambio(ordenar([...cache.values()]));
  };

  const fallo = (error, donde) => {
    console.error(`❌ Error ${donde} productos:`, error);
    if (!cortado && onError) onError(error);
  };

  // -----------------------------------------------------------
  // Carga completa, EN DOS TIEMPOS
  // -----------------------------------------------------------
  // Se llama al principio y otra vez cada vez que el websocket se
  // reconecta: mientras estuvo caído pudimos perdernos avisos, y la
  // única forma honesta de saber cómo quedó todo es volver a preguntar.
  //
  //   1. Todo MENOS la imagen. Son unos 200 KB para los 226 productos:
  //      llega en menos de un segundo y la tienda pinta las tarjetas
  //      enseguida, con el logo que genera a partir del color y el nombre.
  //   2. Las imágenes aparte, y se van pegando a cada producto:
  //      a) primero las que son una ruta a un archivo ("Img/Netflix.jpg"),
  //         que son 130 y pesan casi nada: esas tarjetas tienen foto al
  //         segundo;
  //      b) después las base64, de a 10 y en el orden en que aparecen en
  //         la tienda, redibujando en cada tanda. Con una conexión lenta
  //         las de arriba se ven primero y las de abajo van llegando.
  //
  // POR QUÉ ASÍ Y NO UN "SELECT *"
  //   Las imágenes van como base64 dentro de la fila y entre todas pesan
  //   17 MB. Un solo SELECT * tardaba tanto en serializarse que Supabase
  //   lo cortaba por tiempo (3 s para la tienda, 8 s para el panel) y la
  //   lista quedaba VACÍA con un error 500. Partido en tandas chicas cada
  //   consulta entra sobrada en el límite, y encima la tienda se ve antes.
  //   Cuando las imágenes pasen a Storage (Fase 2 del manual), la fila
  //   vuelve a pesar poco y esto se puede volver a simplificar.
  const COLUMNAS_SIN_IMAGEN =
    'id,nombre,categoria,descripcion,etiqueta,estrellas,tipo,precio,precio_oferta,oferta,' +
    'imagen_fill,imagen_color,imagen_texto,entrega,soporte,acceso,suscripcion,' +
    'activo,destacado,mostrar_en_planes,orden,id_legacy,fecha_creacion,fecha_actualizacion';
  // 10 por tanda: con la conexión lenta que se midió (unos 65 KB/s hacia
  // São Paulo) una tanda de 20 tardaba más de 10 segundos en verse.
  const TANDA = 10;

  async function cargarTodo() {
    const miGeneracion = ++generacion;
    tocadosDurante = new Set();

    const { data, error } = await sb
      .from(TABLA)
      .select(COLUMNAS_SIN_IMAGEN)
      .order('orden', { ascending: true })
      .order('id',    { ascending: true });   // desempate estable, ver cargarImagenes

    // Arrancó otra carga después de esta, o ya nos dieron de baja:
    // esta respuesta llegó vieja y no sirve.
    if (cortado || miGeneracion !== generacion) return;

    if (error) { fallo(error, 'cargando'); return; }

    // Las filas que cambiaron MIENTRAS este SELECT viajaba ya están en la
    // cache y son más nuevas que lo que trae la respuesta. Si las
    // pisáramos, un producto recién borrado reaparecería por un rato.
    const tocados = tocadosDurante;
    tocadosDurante = null;

    for (const [id] of cache) {
      if (!tocados.has(id)) cache.delete(id);
    }
    for (const fila of data) {
      // Sin la columna imagen, filaAProducto deja p.imagen en undefined.
      //   undefined = "todavía no llegó"   ·   '' = "no tiene imagen"
      // El panel usa esa diferencia para no pisar una imagen real al guardar.
      if (!tocados.has(fila.id)) cache.set(fila.id, filaAProducto(fila));
    }

    emitir();
    cargarImagenes(miGeneracion);
  }

  // Pega imágenes en la cache. Solo si el producto sigue SIN imagen
  // (undefined): si mientras tanto llegó un cambio por realtime, ese ya
  // trae la fila entera con su imagen nueva, y la de la tanda sería más
  // vieja. No se toca.
  function pegarImagenes(filas) {
    for (const fila of filas) {
      const p = cache.get(fila.id);
      if (p && p.imagen === undefined) p.imagen = fila.imagen ?? '';
    }
  }

  async function cargarImagenes(miGeneracion) {
    const vigente = () => !cortado && miGeneracion === generacion;

    // a) Las rutas a archivos y las vacías: texto cortito, entran todas en
    //    una consulta minúscula.
    {
      const { data, error } = await sb
        .from(TABLA)
        .select('id,imagen')
        .not('imagen', 'like', 'data:%');

      if (!vigente()) return;
      if (error) {
        console.warn('⚠️ No llegaron las rutas de imagen:', error.message);
      } else {
        pegarImagenes(data);
        emitir();
      }
    }

    // b) Las base64, de a TANDA, en el orden de la tienda.
    //
    // El orden es "orden, id" y no solo "orden": hay muchos productos con
    // el mismo orden, y Postgres no garantiza que los empates salgan igual
    // en dos consultas distintas. Sin el desempate, paginar podía repetir
    // un producto en una tanda y saltearse otro.
    for (let desde = 0; ; desde += TANDA) {
      if (!vigente()) return;

      const { data, error } = await sb
        .from(TABLA)
        .select('id,imagen')
        .like('imagen', 'data:%')
        .order('orden', { ascending: true })
        .order('id',    { ascending: true })
        .range(desde, desde + TANDA - 1);

      if (!vigente()) return;

      if (error) {
        // Una tanda que falla no tumba nada: los productos que faltan se
        // quedan con el logo generado hasta la próxima carga.
        console.warn('⚠️ No llegó una tanda de imágenes:', error.message);
        return;
      }

      pegarImagenes(data);
      emitir();

      if (data.length < TANDA) return;   // era la última
    }
  }

  // -----------------------------------------------------------
  // Cambios sueltos
  // -----------------------------------------------------------
  function aplicarCambio(payload) {
    if (cortado) return;

    const id = payload.new?.id ?? payload.old?.id;
    if (!id) return;

    if (payload.eventType === 'DELETE') cache.delete(id);
    else                                cache.set(id, filaAProducto(payload.new));

    if (tocadosDurante) tocadosDurante.add(id);
    emitir();
  }

  const canal = sb
    .channel('productos-tienda')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, aplicarCambio)
    .subscribe(estado => {
      if (estado === 'SUBSCRIBED') {
        // La primera carga ya salió sola más abajo, sin esperar al
        // websocket: así la tienda pinta los productos enseguida en vez de
        // quedarse en blanco durante el saludo del socket.
        // Acá solo nos interesan las RE-conexiones.
        if (yaHuboConexion) cargarTodo();
        yaHuboConexion = true;
        return;
      }
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
        // No es fatal: los productos ya cargados se siguen viendo, lo que
        // se pierde es la actualización automática. supabase-js reintenta
        // solo, y al reconectar el bloque de arriba resincroniza.
        console.warn(`⚠️ Realtime de productos: ${estado}. Reintentando…`);
      }
    });

  cargarTodo();

  // -----------------------------------------------------------
  // Baja
  // -----------------------------------------------------------
  return function unsubscribe() {
    cortado = true;
    sb.removeChannel(canal);
  };
}


// ============================================================
// HELPERS DE PRESENTACIÓN
// ============================================================
// Copiados tal cual de la versión de Firestore: no dependen de la base,
// solo de la forma del producto, que el mapeo deja igual.

/**
 * Precio final que paga el cliente (respeta la oferta si está activa).
 * @param {Object} p producto
 * @returns {number}
 */
export function precioFinal(p) {
  return (p.oferta && p.precioOferta > 0) ? p.precioOferta : p.precio;
}

/**
 * Formatea un precio para mostrar: 84.9 -> "84.90Bs" · 109 -> "109Bs"
 * @param {number} n
 * @returns {string}
 */
export function formatBs(n) {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? `${num}Bs` : `${num.toFixed(2)}Bs`;
}

/**
 * Porcentaje de descuento de una oferta. 0 si no está en oferta.
 * @param {Object} p producto
 * @returns {number} ej. 27 (significa -27%)
 */
export function porcentajeDescuento(p) {
  if (!p.oferta || !(p.precioOferta > 0) || !(p.precio > 0)) return 0;
  return Math.round((1 - p.precioOferta / p.precio) * 100);
}
