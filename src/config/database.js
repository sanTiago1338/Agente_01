const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'tienda.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    api_key TEXT UNIQUE NOT NULL,
    activo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id TEXT PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    moneda TEXT DEFAULT 'BOB',
    descripcion TEXT,
    referencia TEXT,
    estado TEXT DEFAULT 'pendiente',
    qr_data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    paid_at TEXT,
    telefono TEXT,
    token TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_pagos_cliente ON pagos(cliente_id);
  CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado);
  CREATE INDEX IF NOT EXISTS idx_pagos_referencia ON pagos(referencia);
  CREATE INDEX IF NOT EXISTS idx_clientes_api_key ON clientes(api_key);
  CREATE INDEX IF NOT EXISTS idx_pagos_token ON pagos(token);
`);

const adminKey = process.env.ADMIN_API_KEY || 'admin-zonavip-2024';
const existingAdmin = db.prepare('SELECT id FROM clientes WHERE api_key = ?').get(adminKey);
if (!existingAdmin) {
  db.prepare('INSERT INTO clientes (nombre, email, api_key) VALUES (?, ?, ?)').run(
    'Admin',
    'admin@zonavip.com',
    adminKey
  );
}

function generarApiKey() {
  return 'tk_' + crypto.randomBytes(24).toString('hex');
}

module.exports = { db, generarApiKey };
