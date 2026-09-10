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
    import { mapaDeStock } from './stock-tienda.js';

    // Los IDs de la base son texto (un uuid), pero la tienda usa números
    // en los onclick: openProduct(12). Para productos migrados usamos idLegacy;
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
      const precio = precioFinal(p);
      return {
        id:          idNumerico(p),
        fid:         p.id,                       // ID real del producto
        cat:         p.categoria    || '',
        name:        p.nombre       || '',
        price:       precio,
        bs:          formatBs(precio),
        precioAntes: (p.oferta && p.precioOferta > 0) ? formatBs(p.precio) : '',
        descuento:   porcentajeDescuento(p),
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

    mapaDeStock().then(mapa => {
      if (mapa.size === 0) return;          // nada en stock: no hay nada que repintar
      STOCK = mapa;
      if (ultimoCatalogo) aplicar(ultimoCatalogo);
      console.log(`%c⚡ Entrega inmediata en ${mapa.size} producto(s)`,
                  'color:#128C7E;font-weight:bold');
    });
