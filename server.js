require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const pagosRoutes = require('./src/routes/pagos');
const clientesRoutes = require('./src/routes/clientes');
const publicoRoutes = require('./src/routes/publico');
const webhookRoutes = require('./src/routes/webhook');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.BASE_URL,
  'https://santiago1338.github.io',
  `http://localhost:${PORT}`,
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS no permitido'));
  },
}));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.static(path.join(__dirname)));

app.use('/api/pagos/publico', publicoRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/{*path}', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ZONA VIP - Servidor`);
  console.log(`  --------------------`);
  console.log(`  Tienda:  http://localhost:${PORT}`);
  console.log(`  Admin:   http://localhost:${PORT}/admin.html`);
  console.log(`  API:     http://localhost:${PORT}/api\n`);
});
