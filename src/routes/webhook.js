const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { notificarPagoConfirmado } = require('../services/notificationService');

router.post('/confirmar', (req, res) => {
  const { referencia, monto, webhook_secret } = req.body;
  if (webhook_secret !== (process.env.WEBHOOK_SECRET || 'webhook-secret-cambiar')) {
    return res.status(401).json({ error: 'Webhook secret invalido' });
  }
  if (!referencia) return res.status(400).json({ error: 'Referencia requerida' });

  const pago = db.prepare('SELECT * FROM pagos WHERE referencia = ? AND estado = ?').get(referencia, 'pendiente');
  if (!pago) return res.status(404).json({ error: 'Pago pendiente no encontrado con esa referencia' });
  if (monto && Math.abs(pago.monto - monto) > 0.01) {
    return res.status(400).json({ error: 'El monto no coincide' });
  }

  db.prepare('UPDATE pagos SET estado = ?, paid_at = datetime(?) WHERE id = ?').run('pagado', new Date().toISOString(), pago.id);
  console.log(`[PAGO CONFIRMADO] Ref: ${pago.referencia} | Monto: ${pago.monto} BOB | Tel: ${pago.telefono}`);
  notificarPagoConfirmado(pago);
  res.json({ mensaje: 'Pago confirmado', id: pago.id, monto: pago.monto, telefono: pago.telefono, referencia: pago.referencia });
});

router.post('/confirmar-por-id/:id', (req, res) => {
  const { webhook_secret } = req.body;
  if (webhook_secret !== (process.env.WEBHOOK_SECRET || 'webhook-secret-cambiar')) {
    return res.status(401).json({ error: 'Webhook secret invalido' });
  }

  const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND estado = ?').get(req.params.id, 'pendiente');
  if (!pago) return res.status(404).json({ error: 'Pago pendiente no encontrado' });

  db.prepare('UPDATE pagos SET estado = ?, paid_at = datetime(?) WHERE id = ?').run('pagado', new Date().toISOString(), pago.id);
  console.log(`[PAGO CONFIRMADO] ID: ${pago.id} | Monto: ${pago.monto} BOB | Tel: ${pago.telefono}`);
  notificarPagoConfirmado(pago);
  res.json({ mensaje: 'Pago confirmado', id: pago.id, monto: pago.monto, telefono: pago.telefono });
});

module.exports = router;
