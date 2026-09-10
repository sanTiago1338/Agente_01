// ============================================================
// TIAGO STORE · La tienda
// ============================================================
// Estaba dentro de index.html, en un <script> de 1.890 lineas.
//
// Es un script CLASICO, no un modulo, y tiene que seguir siendolo:
// las funciones que define (openProduct, filterProducts, addToCart...)
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
      // El carrito se rearma con los precios frescos que acaban de llegar.
      reconstruirCarrito();
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
    const ITEMS_PER_PAGE = 12;
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

    function getStars(n) {
      let s = '';
      for(let i=1;i<=5;i++) s += `<span class="star ${i<=n?'on':'off'}">★</span>`;
      return s;
    }

    function addToCart(id) {
      const product = PRODUCTS.find(p => p.id === id);
      if(!product) return;
      if(product.soldOut) { showToast(`✖ ${product.name.substring(0, 30)} está agotado`); return; }

      const existingItem = cart.find(item => item.id === id);
      if(existingItem) {
        existingItem.qty += 1;
      } else {
        cart.push({ ...product, qty: 1 });
      }
      
      updateCartCount();
      guardarCarrito();
      showToast(`✓ ${product.name.substring(0, 30)}... agregado al carrito`);
    }

    function updateCartCount() {
      cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
      document.getElementById('1').textContent = cartCount;
      document.getElementById('7').textContent = cartCount;
    }

    function showToast(msg) {
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--verde);
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        z-index: 300;
        animation: slideUp 0.3s ease;
      `;
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
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
      'espn (cuenta completa)': 'Img/Disney%20%2B%20ESPN%20Completo.jpg',
      'disney plus + espn':     'Img/Disney%20%2B%20ESPN.jpg',
      'youtube premium':        'Img/You%20Tube.jpg',
      'zona iptv':              'Img/Zona%20IPTV.jpg',
      'canva pro':              'Img/Canva%20Pro.jpeg',
      'canva edu':              'Img/Canva%20EDU.jpg',
      'chatgpt pro':            'Img/ChatGPT%20Pro.svg',
      'claude ia pro renovable (cuenta asignada': 'Img/Claude%20Pro%20Completa.jpeg',
      'hbo max (3 meses':       'Img/Hho%20Max%203%20meses.jpg',
      'notion business':        'Img/NOTION%20BUSINESS%20AI.png',
      'rixx':                   'Img/RIXX%20PRO%20AI.png',
      'wink studio':            'Img/WINK%20STUDIO%20VIDEO%20EDITOR.png',
      'ibispaint':              'Img/IBISPAINT%20PREMIUM.png',
      'moclow':                 'Img/MOCLOW%20AI.png',
      'pelidom':                'Img/PELIDOM.png',
      'pixlr':                  'Img/PIXLR%20PREMIUM.png',
      'linear plan':            'Img/LINEAR%20PLAN%20BUSINESS%20PROFESIONAL%20(2%20A%C3%91OS).png',
      'beautiful ai':           'Img/BEAUTIFUL%20AI.png',
      'iqiyi':                  'Img/iQIYI%20VIP.png',
      'hallow':                 'Img/HALLOW.png',
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
      'apple music':   'Img/Apple%20Music.jpg',
      'capcut':        'Img/Cap%20cut.jpg',
      'chatgpt':       'Img/Chat%20Gpt.jpg',
      'claude':        'Img/Claude.jpg',
      'deezer':        'Img/Deezer.jpg',
      'drama box':     'Img/Drama%20Box.jpg',
      'flujo':         'Img/FLUJO%20TV.jpg',
      'free fire':     'Img/Free%20fire.jpg',
      'gamma':         'Img/Gamma.jpg',
      'gemini':        'Img/Gemini.jpg',
      'grok':          'Img/Grok.jpg',
      'hbo':           'Img/Hbo.jpeg',
      'iptv':          'Img/IPTV.jpg',
      'leonardo':      'Img/Leonardo%20IA.jpg',
      'magis':         'Img/Magis%20TV.jpg',
      'netflix':       'Img/Netflix.jpg',
      'paramount':     'Img/Paramount%2B.png',
      'perplexity':    'Img/Perplexity.jpg',
      'prime video':   'Img/Prime%20Video.jpg',
      'spotify':       'Img/Spotyfi.jpg',
      'tele latino':   'Img/Tele%20Latino.jpg',
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
    // en un cuadrito de 265 px. Las de /Img/opt son JPEG de 900 px: hasta 96%
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
      grid.innerHTML = Array.from({ length: ITEMS_PER_PAGE }, () => `
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
      const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
      if (currentPage > totalPages) currentPage = 1;

      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      const pageItems = grupos.slice(start, start + ITEMS_PER_PAGE);

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
                style="--acento:${vivo}; --acento-txt:${legible}"
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
    // Reutiliza el mismo modal que ya usaba openProduct(), así el
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
        const filas = caracteristicasDe(pl).map(([ic, et, val]) =>
          `<li><span>${ic}</span> ${et} <b>${val}</b></li>`).join('');

        return `
        <div class="plan-item${agotado ? ' plan-item--agotado' : ''}">
          <div class="plan-item-cab">
            <img class="plan-logo" src="${urlPlan}" alt="" loading="lazy"
                 onerror="this.onerror=null;this.src=generateLogoSvg('${pl.name.replace(/'/g, "\\'")}','${pl.imgColor}');">
            <div class="plan-chips">
              <span class="plan-chip ${agotado ? 'off' : 'ok'}">${agotado ? '● Agotado' : '● Disponible'}</span>
              ${!agotado && pl.entregaInmediata ? '<span class="plan-chip ya">⚡ Entrega inmediata</span>' : ''}
              <span class="plan-chip zona">🌎 Global</span>
              ${avisoDatos(pl).chip}
            </div>
          </div>

          <div class="plan-item-nombre">${pl.name}</div>
          <ul class="plan-features">${filas}</ul>

          <div class="plan-item-pie">
            <div>
              <div class="plan-precio-lbl">Precio final</div>
              <div class="plan-precio">${sinPrecio(pl) ? 'A consultar' : `${pl.bs}${pl.precioAntes ? `<span class="antes">${pl.precioAntes}</span>` : ''}`}</div>
            </div>
            ${sinPrecio(pl) && !agotado
              ? `<a class="plan-comprar" href="${waConsulta(pl.name)}" target="_blank" rel="noopener">💬 Consultar</a>`
              : `<button class="plan-comprar" ${agotado ? 'disabled' : ''}
                         onclick="${agotado ? '' : `abrirCheckout(${pl.id})`}">
                   🛒 Comprar
                 </button>`}
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

      document.getElementById('9').classList.add('ancho');
      document.getElementById('8').classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('9').scrollTop = 0;
    }


    // ==========================================================
    // CHECKOUT DE UN PLAN
    // ==========================================================
    // Se abre desde el botón "Comprar" de cada plan. Muestra el
    // resumen, exige aceptar los términos y recién ahí habilita
    // el botón que lleva al pago con QR.
    // ==========================================================

    // Rubro del encabezado. Para seguidores y combos no corresponde
    // hablar de suscripción, así que se dice "Servicio".
    const RUBRO = {
      streaming: 'Suscripción Streaming',
      musica:    'Suscripción Música',
      ia:        'Suscripción IA & Tools',
      vpn:       'Suscripción VPN',
      combos:    'Servicio Combo',
      seguidores:'Servicio Seguidores',
      juegos:    'Recarga de Juegos'
    };
    const rubroDe = p => RUBRO[p.cat] || 'Servicio Digital';

    // Cuántos días dura el plan. Mira primero el nombre y después el campo
    // suscripción, porque casi todos los productos tienen la suscripción
    // vacía y la duración solo está escrita en el nombre del plan.
    //
    // Esta misma regla está copiada en la base, en dias_del_plan(): de ahí
    // sale la fecha de vencimiento que se guarda con el pedido. Si tocás
    // una, tocá la otra, o el cliente va a ver una duración y nosotros
    // vamos a tener anotada otra.
    function diasDelPlan(p) {
      for (const parte of [(p.name || ''), (p.suscripcion || '')]) {
        const t = parte.toLowerCase();
        if (!t) continue;

        const meses   = t.match(/(\d+)\s*mes/);
        if (meses)   return Math.min(730, Math.max(1, Number(meses[1]) * 30));
        const dias    = t.match(/(\d+)\s*d[ií]a/);
        if (dias)    return Math.min(730, Math.max(1, Number(dias[1])));
        const semanas = t.match(/(\d+)\s*semana/);
        if (semanas) return Math.min(730, Math.max(1, Number(semanas[1]) * 7));

        if (/\banual\b|1\s*a[ñn]o/.test(t)) return 365;
        if (/semestral/.test(t))            return 180;
        if (/trimestral/.test(t))           return 90;
        if (/mensual/.test(t))              return 30;
        if (/quincenal/.test(t))            return 15;
        if (/semanal/.test(t))              return 7;
      }
      // Lo más común del catálogo. Es una estimación, no un dato.
      return 30;
    }

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

    // Cuándo se le vencería si compra hoy. Es una cuenta aproximada: el
    // plan le empieza a correr cuando se le entrega la cuenta, no cuando
    // toca pagar. La fecha buena la anota la base al entregar.
    function fechaDeVencimiento(p) {
      const d = new Date();
      d.setDate(d.getDate() + diasDelPlan(p));
      return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    // Lo mismo, escrito para que lo lea una persona.
    function duracionDe(p) {
      const d = diasDelPlan(p);
      if (d === 365) return '1 año (365 días)';
      if (d % 30 === 0) {
        const meses = d / 30;
        return meses === 1 ? '1 mes (30 días)' : `${meses} meses (${d} días)`;
      }
      return `${d} días`;
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
    // El mismo bloque se usa en el checkout de un plan y en el carrito:
    // el cliente confirma que sabe qué compra antes de habilitar el pago.
    const TERMINOS = [
      'Soy consciente de lo que estoy comprando: revisé el plan, el precio y la duración, y es exactamente el servicio que quiero.',
      'Sé que es un producto digital y que la entrega llega por WhatsApp de 5 a 30 minutos después del pago.',
      'Entiendo que, una vez entregados los datos de acceso, no corresponde devolución del dinero.',
      'Me comprometo a no cambiar la contraseña, el correo ni los datos de la cuenta.',
      'Si el servicio falla, aviso por WhatsApp y Tiago Store lo repone o lo soluciona.'
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

    function abrirCheckout(id) {
      const p = PRODUCTS.find(x => x.id === id);
      if (!p || p.soldOut) return;

      // Tocar "Comprar" ya lo guarda en el carrito.
      //
      // Antes abrir el checkout no guardaba nada: si el cliente volvía
      // atrás a mirar otra cosa, lo que había elegido se perdía y tenía
      // que buscarlo de nuevo. Ahora queda ahí, y si sigue eligiendo se
      // le van sumando y paga todo junto desde el carrito.
      //
      // Se agrega solo si NO estaba: abrir el mismo producto tres veces
      // no puede dejarle cantidad 3. Por eso no se usa addToCart(), que
      // suma de a uno y además muestra un cartelito que acá sería ruido:
      // el cliente ya está viendo abrirse el checkout.
      if (p.price > 0 && !cart.find(item => item.id === id)) {
        cart.push({ ...p, qty: 1 });
        updateCartCount();
        guardarCarrito();
      }

      const url = getImageUrl(p.name, p.cat, p.imgColor, p.imagenUrl);
      const vivo = acentoDe(p);
      const nombreSeguro = p.name.replace(/'/g, "\\'");

      document.getElementById('10').innerHTML = `
        <div style="--acento:${vivo}">
          <div class="ck-cab">
            <h3>Comprar ${p.name}</h3>
            <button class="ck-cerrar" onclick="closeModal()" aria-label="Cerrar">✕</button>
          </div>

          <div class="ck-caja ck-resumen">
            <img class="ck-logo" src="${url}" alt=""
                 onerror="this.onerror=null;this.src=generateLogoSvg('${nombreSeguro}','${p.imgColor}');">
            <div>
              <div class="ck-rubro">${rubroDe(p)}</div>
              <div class="ck-titulo">${p.name}</div>
              <div class="ck-meta">
                <span>📍 Global</span><i>|</i>
                <span>⏳ ${duracionDe(p)}</span><i>|</i>
                <span>⚡ Entrega de 5 a 30 minutos</span>
              </div>
            </div>
          </div>

          ${sinPrecio(p) ? '' : `
          <div class="ck-caja ck-renovar">
            <div class="ck-renovar-fila">
              <div class="ck-renovar-txt">
                <b>¿Te recordamos renovar al vencer?</b>
                <p>Te escribimos por WhatsApp unos días antes del vencimiento para
                   que no pierdas el servicio. No se cobra nada automáticamente.</p>
              </div>
              <label class="ck-switch">
                <input type="checkbox" id="ckRenovar">
                <span class="ck-switch-pista"><span class="ck-switch-bola"></span></span>
              </label>
            </div>

            <!-- Aparece recién al prender el interruptor: si no vamos a
                 escribirle, pedirle el número es preguntar por gusto. -->
            <div class="ck-renovar-tel" id="ckRenovarTel" hidden>
              <label for="ckTel">¿A qué WhatsApp te escribimos?</label>
              <div class="ck-tel-campo">
                <span class="ck-tel-pais">🇧🇴 +591</span>
                <input type="tel" id="ckTel" inputmode="numeric" maxlength="14"
                       autocomplete="tel-national" placeholder="7 123 4567">
              </div>
              <p class="ck-tel-error" id="ckTelError" hidden></p>
              <p class="ck-tel-nota">Comprando hoy, el plan se te vence
                 alrededor del <b>${fechaDeVencimiento(p)}</b>.
                 Te escribimos unos días antes.</p>
            </div>
          </div>`}
          <!-- Sin precio no hay pedido a donde colgar el aviso: la compra
               se arregla por WhatsApp. Pedirle el número acá sería pedirlo
               para tirarlo. -->


          ${sinPrecio(p) ? '' : avisoDatos(p).caja}

          ${sinPrecio(p) ? '' : bloqueTerminos('ckTerminos')}

          ${sinPrecio(p) ? `
          <div class="ck-caja ck-pago">
            <div class="ck-total-fila">
              <span class="ck-total-lbl">Precio</span>
              <span class="ck-total-val" style="font-size:1.5rem;">A consultar</span>
            </div>
            <a class="ck-pagar" href="${waConsulta(p.name)}" target="_blank" rel="noopener"
               style="text-decoration:none; background:#25d366; box-shadow:none;">
              💬 Consultar por WhatsApp
            </a>
            <p class="ck-aviso">Te pasamos el precio y la disponibilidad al momento.</p>
          </div>` : `
          <div class="ck-caja ck-pago">
            <div class="ck-total-fila">
              <span class="ck-total-lbl">Total a pagar</span>
              <span class="ck-total-val">${p.bs}${p.precioAntes ? `<span class="antes">${p.precioAntes}</span>` : ''}</span>
            </div>
            <button class="ck-pagar" id="ckPagar" disabled>
              🛒 Pagar y confirmar
            </button>
            <p class="ck-aviso">Te llevamos al QR de BancoSol para completar el pago.</p>
          </div>`}

          <button class="ck-volver" onclick="volverAPlanes(${p.id})">
            ${grupoDe(p.id)?.planes.length > 1 ? '← Ver los otros planes' : '← Volver'}
          </button>
        </div>`;

      // Sin aceptar los términos, el botón de pago queda bloqueado.
      // Si el producto no tiene precio no hay pago ni términos: en su
      // lugar quedó el enlace de consulta, así que no hay nada que atar.
      const terminos = document.getElementById('ckTerminos');
      const boton    = document.getElementById('ckPagar');
      const renovar  = document.getElementById('ckRenovar');
      const cajaTel  = document.getElementById('ckRenovarTel');
      const campoTel = document.getElementById('ckTel');
      const errorTel = document.getElementById('ckTelError');

      // El campo del número se abre y se cierra con el interruptor. Puede
      // no haber interruptor: los productos sin precio no llevan esta caja.
      if (renovar && cajaTel && campoTel) {
        renovar.addEventListener('change', () => {
          cajaTel.hidden = !renovar.checked;
          if (renovar.checked) campoTel.focus();
          else { errorTel.hidden = true; campoTel.classList.remove('mal'); }
          if (terminos && boton) refrescarBoton();
        });

        // Solo los 8 números del celular. Si pega el número entero con el
        // 591 adelante —que es como te lo mandan por WhatsApp— se le saca
        // solo, en vez de decirle que está mal.
        campoTel.addEventListener('input', () => {
          let limpio = campoTel.value.replace(/\D/g, '');
          if (limpio.length > 8 && limpio.startsWith('591')) limpio = limpio.slice(3);
          limpio = limpio.slice(0, 8);
          if (limpio !== campoTel.value) campoTel.value = limpio;
          // El error se borra apenas empieza a corregirlo. Dejarlo puesto
          // mientras escribe es retarlo por algo que ya está arreglando.
          errorTel.hidden = true;
          campoTel.classList.remove('mal');
          if (terminos && boton) refrescarBoton();
        });
      }

      // El botón de pagar solo se abre con los términos aceptados y —si
      // pidió el aviso— con un número que sirva para escribirle.
      function refrescarBoton() {
        boton.disabled = !terminos.checked ||
                         (renovar.checked && !telValido(campoTel.value));
      }

      if (terminos && boton) {
        terminos.addEventListener('change', refrescarBoton);

        // Al confirmar se genera el QR con el plan y la preferencia elegida
        boton.addEventListener('click', () => {
          if (!terminos.checked) return;

          const quiereAviso = renovar.checked;
          if (quiereAviso && !telValido(campoTel.value)) {
            errorTel.textContent = 'Escribí tu celular completo: 8 números que empiezan con 6 o 7.';
            errorTel.hidden = false;
            campoTel.classList.add('mal');
            campoTel.focus();
            return;
          }

          pagarConQR(p.id, quiereAviso, quiereAviso ? normalizarTel(campoTel.value) : '');
        });
      }

      // El checkout es angosto: sacamos el ancho del panel de planes
      document.getElementById('9').classList.remove('ancho');
      document.getElementById('8').classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('9').scrollTop = 0;
    }

    // Genera el QR de pago para un plan.
    // Igual que payProductQR(), pero pasando si el cliente pidió
    // que le recordemos renovar, para que llegue con el pedido.
    function pagarConQR(id, recordarRenovacion, whatsapp) {
      const p = PRODUCTS.find(x => x.id === id);
      if (!p || p.price <= 0) return;

      // Se va a pagar SOLO este producto, así que sale del carrito.
      //
      // Si no, pasa esto: el cliente toca Comprar (se guarda), paga ese
      // producto, y más tarde entra al carrito y lo ve ahí todavía. O lo
      // paga dos veces, o te escribe preguntando si se cobró bien. Las dos
      // son peores que hacerle volver a agregarlo si abandonó el pago.
      const i = cart.findIndex(item => item.id === id);
      if (i !== -1) {
        cart.splice(i, 1);
        updateCartCount();
        guardarCarrito();
      }
      // fid = el id real del producto en la base. Va para que la página de
      // pago pueda crear un pedido de verdad y entregar la cuenta sola.
      // Si el producto todavía no está migrado, viaja igual y la página de
      // pago lo ignora: sigue con el camino de WhatsApp de siempre.
      const cartData = [{ fid: p.fid, name: p.name.substring(0, 80), price: p.price, qty: 1, ...productFlags(p) }];
      const params = new URLSearchParams({
        cart: encodeURIComponent(JSON.stringify(cartData)),
        total: p.price.toFixed(2),
      });
      // El aviso de renovación viaja con el número: sin a dónde escribir,
      // la preferencia sola no sirve para nada.
      if (recordarRenovacion && whatsapp) {
        params.set('recordar', '1');
        params.set('wa', whatsapp);
      }
      window.location.href = `pagar-qr.html?${params.toString()}`;
    }


    // Vuelve del checkout al panel de planes de la misma plataforma.
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

    function openProduct(id) {
      const p = PRODUCTS.find(x => x.id === id);
      if(!p) return;

      const imageUrl = getImageUrl(p.name, p.cat, p.imgColor, p.imagenUrl);

      const stars = '★'.repeat(p.stars) + '☆'.repeat(5 - p.stars);
      const whatsappMsg = `🦁 *TIAGO STORE BOLIVIA* 🦁\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nMe permito solicitar el siguiente servicio:\n\n📌 *SERVICIO SOLICITADO*\n──────────────────────────\n🎯 *${p.name}*\n💵 Precio: *${p.bs}*\n⭐ Valoración: ${stars}\n\n📝 _Descripción:_\n_${p.desc}_\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 *CONSULTAS*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n✔️ ¿Disponibilidad del servicio?\n✔️ ¿Métodos de pago aceptados?\n\nQuedo atento/a a su respuesta.\n*Muchas gracias.* 🙏`;
      const whatsappUrl = `https://wa.me/59157707335?text=${encodeURIComponent(whatsappMsg)}`;

      const isGeneratedModal = imageUrl.startsWith('data:');
      document.getElementById('10').innerHTML = `
        <div class="product-img" style="height:160px; border-radius:10px; margin-bottom:1rem; overflow:hidden;">
          <img class="${isGeneratedModal ? 'product-logo-generated' : 'product-logo-img'}" src="${imageUrl}" alt="${p.name}" ${isGeneratedModal ? '' : 'style="width:100px; height:100px; border-radius:18px;"'} onerror="this.onerror=null;this.src=generateLogoSvg('${p.name.replace(/'/g,"\\'")}','${p.imgColor}');this.className='product-logo-generated';">
        </div>
        <div class="modal-price"${p.soldOut ? ' style="text-decoration:line-through; opacity:0.55;"' : ''}>${p.bs}${p.precioAntes ? `<span class="product-price-antes" style="font-size:0.95rem;">${p.precioAntes}</span><span class="product-badge-desc" style="position:static; margin-left:0.5rem; display:inline-block;">-${p.descuento}%</span>` : ''}</div>
        <div class="modal-stars">${getStars(p.stars)}</div>
        <div class="modal-name">${p.name}</div>
        <div class="modal-seller">Tiago Store</div>
        <div class="modal-desc">${p.desc}</div>
        ${p.soldOut ? `
        <div style="background:linear-gradient(135deg,#8b0000,#e50914); color:#fff; padding:0.85rem; border-radius:10px; text-align:center; font-weight:900; letter-spacing:2px; font-size:1.1rem; border:2px solid #fff; margin-bottom:0.5rem;">✖ PRODUCTO AGOTADO</div>
        ` : `
        <button onclick="addToCart(${p.id})" class="modal-btn" style="background:var(--rojo); color:white; width:100%;">
          🛒 Agregar al Carrito
        </button>

        ${p.price > 0 ? `<button onclick="abrirCheckout(${p.id})" class="modal-btn" style="background:linear-gradient(135deg, #ffd700, #ffb300); color:#000; width:100%; font-weight:900; margin-top:0.5rem; display:flex; align-items:center; justify-content:center; gap:0.5rem;">
          <span style="font-size:1.2rem;">QR</span> Comprar con QR — ${p.bs}
        </button>` : ''}
        `}

        <div class="wa-order-box">
          <div class="wa-order-box-title">
            <svg class="btn-wa-icon" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Pedir por WhatsApp
          </div>
          <div class="wa-order-summary">
            <span class="wa-order-summary-name">${p.name}</span>
            <span class="wa-order-summary-price">${p.bs}</span>
          </div>
          <a href="${whatsappUrl}" target="_blank" class="btn-wa-premium">
            <svg class="btn-wa-icon" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Enviar Pedido Ahora
          </a>
          <div class="wa-note">⚡ Respuesta inmediata · Entrega garantizada</div>
        </div>

        <button class="modal-btn modal-btn-close" onclick="closeModal()" style="width:100%; margin-top:0.5rem;">✕ Cerrar</button>
      `;
      document.getElementById('8').classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeModal(e) {
      if(!e || e.target === document.getElementById('8')) {
        document.getElementById('8').classList.remove('open');
        // El panel de planes ensancha el modal: lo devolvemos a su ancho
        document.getElementById('9').classList.remove('ancho');
        document.body.style.overflow = '';
      }
    }

    function openCart() {
      if(cart.length === 0) {
        alert('🛒 Carrito vacío\n\nAgrega productos antes de enviar el pedido.\nEscríbenos directamente por WhatsApp:\n+591 57707335');
        return;
      }

      let html = `
        <div class="ck-cab">
          <h3>Tu carrito</h3>
          <button class="ck-cerrar" onclick="closeModal()" aria-label="Cerrar">✕</button>
        </div>
        <div style="max-height: 60vh; overflow-y: auto;">`;
      let total = 0;
      cart.forEach((item, idx) => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        html += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem; border-bottom:1px solid var(--borde); gap:0.5rem;">
            <div style="flex:1;">
              <div style="font-weight:600; color:var(--texto); font-size:0.9rem;">${item.name.substring(0,35)}</div>
              <div style="font-size:0.75rem; color:var(--texto-dim);">${item.bs}</div>
            </div>
            <div style="display:flex; align-items:center; gap:0.3rem;">
              <button onclick="updateQty(${idx}, -1)" style="background:var(--negro3); border:1px solid var(--borde); color:var(--texto); width:24px; height:24px; border-radius:4px; cursor:pointer; font-size:0.8rem;">−</button>
              <span style="width:30px; text-align:center; color:var(--texto);">${item.qty}</span>
              <button onclick="updateQty(${idx}, 1)" style="background:var(--negro3); border:1px solid var(--borde); color:var(--texto); width:24px; height:24px; border-radius:4px; cursor:pointer; font-size:0.8rem;">+</button>
            </div>
            <button onclick="removeFromCart(${idx})" style="background:var(--rojo); color:white; border:none; padding:0.25rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">Quitar</button>
          </div>
        `;
      });
      html += `
        </div>
        <div style="background:var(--negro3); padding:1rem; border-radius:8px; margin-top:1rem;">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
            <span style="color:var(--texto-dim);">Total (${cartCount} items):</span>
            <strong style="color:var(--dorado); font-size:1.1rem;">${total.toFixed(2)} Bs</strong>
          </div>
        </div>
        <div class="wa-order-box" style="margin-top:1rem;">
          <div class="wa-order-box-title">
            <svg class="btn-wa-icon" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Confirmar Pedido
          </div>
          ${bloqueTerminos('cartTerminos')}
          <button id="cartPagarQR" disabled onclick="payWithQR()" style="display:flex; align-items:center; justify-content:center; gap:0.6rem; width:100%; padding:0.85rem 1.5rem; background:linear-gradient(135deg, #ffd700, #ffb300); color:#000; border:none; border-radius:12px; font-weight:900; font-size:0.95rem; cursor:pointer; margin-bottom:0.5rem; transition:transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 25px rgba(255,215,0,0.4)';" onmouseout="this.style.transform='';this.style.boxShadow='';">
            <span style="font-size:1.3rem;">QR</span>
            Pagar con QR BancoSol — ${total.toFixed(2)} Bs
          </button>
          <div style="text-align:center; font-size:0.7rem; color:var(--tinta-suave); margin-bottom:1rem;">Pago instantaneo · Sin salir de la app</div>
          <div style="text-align:center; font-size:0.75rem; color:var(--texto-dim); margin-bottom:0.5rem;">o tambien puedes pedir por WhatsApp:</div>
          <a href="https://wa.me/59157707335?text=${encodeURIComponent('🦁 *TIAGO STORE BOLIVIA* 🦁\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nAdjunto el detalle de mi pedido:\n\n🛒 *RESUMEN DE PEDIDO*\n──────────────────────────\n' + cart.map(i => `✔️ ${i.qty}x ${i.name} — ${i.bs}`).join('\n') + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL A PAGAR: ' + total.toFixed(2) + ' Bs*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nSolicito confirmación de:\n✔️ Disponibilidad de los productos\n✔️ Métodos de pago disponibles\n\nQuedo en espera de su respuesta.\n*Muchas gracias.* 🙏')}" target="_blank" class="btn-wa-premium">
            <svg class="btn-wa-icon" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Pedir por WhatsApp — ${total.toFixed(2)} Bs
          </a>
          <div class="wa-note">Respuesta inmediata · Entrega garantizada</div>
        </div>
        <button onclick="closeModal()" style="width:100%; margin-top:0.5rem; background:var(--negro3); color:var(--texto); padding:0.75rem; border-radius:8px; border:1px solid var(--borde); cursor:pointer; font-weight:600; font-size:0.85rem;">Cerrar</button>
      `;

      document.getElementById('10').innerHTML = html;

      // Sin términos aceptados, el botón de pago queda bloqueado
      const terminos = document.getElementById('cartTerminos');
      terminos.addEventListener('change', () => {
        document.getElementById('cartPagarQR').disabled = !terminos.checked;
      });

      // El panel de planes ensancha el modal: el carrito va en el ancho normal
      document.getElementById('9').classList.remove('ancho');
      document.getElementById('8').classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function updateQty(idx, change) {
      if(idx >= 0 && idx < cart.length) {
        cart[idx].qty += change;
        if(cart[idx].qty <= 0) removeFromCart(idx);
        else {
          updateCartCount();
          openCart();
        }
      }
    }

    function removeFromCart(idx) {
      if(idx >= 0 && idx < cart.length) {
        cart.splice(idx, 1);
        updateCartCount();
        guardarCarrito();
        if(cart.length === 0) closeModal();
        else openCart();
      }
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

    // Aviso para que el cliente sepa ANTES de pagar que le vamos a pedir
    // el correo, y no se sorprenda recién en la pantalla del QR.
    // Sale de productFlags(), así que cualquier producto que pida datos lo
    // muestra solo, sin tener que escribirlo a mano en la descripción.
    function avisoDatos(producto) {
      const f = productFlags(producto);
      if (!f.needsEmail && !f.needsUsername) return { chip: '', caja: '' };

      const titulo = f.needsUsername
        ? 'Te pediremos tu correo y tu usuario al pagar'
        : 'Te pediremos tu correo al pagar';

      return {
        chip: '<span class="plan-chip correo">📧 Pide tu correo</span>',
        caja: `
          <div class="ck-caja ck-correo">
            <span class="ck-correo-ico">📧</span>
            <div>
              <b>${titulo}</b>
              <p>Este servicio se activa sobre tu propia cuenta. Cuando toques
                 pagar vas a ver el campo para escribirlo.</p>
            </div>
          </div>`
      };
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

    function payProductQR(id) {
      const p = PRODUCTS.find(x => x.id === id);
      if (!p || p.price <= 0) return;
      // fid = el id real del producto en la base. Va para que la página de
      // pago pueda crear un pedido de verdad y entregar la cuenta sola.
      // Si el producto todavía no está migrado, viaja igual y la página de
      // pago lo ignora: sigue con el camino de WhatsApp de siempre.
      const cartData = [{ fid: p.fid, name: p.name.substring(0, 80), price: p.price, qty: 1, ...productFlags(p) }];
      const params = new URLSearchParams({
        cart: encodeURIComponent(JSON.stringify(cartData)),
        total: p.price.toFixed(2),
      });
      window.location.href = `pagar-qr.html?${params.toString()}`;
    }

    function payWithQR() {
      // Sin términos aceptados no se genera el QR
      const terminos = document.getElementById('cartTerminos');
      if (terminos && !terminos.checked) return;

      const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
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
      window.location.href = `pagar-qr.html?${params.toString()}`;
    }

    // Init
    renderProducts();

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
