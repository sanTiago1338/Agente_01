const express = require('express');
const router = express.Router();
const { db, generarApiKey } = require('../config/database');
const { autenticar, soloAdmin } = require('../middleware/auth');

router.post('/', autenticar, soloAdmin, (req, res) => {
  const { nombre, email, telefono } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
  const apiKey = generarApiKey();
  const result = db.prepare(
    'INSERT INTO clientes (nombre, email, telefono, api_key) VALUES (?, ?, ?, ?)'
  ).run(nombre, email || null, telefono || null, apiKey);
  res.status(201).json({
    id: result.lastInsertRowid, nombre, email, telefono, api_key: apiKey,
    mensaje: 'Cliente creado. Guarda la API Key, no se puede recuperar.',
  });
});

router.get('/', autenticar, soloAdmin, (req, res) => {
  const clientes = db.prepare('SELECT id, nombre, email, telefono, activo, created_at FROM clientes').all();
  res.json(clientes);
});

router.patch('/:id/toggle', autenticar, soloAdmin, (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const nuevoEstado = cliente.activo ? 0 : 1;
  db.prepare('UPDATE clientes SET activo = ? WHERE id = ?').run(nuevoEstado, cliente.id);
  res.json({ id: cliente.id, activo: nuevoEstado, mensaje: nuevoEstado ? 'Cliente activado' : 'Cliente desactivado' });
});

router.post('/:id/regenerar-key', autenticar, soloAdmin, (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const nuevaKey = generarApiKey();
  db.prepare('UPDATE clientes SET api_key = ? WHERE id = ?').run(nuevaKey, cliente.id);
  res.json({ id: cliente.id, api_key: nuevaKey, mensaje: 'API Key regenerada.' });
});

module.exports = router;
