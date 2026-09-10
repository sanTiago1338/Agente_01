// ============================================================
// TIAGO STORE · Subir la foto al depósito antes de guardar
// ============================================================
// admin-imagenes.js comprime la foto en el navegador y deja un data URI
// —la imagen entera escrita como texto— en el campo del formulario. Este
// módulo la convierte en un archivo del bucket "imagenes" y devuelve su
// URL, justo antes de guardar el producto o el juego.
//
// POR QUÉ IMPORTA
//   Un data URI se guarda DENTRO de la fila, y la fila viaja entera cada
//   vez que alguien abre la tienda. Con 226 productos eso ya pasó: el
//   catálogo llegó a pesar 17 MB, la consulta se cortaba por tiempo y la
//   lista quedaba vacía. Las fotos viejas se movieron al bucket el
//   7/9/2026 y el catálogo bajó a 215 KB; lo que faltaba era que las
//   NUEVAS no volvieran a entrar pegadas.
//
//   Como archivo, además, el navegador se la baja una sola vez: el bucket
//   las sirve con caché de un año.
//
// LO QUE NO SUBE, A PROPÓSITO
//   · Los SVG que genera el panel (el cuadrito con el nombre). Pesan 1,3 KB
//     y hacerlos archivo no ahorra nada, solo suma un pedido más.
//   · Las rutas a /Img y las URL de otros sitios: ya son archivos.
// ============================================================

import { sbAdmin } from './supabase-config.js';
import { SUPABASE_URL } from './supabase-base.js';

const BUCKET = 'imagenes';
const RAIZ   = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

// Solo estos tres. Ver "LO QUE NO SUBE" arriba.
const SUBIBLES = ['image/png', 'image/jpeg', 'image/webp'];


/**
 * ¿Este valor es una foto pegada que convenga subir?
 * @param {string} valor lo que hay en el campo
 */
export function esFotoPegada(valor) {
  const v = (valor || '').trim();
  return SUBIBLES.some(m => v.startsWith(`data:${m};base64,`));
}

/** ¿Esta URL es un archivo nuestro del bucket? */
export function esDelDeposito(valor) {
  return (valor || '').startsWith(RAIZ);
}


// ------------------------------------------------------------
// Nombre del archivo
// ------------------------------------------------------------
// Legible, sin tildes ni espacios, y con un sufijo al azar para que dos
// productos que se llamen parecido no se pisen el archivo. El azar y no el
// id porque un producto nuevo todavía no tiene id cuando se sube la foto.
function nombreArchivo(nombre, mime) {
  const base = (nombre || 'producto')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 50) || 'producto';

  const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg';
  const azar = crypto.getRandomValues(new Uint8Array(4));
  const sufijo = [...azar].map(b => b.toString(16).padStart(2, '0')).join('');

  return `${base}-${sufijo}.${ext}`;
}


function aBlob(dataUri) {
  const mime  = dataUri.slice(5, dataUri.indexOf(';'));
  const crudo = atob(dataUri.slice(dataUri.indexOf(',') + 1));
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mime, tamano: bytes.length };
}


// ------------------------------------------------------------
// Lo que llama el panel
// ------------------------------------------------------------
/**
 * Devuelve lo que hay que guardar en el campo "imagen".
 *
 * Si es una foto pegada la sube y devuelve su URL. Si no, devuelve el
 * mismo valor sin tocarlo, así una ruta a /Img o una URL de otro sitio
 * siguen funcionando igual que siempre.
 *
 * Si la subida falla TIRA el error en vez de guardar el data URI: guardarlo
 * en silencio es justo lo que hay que evitar, y el que llama lo muestra.
 *
 * @param {string} valor   lo que hay en el campo del formulario
 * @param {string} nombre  el del producto o juego, para nombrar el archivo
 * @returns {Promise<string>} lo que se guarda en la base
 */
export async function prepararImagen(valor, nombre) {
  const v = (valor || '').trim();
  if (!esFotoPegada(v)) return v;

  const { blob, mime, tamano } = aBlob(v);
  const archivo = nombreArchivo(nombre, mime);

  const { error } = await sbAdmin.storage.from(BUCKET).upload(archivo, blob, {
    contentType: mime,
    cacheControl: '31536000',   // un año: el archivo nunca cambia de nombre
    upsert: false               // el sufijo al azar ya evita los choques
  });

  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);

  console.log(`%c⬆ Imagen subida: ${archivo} (${Math.round(tamano / 1024)} KB)`,
              'color:#3ecf8e');

  return RAIZ + archivo;
}


/**
 * Borra del depósito una foto que se dejó de usar.
 *
 * Se llama después de guardar, cuando la imagen cambió. NO borra si algún
 * otro producto o juego sigue apuntando al mismo archivo: puede pasar si
 * alguien copió y pegó la URL de uno a otro, y ahí borrarla dejaría al otro
 * sin foto.
 *
 * Nunca tira error: es limpieza, y que quede un archivo de más molesta
 * mucho menos que romper el guardado que ya salió bien.
 *
 * @param {string} urlVieja la que estaba antes
 * @param {string} urlNueva la que quedó
 */
export async function borrarSiQuedoHuerfana(urlVieja, urlNueva) {
  if (!esDelDeposito(urlVieja) || urlVieja === urlNueva) return;

  try {
    const [productos, juegos] = await Promise.all([
      sbAdmin.from('productos').select('id').eq('imagen', urlVieja).limit(1),
      sbAdmin.from('juegos').select('id').eq('logo', urlVieja).limit(1)
    ]);

    const laUsaOtro = (productos.data?.length || 0) > 0 || (juegos.data?.length || 0) > 0;
    if (laUsaOtro) return;

    const archivo = urlVieja.slice(RAIZ.length);
    await sbAdmin.storage.from(BUCKET).remove([archivo]);
    console.log(`%c🗑 Imagen sin uso borrada: ${archivo}`, 'color:#9aa0ab');
  } catch (err) {
    console.warn('No se pudo limpiar la imagen vieja:', err.message);
  }
}
