// ============================================================
// TIAGO STORE · El catalogo en vivo
// ============================================================
// Trae los productos de Supabase y se queda escuchando cambios: si
// editas un precio en /admin, esta pagina se actualiza sola sin que
// el cliente recargue.
//
// Le pasa la lista a la tienda por window.__aplicarCatalogo, que
// define js/tienda.js. Por eso este archivo va DESPUES de aquel.
// ============================================================

    import { subscribeProductos, precioFinal, formatBs, porcentajeDescuento }
      from './productos-service.js';
    import { subscribeJuegos } from './juegos-service.js';
    import { mapaDeStock, mapaDeRebajas } from './stock-tienda.js';
    import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-base.js';

    // Los IDs de la base son texto (un uuid), pero la tienda usa números
    // en los onclick: abrirCheckout(12). Para productos migrados usamos idLegacy;
    // para los que crees desde el admin, derivamos un número estable del ID.
    function idNumerico(p) {
      if (typeof p.idLegacy === 'number') return p.idLegacy;
      let h = 0;
      for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) | 0;
      return 1000000 + Math.abs(h % 8000000);
    }

    // Adaptador: traduce el producto de Supabase a la forma que la tienda ya usa.
    // Gracias a esto no hubo que reescribir el render, el carrito ni el pago QR.
    function aFormaTienda(p) {
      // La rebaja automática del stock que no se vende (la calcula la base,
      // ver mapaDeRebajas en js/stock-tienda.js) se muestra como una oferta
      // más: el precio normal tachado y el % contra ese precio.
      const rebaja = REBAJAS.get(p.id) || 0;
      const precio = Math.max(0, Math.round((precioFinal(p) - rebaja) * 100) / 100);
      return {
        id:          idNumerico(p),
        fid:         p.id,                       // ID real del producto
        cat:         p.categoria    || '',
        name:        p.nombre       || '',
        price:       precio,
        bs:          formatBs(precio),
        precioAntes: ((p.oferta && p.precioOferta > 0) || rebaja > 0) ? formatBs(p.precio) : '',
        descuento:   rebaja > 0 && p.precio > 0
                       ? Math.round((1 - precio / p.precio) * 100)
                       : porcentajeDescuento(p),
        rebaja,
        stars:       p.estrellas ?? 5,
        img:         p.imagenTexto  || p.nombre || '',
        imagenUrl:   p.imagen       || '',
        imagenFill:  p.imagenFill === true,
        imgColor:    p.imagenColor  || '#333333,#666666',
        tag:         p.etiqueta     || '',
        desc:        p.descripcion  || '',
        type:        p.tipo         || '',
        // Ficha del plan — si están vacíos, la tienda los deduce sola
        entrega:     p.entrega      || '',
        soporte:     p.soporte      || '',
        acceso:      p.acceso       || '',
        suscripcion: p.suscripcion  || '',
        soldOut:     p.activo    === false,
        destacado:   p.destacado === true,
        oferta:      p.oferta    === true,
        // Hay una cuenta comprada esperando: se entrega en el momento de
        // pagar, sin que vos tengas que hacer nada.
        entregaInmediata: (STOCK.get(p.id) || 0) > 0,
        // Cuántas hay: el carrito no deja pedir más que eso (0 = este
        // producto no tiene cuentas cargadas y se entrega a mano).
        stock:       STOCK.get(p.id) || 0,
        // Para ordenar por "El más nuevo". Los productos migrados del
        // catálogo viejo no tienen fecha: quedan en 0, detrás.
        nuevo:       p.fechaCreacion?.seconds || 0
      };
    }

    // ---------- STOCK ----------
    // Qué productos tienen cuenta lista para entregar. Llega aparte del
    // catálogo y suele tardar un poquito más, así que el catálogo se pinta
    // apenas llega y se vuelve a pintar cuando aparece el stock. Es mejor
    // mostrar los productos enseguida sin el cartel, que dejar la tienda en
    // blanco esperando un dato que es un adorno.
    let STOCK = new Map();
    let REBAJAS = new Map();
    let ultimoCatalogo = null;

    function aplicar(productos) {
      ultimoCatalogo = productos;
      window.__aplicarCatalogo(productos.map(aFormaTienda));
    }

    subscribeProductos(
      productos => {
        aplicar(productos);
        console.log(`%c✓ Catálogo cargado: ${productos.length} productos`,
                    'color:#22c55e;font-weight:bold');
      },
      error => window.__errorCatalogo(error.message)
    );

    // ---------- JUEGOS ----------
    // La tienda no vende juegos, pero el carrusel tiene banners de
    // recargas (Free Fire) que usan el logo del juego. También en vivo:
    // si le cambiás el logo desde /admin → Juegos, el banner lo sigue.
    subscribeJuegos(juegos => window.__aplicarJuegosCarrusel(juegos));

    mapaDeStock().then(mapa => {
      if (mapa.size === 0) return;          // nada en stock: no hay nada que repintar
      STOCK = mapa;
      if (ultimoCatalogo) aplicar(ultimoCatalogo);
      console.log(`%c⚡ Entrega inmediata en ${mapa.size} producto(s)`,
                  'color:#128C7E;font-weight:bold');
    });

    // ---------- DÓNDE SE CAE LA VENTA ----------
    // La tienda anota tres pasos de la compra: abrió el carrito, llegó al
    // paso 3 y fue al QR (ver supabase/07-embudo.sql; el panel los muestra
    // en Inicio). Por navegador va un número al azar, que no dice quién es.
    //
    // Va con fetch y keepalive, no con sb.rpc: el último paso se anota
    // justo cuando la página se va a pagar-qr.html, y keepalive es lo que
    // deja que el pedido termine aunque la página ya no esté.
    const SESION = (() => {
      const nueva = () => (crypto.randomUUID ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2));
      try {
        let s = localStorage.getItem('embudo_sesion');
        if (!s) { s = nueva(); localStorage.setItem('embudo_sesion', s); }
        return s;
      } catch (e) {
        return nueva();   // modo incógnito: cuenta igual, solo por esta visita
      }
    })();
    const anotados = new Set();   // cada paso una vez por visita: la base igual lo filtra por día

    window.__anotarPaso = paso => {
      if (anotados.has(paso)) return;
      anotados.add(paso);
      try {
        fetch(`${SUPABASE_URL}/rest/v1/rpc/anotar_paso`, {
          method: 'POST',
          keepalive: true,
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ p_sesion: SESION, p_paso: paso })
        }).catch(() => {});   // si no llega, no se entera nadie: es estadística
      } catch (e) { /* idem */ }
    };

    // ---------- REBAJAS ----------
    // Igual que el stock: llegan aparte y, si hay alguna, se repinta. El
    // carrito toma los precios nuevos solo (reconstruirCarrito en tienda.js).
    mapaDeRebajas().then(mapa => {
      if (mapa.size === 0) return;
      REBAJAS = mapa;
      if (ultimoCatalogo) aplicar(ultimoCatalogo);
    });
