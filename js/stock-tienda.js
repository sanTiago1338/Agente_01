// ============================================================
// TIAGO STORE · Qué productos se entregan al instante
// ============================================================
// Lo usa index.html para poner el cartelito "⚡ Entrega inmediata" en los
// planes que tienen una cuenta comprada esperando.
//
// POR QUÉ IMPORTA PONERLO
//   La entrega automática ya funciona, pero el cliente no tiene forma de
//   saberlo antes de pagar. Un cartel que diga que la recibe en el momento
//   es la diferencia entre "lo pienso" y "lo compro ahora".
//
// POR QUÉ ES UN INDICIO Y NO UNA PROMESA
//   Este dato se pide UNA vez, al cargar la página. Si mientras el cliente
//   mira el catálogo se vende la última cuenta, el cartel queda viejo.
//
//   No es grave, y es a propósito: la verdad se vuelve a chequear en la
//   página de pago, que pregunta el stock justo antes de crear el pedido y
//   ahí ajusta lo que promete (ver pagar-qr.html). O sea que el peor caso
//   es un cartel optimista en la vidriera y el mensaje correcto al pagar,
//   nunca al revés.
//
//   La alternativa —escuchar la tabla de cuentas en vivo— no se puede: esa
//   tabla tiene contraseñas y está cerrada a la clave anon, como debe ser.
// ============================================================

import { sb } from './supabase-base.js';

/**
 * Cuántas cuentas libres hay de cada producto.
 *
 * Solo vienen los que TIENEN alguna: los que no, ni aparecen. Con stock
 * en unos pocos productos son unas pocas filas, así que es una consulta
 * chica aunque el catálogo tenga 226.
 *
 * Nunca devuelve credenciales: la función de la base cuenta sin abrir la
 * tabla (ver stock_disponible en supabase/05-cobros.sql).
 *
 * @returns {Promise<Map<string, number>>} id del producto -> cuántas libres
 */
export async function mapaDeStock() {
  try {
    const { data, error } = await sb.rpc('stock_disponible');

    if (error) {
      // No es fatal: sin este dato la tienda se ve igual que siempre, solo
      // sin el cartelito. No hay razón para molestar al cliente con esto.
      console.warn('No se pudo leer el stock:', error.message);
      return new Map();
    }

    return new Map((data || []).map(f => [f.producto_id, f.libres]));

  } catch (e) {
    console.warn('No se pudo leer el stock:', e.message);
    return new Map();
  }
}

/**
 * Qué productos tienen rebaja automática hoy y de cuántos Bs.
 *
 * La rebaja es del stock que no se vende: 2 Bs cada 3 días desde la cuenta
 * más vieja sin vender, en los productos que tienen prendido el interruptor
 * "Rebaja automática" del panel (ver rebaja_de_stock en
 * supabase/05-cobros.sql). La cuenta la hace la base, que es la que cobra:
 * la tienda solo la muestra, para que el cliente vea el mismo precio que
 * después le va a figurar en el QR.
 *
 * Solo vienen los productos con alguna rebaja. Si falla, la tienda muestra
 * los precios sin rebaja; al pagar, el QR dice el precio que vale.
 *
 * @returns {Promise<Map<string, number>>} id del producto -> Bs de rebaja
 */
export async function mapaDeRebajas() {
  try {
    const { data, error } = await sb.rpc('rebajas_vigentes');
    if (error) {
      console.warn('No se pudieron leer las rebajas:', error.message);
      return new Map();
    }
    return new Map((data || []).map(f => [f.producto_id, Number(f.rebaja) || 0]));
  } catch (e) {
    console.warn('No se pudieron leer las rebajas:', e.message);
    return new Map();
  }
}
