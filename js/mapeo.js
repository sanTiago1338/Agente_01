// ============================================================
// TIAGO STORE · Traducción entre la base y la tienda
// ============================================================
// Postgres usa snake_case (precio_oferta) y todo el front de la tienda
// está escrito en camelCase (precioOferta), heredado de Firestore.
//
// Este archivo es EL ÚNICO lugar donde se cruzan los dos idiomas.
//
// POR QUÉ NO RENOMBRAMOS UNA DE LAS DOS PUNTAS
//   · Poner camelCase en Postgres obliga a escribir "precioOferta" entre
//     comillas dobles en cada consulta, para siempre, y a acordarse de
//     hacerlo. Un olvido = error a mano.
//   · Poner snake_case en el front obliga a tocar index.html (172 KB),
//     planes.html, recarga-juegos.html y los 2.200 renglones del panel.
//     Mucha superficie para romper algo sin darte cuenta.
//
//   La traducción cuesta un archivo. Es el trato más barato de los tres.
//
// AGREGAR UN CAMPO NUEVO
//   Una línea en la lista de abajo y listo: lo leen y lo escriben la tienda,
//   el panel y la herramienta de migración. No hay un segundo lugar que
//   actualizar (que es exactamente donde aparecen los bugs de "en el panel
//   se ve pero en la tienda no").
// ============================================================


// ============================================================
// 1. FECHAS
// ============================================================
// Firestore devolvía las fechas como Timestamp, un objeto con .seconds.
// La tienda y el panel las usan así, para ordenar por "más nuevo":
//
//   index.html:4406        nuevo: p.fechaCreacion?.seconds || 0
//   admin/index.html:867   (b.fechaCreacion?.seconds || 0) - (...)
//
// Postgres devuelve un texto ISO ("2025-09-07T18:31:00.000Z"). Si lo
// pasáramos crudo, esas dos líneas darían undefined y el orden por fecha
// quedaría al azar, sin ningún error en consola. Silencioso y molesto.
//
// Devolvemos un objeto con la misma forma. No es Firestore de verdad, es
// lo justo para que esas dos líneas sigan andando sin tocarlas.
function aFecha(iso) {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return {
    seconds: Math.floor(fecha.getTime() / 1000),   // lo que usan las dos líneas de arriba
    iso,
    toDate:   () => fecha,
    toString: () => iso,
    valueOf:  () => fecha.getTime()                // permite comparar fechas con < y >
  };
}


// ============================================================
// 2. QUÉ COLUMNA ES QUÉ PROPIEDAD
// ============================================================
// [ columna_en_postgres , propiedadEnElFront ]
// Las que se llaman igual en los dos lados también van en la lista: así
// una sola tabla alcanza para leer Y para escribir.

const CAMPOS_PRODUCTO = [
  ['nombre',            'nombre'],
  ['categoria',         'categoria'],
  ['descripcion',       'descripcion'],
  ['etiqueta',          'etiqueta'],
  ['estrellas',         'estrellas'],
  ['tipo',              'tipo'],
  ['precio',            'precio'],
  ['precio_oferta',     'precioOferta'],
  ['oferta',            'oferta'],
  ['imagen',            'imagen'],
  ['imagen_fill',       'imagenFill'],
  ['imagen_color',      'imagenColor'],
  ['imagen_texto',      'imagenTexto'],
  ['entrega',           'entrega'],
  ['soporte',           'soporte'],
  ['acceso',            'acceso'],
  ['suscripcion',       'suscripcion'],
  ['activo',            'activo'],
  ['destacado',         'destacado'],
  ['mostrar_en_planes', 'mostrarEnPlanes'],
  ['orden',             'orden'],
  ['id_legacy',         'idLegacy']
];

const CAMPOS_JUEGO = [
  ['nombre',             'nombre'],
  ['unidad',             'unidad'],
  ['etiqueta',           'etiqueta'],
  ['logo',               'logo'],
  ['color1',             'color1'],
  ['color2',             'color2'],
  ['necesita_server_id', 'necesitaServerId'],
  ['necesita_cuenta',    'necesitaCuenta'],
  ['auto_region',        'autoRegion'],
  ['etiquetas_id',       'etiquetasId'],
  ['activo',             'activo'],
  ['popular',            'popular'],
  ['nuevo',              'nuevo'],
  ['orden',              'orden'],
  // jsonb. Adentro los paquetes siguen en camelCase (necesitaEmail, etc.),
  // igual que en Firestore, así que no hay que traducir nada acá dentro.
  ['paquetes',           'paquetes']
];

// Columnas que la base maneja sola. Si el panel las manda en un update,
// las ignoramos: fecha_creacion no se toca nunca y fecha_actualizacion la
// pone el trigger de 01-esquema.sql.
const CAMPOS_AUTOMATICOS = ['id', 'fecha_creacion', 'fecha_actualizacion'];

// Los numeric de Postgres pueden llegar como texto ("109.00") según el
// driver. Number() los normaliza. Si viene null se queda null: en
// precio_oferta, null significa "no tiene oferta" y no es lo mismo que 0.
const NUMERICOS_PRODUCTO = ['precio', 'precioOferta'];


// ============================================================
// 3. DE LA BASE AL FRONT
// ============================================================

/** Fila de la tabla productos -> objeto que entiende la tienda. */
export function filaAProducto(fila) {
  if (!fila) return null;
  const p = { id: fila.id };

  for (const [columna, propiedad] of CAMPOS_PRODUCTO) {
    p[propiedad] = fila[columna];
  }
  for (const campo of NUMERICOS_PRODUCTO) {
    if (p[campo] !== null && p[campo] !== undefined) p[campo] = Number(p[campo]);
  }

  p.fechaCreacion      = aFecha(fila.fecha_creacion);
  p.fechaActualizacion = aFecha(fila.fecha_actualizacion);
  return p;
}

/** Fila de la tabla juegos -> objeto que entiende la página de recargas. */
export function filaAJuego(fila) {
  if (!fila) return null;
  const j = { id: fila.id };

  for (const [columna, propiedad] of CAMPOS_JUEGO) {
    j[propiedad] = fila[columna];
  }

  // jsonb siempre llega parseado, pero si alguien guardó basura a mano
  // preferimos un array vacío antes que reventar el render de la página.
  if (!Array.isArray(j.paquetes))    j.paquetes    = [];
  if (!Array.isArray(j.etiquetasId)) j.etiquetasId = [];

  j.fechaCreacion      = aFecha(fila.fecha_creacion);
  j.fechaActualizacion = aFecha(fila.fecha_actualizacion);
  return j;
}


// ============================================================
// 4. DEL FRONT A LA BASE
// ============================================================
// Solo se mandan las propiedades que vinieron. Así un update parcial sigue
// siendo parcial: si el panel manda { precio }, se toca el precio y nada más.

/** Objeto del panel -> fila para insert/update en productos. */
export function productoAFila(obj) {
  return aFila(obj, CAMPOS_PRODUCTO);
}

/** Objeto del panel -> fila para insert/update en juegos. */
export function juegoAFila(obj) {
  return aFila(obj, CAMPOS_JUEGO);
}

function aFila(obj, campos) {
  const fila = {};
  for (const [columna, propiedad] of campos) {
    if (!Object.prototype.hasOwnProperty.call(obj, propiedad)) continue;

    const valor = obj[propiedad];

    // undefined no es null. undefined = "no lo mandes"; null = "ponelo en
    // NULL". Si dejáramos pasar undefined, PostgREST lo convertiría en null
    // y un guardado parcial borraría campos sin querer.
    if (valor === undefined) continue;

    fila[columna] = valor;
  }
  return fila;
}


// ============================================================
// 5. LISTAS, POR SI HACEN FALTA AFUERA
// ============================================================
// Los nombres que conoce la traducción, como lista simple. Hoy no los usa
// nadie: los pedía la herramienta que copió el catálogo desde Firestore,
// que se borró cuando la mudanza terminó.
//
// Se dejan porque son la respuesta a "¿qué campos entiende el mapeo?", que
// es justo lo que hay que mirar al agregar una columna nueva, y porque
// cuestan una línea cada una.
export const PROPIEDADES_PRODUCTO = CAMPOS_PRODUCTO.map(([, prop]) => prop);
export const PROPIEDADES_JUEGO    = CAMPOS_JUEGO.map(([, prop]) => prop);
export { CAMPOS_AUTOMATICOS };
