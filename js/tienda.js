// ============================================================
// TIAGO STORE · La tienda
// ============================================================
// Estaba dentro de index.html, en un <script> de 1.890 lineas.
//
// Es un script CLASICO, no un modulo, y tiene que seguir siendolo:
// las funciones que define (abrirPlataforma, filterProducts, openCart...)
// las llaman los onclick escritos en el HTML, y para eso tienen que
// vivir en el scope global. Un modulo las encerraria y los botones
// dejarian de responder.
//
// Por lo mismo va SIN defer y en el mismo lugar del body donde
// estaba: mas abajo hay codigo que cuenta con que esto ya corrio.
// ============================================================

    // ===== PRODUCT DATA =====
    // ==========================================================
    // CATÁLOGO DE PRODUCTOS
    // ==========================================================
    // Los productos YA NO se escriben acá.
    // Viven en Supabase y se cargan solos — ver el <script type="module">
    // al final de este archivo.
    //
    // Para agregar, editar o borrar productos, cambiar precios,
    // nombres o imágenes:  abrí  /admin
    // Nunca más hay que tocar este HTML.
    // ==========================================================
    let PRODUCTS = [];
    let catalogoCargado = false;

    // Supabase llama a esto en cada cambio (tiempo real).
    window.__aplicarCatalogo = function (productos) {
      PRODUCTS = productos;
      catalogoCargado = true;
      renderCategorias();   // pestañas según lo que haya en Supabase
      renderSubfiltros();
      renderProducts();
      actualizarFotosDePlataforma();   // banners y Tops, con la foto de su plataforma
      // El carrito se rearma con los precios frescos que acaban de llegar.
      reconstruirCarrito();
      // Si volvió con "atrás" a una pantalla de la ventana, se la abre
      restaurarPantalla();
    };

    // Si Supabase falla, lo mostramos en la grilla en vez de dejarla vacía.
    window.__errorCatalogo = function (mensaje) {
      catalogoCargado = true;
      const grid = document.getElementById('5');
      if (!grid) return;
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3.5rem 1rem;">
        <div style="font-size:2.5rem; margin-bottom:.75rem;">⚠️</div>
        <div style="font-weight:900; color:#fff; margin-bottom:.4rem;">No se pudo cargar el catálogo</div>
        <div style="font-size:.9rem; color:var(--gris-texto);">${mensaje}</div>
      </div>`;
    };

    let currentCat = 'all';
    let currentSub = 'all';
    let currentSearch = '';
    let currentPage = 1;
    // Cuántas plataformas trae cada página: al menos 12, y siempre filas
    // completas según las columnas que muestra la grilla (2 en el celular,
    // hasta 6 en la compu; ver css/tienda.css). Con 5 columnas son 15 y
    // no 12: si no, la última fila quedaba con dos tarjetas sueltas.
    const MINIMO_POR_PAGINA = 12;
    function itemsPorPagina() {
      const grid = document.getElementById('5');
      const cols = grid
        ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
        : 0;
      return cols > 0 ? cols * Math.ceil(MINIMO_POR_PAGINA / cols) : MINIMO_POR_PAGINA;
    }

    // Si al girar la tablet o achicar la ventana cambian las columnas,
    // se rearma la página para que siga saliendo con filas completas.
    let porPaginaActual = 0;
    window.addEventListener('resize', () => {
      const n = itemsPorPagina();
      if (n === porPaginaActual) return;
      porPaginaActual = n;
      if (catalogoCargado) renderProducts();
    });
    let cartCount = 0;
    let cart = [];

    // ==========================================================
    // CARRITO PERSISTENTE
    // ==========================================================
    // Guardamos SOLO id + cantidad, no una copia del producto.
    // Los datos (precio, nombre, imagen) se releen del catálogo cada vez,
    // así el carrito siempre muestra el precio actual aunque lo cambies
    // desde el panel mientras el cliente lo tiene abierto.
    // ==========================================================
    const CART_KEY = 'zonavip_carrito';

    function guardarCarrito() {
      try {
        localStorage.setItem(CART_KEY,
          JSON.stringify(cart.map(i => ({ id: i.id, qty: i.qty }))));
      } catch (e) {
        // Modo incógnito o almacenamiento lleno: el carrito sigue
        // funcionando en memoria, solo no sobrevive a la recarga.
      }
    }

    function leerCarritoGuardado() {
      try {
        const datos = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        return Array.isArray(datos) ? datos : [];
      } catch (e) {
        return [];
      }
    }

    // Rearma el carrito con los datos frescos del catálogo.
    // Descarta lo que ya no existe o quedó agotado.
    function reconstruirCarrito() {
      const guardado = leerCarritoGuardado();
      const antes = guardado.length;

      cart = guardado
        .map(({ id, qty }) => {
          const p = PRODUCTS.find(x => x.id === id);
          return (p && !p.soldOut) ? { ...p, qty: Math.max(1, Number(qty) || 1) } : null;
        })
        .filter(Boolean);

      // Si algo se cayó del carrito, actualizamos lo guardado
      if (cart.length !== antes) guardarCarrito();
      updateCartCount();
    }

    // Si el cliente tiene la tienda abierta en dos pestañas,
    // el carrito se mantiene igual en las dos.
    window.addEventListener('storage', e => {
      if (e.key === CART_KEY && catalogoCargado) reconstruirCarrito();
    });

    function updateCartCount() {
      cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
      document.getElementById('1').textContent = cartCount;
      document.getElementById('7').textContent = cartCount;
    }


    function generateLogoSvg(name, imgColor) {
      // Extraer nombre corto del servicio (máx 2 palabras)
      let short = name.replace(/\(.*?\)/g, '').replace(/\s*—.*$/, '').trim();
      short = short.replace(/\b(PRO|PLUS|Premium|Estándar|Standard|Business|Ultra|Basic|Lite|Essential)\b.*/i, '').trim();
      const words = short.split(/\s+/).filter(w => w.length > 0);

      const line1 = (words[0] || '').toUpperCase();
      const line2 = (words[1] || '').toUpperCase();
      const hasTwo = line2.length > 0;

      const colors = (imgColor || '#1e1e1e,#333').split(',');
      const c1 = colors[0].trim();
      const c2 = (colors[1] || colors[0]).trim();

      // viewBox cuadrado 160x160. Ancho útil = 144px.
      const maxLen = Math.max(line1.length || 1, line2.length || 1);
      const fsByWidth = Math.floor(144 / (maxLen * 0.62));
      const fsByHeight = hasTwo ? 44 : 64;
      const fs = Math.round(Math.min(fsByWidth, fsByHeight, 64) * 0.9);

      // Centrado vertical en viewBox 160x160 (centro = 80).
      let textBlock;
      if (hasTwo) {
        const gap = 10;
        const y1 = Math.round(80 - (fs + gap) / 2 + 0.36 * fs);
        const y2 = y1 + fs + gap;
        textBlock =
          `<text x="80" y="${y1}" font-family="Arial Black,Impact,sans-serif" font-size="${fs}" font-weight="900" fill="white" fill-opacity="0.95" text-anchor="middle">${line1}</text>` +
          `<text x="80" y="${y2}" font-family="Arial Black,Impact,sans-serif" font-size="${fs}" font-weight="900" fill="white" fill-opacity="0.72" text-anchor="middle">${line2}</text>`;
      } else {
        const y = Math.round(80 + 0.36 * fs);
        textBlock =
          `<text x="80" y="${y}" font-family="Arial Black,Impact,sans-serif" font-size="${fs}" font-weight="900" fill="white" fill-opacity="0.95" text-anchor="middle">${line1}</text>`;
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" overflow="hidden"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.12)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient></defs><rect width="160" height="160" fill="url(#bg)"/><rect width="160" height="160" fill="url(#sh)"/><rect x="5" y="5" width="150" height="150" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1" rx="7"/>${textBlock}</svg>`;
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    // Logos personalizados locales (carpeta /Img/). Se busca por keyword.
    // Para usar tu propio logo: coloca el archivo en /Img/ (ej. /Img/netflix.png)
    // y añade aquí la entrada: 'netflix': 'Img/netflix.png'
    // Formatos soportados: .png .jpg .jpeg .webp .svg
    const LOCAL_LOGOS = {
      // Más específicas primero (para evitar matches genéricos)
      // Sin Netflix, IPTV, Flujo, Hallow, Pixlr, Linear, Apple Music, Drama
      // Box, Tele Latino, Zona IPTV ni las "completas" de Disney y Claude:
      // esas fotos se borraron de Img/opt y los productos ya tienen la suya
      // en Storage. Si alguno se queda sin imagen, cae al logo de Google de
      // más abajo en vez de a un cuadro roto.
      'disney plus + espn':     'Img/Disney%20%2B%20ESPN.jpg',
      'youtube premium':        'Img/You%20Tube.jpg',
      'canva pro':              'Img/Canva%20Pro.jpeg',
      'canva edu':              'Img/Canva%20EDU.jpg',
      'chatgpt pro':            'Img/ChatGPT%20Pro.svg',
      'hbo max (3 meses':       'Img/Hho%20Max%203%20meses.jpg',
      'notion business':        'Img/NOTION%20BUSINESS%20AI.png',
      'rixx':                   'Img/RIXX%20PRO%20AI.png',
      'wink studio':            'Img/WINK%20STUDIO%20VIDEO%20EDITOR.png',
      'ibispaint':              'Img/IBISPAINT%20PREMIUM.png',
      'moclow':                 'Img/MOCLOW%20AI.png',
      'pelidom':                'Img/PELIDOM.png',
      'beautiful ai':           'Img/BEAUTIFUL%20AI.png',
      'iqiyi':                  'Img/iQIYI%20VIP.png',
      'qobuz':                  'Img/QOBUZ%20STUDIO.png',
      'openart':                'Img/OPENART%20AI.png',
      'hma':                    'Img/VPN%20HMA%207DIAS.jpg',
      'brawl stars':            'Img/Brawl%20Stars.png',
      'clash of clans':         'Img/Clash%20of%20Clans.png',
      'clash royale':           'Img/Clash%20Royale.png',
      'roblox':                 'Img/Roblox.png',
      'mobile legends':         'Img/Mobile%20Legends.png',
      'pug mobile':             'Img/Pug%20Mobile.png',
      // Generales
      'amazon music':  'Img/Amazon%20Music.jpg',
      'capcut':        'Img/Cap%20cut.jpg',
      'chatgpt':       'Img/Chat%20Gpt.jpg',
      'claude':        'Img/Claude.jpg',
      'deezer':        'Img/Deezer.jpg',
      'free fire':     'Img/Free%20fire.jpg',
      'gamma':         'Img/Gamma.jpg',
      'gemini':        'Img/Gemini.jpg',
      'grok':          'Img/Grok.jpg',
      'hbo':           'Img/Hbo.jpeg',
      'leonardo':      'Img/Leonardo%20IA.jpg',
      'magis':         'Img/Magis%20TV.jpg',
      'paramount':     'Img/Paramount%2B.png',
      'perplexity':    'Img/Perplexity.jpg',
      'prime video':   'Img/Prime%20Video.jpg',
      'spotify':       'Img/Spotyfi.jpg',
      'tidal':         'Img/Tidal.jpeg',
      'ufc':           'Img/UFC.jpg',
      'viki':          'Img/Viki%20Rakuten%20.jpeg',
      'vix':           'Img/Vix.jpg',
      'youtube':       'Img/You%20Tube.jpg',
    };

    // Todas las imágenes llenan la tarjeta: las fotos y los pósters son
    // cuadrados o casi, y los logos que generamos son vectores que
    // agrandan sin perder filo.
    //
    // El caso aparte es el favicon de Google, que se pide con su tamaño
    // en la URL (sz=128). A 128px no alcanza para llenar la tarjeta sin
    // verse borroso, así que pedimos el mismo ícono al doble. Vale
    // también para las imágenes viejas guardadas en Supabase, que
    // quedaron apuntando a sz=128.
    function enAlta(url) {
      return url.includes('/s2/favicons') ? url.replace(/([?&]sz=)\d+/, '$1256') : url;
    }

    // Redirige cualquier imagen de /Img a su versión liviana de /Img/opt.
    // Los originales pesaban hasta 3,7 MB (PNG de 1152x2048) para mostrarse
    // en un cuadrito de 265 px. Las de /Img/opt son JPEG de 720 px a q80: hasta 96%
    // más livianas y sin diferencia visible ni en un celular a 3x.
    // Se hace acá, en el código, y no renombrando los archivos, porque las
    // rutas viven en Supabase (campo "imagen" de cada producto): así no hay
    // que migrar la base y los originales siguen sirviendo de respaldo.
    // Las genera optimizar-imagenes.ps1.
    function imgOptimizada(url) {
      if (typeof url !== 'string') return url;
      // Si ya apunta a la carpeta optimizada, no la volvemos a mapear
      // (si no, una ruta cargada a mano desde el panel daría Img/opt/opt/…).
      if (/^Img\/opt\//i.test(url)) return url;
      const m = url.match(/^Img\/(.+)\.(png|jpe?g)$/i);
      return m ? `Img/opt/${m[1]}.jpg` : url;
    }

    // Envoltura: todo lo que devuelva getImageUrlBase pasa por el redirector,
    // sin importar por cuál de sus muchos `return` haya salido.
    function getImageUrl(productName, category, imgColor, urlGuardada) {
      return imgOptimizada(getImageUrlBase(productName, category, imgColor, urlGuardada));
    }

    function getImageUrlBase(productName, category, imgColor, urlGuardada) {
      // 0) Si el producto tiene imagen guardada en Supabase (subida desde el
      //    panel de admin, o migrada del catálogo viejo), esa manda y corta acá.
      //    Esto es lo que permite cambiar la imagen de un producto sin tocar código.
      if (typeof urlGuardada === 'string' && urlGuardada.trim() !== '') return enAlta(urlGuardada);

      const gf  = 'https://www.google.com/s2/favicons?sz=256&domain=';
      const nameLC = productName.toLowerCase();

      // ChatGPT GO y Business mantienen su imagen original (favicon), no el logo local
      if (nameLC.includes('chatgpt go') || nameLC.includes('chatgpt business')) {
        return `${gf}chatgpt.com`;
      }

      // Logo dedicado para IPTV Smarter PRO Z TV (evita el genérico de IPTV)
      if (nameLC.includes('pro z tv')) {
        return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="ztv" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2a0a52"/><stop offset="100%" stop-color="#7b1fa2"/></linearGradient></defs><rect width="160" height="160" rx="20" fill="url(#ztv)"/><rect x="12" y="12" width="136" height="136" rx="14" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><text x="80" y="58" font-family="Arial,sans-serif" font-size="15" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="1">IPTV SMARTER</text><text x="80" y="98" font-family="Arial Black,Impact,sans-serif" font-size="44" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="2">Z TV</text><text x="80" y="128" font-family="Arial,sans-serif" font-size="11" font-weight="800" fill="#ffd700" text-anchor="middle" letter-spacing="1">LIGA BOLIVIANA</text></svg>')}`;
      }

      // 1) Primero busca un logo local en /Img/
      for (let [key, url] of Object.entries(LOCAL_LOGOS)) {
        if (nameLC.includes(key)) return url;
      }

      const mapping = {
        // ── STREAMING ────────────────────────────────────────────────
        'netflix':         `${gf}netflix.com`,
        'disney':          `${gf}disneyplus.com`,
        'paramount':       `${gf}paramountplus.com`,
        'prime video':     `${gf}primevideo.com`,
        'magis':           `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff8800"/><stop offset="100%" stop-color="#ff4400"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#mg)"/><text x="64" y="62" font-family="Arial Black,Impact,sans-serif" font-size="30" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="1">MAGIS</text><text x="64" y="100" font-family="Arial Black,Impact,sans-serif" font-size="36" font-weight="900" fill="#fff" fill-opacity="0.9" text-anchor="middle" letter-spacing="3">TV</text></svg>')}`,
        'flujo':           `${gf}flujotv.com`,
        'tele latino':     `${gf}telelatino.net`,
        'iptv':            `${gf}iptvsmarters.com`,
        'veltix':          `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="vx" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3a0000"/><stop offset="100%" stop-color="#a30000"/></linearGradient></defs><rect width="160" height="160" rx="20" fill="url(#vx)"/><text x="80" y="80" font-family="Arial Black,Impact,sans-serif" font-size="34" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" letter-spacing="2">VELTIX</text><text x="80" y="118" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#ffd700" text-anchor="middle" letter-spacing="1">LIGA BOLIVIANA</text></svg>')}`,
        'plex':            `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="px" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1a1a"/><stop offset="100%" stop-color="#3a3a3a"/></linearGradient></defs><rect width="160" height="160" rx="20" fill="url(#px)"/><text x="80" y="78" font-family="Arial Black,Impact,sans-serif" font-size="38" font-weight="900" fill="#e5a00d" text-anchor="middle" dominant-baseline="central" letter-spacing="2">PLEX</text><text x="80" y="116" font-family="Arial,sans-serif" font-size="14" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="3">TV</text></svg>')}`,
        'hbo':             `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="hb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7b2ff7"/><stop offset="100%" stop-color="#4a00b0"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#hb)"/><text x="64" y="84" font-family="Arial Black,Impact,sans-serif" font-size="48" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="3">HBO</text></svg>')}`,
        'crunchyroll':     `${gf}crunchyroll.com`,
        'capcut':          `${gf}capcut.com`,
        'vix':             `${gf}vix.com`,
        'viki':            `${gf}viki.com`,
        'drama box':       `${gf}dramaboxapp.com`,
        'peacock':         `${gf}peacocktv.com`,
        'shadowz':         `${gf}shadowz.fr`,
        'retrocrush':      `${gf}retrocrush.tv`,
        'mubi':            `${gf}mubi.com`,
        'ufc':             `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="ufcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0a0a0a"/><stop offset="100%" stop-color="#2a2a2a"/></linearGradient></defs><rect width="160" height="160" rx="20" fill="url(#ufcg)"/><rect x="14" y="14" width="132" height="132" rx="14" fill="none" stroke="#ffd700" stroke-width="1.5" stroke-opacity="0.55"/><text x="80" y="78" font-family="Arial Black,Impact,sans-serif" font-size="58" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" letter-spacing="3">UFC</text><text x="80" y="124" font-family="Arial,sans-serif" font-size="11" font-weight="800" fill="#ffd700" text-anchor="middle" letter-spacing="2">ULTIMATE FIGHTING</text></svg>')}`,

        // ── MÚSICA ───────────────────────────────────────────────────
        'youtube premium': `${gf}youtube.com`,
        'youtube':         `${gf}youtube.com`,
        'spotify':         `${gf}spotify.com`,
        'tidal':           `${gf}tidal.com`,
        'deezer':          `${gf}deezer.com`,
        'apple tv':        `${gf}tv.apple.com`,
        'apple music':     `${gf}music.apple.com`,
        'donna ai':        `${gf}donna.ai`,
        'epidemic':        `${gf}epidemicsound.com`,
        'podimo':          `${gf}podimo.com`,
        'brain.fm':        `${gf}brain.fm`,
        'audio beta':      `${gf}audiobeta.com`,
        'soundcloud':      `${gf}soundcloud.com`,
        'audiomack':       `${gf}audiomack.com`,
        'napster':         `${gf}napster.com`,

        // ── IA & TOOLS ───────────────────────────────────────────────
        'chatgpt':         `${gf}chatgpt.com`,
        'grok':            `${gf}x.ai`,
        'leonardo':        `${gf}leonardo.ai`,
        'jarvis':          `${gf}jarvis.cx`,
        'google ai':       `${gf}google.com`,
        'gemini':          `${gf}gemini.google.com`,
        'perplexity':      `${gf}perplexity.ai`,
        'claude':          `${gf}claude.ai`,
        'canva':           `${gf}canva.com`,
        'adobe photoshop': `${gf}adobe.com`,
        'adobe express':   `${gf}express.adobe.com`,
        'adobe':           `${gf}adobe.com`,
        'beautiful ai':    `${gf}beautiful.ai`,
        'prezi':           `${gf}prezi.com`,
        'gamma':           `${gf}gamma.app`,
        'trading':         `${gf}tradingview.com`,
        'videoideas':      `${gf}videoideas.ai`,
        'freepik':         `${gf}freepik.com`,
        'lovable':         `${gf}lovable.dev`,
        'kapwing':         `${gf}kapwing.com`,
        'meitu':           `${gf}meitu.com`,
        'discord':         `${gf}discord.com`,
        'dinolingo':       `${gf}dinolingo.com`,
        'duolingo':        `${gf}duolingo.com`,
        'notion':          `${gf}notion.so`,
        'figma':           `${gf}figma.com`,
        'talkpal':         `${gf}talkpal.ai`,
        'uizard':          `${gf}uizard.io`,
        'wispr':           `${gf}wispr.ai`,
        'creative fabrica':`${gf}creativefabrica.com`,
        'talkio':          `${gf}talkio.ai`,
        'mindstudio':      `${gf}mindstudio.ai`,
        'idagio':          `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="idg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1207"/><stop offset="100%" stop-color="#3d2a0f"/></linearGradient><linearGradient id="idgold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd700"/><stop offset="100%" stop-color="#b8860b"/></linearGradient></defs><rect width="160" height="160" rx="20" fill="url(#idg)"/><rect x="14" y="14" width="132" height="132" rx="14" fill="none" stroke="url(#idgold)" stroke-width="1.5" stroke-opacity="0.7"/><text x="80" y="78" font-family="Georgia,serif" font-size="30" font-weight="900" fill="url(#idgold)" text-anchor="middle" dominant-baseline="central" letter-spacing="3" font-style="italic">IDAGIO</text><text x="80" y="118" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#ffd700" fill-opacity="0.85" text-anchor="middle" letter-spacing="3">CLASSICAL MUSIC</text></svg>')}`,
        'nextory':         `${gf}nextory.com`,

        // ── JUEGOS ───────────────────────────────────────────────────
        'brawl stars':     `${gf}brawlstars.com`,
        'free fire':       `${gf}ff.garena.com`,
        'clash of clans':  `${gf}clashofclans.com`,
        'clash royale':    `${gf}clashroyale.com`,
        'roblox':          `${gf}roblox.com`,
        'mobile legends':  `${gf}mobilelegends.com`,
        'pug mobile':      `${gf}pubg.com`,

        // ── SEGUIDORES ───────────────────────────────────────────────
        'instagram':       `${gf}instagram.com`,
        'tiktok':          `${gf}tiktok.com`,
        'facebook':        `${gf}facebook.com`,

        // ── VPN ──────────────────────────────────────────────────────
        'potato':          `${gf}potatovpn.com`,
        'hma':             `${gf}hidemyass.com`,
        'vpn express':     `${gf}expressvpn.com`,
        'expressvpn':      `${gf}expressvpn.com`,
        'nordvpn':         `${gf}nordvpn.com`,
        'norvpn':          `${gf}nordvpn.com`,
        'surfshark':       `${gf}surfshark.com`,
      };

      for(let [key, url] of Object.entries(mapping)) {
        if(nameLC.includes(key)) return url;
      }

      return generateLogoSvg(productName, imgColor);
    }

    // Esqueletos animados mientras Supabase responde (~300ms).
    function renderSkeletons() {
      const grid = document.getElementById('5');
      if (!grid) return;
      grid.innerHTML = Array.from({ length: itemsPorPagina() }, () => `
        <div class="product-card skeleton-card">
          <div class="skeleton-box" style="aspect-ratio:1/1; border-radius:12px;"></div>
          <div class="product-body">
            <div class="skeleton-box" style="height:22px; width:45%; margin-bottom:.6rem;"></div>
            <div class="skeleton-box" style="height:13px; width:65%; margin-bottom:.6rem;"></div>
            <div class="skeleton-box" style="height:15px; width:90%;"></div>
          </div>
          <div class="skeleton-box" style="height:42px; border-radius:10px;"></div>
        </div>`).join('');
      const pag = document.getElementById('6');
      if (pag) pag.innerHTML = '';
    }

    // ==========================================================
    // AGRUPACIÓN POR PLATAFORMA
    // ==========================================================
    // La grilla ya no muestra una tarjeta por variante, sino una por
    // servicio. "Netflix Premium 4K (1 pantalla)" y "(Cuenta Completa)"
    // se juntan en una tarjeta que dice "DESDE 29.90Bs", y al tocarla
    // se abre un panel con los dos planes.
    // ==========================================================

    // "Netflix Premium 4K (1 pantalla)" -> "Netflix Premium 4K"
    //
    // Saca dos cosas que hablan del plan y no de la plataforma:
    // los paréntesis, estén donde estén, y las palabras de variante
    // del final. Así "Claude IA Pro Renovable" y "Claude IA Pro
    // (cuenta asignada) Privada" caen en la misma tarjeta.
    const VARIANTE_FINAL = /\s+(renovable|privad[oa]|personal|compartid[oa]|complet[ao]|individual)$/i;

    // Marcas que van sí o sí en una sola tarjeta, aunque sus planes se
    // llamen distinto entre sí ("Deezer PRO Familiar" y "Deezer Premium").
    // Si el nombre del producto menciona la marca, cae acá.
    //
    // Para unir otra plataforma, agregá su nombre a esta lista: el texto
    // que escribas es el que se muestra en la tarjeta.
    const MARCAS_UNIFICADAS = ['Tidal', 'Deezer', 'Gemini', 'Nextory', 'Duolingo']
      .map(marca => [marca, new RegExp(`\\b${marca}\\b`, 'i')]);

    function plataformaDe(nombre, categoria) {
      // En COMBOS el nombre completo es el producto. "PRIME VIDEO + TIDAL"
      // no es un plan de Tidal: unificarlo por marca hacía que la tarjeta
      // dijera solo "Tidal" y le escondiera al cliente la mitad de lo que
      // estaba comprando. Lo mismo con "DUOLINGO SUPER + Audiomack".
      if (categoria !== 'combos') {
        const marca = MARCAS_UNIFICADAS.find(([, busca]) => busca.test(String(nombre || '')));
        if (marca) return marca[0];
      }

      let n = String(nombre || '')
        .replace(/\([^)]*\)/g, ' ')   // "(cuenta asignada)", "(1 pantalla)"
        .replace(/\s+/g, ' ')         // los dobles espacios que quedan
        .trim();

      // En bucle por si arrastra más de una: "... Renovable Privada"
      let previo;
      do {
        previo = n;
        n = n.replace(VARIANTE_FINAL, '').trim();
      } while (n !== previo && n !== '');

      return n || String(nombre || '').trim();
    }

    // Precio con el mismo formato que usa el resto de la tienda
    function formatoBs(n) {
      const num = Number(n) || 0;
      return Number.isInteger(num) ? num + 'Bs' : num.toFixed(2) + 'Bs';
    }

    // ---------- Color de cada plataforma ----------
    // Sale de imagenColor, que ya viene en cada producto ("#8b0000,#e50914").
    // El segundo tono es el vivo de la marca; si falta, se usa el primero.
    function acentoDe(p) {
      const partes = String(p.imgColor || '').split(',').map(s => s.trim());
      const hex = partes.find(c => /^#[0-9a-f]{6}$/i.test(c) && c !== partes[0])
               || partes.find(c => /^#[0-9a-f]{6}$/i.test(c));
      return hex || '#767c88';
    }

    function luminancia(r, g, b) {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }

    // Oscurece el color hasta que se lea sobre blanco (4.5:1).
    // El naranja de Crunchyroll o el verde de Spotify quedan
    // preciosos en un logo pero ilegibles como texto en fondo claro.
    function acentoLegible(hex) {
      let r = parseInt(hex.slice(1, 3), 16);
      let g = parseInt(hex.slice(3, 5), 16);
      let b = parseInt(hex.slice(5, 7), 16);
      let vueltas = 0;
      while (1.05 / (luminancia(r, g, b) + 0.05) < 4.5 && vueltas++ < 40) {
        r = Math.round(r * 0.92); g = Math.round(g * 0.92); b = Math.round(b * 0.92);
      }
      return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    // El color de marca rebajado con blanco: 0.08 da el fondo pastel del
    // botón "Ver catálogo" y 0.25 su borde. Se calcula acá y no con
    // color-mix() en el CSS porque hay celulares con navegadores viejos.
    function pastel(hex, cuanto) {
      const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      return '#' + c.map(v => Math.round(v * cuanto + 255 * (1 - cuanto))
                               .toString(16).padStart(2, '0')).join('');
    }

    // Lista de características de cada plan. Todo sale de datos que ya
    // existen, salvo entrega y soporte, que son la promesa fija del
    // negocio (la misma que anuncia la franja superior).
    // Las cuatro filas se pueden escribir a mano desde el panel
    // (campos entrega, soporte, acceso y suscripción). Si el campo
    // quedó vacío se deduce del tipo y del nombre, como siempre.
    // Un guión suelto ("-") esconde esa fila.
    function textoFicha(escrito, deducido) {
      const v = String(escrito || '').trim();
      if (v === '-') return null;
      return v || deducido;
    }

    function caracteristicasDe(p) {
      const t = tiposDe(p);

      const acceso = t.includes('completa')      ? 'Cuenta completa'
                   : t.includes('1-pantalla')    ? '1 pantalla'
                   : t.includes('1-dispositivo') ? '1 dispositivo'
                   : null;

      const plazo = t.includes('mensual')  ? 'Mensual'
                  : t.includes('semanal')  ? 'Semanal'
                  : t.includes('anual')    ? 'Anual'
                  : t.includes('multimes') ? 'Multi-mes'
                  : null;
      const renovable = /renovable/i.test(p.name) || /renovable/i.test(p.tag || '');
      const suscripcion = (plazo || renovable)
        ? (renovable ? (plazo ? plazo + ' · Renovable' : 'Renovable') : plazo)
        : null;

      return [
        ['⚡',  'Entrega',     textoFicha(p.entrega,     'De 5 a 30 minutos')],
        ['🛡️', 'Soporte',     textoFicha(p.soporte,     'Incluido')],
        ['📺',  'Acceso',      textoFicha(p.acceso,      acceso)],
        ['🔄',  'Suscripción', textoFicha(p.suscripcion, suscripcion)]
      ].filter(fila => fila[2]);
    }

    // Junta dos grupos cuando el nombre de uno es el comienzo del otro.
    //
    // "Netflix Premium 4K" y "Netflix Premium 4K Renovable" son el mismo
    // servicio con distinto plan, pero como los nombres difieren quedaban
    // en tarjetas separadas. Acá se unen bajo el nombre más corto.
    //
    // Solo compara dentro de la misma categoría y exige que la diferencia
    // arranque con un espacio, para no juntar "Plex" con "Plexus".
    function fusionarPorPrefijo(mapa) {
      const porCategoria = {};
      [...mapa.keys()].forEach(clave => {
        const corte = clave.indexOf('||');
        const cat = clave.slice(0, corte);
        (porCategoria[cat] = porCategoria[cat] || []).push({ clave, nombre: clave.slice(corte + 2) });
      });

      // clave larga -> clave corta que la absorbe
      const absorbidoPor = new Map();

      Object.values(porCategoria).forEach(grupos => {
        grupos.sort((a, b) => a.nombre.length - b.nombre.length);
        grupos.forEach((corto, i) => {
          const prefijo = corto.nombre.toLowerCase() + ' ';
          for (let j = i + 1; j < grupos.length; j++) {
            const largo = grupos[j];
            if (absorbidoPor.has(largo.clave)) continue;
            if (largo.nombre.toLowerCase().startsWith(prefijo)) {
              absorbidoPor.set(largo.clave, corto.clave);
            }
          }
        });
      });

      if (absorbidoPor.size === 0) return mapa;

      // Sigue la cadena por si A absorbió a B y B a C.
      // Nunca hay ciclos: solo se apunta de un nombre largo a uno más corto.
      const raizDe = clave => {
        let r = clave;
        while (absorbidoPor.has(r)) r = absorbidoPor.get(r);
        return r;
      };

      const fusionado = new Map();
      mapa.forEach((planes, clave) => {
        const raiz = raizDe(clave);
        if (!fusionado.has(raiz)) fusionado.set(raiz, []);
        fusionado.get(raiz).push(...planes);
      });
      return fusionado;
    }

    // Junta los productos ya filtrados en plataformas
    function agruparEnPlataformas(lista) {
      let mapa = new Map();
      lista.forEach(p => {
        const clave = p.cat + '||' + plataformaDe(p.name, p.cat);
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(p);
      });

      mapa = fusionarPorPrefijo(mapa);

      return [...mapa.entries()].map(([clave, planes]) => {
        const disponibles = planes.filter(p => !p.soldOut);
        const base = disponibles[0] || planes[0];
        const precios = (disponibles.length ? disponibles : planes).map(p => p.price);
        const conOferta = planes.filter(p => p.descuento > 0);
        return {
          clave,
          // El nombre sale de la clave, que ya es el más corto del grupo
          nombre: clave.slice(clave.indexOf('||') + 2),
          planes: planes.slice().sort((a, b) => a.price - b.price),
          base,
          desde: Math.min(...precios),
          // El plan más recientemente creado manda para "El más nuevo"
          nuevo: Math.max(...planes.map(p => p.nuevo || 0)),
          agotada: disponibles.length === 0,
          descuento: conOferta.length ? Math.max(...conOferta.map(p => p.descuento)) : 0
        };
      });
    }

    // Plataformas de la vista actual, para que el panel las encuentre
    let PLATAFORMAS_VISIBLES = [];

    // ---------- BÚSQUEDA POR INICIAL ----------
    // Se escriben las primeras letras y salen solo las plataformas que
    // empiezan así. Antes buscaba el texto en cualquier parte del nombre
    // del plan, y "disney" traía también "DISNEY+ 7ESPN PREMIUM".

    // Compara sin tildes ni mayúsculas, así "musica" encuentra "Música"
    // y "pro z" encuentra "PRO Z TV". normalize('NFD') separa la letra de
    // su tilde, y acá tiramos las tildes sueltas (bloque Unicode 0300-036F).
    function sinTildes(txt) {
      let limpio = '';
      for (const c of String(txt || '').normalize('NFD')) {
        const cod = c.codePointAt(0);
        if (cod < 0x0300 || cod > 0x036F) limpio += c;
      }
      return limpio.toLowerCase().trim();
    }

    // Parte el nombre en palabras sueltas, ignorando "+", guiones y demás
    // signos: "DISNEY+ / STAR" queda como ["disney", "star"].
    function palabrasDe(txt) {
      return sinTildes(txt).split(/[^a-z0-9]+/).filter(Boolean);
    }

    // Antes esto exigía que la plataforma EMPEZARA con lo escrito, así que
    // "max" no encontraba "HBO Max" ni "prime" a "Amazon Prime Video": solo
    // servía si el cliente adivinaba la primera palabra. Ahora cada palabra
    // de la búsqueda tiene que ser el comienzo de alguna palabra del nombre,
    // que sigue dejando fuera coincidencias sueltas en medio de una palabra.
    function empiezaCon(nombre, busqueda) {
      const buscadas = palabrasDe(busqueda);
      if (buscadas.length === 0) return true;
      const enNombre = palabrasDe(nombre);
      return buscadas.every(q => enNombre.some(p => p.startsWith(q)));
    }

    function renderProducts() {
      // Todavía no llegó el catálogo desde Supabase.
      if (!catalogoCargado) { renderSkeletons(); return; }

      // Buscar es buscar en toda la tienda: si el cliente escribió algo,
      // la categoría se ignora. Antes solo miraba dentro de la pestaña
      // abierta, así que estando en "Streaming" buscar un VPN no daba nada.
      const buscando = palabrasDe(currentSearch).length > 0;

      const filtrados = PRODUCTS.filter(p => {
        const catOk = buscando || currentCat === 'all' || p.cat === currentCat;
        // tiposDe() unifica las variantes ("1-device" = "1-dispositivo")
        const subOk = currentSub === 'all' || tiposDe(p).includes(currentSub);
        return catOk && subOk;
      });

      // La búsqueda se aplica a la plataforma ya armada, no a cada plan:
      // el cliente escribe las primeras letras y salen solo las plataformas
      // que empiezan así. Los planes de adentro no se tocan.
      const grupos = agruparEnPlataformas(filtrados)
        .filter(g => empiezaCon(g.nombre, currentSearch));

      const sort = document.getElementById('4').value;
      // "El más nuevo" venía sin implementar: era la opción por defecto
      // y no hacía nada, así que lo recién publicado caía al final del
      // catálogo. Los productos viejos no traen fecha y quedan en 0, o
      // sea que conservan el orden de siempre detrás de los nuevos.
      if (sort === 'new')        grupos.sort((a, b) => b.nuevo - a.nuevo);
      if (sort === 'price-asc')  grupos.sort((a, b) => a.desde - b.desde);
      if (sort === 'price-desc') grupos.sort((a, b) => b.desde - a.desde);
      if (sort === 'name')       grupos.sort((a, b) => a.nombre.localeCompare(b.nombre));

      PLATAFORMAS_VISIBLES = grupos;

      const total = grupos.length;
      const porPagina = itemsPorPagina();
      porPaginaActual = porPagina;
      const totalPages = Math.ceil(total / porPagina);
      if (currentPage > totalPages) currentPage = 1;

      const start = (currentPage - 1) * porPagina;
      const pageItems = grupos.slice(start, start + porPagina);

      const grid = document.getElementById('5');

      if (total === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3.5rem 1rem;">
          <div style="font-size:2.5rem; margin-bottom:.75rem;">🔍</div>
          <div style="font-weight:900; color:var(--tinta); margin-bottom:.4rem;">Sin resultados</div>
          <div style="font-size:.9rem; color:var(--tinta-suave);">
            ${currentSearch ? `No encontramos nada para «${currentSearch}»` : 'No hay productos en esta categoría'}
          </div>
        </div>`;
        renderPagination(0);
        return;
      }

      grid.innerHTML = pageItems.map(g => {
        const p = g.base;
        const url = getImageUrl(p.name, p.cat, p.imgColor, p.imagenUrl);
        const n = g.planes.length;
        const nombreSeguro = p.name.replace(/'/g, "\\'");

        // Logo, nombre y botón de catálogo, cada uno con el color
        // de su plataforma. El vivo va al borde; el oscurecido, al texto.
        const vivo   = acentoDe(p);
        const legible = acentoLegible(vivo);

        return `
        <button type="button" class="plat-card${g.agotada ? ' plat-card--agotada' : ''}"
                style="--acento:${vivo}; --acento-txt:${legible}; --acento-suave:${pastel(vivo, .08)}; --acento-borde:${pastel(vivo, .25)}"
                onclick="abrirPlataforma('${g.clave.replace(/'/g, "\\'")}')">
          <div class="plat-img">
            <img src="${url}" alt="" loading="lazy" decoding="async"
                 onerror="this.onerror=null;this.src=generateLogoSvg('${nombreSeguro}','${p.imgColor}');">
          </div>
          <div class="plat-nombre">${g.nombre}</div>
          <div class="plat-cta">Ver catálogo →</div>
        </button>`;
      }).join('');

      renderPagination(totalPages);
    }

    // ==========================================================
    // PANEL DE PLANES DE UNA PLATAFORMA
    // ==========================================================
    // Usa el mismo modal que el carrito (#8, #9 y #10), así el
    // cierre, el fondo y el scroll se comportan igual que siempre.
    function abrirPlataforma(clave) {
      const g = PLATAFORMAS_VISIBLES.find(x => x.clave === clave);
      if (!g) return;

      const p = g.base;
      const url = getImageUrl(p.name, p.cat, p.imgColor, p.imagenUrl);
      const nombreSeguro = p.name.replace(/'/g, "\\'");
      const vivo = acentoDe(p);

      const tarjetas = g.planes.map(pl => {
        const agotado = pl.soldOut === true;
        const urlPlan = getImageUrl(pl.name, pl.cat, pl.imgColor, pl.imagenUrl);
        // Cada característica es un bloquecito: rótulo arriba, dato abajo
        const filas = caracteristicasDe(pl).map(([ic, et, val]) =>
          `<li><span class="ic">${ic}</span><div><small>${et}</small><b>${val}</b></div></li>`).join('');

        // "15 Bs" grande, y abajo lo que costaba tachado con el descuento
        const precioHtml = sinPrecio(pl)
          ? '<div class="plan-precio consultar">A consultar</div>'
          : `<div class="plan-precio">${formatoBs(pl.price).replace(/Bs$/, '')}<small>Bs</small></div>
             ${pl.precioAntes ? `<div class="plan-ahorro"><s>${pl.precioAntes}</s>${pl.descuento ? `<span class="plan-desc">-${pl.descuento}%</span>` : ''}</div>` : ''}`;

        return `
        <div class="plan-item${agotado ? ' plan-item--agotado' : ''}">
          <div class="plan-in">
            <div class="plan-cab">
              <img class="plan-logo" src="${urlPlan}" alt="" loading="lazy"
                   onerror="this.onerror=null;this.src=generateLogoSvg('${pl.name.replace(/'/g, "\\'")}','${pl.imgColor}');">
              <div class="plan-cab-txt">
                <div class="plan-item-nombre">${pl.name}</div>
                <div class="plan-chips">
                  <span class="plan-chip ${agotado ? 'off' : 'ok'}">${agotado ? '● Agotado' : '● Disponible'}</span>
                  ${!agotado && pl.entregaInmediata ? '<span class="plan-chip ya">⚡ Entrega inmediata</span>' : ''}
                  <span class="plan-chip zona">🌎 Global</span>
                  ${chipDatos(pl)}
                </div>
              </div>
            </div>

            <ul class="plan-features">${filas}</ul>

            <div class="plan-item-pie">
              <div>
                <div class="plan-precio-lbl">Precio final</div>
                ${precioHtml}
              </div>
              ${sinPrecio(pl) && !agotado
                ? `<a class="plan-comprar" href="${waConsulta(pl.name)}" target="_blank" rel="noopener">💬 Consultar</a>`
                : `<button class="plan-comprar" ${agotado ? 'disabled' : ''}
                           onclick="${agotado ? '' : `abrirCheckout(${pl.id})`}">
                     🛒 ${agotado ? 'Agotado' : 'Comprar'}
                   </button>`}
            </div>
          </div>
        </div>`;
      }).join('');

      // La guía sale de la descripción que ya tiene el producto.
      // Si ningún plan tiene descripción, la sección no se muestra.
      const guia = g.planes.map(pl => (pl.desc || '').trim()).filter(Boolean);
      const guiaHtml = guia.length ? `
        <div class="pl-guia">
          <div class="pl-guia-cab">
            <span class="pl-guia-ico">⚡</span>
            <div>
              <b>Guía de activación</b>
              <small>Reglas del servicio</small>
            </div>
          </div>
          <div class="pl-guia-txt">${[...new Set(guia)].join('\n')}</div>
        </div>` : '';

      document.getElementById('10').innerHTML = `
        <div style="--acento:${vivo}">
          <div class="pl-cab">
            <span>Servicios de ${g.nombre}</span>
            <button class="ck-cerrar" onclick="closeModal()" aria-label="Cerrar">✕</button>
          </div>

          <div class="pl-hero" style="background-image:url('${url}')">
            <div class="pl-hero-txt">
              <span class="pl-badge">Suscripciones premium</span>
              <h3>${g.nombre}</h3>
              <p>Elegí el plan que mejor se adapte a lo que necesitás.<br>
                 <b>Entrega de 5 a 30 minutos</b> y soporte incluido.</p>
            </div>
          </div>

          <div class="pl-grid">${tarjetas}</div>
          ${guiaHtml}
        </div>`;

      // Misma ventana que la de compra (.ancho y .compra miden igual en el
      // CSS): al tocar "Comprar" cambia lo de adentro, no el tamaño.
      document.getElementById('9').classList.remove('compra');
      document.getElementById('9').classList.add('ancho');
      document.getElementById('8').classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('9').scrollTop = 0;
      anotarPantalla('planes', clave);
    }


    // ==========================================================
    // AYUDAS DE LA COMPRA
    // ==========================================================
    // El número de WhatsApp, los productos sin precio, los términos...
    // Las usan el panel de planes y el carrito.
    // ==========================================================

    // Los celulares de Bolivia son 8 números que empiezan con 6 o con 7.
    // No se acepta menos: un número mal escrito es un aviso que nunca
    // llega, y el cliente se entera cuando ya perdió el servicio.
    function telValido(v) {
      return /^[67]\d{7}$/.test(String(v || '').replace(/\D/g, ''));
    }

    // Como lo necesita wa.me: código de país pegado, sin nada más.
    function normalizarTel(v) {
      return '591' + String(v || '').replace(/\D/g, '');
    }

    // Grupo (plataforma) al que pertenece un plan dentro de la vista actual.
    const grupoDe = idPlan => PLATAFORMAS_VISIBLES.find(g => g.planes.some(p => p.id === idPlan));

    // Producto al que todavía no le cargaron precio en el admin.
    // No se puede cobrar, así que en vez de un botón de pago que no
    // hace nada, se ofrece consultar por WhatsApp.
    const sinPrecio = p => !(p.price > 0);

    function waConsulta(nombre) {
      const texto = `🦁 *TIAGO STORE BOLIVIA* 🦁\n\nHola, quiero consultar el precio y la disponibilidad de:\n\n🎯 *${nombre}*\n\nGracias.`;
      return `https://wa.me/59157707335?text=${encodeURIComponent(texto)}`;
    }

    // ---------- Términos del servicio ----------
    // Van en el paso 3 del carrito: el cliente confirma que sabe qué
    // compra antes de habilitar el pago.
    // En primera persona: es lo que el cliente dice que sabe al tildar
    // "Acepto". Son las mismas cinco condiciones de siempre; si se agrega
    // una regla nueva, va acá.
    const TERMINOS = [
      'Soy consciente de lo que estoy comprando: revisé el plan, el precio y la duración, y es exactamente el servicio que quiero.',
      'Sé que es un producto digital: recibo los datos de acceso en esta página o por WhatsApp, entre 5 y 30 minutos después de que se confirme mi pago.',
      'Entiendo que, una vez que recibo los datos de acceso, no hay devolución del dinero.',
      'Me comprometo a usar la cuenta tal como me la entregan, sin cambiar la contraseña, el correo ni ningún otro dato.',
      'Si el servicio deja de funcionar durante el plan, aviso por WhatsApp y Tiago Store lo repone o lo soluciona.'
    ];

    function bloqueTerminos(id) {
      return `
        <div class="ck-caja ck-terminos-caja">
          <label class="ck-terminos" for="${id}">
            <input type="checkbox" id="${id}">
            <span>Acepto los términos y condiciones.</span>
          </label>
          <button type="button" class="ck-ver-terminos" onclick="verTerminos(this)">Ver términos y condiciones</button>
          <ul class="ck-lista-terminos" hidden>
            ${TERMINOS.map(t => `<li>${t}</li>`).join('')}
          </ul>
        </div>`;
    }

    // Pliega y despliega el detalle que está justo debajo del botón.
    function verTerminos(boton) {
      const lista = boton.nextElementSibling;
      lista.hidden = !lista.hidden;
      boton.classList.toggle('abierto', !lista.hidden);
    }

    // ==========================================================
    // COMPRAR EN TRES PASOS
    // ==========================================================
    //   1. Comprar   — el botón de cada plan lo suma al carrito
    //   2. Carrito   — se abre solo: cantidades, aviso de renovación,
    //                  términos y el total
    //   3. Pagar con QR — lleva a pagar-qr.html con todo el carrito
    //
    // Antes "Comprar" abría una ventana de pago de ESE producto solo, y el
    // carrito era un camino aparte. Ahora hay uno solo: el cliente puede
    // sumar más cosas y pagar todo junto.
    // ==========================================================

    // Hasta cuántas unidades de un producto se pueden pedir.
    // Con cuentas cargadas en Stock: las que hay (no se vende lo que no se
    // puede entregar al toque). Sin stock cargado —se entrega a mano—: el
    // tope de la página de pago, 10 por producto (lineasEntregables en
    // js/pedido-automatico.js).
    const MAX_POR_PRODUCTO = 10;

    // Descuento combo: con 2 productos o más en el carrito (cualquiera,
    // aunque sea el mismo repetido) se descuentan 4 Bs del total, lleve 2
    // o 10. El que cobra es la base (crear_compra en supabase/05-cobros.sql:
    // se lo resta al pedido más caro); acá solo se muestra, con la MISMA
    // cuenta. Si cambiás el monto, cambialo en los dos lados.
    const DESCUENTO_COMBO = 4;

    function cuentasDelCarrito() {
      const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const unidades = cart.reduce((s, i) => s + i.qty, 0);
      const descuento = unidades >= 2
        ? Math.min(DESCUENTO_COMBO, Math.max(...cart.map(i => i.price)))
        : 0;
      return { subtotal, unidades, descuento, total: subtotal - descuento };
    }
    const topeDe = p => (p.stock > 0 ? Math.min(p.stock, MAX_POR_PRODUCTO) : MAX_POR_PRODUCTO);

    // Paso 1 -> paso 2. Si ya estaba en el carrito no se suma otra unidad:
    // tocar "Comprar" dos veces no puede dejarle cantidad 2 sin querer.
    // Para más unidades está el + del carrito.
    function abrirCheckout(id) {
      const p = PRODUCTS.find(x => x.id === id);
      if (!p || p.soldOut) return;
      if (sinPrecio(p)) { window.open(waConsulta(p.name), '_blank', 'noopener'); return; }

      if (!cart.find(item => item.id === id)) {
        cart.push({ ...p, qty: 1 });
        updateCartCount();
        guardarCarrito();
      }
      openCart({ agregado: id });
    }


    // Vuelve del carrito al panel de planes de la misma plataforma.
    //
    // Busca el grupo que contiene ese plan en vez de rearmar la clave
    // desde el nombre: con la fusión por prefijo, "Netflix Premium 4K
    // Renovable (1 pantalla)" vive bajo la clave "Netflix Premium 4K",
    // así que reconstruirla no encontraba nada.
    function volverAPlanes(idPlan) {
      const g = grupoDe(idPlan);
      if (g) abrirPlataforma(g.clave);
      else   closeModal();
    }


    function renderPagination(totalPages) {
      const pag = document.getElementById('6');
      if(totalPages <= 1) { pag.innerHTML = ''; return; }
      let html = '';
      if(currentPage > 1) html += `<button class="page-btn" onclick="goPage(${currentPage-1})">‹</button>`;
      for(let i=1;i<=totalPages;i++) {
        if(i === currentPage || Math.abs(i-currentPage) <= 2 || i===1 || i===totalPages) {
          html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
        } else if(Math.abs(i-currentPage)===3) {
          html += `<span style="color:var(--gris-texto); padding:0 0.25rem;">…</span>`;
        }
      }
      if(currentPage < totalPages) html += `<button class="page-btn" onclick="goPage(${currentPage+1})">›</button>`;
      pag.innerHTML = html;
    }

    function goPage(n) {
      currentPage = n;
      renderProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==========================================================
    // FILTROS DINÁMICOS
    // ==========================================================
    // Las pestañas de categoría y las pastillas de subcategoría se arman
    // solas leyendo lo que hay en Supabase. Si creás una categoría nueva
    // desde el panel, aparece acá sin republicar la web.
    // ==========================================================

    // Nombre bonito para las categorías conocidas.
    // Una categoría nueva sale en mayúsculas con un ícono genérico.
    const ETIQUETAS_CAT = {
      streaming:  '🎬 STREAMING',
      musica:     '🎵 MÚSICA',
      ia:         '🤖 IA & TOOLS',
      combos:     '🎁 COMBOS',
      vpn:        '🔐 VPN',
      seguidores: '📱 SEGUIDORES',
      juegos:     '🎮 JUEGOS',
      recargas:   '💎 RECARGAS',
      apps:       '📲 APPS',
      cursos:     '📚 CURSOS'
    };
    function etiquetaCat(c) {
      return ETIQUETAS_CAT[c] || ('🏷️ ' + String(c).toUpperCase());
    }

    // Orden en que se muestran las pestañas.
    // Una categoría que exista en Supabase y no esté en esta lista se
    // agrega al final, así crear una nueva desde el panel sigue funcionando
    // sin tocar este archivo.
    const ORDEN_CATEGORIAS = ['streaming', 'musica', 'ia', 'combos', 'vpn', 'seguidores'];

    // Categorías que se muestran siempre, aunque todavía no tengan productos.
    const CATEGORIAS_FIJAS = ['combos'];


    // Nombre limpio para el título (sin el emoji de la pestaña)
    // Título sin el emoji: "🎬 STREAMING" -> "STREAMING"
    function nombreCat(c) {
      if (c === 'all') return 'Todas las plataformas';
      const partes = etiquetaCat(c).split(' ');
      return partes.length > 1 ? partes.slice(1).join(' ') : partes[0];
    }

    // Los "tipo" del catálogo vienen con variantes escritas distinto:
    // "1-dispositivo", "1- Dispositivo", "1-device"... Las unificamos
    // para que no salgan tres pastillas que significan lo mismo.
    const SINONIMOS_TIPO = {
      '1-device':       '1-dispositivo',
      '1- dispositivo': '1-dispositivo',
      '1 dispositivo':  '1-dispositivo',
      '1 pantalla':     '1-pantalla',
      '2-meses':        'multimes'
    };
    function tiposDe(p) {
      return String(p.type || '')
        .split(',')
        // El .replace junta los espacios repetidos: "1  Dispositivo"
        // venía del panel y no coincidía con ningún sinónimo.
        .map(t => t.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean)
        .map(t => t.startsWith('completa') ? 'completa' : (SINONIMOS_TIPO[t] || t));
    }

    const ETIQUETAS_SUB = {
      '1-pantalla':    '1 Pantalla',
      '1-dispositivo': '1 Dispositivo',
      'completa':      'Cuenta Completa',
      'mensual':       'Mensual',
      'semanal':       'Semanal',
      'anual':         'Anual',
      'multimes':      'Multi-mes',
      'premium':       'Premium',
      'social':        'Redes Sociales',
      'seguidores':    'Seguidores',
      'pedido':        'A Pedido'
    };
    function etiquetaSub(t) {
      return ETIQUETAS_SUB[t] ||
        (t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' '));
    }

    // Pestañas de categoría
    function renderCategorias() {
      const wrap = document.querySelector('.cat-tabs');
      if (!wrap) return;

      // Las que hay en Supabase + las fijas, ordenadas según ORDEN_CATEGORIAS.
      // Lo que no esté en esa lista va al final, alfabético.
      const enSupabase = PRODUCTS.map(p => p.cat).filter(Boolean);
      const cats = [...new Set([...enSupabase, ...CATEGORIAS_FIJAS])].sort((a, b) => {
        const ia = ORDEN_CATEGORIAS.indexOf(a);
        const ib = ORDEN_CATEGORIAS.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
      });

      // Si borraste la categoría que estaba filtrando, volvemos a TODOS
      if (currentCat !== 'all' && !cats.includes(currentCat)) currentCat = 'all';

      wrap.innerHTML =
        `<button class="cat-tab${currentCat === 'all' ? ' active' : ''}" onclick="filterCat('all', this)">TODOS</button>` +
        cats.map(c =>
          `<button class="cat-tab${currentCat === c ? ' active' : ''}" onclick="filterCat('${c}', this)">${etiquetaCat(c)}</button>`
        ).join('');
    }

    // Pastillas de subcategoría — solo las que existen dentro de la
    // categoría elegida, y solo si tienen al menos 2 productos.
    function renderSubfiltros() {
      const wrap = document.querySelector('.sub-pills');
      if (!wrap) return;

      const enCategoria = PRODUCTS.filter(p => currentCat === 'all' || p.cat === currentCat);
      const cuenta = {};
      enCategoria.forEach(p => tiposDe(p).forEach(t => { cuenta[t] = (cuenta[t] || 0) + 1; }));

      const tipos = Object.entries(cuenta)
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([t]) => t);

      if (currentSub !== 'all' && !tipos.includes(currentSub)) currentSub = 'all';

      // Con una sola opción el filtro no aporta nada: lo escondemos
      wrap.style.display = tipos.length === 0 ? 'none' : '';

      wrap.innerHTML =
        `<button class="sub-pill${currentSub === 'all' ? ' active' : ''}" onclick="filterSub('all', this)">Todos</button>` +
        tipos.map(t =>
          `<button class="sub-pill${currentSub === t ? ' active' : ''}" onclick="filterSub('${t}', this)">${etiquetaSub(t)}</button>`
        ).join('');
    }

    function filterCat(cat, el) {
      currentCat = cat;
      currentSub = 'all';   // el subfiltro anterior puede no existir acá
      currentPage = 1;

      // La búsqueda manda sobre la categoría, así que elegir una pestaña
      // limpia lo escrito: si no, la pestaña quedaría marcada sin efecto.
      const input = document.getElementById('2');
      if (input) input.value = '';
      currentSearch = '';
      cerrarSugerencias();

      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');

      const titulo = document.getElementById('tituloCategoria');
      const miga    = document.getElementById('migaCategoria');
      if (titulo) titulo.textContent = nombreCat(cat);
      if (miga)   miga.textContent   = nombreCat(cat);

      renderSubfiltros();
      renderProducts();
    }

    function filterSub(sub, el) {
      currentSub = sub;
      currentPage = 1;
      document.querySelectorAll('.sub-pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
      renderProducts();
    }

    // Suelta la categoría y vuelve a "TODOS", dejando las pestañas, el
    // título y los subfiltros coherentes con lo que se está mostrando.
    function volverATodo() {
      currentCat = 'all';
      currentSub = 'all';
      document.querySelectorAll('.cat-tab').forEach((t, i) => t.classList.toggle('active', i === 0));

      const titulo = document.getElementById('tituloCategoria');
      const miga   = document.getElementById('migaCategoria');
      if (titulo) titulo.textContent = nombreCat('all');
      if (miga)   miga.textContent   = nombreCat('all');

      renderSubfiltros();
    }

    function filterProducts() {
      currentSearch = document.getElementById('2').value;
      currentPage = 1;

      // Con algo escrito la búsqueda es de toda la tienda, así que la
      // pestaña de categoría se suelta para que no diga una cosa y se vea otra.
      if (palabrasDe(currentSearch).length) volverATodo();

      renderProducts();
      renderSugerencias();
    }

    // La ✕ del buscador. Vuelve a enfocar el campo porque quien borra casi
    // siempre es para escribir otra cosa, y así le salen sus recientes.
    function limpiarBusqueda() {
      const input = document.getElementById('2');
      if (!input) return;
      input.value = '';
      filterProducts();
      input.focus();
    }

    // Deja la tienda filtrada por un texto, como si el cliente lo hubiera
    // escrito. Lo usan las tarjetas de "Tops", las recientes y el Enter.
    function usarBusqueda(texto) {
      const input = document.getElementById('2');
      if (input) input.value = texto;
      currentSearch = texto;
      currentPage = 1;
      volverATodo();
      guardarReciente(texto);
      cerrarSugerencias();
      renderProducts();
      const grid = document.getElementById('5');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Tops cards → filtran por el nombre del producto
    document.addEventListener('click', function(e){
      const card = e.target.closest('.tops-card');
      if (!card) return;
      e.preventDefault();
      usarBusqueda(card.getAttribute('data-search') || '');
    });


    // ==========================================================
    //  BUSCADOR PREDICTIVO + BÚSQUEDAS RECIENTES
    // ==========================================================
    // Mientras el cliente escribe salen debajo del campo las plataformas
    // que coinciden (de todo el catálogo, sin importar la pestaña) y las
    // búsquedas que ya hizo antes que empiecen con esas mismas letras.

    const LLAVE_RECIENTES = 'tiago-busquedas';
    const TOPE_RECIENTES  = 8;    // lo que se guarda
    const MAX_RECIENTES   = 4;    // lo que se muestra de una vez
    const MAX_SUGERENCIAS = 7;

    function leerRecientes() {
      try {
        const v = JSON.parse(localStorage.getItem(LLAVE_RECIENTES) || '[]');
        return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [];
      } catch {
        // Incógnito o almacenamiento bloqueado: sin recientes, y ya.
        return [];
      }
    }

    function escribirRecientes(lista) {
      try {
        localStorage.setItem(LLAVE_RECIENTES, JSON.stringify(lista.slice(0, TOPE_RECIENTES)));
      } catch { /* no es imprescindible */ }
    }

    function guardarReciente(texto) {
      const txt = String(texto || '').trim();
      if (txt.length < 2) return;
      // Si ya la había buscado, sube al principio en vez de repetirse.
      const lista = leerRecientes().filter(x => sinTildes(x) !== sinTildes(txt));
      lista.unshift(txt);
      escribirRecientes(lista);
    }

    function borrarRecientes() {
      escribirRecientes([]);
      renderSugerencias();
    }

    // Escapa el texto que va dentro del desplegable: los nombres salen del
    // panel y no tienen por qué ser HTML válido.
    function escaparHtml(txt) {
      return String(txt == null ? '' : txt)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Pone en negrita el pedazo que el cliente ya escribió, palabra por
    // palabra: buscando "max" en "HBO Max" se resalta solo "Max".
    function resaltar(nombre, busqueda) {
      const buscadas = palabrasDe(busqueda);
      if (!buscadas.length) return escaparHtml(nombre);

      return String(nombre || '').split(/(\s+)/).map(tramo => {
        const q = buscadas.find(x => sinTildes(tramo).startsWith(x));
        if (!q) return escaparHtml(tramo);
        return '<b>' + escaparHtml(tramo.slice(0, q.length)) + '</b>' +
               escaparHtml(tramo.slice(q.length));
      }).join('');
    }

    let SUG_FILAS = [];    // qué hace cada fila dibujada, en orden
    let sugMarcada = -1;   // fila resaltada con las flechas del teclado

    function cerrarSugerencias() {
      const caja = document.getElementById('sugerencias');
      if (caja) caja.hidden = true;
      sugMarcada = -1;
    }

    function renderSugerencias() {
      const caja  = document.getElementById('sugerencias');
      const input = document.getElementById('2');
      if (!caja || !input) return;

      const texto = input.value;
      const hayTexto = palabrasDe(texto).length > 0;

      // Las recientes se filtran con la misma regla que el catálogo, así
      // el cliente escribe una letra y le salen las suyas que empiezan así.
      const recientes = leerRecientes()
        .filter(r => empiezaCon(r, texto))
        .slice(0, MAX_RECIENTES);

      // Las plataformas salen de TODO el catálogo, no de la pestaña abierta.
      const plataformas = hayTexto && catalogoCargado
        ? agruparEnPlataformas(PRODUCTS)
            .filter(g => empiezaCon(g.nombre, texto))
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .slice(0, MAX_SUGERENCIAS)
        : [];

      SUG_FILAS = [];
      sugMarcada = -1;
      let html = '';

      if (recientes.length) {
        html += `<div class="sug-titulo">Búsquedas recientes
                   <button type="button" class="sug-limpiar" data-limpiar="1">Borrar</button>
                 </div>`;
        recientes.forEach(r => {
          const i = SUG_FILAS.length;
          SUG_FILAS.push({ texto: r });
          html += `<button type="button" class="sug-item" data-fila="${i}">
                     <span class="sug-ico">🕘</span>
                     <span class="sug-txt"><span class="sug-nombre">${resaltar(r, texto)}</span></span>
                   </button>`;
        });
      }

      if (plataformas.length) {
        html += `<div class="sug-titulo">Plataformas</div>`;
        plataformas.forEach(g => {
          const i = SUG_FILAS.length;
          SUG_FILAS.push({ texto: g.nombre, clave: g.clave });
          const p = g.base;
          const url = getImageUrl(p.name, p.cat, p.imgColor, p.imagenUrl);
          const logoAlt = escaparHtml(p.name).replace(/'/g, '&#39;');
          html += `<button type="button" class="sug-item" data-fila="${i}">
                     <img class="sug-logo" src="${url}" alt="" loading="lazy"
                          onerror="this.onerror=null;this.src=generateLogoSvg('${logoAlt}','${p.imgColor}');">
                     <span class="sug-txt">
                       <span class="sug-nombre">${resaltar(g.nombre, texto)}</span>
                       <span class="sug-meta">${escaparHtml(nombreCat(p.cat))} · ${g.planes.length} ${g.planes.length === 1 ? 'plan' : 'planes'}</span>
                     </span>
                     <span class="sug-precio">${g.agotada ? 'Agotado'
                       : g.desde > 0 ? 'desde ' + formatoBs(g.desde)
                       // Sin precio cargado no se puede decir "desde 0Bs":
                       // el panel de la plataforma ya dice "A consultar".
                       : 'A consultar'}</span>
                   </button>`;
        });
      }

      if (hayTexto && !plataformas.length) {
        html += `<div class="sug-vacio">
                   ${catalogoCargado ? `Ninguna plataforma con «${escaparHtml(texto.trim())}»` : 'Cargando catálogo…'}
                 </div>`;
      }

      caja.innerHTML = html;
      caja.hidden = html === '';
    }

    // Un solo listener para todo el desplegable: las filas se redibujan
    // en cada tecla y no conviene colgarles handlers uno por uno.
    document.addEventListener('click', function (e) {
      const caja = document.getElementById('sugerencias');
      if (!caja || caja.hidden) return;

      if (e.target.closest('[data-limpiar]')) { borrarRecientes(); return; }

      const fila = e.target.closest('.sug-item');
      if (!fila || !caja.contains(fila)) return;

      elegirSugerencia(Number(fila.getAttribute('data-fila')));
    });

    function elegirSugerencia(i) {
      const dato = SUG_FILAS[i];
      if (!dato) return;

      usarBusqueda(dato.texto);
      // Si es una plataforma concreta, se abre directo su panel de planes:
      // ya quedó filtrada arriba, o sea que abrirPlataforma la encuentra.
      if (dato.clave) abrirPlataforma(dato.clave);
    }

    // Flechas para recorrer, Enter para elegir, Escape para cerrar.
    function teclaSugerencias(e) {
      const caja = document.getElementById('sugerencias');

      if (e.key === 'Escape') { cerrarSugerencias(); return; }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (sugMarcada >= 0 && SUG_FILAS[sugMarcada]) elegirSugerencia(sugMarcada);
        else usarBusqueda(e.target.value);
        e.target.blur();
        return;
      }

      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (!caja || caja.hidden || !SUG_FILAS.length) return;

      e.preventDefault();
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      sugMarcada = (sugMarcada + paso + SUG_FILAS.length + 1) % (SUG_FILAS.length + 1);
      if (sugMarcada === SUG_FILAS.length) sugMarcada = -1;   // vuelta al campo

      caja.querySelectorAll('.sug-item').forEach((el, i) => {
        el.classList.toggle('marcada', i === sugMarcada);
        if (i === sugMarcada) el.scrollIntoView({ block: 'nearest' });
      });
    }

    // Tocar fuera del buscador cierra el desplegable.
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('.search-box')) cerrarSugerencias();
    });

    function sortProducts() {
      currentPage = 1;
      renderProducts();
    }

    function toggleFilter() {
      const row = document.getElementById('3');
      row.style.display = row.style.display === 'none' ? 'block' : 'none';
    }

    // ==========================================================
    // EL "ATRÁS" DEL CELULAR DENTRO DE LA VENTANA
    // ==========================================================
    // Cada pantalla de la ventana (planes, carrito, pago) es una entrada
    // del historial del navegador. Así el "atrás" del celular vuelve a la
    // pantalla anterior, en vez de sacar al cliente de la tienda en medio
    // de una compra. Cerrar la ventana (✕, tocar afuera, Esc) es volver
    // hasta antes de abrirla.
    //
    // history.state = { tienda: 'planes' | 'carrito' | 'pago', clave, nivel }
    //   clave: de qué plataforma son los planes
    //   nivel: cuántas pantallas de la ventana hay hasta esta (1 = la primera)
    //
    // Hacia atrás nunca se dibuja a mano: los botones de volver llaman a
    // atras(), que va por el historial, y la pantalla la dibuja el popstate.
    // Si no, lo que se ve y el historial se desfasan, y el "atrás" del
    // celular lleva a cualquier lado.
    // ==========================================================
    let restaurando = false;       // el popstate está redibujando: no anotar
    let yendo = false;             // hay un history.go pedido que no llegó
    let despuesDeCerrar = null;    // qué hacer cuando termine de cerrarse
    let pantallaRestaurada = false;

    const nivelActual = () => (history.state && history.state.tienda) ? history.state.nivel : 0;
    const ventanaAbierta = () => document.getElementById('8').classList.contains('open');

    // Anota la pantalla que se acaba de abrir. Si es la misma que ya está
    // (dos toques seguidos a "Comprar"), no la apila dos veces.
    function anotarPantalla(pantalla, clave = null) {
      if (restaurando) return;
      const s = history.state;
      if (s && s.tienda === pantalla && s.clave === clave) return;
      history.pushState({ tienda: pantalla, clave, nivel: nivelActual() + 1 }, '');
    }

    // Vuelve n pantallas por el historial. Si el historial no las tiene
    // (se recargó la página en el medio), hace "alternativa" a mano.
    function atras(n, alternativa) {
      if (yendo) return;                       // dos toques rápidos: uno solo
      if (nivelActual() < n) { alternativa(); return; }
      yendo = true;
      setTimeout(() => { yendo = false; }, 1000);   // por si el popstate no llega
      history.go(-n);
    }

    // despues: qué hacer una vez cerrada (el "Ver productos" del carrito
    // vacío lleva al inicio, y eso tiene que pasar DESPUÉS de volver).
    function closeModal(e, despues = null) {
      if (e && e.target !== document.getElementById('8')) return;
      if (nivelActual() === 0) {
        cerrarVentana();
        if (despues) despues();
        return;
      }
      if (yendo) return;
      despuesDeCerrar = despues;
      atras(nivelActual(), cerrarVentana);
    }

    function cerrarVentana() {
      document.getElementById('8').classList.remove('open');
      // El panel de planes ensancha el modal y la compra lo agranda:
      // lo devolvemos a su tamaño
      document.getElementById('9').classList.remove('ancho', 'compra');
      document.body.style.overflow = '';
    }

    // Dibuja la pantalla que dice el historial (null = ventana cerrada).
    function mostrarPantalla(s) {
      if (!s) { if (ventanaAbierta()) cerrarVentana(); return; }

      if (s.tienda === 'planes') {
        if (PLATAFORMAS_VISIBLES.some(g => g.clave === s.clave)) abrirPlataforma(s.clave);
        else cerrarVentana();
        return;
      }

      // Carrito o pago. Si la compra ya está dibujada solo se cambia de
      // paso: así no se pierden los términos tildados ni el número.
      if (!ventanaAbierta() || !document.getElementById('crPaso2')) openCart();
      irAPaso(s.tienda === 'pago' ? 3 : 2);
    }

    window.addEventListener('popstate', e => {
      yendo = false;
      const s = e.state && e.state.tienda ? e.state : null;
      restaurando = true;
      try { mostrarPantalla(s); } finally { restaurando = false; }
      if (!s && despuesDeCerrar) {
        const f = despuesDeCerrar;
        despuesDeCerrar = null;
        f();
      }
    });

    // Esc cierra la ventana, en la compu
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && ventanaAbierta()) closeModal();
    });

    // Volvió con "atrás" desde la página del QR (o recargó con la ventana
    // abierta) y el navegador dibujó la tienda de cero: se le abre la
    // pantalla donde estaba. Lo llama __aplicarCatalogo la primera vez,
    // porque sin catálogo no hay planes ni carrito que mostrar.
    function restaurarPantalla() {
      if (pantallaRestaurada) return;
      pantallaRestaurada = true;
      if (!history.state || !history.state.tienda) return;
      restaurando = true;
      try { mostrarPantalla(history.state); } finally { restaurando = false; }
    }

    // ==========================================================
    // PASOS 2 Y 3: CARRITO Y PAGO, CADA UNO EN SU PANTALLA
    // ==========================================================
    // Paso 2 (Tu carrito): los productos con − cantidad +, subtotal y
    // quitar. Abajo, fijo: el total, "Seguir comprando" y "Continuar".
    // Paso 3 (Pagar con QR): el resumen de solo lectura, el aviso de
    // correo, el de renovación y los términos. Abajo, fijo: el total,
    // "Volver al carrito" y "Pagar con QR".
    //
    // Antes estaba todo en una sola ventana larga. Ahora openCart() dibuja
    // los DOS pasos de una vez y irAPaso() muestra uno y esconde el otro:
    // así ir y volver no borra los términos tildados ni el número de
    // WhatsApp. Por lo mismo, cambiar una cantidad redibuja solo su fila.
    // ==========================================================
    const fmtBsCarrito = n => {
      const num = Number(n) || 0;
      return (Number.isInteger(num) ? String(num) : num.toFixed(2)) + ' Bs';
    };

    // La guía de los tres pasos. Los ya hechos son botones para volver a
    // ellos; hacia adelante no se salta desde acá (hay que pasar por el
    // botón de cada pantalla, que es el que controla lo que falta).
    const PASOS = ['Elegir', 'Carrito', 'Pagar con QR'];
    const VOLVER_A_PASO = ['seguirComprando()', 'volverAlCarrito()'];

    function pasosHtml(actual) {
      return `
      <ol class="cr-pasos" aria-label="Pasos de la compra">
        ${PASOS.map((nombre, i) => {
          const n = i + 1;
          if (n === actual) return `<li class="actual" aria-current="step"><span>${n}</span>${nombre}</li>`;
          if (n < actual)   return `<li class="hecho"><button type="button" onclick="${VOLVER_A_PASO[i]}"><span>✓</span>${nombre}</button></li>`;
          return `<li><span>${n}</span>${nombre}</li>`;
        }).join('')}
      </ol>`;
    }

    let pasoActual   = 0;      // 2 o 3 mientras el carrito está abierto
    let planDeVuelta = null;   // el plan que se acaba de agregar, para "Seguir comprando"

    // redibujar: se llama para rearmar el carrito que ya está a la vista
    // (se quitó el último producto, se perdió una fila); no es una
    // pantalla nueva y no va al historial.
    function openCart({ agregado = null, redibujar = false } = {}) {
      if (!redibujar) anotarPantalla('carrito');

      // Si bajó el stock desde que lo agregó, se ajusta la cantidad
      const ajustados = [];
      cart.forEach(item => {
        const tope = topeDe(item);
        if (item.qty > tope) { item.qty = tope; ajustados.push(item.id); }
      });
      if (ajustados.length) { updateCartCount(); guardarCarrito(); }

      // Sin plan de donde vino (se abrió desde el ícono del carrito),
      // "Seguir comprando" cierra la ventana
      planDeVuelta = agregado;
      pasoActual = 0;

      const cuerpo = document.getElementById('10');

      if (cart.length === 0) {
        cuerpo.innerHTML = `
          <div class="ck-cab">
            <h3>Tu carrito</h3>
            <button class="ck-cerrar" onclick="closeModal()" aria-label="Cerrar">✕</button>
          </div>
          <div class="cr-vacio">
            <div class="cr-vacio-ico">🛒</div>
            <b>Tu carrito está vacío</b>
            <p>Elegí un plan y tocá <b>Comprar</b>: aparece acá para pagarlo con QR.</p>
            <button class="ck-pagar" onclick="closeModal(null, goHome)">Ver productos</button>
          </div>`;
        abrirModalCarrito(false);
        return;
      }

      const recien = agregado ? cart.find(i => i.id === agregado) : null;
      const pideDatos = cart.some(i => { const f = productFlags(i); return f.needsEmail || f.needsUsername; });

      // El total va en el pie de los dos pasos: por eso son clases y no ids
      const totalHtml = `
        <div class="cr-total">
          <div>
            <span class="cr-total-lbl">Total a pagar</span>
            <small class="cr-cuantos"></small>
          </div>
          <b class="cr-total-num"></b>
        </div>`;

      cuerpo.innerHTML = `
        <div class="ck-cab">
          <h3 id="crTitulo" tabindex="-1">Tu carrito</h3>
          <button class="ck-cerrar" onclick="closeModal()" aria-label="Cerrar">✕</button>
        </div>

        <div id="crPasos"></div>

        <!-- ===== PASO 2: TU CARRITO ===== -->
        <section class="cr-paso" id="crPaso2">
          <div class="cr-scroll">
            ${recien ? `<div class="cr-agregado" role="status">✓ Agregaste <b>${escaparHtml(recien.name)}</b></div>` : ''}
            <ul class="cr-items">${cart.map((item, idx) => filaCarrito(item, idx, ajustados.includes(item.id))).join('')}</ul>
            <!-- Descuento combo: aplicado, o la invitación a sumar otro.
                 Lo llena pintarTotales() cada vez que cambia el carrito. -->
            <div class="cr-combo" id="crCombo"></div>
          </div>
          <div class="cr-pie">
            ${totalHtml}
            <div class="cr-acciones">
              <button type="button" class="cr-atras" onclick="seguirComprando()">← Seguir comprando</button>
              <button type="button" class="ck-pagar" onclick="irAPaso(3)">Continuar →</button>
            </div>
          </div>
        </section>

        <!-- ===== PASO 3: PAGAR CON QR ===== -->
        <section class="cr-paso" id="crPaso3" hidden>
          <div class="cr-scroll">
            <div class="ck-caja cr-pedido">
              <div class="cr-pedido-cab">
                <b>Tu pedido</b>
                <button type="button" class="cr-editar" onclick="volverAlCarrito()">Editar</button>
              </div>
              <ul class="cr-resumen" id="crResumen"></ul>
            </div>

            ${pideDatos ? `
            <div class="ck-caja ck-correo">
              <span class="ck-correo-ico">📧</span>
              <div>
                <b>Te pediremos tu correo al pagar</b>
                <p>Alguno de estos servicios se activa sobre tu propia cuenta.
                   En la pantalla del QR vas a ver el campo para escribirlo.</p>
              </div>
            </div>` : ''}

            <div class="ck-caja ck-renovar">
              <div class="ck-renovar-fila">
                <div class="ck-renovar-txt">
                  <b>¿Te recordamos renovar al vencer?</b>
                  <p>Te escribimos por WhatsApp unos días antes del vencimiento para
                     que no pierdas el servicio. No se cobra nada automáticamente.</p>
                </div>
                <label class="ck-switch">
                  <input type="checkbox" id="crRenovar">
                  <span class="ck-switch-pista"><span class="ck-switch-bola"></span></span>
                </label>
              </div>
              <!-- Aparece recién al prender el interruptor: si no vamos a
                   escribirle, pedirle el número es preguntar por gusto. -->
              <div class="ck-renovar-tel" id="crRenovarTel" hidden>
                <label for="crTel">¿A qué WhatsApp te escribimos?</label>
                <div class="ck-tel-campo">
                  <span class="ck-tel-pais">🇧🇴 +591</span>
                  <input type="tel" id="crTel" inputmode="numeric" maxlength="14"
                         autocomplete="tel-national" placeholder="7 123 4567">
                </div>
                <p class="ck-tel-error" id="crTelError" hidden></p>
              </div>
            </div>

            ${bloqueTerminos('cartTerminos')}
          </div>
          <div class="cr-pie">
            ${totalHtml}
            <div class="cr-acciones">
              <button type="button" class="cr-atras" onclick="volverAlCarrito()">← Volver al carrito</button>
              <button type="button" class="ck-pagar" id="cartPagarQR" disabled onclick="payWithQR()">
                Pagar con QR <span class="cr-pagar-monto" id="crPagarMonto"></span>
              </button>
            </div>
            <p class="ck-aviso" id="crAvisoPagar">Te llevamos al QR para completar el pago.</p>
          </div>
        </section>`;

      pintarTotales();
      atarCarrito();
      abrirModalCarrito(true);
      irAPaso(2);
      anotarPaso('carrito');
    }

    // Anota un paso de la compra para el embudo del panel (ver
    // __anotarPaso en js/tienda-catalogo.js). Si ese módulo no cargó,
    // la compra sigue igual: es solo estadística.
    const anotarPaso = paso => { if (window.__anotarPaso) window.__anotarPaso(paso); };

    // Muestra el paso 2 o el 3. Los dos ya están dibujados: solo se
    // esconde uno y se muestra el otro.
    function irAPaso(n) {
      const s2 = document.getElementById('crPaso2');
      const s3 = document.getElementById('crPaso3');
      if (!s2 || !s3) return;
      if (n === 3 && cart.length === 0) return;

      const antes = pasoActual;
      const entra = n === 3 ? s3 : s2;
      s2.hidden = n !== 2;
      s3.hidden = n !== 3;
      entra.querySelector('.cr-scroll').scrollTop = 0;

      document.getElementById('crPasos').innerHTML = pasosHtml(n);
      const titulo = document.getElementById('crTitulo');
      titulo.textContent = n === 3 ? 'Pagar con QR' : 'Tu carrito';
      if (n === 3) { pintarResumen(); anotarPaso('pago'); }

      pasoActual = n;
      if (antes && antes !== n) {
        // Entra desde la derecha al avanzar y desde la izquierda al volver
        entra.style.setProperty('--desde', n > antes ? '28px' : '-28px');
        entra.classList.remove('entra');
        void entra.offsetWidth;            // reinicia la animación
        entra.classList.add('entra');
        // El botón que se tocó quedó escondido: el foco pasa al título
        titulo.focus({ preventScroll: true });
        if (n === 3) anotarPantalla('pago');
      }
    }

    // "Seguir comprando" y "✓ Elegir": a los planes del producto recién
    // agregado, o se cierra si el carrito se abrió desde el ícono. Por el
    // historial, igual que el "atrás" del celular: una pantalla desde el
    // carrito, dos desde el pago.
    function seguirComprando() {
      atras(pasoActual === 3 ? 2 : 1, () => {
        if (planDeVuelta !== null && PRODUCTS.some(p => p.id === planDeVuelta)) volverAPlanes(planDeVuelta);
        else closeModal();
      });
    }

    // Del paso 3 al 2
    function volverAlCarrito() {
      atras(1, () => irAPaso(2));
    }

    // "Tu pedido" del paso 3: lo que se va a pagar, de solo lectura
    function pintarResumen() {
      const lista = document.getElementById('crResumen');
      if (!lista) return;
      const { descuento } = cuentasDelCarrito();
      lista.innerHTML = cart.map(i => `
        <li>
          <span class="cr-res-nombre">${i.qty}× ${escaparHtml(i.name)}</span>
          <b>${fmtBsCarrito(i.price * i.qty)}</b>
        </li>`).join('') +
        (descuento > 0 ? `
        <li class="cr-res-desc">
          <span class="cr-res-nombre">🎁 Descuento combo</span>
          <b>−${fmtBsCarrito(descuento)}</b>
        </li>` : '');
    }

    function filaCarrito(item, idx, ajustado) {
      const url = getImageUrl(item.name, item.cat, item.imgColor, item.imagenUrl);
      const nombreSeguro = item.name.replace(/'/g, "\\'");
      const f = productFlags(item);
      const entrega = item.stock > 0
        ? `<span class="cr-ya">⚡ Entrega inmediata</span> · ${item.stock === 1 ? 'queda 1' : `quedan ${item.stock}`}`
        : '⏱ Entrega de 5 a 30 min';
      return `
        <li class="cr-item" data-idx="${idx}">
          <img class="cr-img" src="${url}" alt="" loading="lazy"
               onerror="this.onerror=null;this.src=generateLogoSvg('${nombreSeguro}','${item.imgColor}');">
          <div class="cr-info">
            <div class="cr-nombre">${escaparHtml(item.name)}</div>
            <div class="cr-meta">${entrega}${f.needsEmail || f.needsUsername ? ' · 📧 pide tu correo' : ''}</div>
            <div class="cr-unit">${fmtBsCarrito(item.price)} c/u${item.precioAntes ? ` <s>${item.precioAntes}</s>` : ''}</div>
            <div class="cr-aviso" ${ajustado ? '' : 'hidden'}>${ajustado ? mensajeTope(item) : ''}</div>
          </div>
          <div class="cr-der">
            <div class="cr-cant" role="group" aria-label="Cantidad">
              <button type="button" onclick="updateQty(${idx}, -1)" aria-label="Uno menos">−</button>
              <span class="cr-qty" aria-live="polite">${item.qty}</span>
              <button type="button" onclick="updateQty(${idx}, 1)" aria-label="Uno más">+</button>
            </div>
            <div class="cr-sub">${fmtBsCarrito(item.price * item.qty)}</div>
            <button type="button" class="cr-quitar" onclick="removeFromCart(${idx})" aria-label="Quitar del carrito" title="Quitar">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </li>`;
    }

    // Lo que ve el cliente cuando quiere más de lo que hay
    function mensajeTope(item) {
      return item.stock > 0 && item.stock <= MAX_POR_PRODUCTO
        ? `Solo hay ${item.stock} en stock`
        : `Máximo ${MAX_POR_PRODUCTO} por compra`;
    }

    function pintarTotales() {
      const { unidades, descuento, total } = cuentasDelCarrito();
      const el = id => document.getElementById(id);
      if (!el('crPagarMonto')) return;

      // El total está en el pie del paso 2 y en el del 3, ya con el
      // descuento combo si corresponde
      document.querySelectorAll('.cr-total-num').forEach(e => { e.textContent = fmtBsCarrito(total); });
      document.querySelectorAll('.cr-cuantos').forEach(e => {
        e.textContent = (unidades === 1 ? '1 producto' : `${unidades} productos`) +
                        (descuento > 0 ? ` · ahorrás ${fmtBsCarrito(descuento)}` : '');
      });
      el('crPagarMonto').textContent = '· ' + fmtBsCarrito(total);

      // Con 2 o más: el descuento aplicado. Con 1: la invitación a sumar otro.
      const combo = el('crCombo');
      if (combo) {
        combo.classList.toggle('aplicado', descuento > 0);
        combo.innerHTML = descuento > 0
          ? `<span>🎁 <b>Descuento combo</b> por llevar ${unidades} productos</span><b class="cr-combo-monto">−${fmtBsCarrito(descuento)}</b>`
          : `<span>🎁 Sumá otro producto y ahorrá <b>${fmtBsCarrito(DESCUENTO_COMBO)}</b> con el descuento combo</span>`;
      }
    }

    // Términos + aviso de renovación: los mismos candados que tenía la
    // ventana de compra de un solo producto.
    function atarCarrito() {
      const terminos = document.getElementById('cartTerminos');
      const boton    = document.getElementById('cartPagarQR');
      const renovar  = document.getElementById('crRenovar');
      const cajaTel  = document.getElementById('crRenovarTel');
      const campoTel = document.getElementById('crTel');
      const errorTel = document.getElementById('crTelError');

      // El aviso de abajo del botón (#crAvisoPagar) dice siempre lo mismo;
      // que faltan los términos ya lo marca la caja en rojo.
      const refrescar = () => {
        boton.disabled = !terminos.checked || (renovar.checked && !telValido(campoTel.value));
      };

      renovar.addEventListener('change', () => {
        cajaTel.hidden = !renovar.checked;
        if (renovar.checked) campoTel.focus();
        else { errorTel.hidden = true; campoTel.classList.remove('mal'); }
        refrescar();
      });

      // Solo los 8 números del celular; si pega el 591 adelante, se saca
      campoTel.addEventListener('input', () => {
        let limpio = campoTel.value.replace(/\D/g, '');
        if (limpio.length > 8 && limpio.startsWith('591')) limpio = limpio.slice(3);
        limpio = limpio.slice(0, 8);
        if (limpio !== campoTel.value) campoTel.value = limpio;
        errorTel.hidden = true;
        campoTel.classList.remove('mal');
        refrescar();
      });

      terminos.addEventListener('change', refrescar);
    }

    // grande = la ventana de compra (.compra), del mismo tamaño que el
    // panel de planes: al tocar "Comprar" cambia lo de adentro, no la
    // ventana. El carrito vacío usa la ventana chica de siempre.
    function abrirModalCarrito(grande) {
      const hoja = document.getElementById('9');
      hoja.classList.remove('ancho');
      hoja.classList.toggle('compra', grande === true);
      document.getElementById('8').classList.add('open');
      document.body.style.overflow = 'hidden';
      hoja.scrollTop = 0;
    }

    // − y +. Con stock cargado no se pasa de lo que hay: al intentarlo,
    // la fila avisa "Solo hay N en stock" en vez de sumar en silencio algo
    // que no se va a poder entregar.
    function updateQty(idx, change) {
      const item = cart[idx];
      if (!item) return;

      const fila  = document.querySelector(`.cr-item[data-idx="${idx}"]`);
      const aviso = fila?.querySelector('.cr-aviso');

      if (change > 0 && item.qty >= topeDe(item)) {
        if (aviso) {
          aviso.textContent = mensajeTope(item);
          aviso.hidden = false;
          fila.classList.remove('cr-tope');
          void fila.offsetWidth;            // reinicia la animación
          fila.classList.add('cr-tope');
        }
        return;
      }

      if (item.qty + change <= 0) { removeFromCart(idx); return; }

      item.qty += change;
      updateCartCount();
      guardarCarrito();

      if (!fila) { openCart({ redibujar: true }); return; }
      fila.querySelector('.cr-qty').textContent = item.qty;
      fila.querySelector('.cr-sub').textContent = fmtBsCarrito(item.price * item.qty);
      if (aviso && item.qty < topeDe(item)) aviso.hidden = true;
      pintarTotales();
    }

    function removeFromCart(idx) {
      if (idx < 0 || idx >= cart.length) return;
      cart.splice(idx, 1);
      updateCartCount();
      guardarCarrito();

      // Sin redibujar todo (los términos y el número quedan como estaban):
      // se saca la fila y se renumeran las que siguen.
      const fila = document.querySelector(`.cr-item[data-idx="${idx}"]`);
      if (!fila || cart.length === 0) { openCart({ redibujar: true }); return; }
      fila.remove();
      document.querySelectorAll('.cr-item').forEach((f, i) => {
        f.dataset.idx = i;
        f.querySelectorAll('.cr-cant button')[0].setAttribute('onclick', `updateQty(${i}, -1)`);
        f.querySelectorAll('.cr-cant button')[1].setAttribute('onclick', `updateQty(${i}, 1)`);
        f.querySelector('.cr-quitar').setAttribute('onclick', `removeFromCart(${i})`);
      });
      pintarTotales();
    }

    function goHome() {
      currentCat = 'all'; currentSub = 'all'; currentSearch = '';
      document.getElementById('2').value = '';
      cerrarSugerencias();
      document.querySelectorAll('.cat-tab').forEach((t,i) => t.classList.toggle('active', i===0));
      document.querySelectorAll('.sub-pill').forEach((p,i) => p.classList.toggle('active', i===0));
      currentPage = 1;
      renderProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showAllCats() {
      document.querySelector('.cat-tabs-wrap').scrollIntoView({ behavior: 'smooth' });
    }

    // Cartelito del plan para que el cliente sepa ANTES de pagar que le
    // vamos a pedir el correo, y no se sorprenda recién en la pantalla del
    // QR. Sale de productFlags(), así que cualquier producto que pida datos
    // lo muestra solo, sin tener que escribirlo a mano en la descripción.
    // (En el carrito, el aviso completo está en el paso 3.)
    function chipDatos(producto) {
      const f = productFlags(producto);
      return f.needsEmail || f.needsUsername
        ? '<span class="plan-chip correo">📧 Pide tu correo</span>'
        : '';
    }

    // Qué datos extra hay que pedirle al cliente en la pantalla de pago.
    // Miramos nombre Y descripción, porque muchas veces la frase que decide
    // ("a correo de cliente") solo está escrita en la descripción.
    // Es la única regla: si no dice eso, la tienda no pide correo.
    function productFlags(producto) {
      const p = typeof producto === 'string' ? { name: producto } : (producto || {});
      const texto = ((p.name || '') + ' ' + (p.desc || '')).toLowerCase();
      const flags = {};
      if (texto.includes('correo de cliente')) {
        flags.needsEmail = true;
      }
      return flags;
    }

    // Paso 3: del carrito a la pantalla del QR, con todo lo que tiene.
    function payWithQR() {
      // Sin términos aceptados no se genera el QR
      const terminos = document.getElementById('cartTerminos');
      if (terminos && !terminos.checked) return;

      // Si pidió que le recordemos renovar, tiene que haber a dónde escribirle
      const renovar  = document.getElementById('crRenovar');
      const campoTel = document.getElementById('crTel');
      const quiereAviso = !!(renovar && renovar.checked);
      if (quiereAviso && !telValido(campoTel.value)) {
        const error = document.getElementById('crTelError');
        error.textContent = 'Escribí tu celular completo: 8 números que empiezan con 6 o 7.';
        error.hidden = false;
        campoTel.classList.add('mal');
        campoTel.focus();
        return;
      }
      if (cart.length === 0) return;

      // El total ya con el descuento combo: es el que se ve mientras la
      // base arma la compra (después manda el que calculó ella, que es el mismo)
      const { total } = cuentasDelCarrito();
      const cartData = cart.map(item => ({
        fid: item.fid,
        name: item.name.substring(0, 80),
        price: item.price,
        qty: item.qty,
        ...productFlags(item),
      }));
      const params = new URLSearchParams({
        cart: encodeURIComponent(JSON.stringify(cartData)),
        total: total.toFixed(2),
      });
      // El aviso de renovación viaja con el número (lo lee pagar-qr.html)
      if (quiereAviso) {
        params.set('recordar', '1');
        params.set('wa', normalizarTel(campoTel.value));
      }
      anotarPaso('qr');
      window.location.href = `pagar-qr.html?${params.toString()}`;
    }

    // Init
    renderProducts();

    // ===== FOTOS DEL CARRUSEL =====
    // Cada banner muestra la misma imagen que la tarjeta de su plataforma
    // (data-plataforma) o de su juego (data-juego). Corre cada vez que
    // llega el catálogo, así que cambiar la foto desde /admin cambia
    // también el banner, sin tocar este archivo.
    function ponerFotoBanner(slide, url) {
      const img = slide.querySelector('.hero-slide-img');
      if (!img || !url) return;
      // La que vino escrita en el HTML queda de reserva: si la foto de la
      // plataforma no carga, el banner no se queda con un cuadro roto.
      if (!img.dataset.reserva) img.dataset.reserva = img.getAttribute('src') || img.dataset.src;
      img.onerror = () => { img.onerror = null; img.src = img.dataset.reserva; };
      // Todavía no le tocó salir: se cambia la que va a pedir, sin bajarla.
      if ('src' in img.dataset) { img.dataset.src = url; return; }
      if (img.src !== new URL(url, location.href).href) img.src = url;
    }

    // "Spotify" tiene que dar la tarjeta Spotify Premium y no un combo que
    // lo nombra de pasada: gana el nombre igual, después el que empieza
    // así, y recién después cualquiera que lo contenga. A igual puntaje,
    // la que tiene planes disponibles.
    function plataformaPorNombre(grupos, buscada) {
      const b = sinTildes(buscada);
      let mejor = null, mejorPts = 0;
      for (const g of grupos) {
        const n = sinTildes(g.nombre);
        const pts = n === b ? 3 : n.startsWith(b) ? 2 : empiezaCon(g.nombre, buscada) ? 1 : 0;
        if (pts === 0) continue;
        const total = pts + (g.agotada ? 0 : 0.5);
        if (total > mejorPts) { mejor = g; mejorPts = total; }
      }
      return mejor;
    }

    // La foto de una plataforma: la misma que muestra su tarjeta.
    function fotoDePlataforma(grupos, buscada) {
      const g = plataformaPorNombre(grupos, buscada);
      if (!g) return null;
      const p = g.base;
      return getImageUrl(p.name, p.cat, p.imgColor, p.imagenUrl);
    }

    function actualizarCarrusel(grupos) {
      document.querySelectorAll('#heroTrack .hero-slide[data-plataforma]').forEach(slide => {
        ponerFotoBanner(slide, fotoDePlataforma(grupos, slide.dataset.plataforma));
      });
    }

    // ===== FONDO DE LAS TARJETAS DE TOPS =====
    // Cada tarjeta de Tops lleva de fondo la foto de la plataforma que
    // busca (data-search), en vez del color liso. El color (--c1/--c2)
    // queda debajo: se ve mientras la foto carga, si no carga, o si la
    // plataforma ya no está en el catálogo.
    function actualizarTops(grupos) {
      document.querySelectorAll('.tops-card[data-search]').forEach(card => {
        const url = fotoDePlataforma(grupos, card.dataset.search);
        if (!url) {
          card.classList.remove('tops-card--foto');
          card.style.removeProperty('--foto');
          return;
        }
        // Absoluta: una ruta relativa dentro de una variable CSS se
        // resolvería contra css/tienda.css y no contra la página.
        const absoluta = new URL(url, location.href).href.replace(/"/g, '%22');
        card.style.setProperty('--foto', `url("${absoluta}")`);
        card.classList.add('tops-card--foto');
      });
    }

    // Corre cada vez que llega el catálogo (también en tiempo real).
    function actualizarFotosDePlataforma() {
      const grupos = agruparEnPlataformas(PRODUCTS);
      actualizarCarrusel(grupos);
      actualizarTops(grupos);
    }

    // Los juegos no son parte del catálogo: los manda aparte
    // js/tienda-catalogo.js, solo para los banners de recargas.
    window.__aplicarJuegosCarrusel = function (juegos) {
      document.querySelectorAll('#heroTrack .hero-slide[data-juego]').forEach(slide => {
        const buscado = sinTildes(slide.dataset.juego);
        const j = juegos.find(x => sinTildes(x.nombre) === buscado);
        if (j && j.logo) ponerFotoBanner(slide, imgOptimizada(j.logo));
      });
    };

    // ===== HERO CAROUSEL =====
    (function() {
      const track = document.getElementById('heroTrack');
      const dotsWrap = document.getElementById('heroDots');
      const carousel = document.getElementById('heroCarousel');
      if (!track || !dotsWrap || !carousel) return;
      const slides = track.children;
      const total = slides.length;
      let current = 0;
      let timer = null;
      const INTERVAL = 5000;

      // Build dots
      for (let i = 0; i < total; i++) {
        const dot = document.createElement('button');
        dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', 'Ir al slide ' + (i + 1));
        dot.addEventListener('click', () => goTo(i));
        dotsWrap.appendChild(dot);
      }

      // Carga diferida de las diapositivas.
      // Solo la primera trae src en el HTML; las demás traen data-src y se
      // piden recién cuando les toca salir. Antes el navegador bajaba las 6
      // imágenes de una (1,6 MB) aunque el cliente solo viera la primera.
      // No sirve loading="lazy": las diapositivas están una al lado de la
      // otra dentro del overflow:hidden, así que Chrome las considera "casi
      // visibles" y las baja igual.
      function cargarSlide(i) {
        const img = slides[i] && slides[i].querySelector('img[data-src]');
        if (!img) return;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
      // La actual y la siguiente: siempre hay 5 segundos de ventaja antes
      // de que la diapositiva entre en pantalla, así nunca se ve vacía.
      function precargar(i) { cargarSlide(i); cargarSlide((i + 1) % total); }

      function goTo(idx) {
        current = (idx + total) % total;
        precargar(current);
        track.style.transform = `translateX(-${current * 100}%)`;
        Array.from(dotsWrap.children).forEach((d, i) => {
          d.classList.toggle('active', i === current);
        });
        restart();
      }

      window.heroMove = function(dir) { goTo(current + dir); };

      function start() { timer = setInterval(() => goTo(current + 1), INTERVAL); }
      function stop() { if (timer) { clearInterval(timer); timer = null; } }
      function restart() { stop(); start(); }

      // Pause on hover (desktop)
      carousel.addEventListener('mouseenter', stop);
      carousel.addEventListener('mouseleave', start);

      // Touch swipe
      let startX = 0, deltaX = 0, dragging = false;
      carousel.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX; deltaX = 0; dragging = true; stop();
      }, { passive: true });
      carousel.addEventListener('touchmove', e => {
        if (!dragging) return;
        deltaX = e.touches[0].clientX - startX;
      }, { passive: true });
      carousel.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        if (Math.abs(deltaX) > 40) goTo(current + (deltaX < 0 ? 1 : -1));
        else start();
      });

      // La segunda diapositiva espera a que la página termine de cargar:
      // así no le compite el ancho de banda ni al catálogo ni a la imagen
      // que el cliente sí está mirando.
      if (document.readyState === 'complete') precargar(0);
      else window.addEventListener('load', () => precargar(0), { once: true });

      start();
    })();
