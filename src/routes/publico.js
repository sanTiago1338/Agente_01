const express = require('express');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const router = express.Router();
const { db } = require('../config/database');
const { generarDatosQR, generarImagenQR } = require('../services/qrService');
const { notificarNuevoPago } = require('../services/notificationService');

router.post('/', async (req, res) => {
  try {
    const { monto, descripcion, telefono } = req.body;
    if (!monto || monto <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (monto > 100000) {
      return res.status(400).json({ error: 'El monto maximo es 100,000 BOB' });
    }

    const id = uuidv4();
    const ref = `ZV-${id.substring(0, 8).toUpperCase()}`;
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const qrData = generarDatosQR(monto, ref, descripcion);
    const qrBase64 = await generarImagenQR(qrData, { formato: 'base64' });

    const admin = db.prepare('SELECT id FROM clientes WHERE nombre = ?').get('Admin');

    db.prepare(`
      INSERT INTO pagos (id, cliente_id, monto, descripcion, referencia, qr_data, expires_at, telefono, token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, admin.id, monto, descripcion || '', ref, qrData, expiresAt, telefono || '', token);

    res.status(201).json({
      id, token, monto, referencia: ref,
      qr_imagen: qrBase64, expires_at: expiresAt,
      expira_en_minutos: 30,
    });

    notificarNuevoPago({ monto, referencia: ref, descripcion, telefono });
  } catch (error) {
    console.error('Error al crear pago publico:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/:id', async (req, res) => {
  const { token } = req.query;
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND token = ?').get(req.params.id, token);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

  if (pago.estado === 'pendiente' && new Date(pago.expires_at) < new Date()) {
    db.prepare('UPDATE pagos SET estado = ? WHERE id = ?').run('expirado', pago.id);
    pago.estado = 'expirado';
  }

  const qrBase64 = await generarImagenQR(pago.qr_data, { formato: 'base64' });
  res.json({
    id: pago.id, monto: pago.monto, referencia: pago.referencia,
    estado: pago.estado, qr_imagen: qrBase64, telefono: pago.telefono,
    expires_at: pago.expires_at, paid_at: pago.paid_at,
  });
});

router.get('/:id/estado', (req, res) => {
  const { token } = req.query;
  const pago = db.prepare('SELECT id, estado, monto, telefono, paid_at, expires_at FROM pagos WHERE id = ? AND token = ?')
    .get(req.params.id, token);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

  if (pago.estado === 'pendiente' && new Date(pago.expires_at) < new Date()) {
    db.prepare('UPDATE pagos SET estado = ? WHERE id = ?').run('expirado', pago.id);
    pago.estado = 'expirado';
  }

  res.json({ estado: pago.estado, monto: pago.monto, telefono: pago.telefono, paid_at: pago.paid_at });
});

module.exports = router;
