const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const CALLMEBOT_APIKEY = process.env.CALLMEBOT_APIKEY || '';

async function notificarNuevoPago(pago) {
  if (!ADMIN_PHONE || !CALLMEBOT_APIKEY) {
    console.log('[NOTIFICACION] WhatsApp no configurado (falta ADMIN_PHONE o CALLMEBOT_APIKEY en .env)');
    return;
  }

  const mensaje =
    `🦁 *ZONA VIP - NUEVO PAGO*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Monto:* ${pago.monto.toFixed(2)} Bs\n` +
    `📋 *Ref:* ${pago.referencia}\n` +
    `📝 *Detalle:* ${pago.descripcion || 'Sin detalle'}\n` +
    `📱 *Cliente:* ${pago.telefono || 'Web'}\n` +
    `⏰ *Hora:* ${new Date().toLocaleString('es-BO')}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⚡ Confirmar en: ${process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`}/admin.html`;

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(ADMIN_PHONE)}&text=${encodeURIComponent(mensaje)}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;

  try {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`[WHATSAPP] Notificacion enviada - Ref: ${pago.referencia} - ${pago.monto} Bs`);
    } else {
      console.log(`[WHATSAPP] Error al enviar: ${res.status}`);
    }
  } catch (err) {
    console.log(`[WHATSAPP] Error de conexion: ${err.message}`);
  }
}

async function notificarPagoConfirmado(pago) {
  if (!ADMIN_PHONE || !CALLMEBOT_APIKEY) return;

  const mensaje =
    `✅ *PAGO CONFIRMADO*\n` +
    `💰 ${pago.monto.toFixed(2)} Bs\n` +
    `📋 Ref: ${pago.referencia}\n` +
    `📱 Cliente: ${pago.telefono || 'Web'}`;

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(ADMIN_PHONE)}&text=${encodeURIComponent(mensaje)}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;

  try { await fetch(url); } catch (e) {}
}

module.exports = { notificarNuevoPago, notificarPagoConfirmado };
