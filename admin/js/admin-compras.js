// ============================================================
// TIAGO STORE · Pedidos juntados en compras
// ============================================================
// Desde el carrito, una compra de 2 Netflix y 1 Disney son TRES filas en
// la tabla pedidos —una por cuenta que se entrega— con el mismo "grupo".
// Pero es UNA venta: se paga con una transferencia, se confirma con un
// botón y el descuento combo es de la compra entera.
//
// Ventas e Inicio la muestran como lo que es. Las cuentas salen de acá, en
// un solo lugar, para que las dos pantallas no digan cosas distintas.
//
// Los pedidos de antes del carrito no tienen grupo: cada uno es su propia
// compra, como siempre.
// ============================================================

// Del estado que más te necesita al que menos. Una compra con una línea
// sin stock y otra entregada se ve como "sin stock": es lo que falta hacer.
export const URGENCIA = ['sin_stock', 'pagado', 'esperando_pago', 'vencido', 'entregado', 'cancelado'];

const bs = n => Number(n || 0);

/**
 * Los pedidos juntados por compra, en el mismo orden en que llegaron (si
 * venían del más nuevo al más viejo, así quedan). Dentro de cada compra,
 * las líneas van por número.
 *
 * total     = lo que se cobra: la suma de "precio", que ya tiene el
 *             descuento combo aplicado (ver crear_compra en la base).
 * descuento = cuánto se le sacó a la compra por combo.
 */
export function agruparCompras(pedidos) {
  const porClave = new Map();
  for (const p of pedidos) {
    const clave = p.grupo || p.id;
    if (!porClave.has(clave)) porClave.set(clave, { clave, lineas: [] });
    porClave.get(clave).lineas.push(p);
  }

  return [...porClave.values()].map(c => {
    c.lineas.sort((a, b) => Number(a.numero) - Number(b.numero));
    c.primera   = c.lineas[0];
    c.total     = c.lineas.reduce((s, p) => s + bs(p.precio), 0);
    c.descuento = c.lineas.reduce((s, p) => s + bs(p.descuento), 0);
    return c;
  });
}

/** "#97", "#97–99", o "#97 +2" si entre medio se coló otra compra. */
export function numerosDeCompra(lineas) {
  const nums = lineas.map(p => Number(p.numero)).sort((a, b) => a - b);
  const a = nums[0], z = nums[nums.length - 1];
  if (nums.length === 1) return `#${a}`;
  return z - a + 1 === nums.length ? `#${a}–${z}` : `#${a} +${nums.length - 1}`;
}

/**
 * Las unidades del mismo producto, juntas: 2 filas de Netflix son
 * "Netflix ×2". Con porEstado, además se separan por estado: si una se
 * entregó y la otra quedó sin stock, son dos renglones distintos.
 *
 * "unitario" es el precio normal, sin el descuento combo: el descuento va
 * en su propio renglón, como en el carrito y en la página del QR.
 */
export function productosDeCompra(lineas, porEstado = false) {
  const m = new Map();
  for (const p of lineas) {
    const k = (p.producto_id || p.producto_nombre) + (porEstado ? '|' + p.estado : '');
    if (!m.has(k)) {
      m.set(k, {
        nombre:   p.producto_nombre,
        estado:   p.estado,
        unitario: bs(p.precio) + bs(p.descuento),
        lineas:   []
      });
    }
    m.get(k).lineas.push(p);
  }
  return [...m.values()].map(x => ({ ...x, cant: x.lineas.length }));
}

/** "Netflix ×2 + Disney": lo que se compró, en un renglón. */
export function nombreDeCompra(lineas) {
  return productosDeCompra(lineas)
    .map(x => x.cant > 1 ? `${x.nombre} ×${x.cant}` : x.nombre)
    .join(' + ');
}

/** El estado que manda en la compra: el que más te necesita. */
export function estadoPrincipal(lineas) {
  let mejor = null;
  for (const p of lineas) {
    const i = URGENCIA.indexOf(p.estado);
    const j = mejor === null ? Infinity : URGENCIA.indexOf(mejor);
    if (mejor === null || (i !== -1 && i < j)) mejor = p.estado;
  }
  return mejor;
}

/** Cuántas compras distintas hay en una lista de pedidos. */
export function cuantasCompras(pedidos) {
  return new Set(pedidos.map(p => p.grupo || p.id)).size;
}
