const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { db } = require('../config/database');
const { generarDatosQR, generarImagenQR, generarQRSvg } = require('../services/qrService');

async function crearPago(req, res) {
  try {
    const { monto, descripcion, referencia, expira_en_minutos } = req.body;
    if (!monto || monto <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (monto > 100000) {
      return res.status(400).json({ error: 'El monto maximo es 100,000 BOB' });
    }
    const id = uuidv4();
    const ref = referencia || `PAY-${id.substring(0, 8).toUpperCase()}`;
    const minutos = expira_en_minutos || 30;
    const expiresAt = new Date(Date.now() + minutos * 60 * 1000).toISOString();
    const qrData = generarDatosQR(monto, ref, descripcion);
    db.prepare(`
      INSERT INTO pagos (id, cliente_id, monto, descripcion, referencia, qr_data, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.cliente.id, monto, descripcion || '', ref, qrData, expiresAt);
    const qrBase64 = await generarImagenQR(qrData, { formato: 'base64' });
    res.status(201).json({
      id, monto, moneda: 'BOB', descripcion: descripcion || '',
      referencia: ref, estado: 'pendiente', qr_imagen: qrBase64,
      qr_data: qrData, expires_at: expiresAt, created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error al crear pago:', error);
    res.status(500).json({ error: 'Error interno al crear el pago' });
  }
}

function obtenerPago(req, res) {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND cliente_id = ?').get(req.params.id, req.cliente.id);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  if (pago.estado === 'pendiente' && new Date(pago.expires_at) < new Date()) {
    db.prepare('UPDATE pagos SET estado = ? WHERE id = ?').run('expirado', pago.id);
    pago.estado = 'expirado';
  }
  res.json(pago);
}

async function obtenerQRImagen(req, res) {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND cliente_id = ?').get(req.params.id, req.cliente.id);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  const formato = req.query.formato || 'png';
  if (formato === 'svg') {
    const svg = await generarQRSvg(pago.qr_data);
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.send(svg);
  }
  const buffer = await generarImagenQR(pago.qr_data, { width: parseInt(req.query.width) || 400 });
  res.setHeader('Content-Type', 'image/png');
  res.send(buffer);
}

function listarPagos(req, res) {
  const { estado, limite, pagina } = req.query;
  const limit = Math.min(parseInt(limite) || 20, 100);
  const offset = ((parseInt(pagina) || 1) - 1) * limit;
  let query = 'SELECT * FROM pagos WHERE cliente_id = ?';
  const params = [req.cliente.id];
  if (estado) { query += ' AND estado = ?'; params.push(estado); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const pagos = db.prepare(query).all(...params);
  const totalQuery = estado
    ? 'SELECT COUNT(*) as total FROM pagos WHERE cliente_id = ? AND estado = ?'
    : 'SELECT COUNT(*) as total FROM pagos WHERE cliente_id = ?';
  const totalParams = estado ? [req.cliente.id, estado] : [req.cliente.id];
  const { total } = db.prepare(totalQuery).get(...totalParams);
  res.json({ pagos, paginacion: { total, pagina: parseInt(pagina) || 1, limite: limit, total_paginas: Math.ceil(total / limit) } });
}

function confirmarPago(req, res) {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  if (pago.estado === 'pagado') return res.status(400).json({ error: 'Este pago ya fue confirmado' });
  if (pago.estado === 'expirado') return res.status(400).json({ error: 'Este pago ha expirado' });
  db.prepare('UPDATE pagos SET estado = ?, paid_at = datetime(?) WHERE id = ?').run('pagado', new Date().toISOString(), pago.id);
  res.json({ mensaje: 'Pago confirmado exitosamente', id: pago.id, estado: 'pagado' });
}

function cancelarPago(req, res) {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND cliente_id = ?').get(req.params.id, req.cliente.id);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  if (pago.estado !== 'pendiente') return res.status(400).json({ error: `No se puede cancelar un pago con estado: ${pago.estado}` });
  db.prepare('UPDATE pagos SET estado = ? WHERE id = ?').run('cancelado', pago.id);
  res.json({ mensaje: 'Pago cancelado', id: pago.id, estado: 'cancelado' });
}

module.exports = { crearPago, obtenerPago, obtenerQRImagen, listarPagos, confirmarPago, cancelarPago };
