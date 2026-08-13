// ============================================================
// ZONA VIP · Subida y compresión de imágenes
// ============================================================
// Comprime la imagen EN EL NAVEGADOR antes de guardarla, y la
// deja como data URI dentro del producto en Firestore.
//
// Por qué comprimir sí o sí:
//   Firestore tiene un límite duro de 1 MB por documento.
//   Una foto de celular pesa 3-5 MB. Sin comprimir, no entra.
//
// Flujo:  archivo → <canvas> → 256x256 → WebP 0.82 → ~10 KB
//
// Se engancha al editor de producto que crea admin-productos.js,
// por eso este archivo se carga DESPUÉS de aquel.
// ============================================================

// -----------------------------------------------------------
// Configuración
// -----------------------------------------------------------
const LADO_MAX     = 256;     // px — en la tienda se ve a ~150px
const CALIDAD      = 0.82;
const PESO_OBJETIVO = 90 * 1024;   // 90 KB — si se pasa, recomprime
const PESO_MAXIMO   = 400 * 1024;  // 400 KB — tope duro (Firestore: 1 MB)

const aviso = (txt, tipo) =>
  (window.avisoAdmin ? window.avisoAdmin(txt, tipo) : console.log(txt));

// -----------------------------------------------------------
// ¿El navegador exporta WebP?  (todos desde 2020)
// WebP pesa menos que JPEG y respeta la transparencia,
// que es lo que necesitan los logos con fondo transparente.
// -----------------------------------------------------------
const FORMATO = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  return c.toDataURL('image/webp').startsWith('data:image/webp')
    ? { mime: 'image/webp', nombre: 'WebP' }
    : { mime: 'image/png',  nombre: 'PNG'  };
})();

// ============================================================
// 1. ESTILOS
// ============================================================
const css = document.createElement('style');
css.textContent = `
  .zvi-zona {
    border: 1.5px dashed #383838;
    border-radius: 10px;
    padding: 18px 14px;
    text-align: center;
    cursor: pointer;
    background: #1a1a1a;
    transition: border-color .15s, background .15s;
    margin-bottom: 9px;
  }
  .zvi-zona:hover   { border-color: #e50914; background: #1f1717; }
  .zvi-zona.encima  { border-color: #e50914; background: #241313; }
  .zvi-zona .icono  { font-size: 24px; display: block; margin-bottom: 6px; }
  .zvi-zona .titulo { font-size: 13.5px; color: #f5f5f5; font-weight: 600; }
  .zvi-zona .sub    { font-size: 11.5px; color: #6b6b6b; margin-top: 3px; }

  .zvi-ficha {
    display: none;
    align-items: center;
    gap: 12px;
    padding: 11px;
    background: #16241a;
    border: 1px solid rgba(34,197,94,.4);
    border-radius: 10px;
    margin-bottom: 9px;
  }
  .zvi-ficha.visible { display: flex; }
  .zvi-ficha img {
    width: 50px; height: 50px;
    border-radius: 8px;
    object-fit: cover;
    background: #232323;
    flex-shrink: 0;
  }
  .zvi-ficha .info   { flex: 1; min-width: 0; }
  .zvi-ficha .t      { font-size: 13px; font-weight: 600; color: #a8ebc0; }
  .zvi-ficha .d      { font-size: 11.5px; color: #6b8f76; margin-top: 2px; }
  .zvi-ficha button  {
    background: none; border: 1px solid #2f4a38;
    color: #8fbfa0; border-radius: 7px;
    padding: 7px 11px; cursor: pointer;
    font-size: 12.5px; font-family: inherit;
    white-space: nowrap;
  }
  .zvi-ficha button:hover { background: #1d3324; color: #fff; }

  .zvi-progreso {
    display: none;
    align-items: center; gap: 10px;
    padding: 12px;
    background: #1c1c1c;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    margin-bottom: 9px;
    font-size: 13px; color: #9a9a9a;
  }
  .zvi-progreso.visible { display: flex; }
  .zvi-spin {
    width: 17px; height: 17px;
    border: 2px solid #2a2a2a;
    border-top-color: #e50914;
    border-radius: 50%;
    animation: zviGirar .7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes zviGirar { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .zvi-spin { animation-duration: 2.5s; } }

  .zvi-alternar {
    background: none; border: none;
    color: #ffd700; font-size: 12px;
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
    <div class="sub">Se achica sola a ${LADO_MAX}×${LADO_MAX} · JPG, PNG, WebP o GIF</div>`;

  // --- Input de archivo oculto ---
  const archivo = document.createElement('input');
  archivo.type = 'file';
  archivo.accept = 'image/*';
  archivo.style.display = 'none';

  // --- Indicador de progreso ---
  const progreso = document.createElement('div');
  progreso.className = 'zvi-progreso';
  progreso.innerHTML = '<div class="zvi-spin"></div><span>Comprimiendo imagen…</span>';

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
      const kb = Math.round(valor.length * 0.75 / 1024);   // base64 → bytes reales
      ficha.querySelector('.d').textContent =
        `${FORMATO.nombre} · ${LADO_MAX}px máx · ~${kb} KB · guardada en Firestore`;
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
      const { dataUri, ancho, alto, bytes } = await comprimir(file);

      if (bytes > PESO_MAXIMO) {
        aviso('No se pudo comprimir lo suficiente. Probá con una imagen más simple.', 'error');
        return;
      }

      input.value = dataUri;
      input.dispatchEvent(new Event('input'));   // actualiza la vista previa de C3

      const antes   = (file.size / 1024).toFixed(0);
      const despues = (bytes / 1024).toFixed(0);
      aviso(`✓ Imagen lista: ${antes} KB → ${despues} KB (${ancho}×${alto})`, 'ok');
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
 * Si el resultado sigue pesando mucho, reintenta con menos
 * calidad y menos tamaño hasta entrar en PESO_OBJETIVO.
 *
 * @param {File} file
 * @returns {Promise<{dataUri:string, ancho:number, alto:number, bytes:number}>}
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
          // Intento 1: tamaño y calidad normales.
          // Si pesa de más, bajamos ambos y probamos otra vez.
          const intentos = [
            { lado: LADO_MAX,       calidad: CALIDAD },
            { lado: LADO_MAX,       calidad: 0.65    },
            { lado: LADO_MAX * 0.75, calidad: 0.6    },
            { lado: LADO_MAX * 0.5,  calidad: 0.55   }
          ];

          let mejor = null;

          for (const { lado, calidad } of intentos) {
            const escala = Math.min(1, lado / Math.max(img.width, img.height));
            const ancho  = Math.max(1, Math.round(img.width  * escala));
            const alto   = Math.max(1, Math.round(img.height * escala));

            const lienzo = document.createElement('canvas');
            lienzo.width  = ancho;
            lienzo.height = alto;

            const ctx = lienzo.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, ancho, alto);

            const dataUri = lienzo.toDataURL(FORMATO.mime, calidad);
            const bytes   = Math.round(dataUri.length * 0.75);

            mejor = { dataUri, ancho, alto, bytes };
            if (bytes <= PESO_OBJETIVO) break;
          }

          resolve(mejor);
        } catch (err) {
          reject(err);
        }
      };

      img.src = lector.result;
    };

    lector.readAsDataURL(file);
  });
}

console.log(`%c✓ Subida de imágenes lista (${FORMATO.nombre})`,
            'color:#22c55e;font-weight:bold');
