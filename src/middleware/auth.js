const { db } = require('../config/database');

function autenticar(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: 'API Key requerida. Enviar en header X-API-Key' });
  }

  const cliente = db.prepare('SELECT * FROM clientes WHERE api_key = ? AND activo = 1').get(apiKey);

  if (!cliente) {
    return res.status(403).json({ error: 'API Key invalida o cliente inactivo' });
  }

  req.cliente = cliente;
  next();
}

function soloAdmin(req, res, next) {
  if (req.cliente.nombre !== 'Admin') {
    return res.status(403).json({ error: 'Acceso solo para administradores' });
  }
  next();
}

module.exports = { autenticar, soloAdmin };
