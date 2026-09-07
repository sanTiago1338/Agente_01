// ============================================================
// TIAGO STORE · Subida y compresión de imágenes
// ============================================================
// Comprime la imagen EN EL NAVEGADOR antes de guardarla, y la
// deja como data URI dentro del producto en Firestore.
//
// Por qué comprimir sí o sí:
//   Firestore tiene un límite duro de 1 MB por documento.
//   Una foto de celular pesa 3-5 MB. Sin comprimir, no entra.
//
// Flujo:  archivo → <canvas> achicado de a mitades → 1024x1024 máx
//         → toque de nitidez → WebP (o JPEG/PNG) → ~80-250 KB
//
// Se engancha al editor de producto que crea admin-productos.js,
// por eso este archivo se carga DESPUÉS de aquel.
// ============================================================

// -----------------------------------------------------------
// Configuración
// -----------------------------------------------------------
// De dónde sale el 1024. Medido en la tienda:
//   tarjeta de la grilla en escritorio (4 columnas) ... hasta ~460px
//   hero del panel de plataforma ...................... 747x190
//   tarjeta en un celular de pantalla 3x .............. 177px = 531px reales
//   tarjeta a todo el ancho en un celular 3x .......... 340px = 1020px reales
// Con 768 (lo de antes) a las pantallas 3x les seguía faltando.
const LADO_MAX = 1024;

// Si el archivo se pasa de PESO_OBJETIVO se reintenta bajando la
// CALIDAD antes que el TAMAÑO: una imagen grande con algo de
// compresión se ve mucho mejor que una chica y perfecta.
// Nunca se baja de LADO_MINIMO.
const CALIDAD       = 0.86;
const LADO_MINIMO   = 768;
const PESO_OBJETIVO = 220 * 1024;  // 220 KB — si se pasa, reintenta
// Tope duro. Ojo: estos bytes son los de la imagen, pero se guarda en
// base64, que ocupa un tercio más (420 KB -> ~560 KB en el documento).
// El límite de Firestore es 1 MB por documento, contando el resto de
// los campos, así que de acá no conviene subir.
const PESO_MAXIMO   = 420 * 1024;

// Cuánta nitidez se devuelve después de achicar (0 = nada).
// 0.3 es suave: levanta los bordes sin dejar halos en los logos.
const NITIDEZ = 0.3;

const aviso = (txt, tipo) =>
  (window.avisoAdmin ? window.avisoAdmin(txt, tipo) : console.log(txt));

// -----------------------------------------------------------
// Formato de salida
// -----------------------------------------------------------
// WebP pesa menos que JPEG y respeta la transparencia, que es lo que
// necesitan los logos. Lo generan Chrome, Edge, Firefox y Android...
// pero Safari (iPhone, iPad y Mac) NO sabe exportar WebP desde <canvas>.
//
// Lo que pasaba: desde Safari esto caía a PNG. PNG no tiene "calidad",
// así que la única forma de bajar de peso era achicar la imagen, y
// Apple Music, Podimo, Canva y Disney quedaron guardadas en 384x384
// (por eso se veían borrosas). Ahora, sin WebP:
//   - foto o imagen sin transparencia  -> JPEG (sí tiene calidad)
//   - logo con transparencia de verdad -> PNG
// -----------------------------------------------------------
const SOPORTA_WEBP = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  return c.toDataURL('image/webp').startsWith('data:image/webp');
})();

function formatoPara(tieneAlfa) {
  if (SOPORTA_WEBP) return { mime: 'image/webp', nombre: 'WebP', conCalidad: true  };
  if (tieneAlfa)    return { mime: 'image/png',  nombre: 'PNG',  conCalidad: false };
  return                   { mime: 'image/jpeg', nombre: 'JPEG', conCalidad: true  };
}

// "data:image/webp;base64,..." -> "WebP"
function nombreDeMime(dataUri) {
  const mime = dataUri.slice(5, dataUri.indexOf(';'));
  return { 'image/webp': 'WebP', 'image/jpeg': 'JPEG', 'image/png': 'PNG',
           'image/gif': 'GIF', 'image/svg+xml': 'SVG' }[mime] || mime;
}

// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .zvi-zona {
    border: 1.5px dashed var(--borde-2);
    border-radius: 10px;
    padding: 18px 14px;
    text-align: center;
    cursor: pointer;
    background: var(--superficie-2);
    transition: border-color .15s, background .15s;
    margin-bottom: 9px;
  }
  .zvi-zona:hover   { border-color: var(--rojo); background: rgba(229,9,20,.05); }
  .zvi-zona.encima  { border-color: var(--rojo); background: rgba(229,9,20,.09); }
  .zvi-zona .icono  { font-size: 24px; display: block; margin-bottom: 6px; }
  .zvi-zona .titulo { font-size: 13.5px; color: var(--tinta); font-weight: 600; }
  .zvi-zona .sub    { font-size: 11.5px; color: var(--gris-dim); margin-top: 3px; }

  .zvi-ficha {
    display: none;
    align-items: center;
    gap: 12px;
    padding: 11px;
    background: #eaf7ef;
    border: 1px solid rgba(21,128,61,.3);
    border-radius: 10px;
    margin-bottom: 9px;
  }
  .zvi-ficha.visible { display: flex; }
  .zvi-ficha img {
    width: 50px; height: 50px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--panel-3);
    flex-shrink: 0;
  }
  .zvi-ficha .info   { flex: 1; min-width: 0; }
  .zvi-ficha .t      { font-size: 13px; font-weight: 600; color: #10502a; }
  .zvi-ficha .d      { font-size: 11.5px; color: #4f7a60; margin-top: 2px; }
  .zvi-ficha .d b    { color: #9a3412; font-weight: 600; }
  .zvi-ficha button  {
    background: none; border: 1px solid rgba(21,128,61,.35);
    color: var(--ok); border-radius: 7px;
    padding: 7px 11px; cursor: pointer;
    font-size: 12.5px; font-family: inherit;
    white-space: nowrap;
  }
  .zvi-ficha button:hover { background: rgba(21,128,61,.12); color: #10502a; }

  .zvi-progreso {
    display: none;
    align-items: center; gap: 10px;
    padding: 12px;
    background: var(--panel-2);
    border: 1px solid var(--borde);
    border-radius: 10px;
    margin-bottom: 9px;
    font-size: 13px; color: var(--gris);
  }
  .zvi-progreso.visible { display: flex; }
  .zvi-spin {
    width: 17px; height: 17px;
    border: 2px solid var(--borde);
    border-top-color: var(--rojo);
    border-radius: 50%;
    animation: zviGirar .7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes zviGirar { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .zvi-spin { animation-duration: 2.5s; } }

  .zvi-alternar {
    background: none; border: none;
    color: var(--dorado); font-size: 12px;
    cursor: pointer; padding: 3px 0;
    text-decoration: underline; text-underline-offset: 3px;
    font-family: inherit;
  }
  .zvi-alternar:hover { filter: brightness(1.2); }
`;
document.head.appendChild(css);

// ============================================================
// 2. ENGANCHE AL EDITOR DE PRODUCTO
// ============================================================
const campoUrl = document.getElementById('fImagen');
if (!campoUrl) {
  console.warn('admin-imagenes.js: no encontré #fImagen. ¿Se cargó admin-productos.js antes?');
} else {
  montar(campoUrl);
}

function montar(input) {
  const campo   = input.closest('.zv-campo');
  const etiqueta = campo.querySelector('label');
  const previa  = campo.querySelector('.zv-previa');

  // Texto de ayuda actualizado
  etiqueta.innerHTML =
    'Imagen del producto <span class="ayuda">— subila, arrastrala o pegala con Ctrl+V</span>';

  // --- Zona para soltar / elegir ---
  const zona = document.createElement('div');
  zona.className = 'zvi-zona';
  zona.innerHTML = `
    <span class="icono">🖼️</span>
    <div class="titulo">Elegí una imagen o arrastrala acá</div>
    <div class="sub">Se optimiza sola hasta ${LADO_MAX}×${LADO_MAX} · JPG, PNG, WebP o GIF · cuanto más grande la original, mejor</div>`;

  // --- Input de archivo oculto ---
  const archivo = document.createElement('input');
  archivo.type = 'file';
  archivo.accept = 'image/*';
  archivo.style.display = 'none';

  // --- Indicador de progreso ---
  const progreso = document.createElement('div');
  progreso.className = 'zvi-progreso';
  progreso.innerHTML = '<div class="zvi-spin"></div><span>Optimizando imagen…</span>';

  // --- Ficha de imagen ya cargada ---
  const ficha = document.createElement('div');
  ficha.className = 'zvi-ficha';
  ficha.innerHTML = `
    <img alt="">
    <div class="info">
      <div class="t">Imagen lista</div>
      <div class="d"></div>
    </div>
    <button type="button">Quitar</button>`;

  // --- Alternar a modo URL manual ---
  const alternar = document.createElement('button');
  alternar.type = 'button';
  alternar.className = 'zvi-alternar';
  alternar.textContent = 'o pegar una URL / ruta a mano';

  campo.insertBefore(ficha,    input);
  campo.insertBefore(progreso, input);
  campo.insertBefore(zona,     input);
  campo.insertBefore(archivo,  input);
  campo.insertBefore(alternar, previa);

  // ---------------------------------------------------------
  // Estados de la interfaz
  // ---------------------------------------------------------
  let modoUrl = false;

  function refrescar() {
    const valor  = input.value.trim();
    const esData = valor.startsWith('data:');

    ficha.classList.toggle('visible', esData);
    zona.style.display  = (esData || modoUrl) ? 'none' : '';
    input.style.display = modoUrl ? '' : 'none';
    alternar.style.display = esData ? 'none' : '';
    alternar.textContent = modoUrl
      ? '← volver a subir un archivo'
      : 'o pegar una URL / ruta a mano';

    if (esData) {
      ficha.querySelector('img').src = valor;
      const kb      = Math.round(valor.length * 0.75 / 1024);   // base64 → bytes reales
      const formato = nombreDeMime(valor);
      const detalle = ficha.querySelector('.d');
      detalle.textContent = `${formato} · ~${kb} KB · guardada en Firestore`;

      // Las medidas salen recién cuando el navegador la decodifica.
      // Si es una imagen chica de antes, avisar: así se ven cuáles
      // conviene volver a subir.
      const sonda = new Image();
      sonda.onload = () => {
        if (input.value.trim() !== valor) return;   // ya cambió de producto
        const lado = Math.max(sonda.naturalWidth, sonda.naturalHeight);
        detalle.textContent =
          `${formato} · ${sonda.naturalWidth}×${sonda.naturalHeight} · ~${kb} KB · guardada en Firestore`;
        if (lado < LADO_MINIMO) {
          const b = document.createElement('b');
          b.textContent = ' · ⚠ chica: se ve borrosa en la tienda, volvé a subirla en buena calidad';
          detalle.appendChild(b);
        }
      };
      sonda.src = valor;
    }
  }

  alternar.addEventListener('click', () => { modoUrl = !modoUrl; refrescar(); });

  ficha.querySelector('button').addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    refrescar();
  });

  // ---------------------------------------------------------
  // Elegir archivo
  // ---------------------------------------------------------
  zona.addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', e => {
    if (e.target.files[0]) procesar(e.target.files[0]);
    archivo.value = '';   // permite volver a elegir el mismo archivo
  });

  // ---------------------------------------------------------
  // Arrastrar y soltar
  // ---------------------------------------------------------
  ['dragenter', 'dragover'].forEach(ev =>
    zona.addEventListener(ev, e => {
      e.preventDefault();
      zona.classList.add('encima');
    }));

  ['dragleave', 'drop'].forEach(ev =>
    zona.addEventListener(ev, e => {
      e.preventDefault();
      zona.classList.remove('encima');
    }));

  zona.addEventListener('drop', e => {
    const f = e.dataTransfer?.files?.[0];
    if (f) procesar(f);
  });

  // ---------------------------------------------------------
  // Pegar con Ctrl+V (solo con el editor abierto)
  // ---------------------------------------------------------
  document.addEventListener('paste', e => {
    const editorAbierto = document
      .getElementById('zvFondoEditor')?.classList.contains('abierto');
    if (!editorAbierto || modoUrl) return;

    const item = [...(e.clipboardData?.items || [])]
      .find(i => i.type.startsWith('image/'));
    if (!item) return;

    e.preventDefault();
    const f = item.getAsFile();
    if (f) procesar(f);
  });

  // ---------------------------------------------------------
  // Procesar: validar → comprimir → guardar
  // ---------------------------------------------------------
  async function procesar(file) {
    if (!file.type.startsWith('image/')) {
      aviso('Ese archivo no es una imagen.', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      aviso('La imagen pesa más de 20 MB. Probá con una más chica.', 'error');
      return;
    }

    progreso.classList.add('visible');
    zona.style.display = 'none';

    try {
      const r = await comprimir(file);

      if (r.bytes > PESO_MAXIMO) {
        aviso('No se pudo comprimir lo suficiente. Probá con una imagen más simple.', 'error');
        return;
      }

      input.value = r.dataUri;
      input.dispatchEvent(new Event('input'));   // actualiza la vista previa de C3

      const antes   = (file.size / 1024).toFixed(0);
      const despues = (r.bytes / 1024).toFixed(0);
      aviso(`✓ Imagen lista: ${r.original} → ${r.ancho}×${r.alto} · ${antes} KB → ${despues} KB (${r.formato})`, 'ok');
      if (r.nota) aviso(r.nota, 'info');
      if (Math.max(r.ancho, r.alto) < LADO_MINIMO) {
        aviso(`La original era chica (${r.original}): en la tienda se va a ver borrosa. ` +
              `Si podés, buscá una de al menos ${LADO_MAX} px.`, 'error');
      }
    } catch (err) {
      console.error(err);
      aviso(`No se pudo procesar la imagen: ${err.message}`, 'error');
    } finally {
      progreso.classList.remove('visible');
      refrescar();
    }
  }

  // El editor cambia de producto -> re-sincronizar la interfaz
  input.addEventListener('input', refrescar);
  const observador = new MutationObserver(refrescar);
  const fondo = document.getElementById('zvFondoEditor');
  if (fondo) observador.observe(fondo, { attributes: true, attributeFilter: ['class'] });

  refrescar();
}

// ============================================================
// 3. COMPRESIÓN
// ============================================================
/**
 * Achica y comprime una imagen usando <canvas>.
 *
 * @param {File} file
 * @returns {Promise<{dataUri:string, ancho:number, alto:number, bytes:number,
 *                    formato:string, original:string, nota?:string}>}
 */
function comprimir(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();

    lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
    lector.onload = () => {
      const img = new Image();

      img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
      img.onload = () => {
        try {
          resolve(codificar(img, file));
        } catch (err) {
          reject(err);
        }
      };

      img.src = lector.result;
    };

    lector.readAsDataURL(file);
  });
}

/**
 * Elige formato, achica y reintenta hasta entrar en el peso objetivo.
 * Orden de los reintentos: primero baja la calidad, recién después el
 * tamaño, y nunca por debajo de LADO_MINIMO.
 */
function codificar(img, file) {
  if (!(img.width > 0 && img.height > 0)) {
    throw new Error('la imagen no tiene medidas (¿es un SVG sin ancho y alto?)');
  }
  const original = `${img.width}×${img.height}`;

  // ¿Tiene transparencia? Un JPEG nunca; el resto se mira píxel a píxel.
  const tieneAlfa = file.type !== 'image/jpeg' && detectarAlfa(img);
  const formato   = formatoPara(tieneAlfa);

  // Cada tamaño se achica una sola vez, aunque se pruebe con varias calidades.
  const lienzos = new Map();
  const lienzoDe = lado => {
    const { ancho, alto } = medidasPara(img, lado);
    const clave = `${ancho}x${alto}`;
    if (!lienzos.has(clave)) lienzos.set(clave, achicar(img, ancho, alto, !tieneAlfa));
    return lienzos.get(clave);
  };

  const intentos = [
    { lado: LADO_MAX,    calidad: CALIDAD },
    { lado: LADO_MAX,    calidad: 0.78    },
    { lado: LADO_MAX,    calidad: 0.70    },
    { lado: 896,         calidad: 0.72    },
    { lado: LADO_MINIMO, calidad: 0.70    }
  ];

  let mejor = null;
  const probados = new Set();

  for (const { lado, calidad } of intentos) {
    const lienzo = lienzoDe(lado);
    // PNG ignora la calidad y una imagen chica no se agranda:
    // no repetir un intento que va a dar exactamente lo mismo.
    const clave = `${lienzo.width}x${lienzo.height}` + (formato.conCalidad ? `@${calidad}` : '');
    if (probados.has(clave)) continue;
    probados.add(clave);

    const dataUri = lienzo.toDataURL(formato.mime, calidad);
    const bytes   = Math.round(dataUri.length * 0.75);

    mejor = { dataUri, ancho: lienzo.width, alto: lienzo.height, bytes,
              formato: formato.nombre, original };
    if (bytes <= PESO_OBJETIVO) return mejor;
  }

  if (mejor.bytes <= PESO_MAXIMO || formato.conCalidad) return mejor;

  // Último recurso: un PNG con transparencia que no entra ni a 768.
  // Se aplana sobre blanco (el fondo de la tarjeta en la tienda, así
  // que se ve igual) y se guarda en JPEG, que sí baja de peso.
  const plano   = aplanar(lienzoDe(LADO_MAX));
  const dataUri = plano.toDataURL('image/jpeg', 0.8);
  return {
    dataUri, ancho: plano.width, alto: plano.height,
    bytes: Math.round(dataUri.length * 0.75),
    formato: 'JPEG', original,
    nota: 'La imagen tenía transparencia y pesaba mucho: se guardó con fondo blanco.'
  };
}

// Medidas finales para un lado máximo. Nunca agranda.
function medidasPara(img, lado) {
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  return {
    ancho: Math.max(1, Math.round(img.width  * escala)),
    alto:  Math.max(1, Math.round(img.height * escala))
  };
}

function lienzoNuevo(ancho, alto) {
  const c = document.createElement('canvas');
  c.width  = ancho;
  c.height = alto;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return c;
}

/**
 * Achica de a mitades y termina con un paso fino.
 *
 * Achicar de golpe una foto de 4000 px a 1000 px tira píxeles enteros
 * y deja la imagen áspera y a la vez borrosa (Safari y Firefox ni
 * miran imageSmoothingQuality). Bajando de a mitades cada paso
 * promedia bien a sus vecinos, que es lo que hace Photoshop.
 *
 * Después, toda imagen achicada queda un poco lavada: un toque de
 * nitidez (solo en las que no tienen transparencia) la devuelve.
 */
function achicar(img, ancho, alto, afilar) {
  let fuente = img;
  let w = img.width, h = img.height;

  while (w >= ancho * 2 && h >= alto * 2) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    const paso = lienzoNuevo(w, h);
    paso.getContext('2d').drawImage(fuente, 0, 0, w, h);
    fuente = paso;
  }

  const final = lienzoNuevo(ancho, alto);
  final.getContext('2d').drawImage(fuente, 0, 0, ancho, alto);

  const seAchico = ancho < img.width * 0.8;
  if (afilar && seAchico && NITIDEZ > 0) darNitidez(final, NITIDEZ);

  return final;
}

/**
 * Máscara de enfoque suave: cada píxel se separa un poco del
 * promedio de sus 4 vecinos. Solo toca el color, no la transparencia.
 */
function darNitidez(lienzo, cantidad) {
  const ctx = lienzo.getContext('2d');
  const w = lienzo.width, h = lienzo.height;
  if (w < 3 || h < 3) return;

  const origen  = ctx.getImageData(0, 0, w, h);
  const destino = ctx.createImageData(w, h);
  const a = origen.data, b = destino.data;
  b.set(a);   // bordes y canal alfa quedan tal cual

  const centro = 1 + 4 * cantidad;
  const fila   = w * 4;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * fila + x * 4;
      for (let c = 0; c < 3; c++) {
        const p = i + c;
        // Uint8ClampedArray ya recorta a 0..255 y redondea
        b[p] = centro * a[p]
             - cantidad * (a[p - 4] + a[p + 4] + a[p - fila] + a[p + fila]);
      }
    }
  }

  ctx.putImageData(destino, 0, 0);
}

// ¿Algún píxel transparente? Se mira en una copia chica: alcanza y es
// instantáneo.
function detectarAlfa(img) {
  const { ancho, alto } = medidasPara(img, 256);
  const c = lienzoNuevo(ancho, alto);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, ancho, alto);
  const d = ctx.getImageData(0, 0, ancho, alto).data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 250) return true;
  }
  return false;
}

// Copia sobre fondo blanco (sin transparencia), para poder ir a JPEG.
function aplanar(lienzo) {
  const c = lienzoNuevo(lienzo.width, lienzo.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(lienzo, 0, 0);
  return c;
}

console.log(
  SOPORTA_WEBP
    ? '%c✓ Subida de imágenes lista (WebP)'
    : '%c✓ Subida de imágenes lista (JPEG/PNG: este navegador no genera WebP)',
  'color:#22c55e;font-weight:bold');
