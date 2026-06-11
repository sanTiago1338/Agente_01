const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { autenticar, soloAdmin } = require('../middleware/auth');
const { guardarDatosQR, obtenerDatosQR, estaConfigurado } = require('../services/qrReaderService');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const QR_PATH = path.join(DATA_DIR, 'qr-banco.png');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDataDir();
    cb(null, DATA_DIR);
  },
  filename: (req, file, cb) => cb(null, 'qr-banco.png'),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Solo se permiten imagenes (jpg, png, webp)'));
  },
});

router.post('/subir-qr', autenticar, soloAdmin, upload.single('qr'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibio ninguna imagen' });
  }

  try {
    const config = await guardarDatosQR(QR_PATH);
    console.log(`[QR CONFIGURADO] Datos extraidos del QR de BancoSol`);
    console.log(`[QR DATA] ${config.qr_data.substring(0, 80)}...`);
    res.json({
      mensaje: 'QR de BancoSol configurado exitosamente',
      qr_data_extraida: config.qr_data,
      archivo: req.file.filename,
    });
  } catch (err) {
    res.json({
      mensaje: 'Imagen guardada (no se pudo decodificar el QR, pero se usara la imagen directamente)',
      archivo: req.file.filename,
    });
  }
});

router.get('/qr-banco', (req, res) => {
  if (!fs.existsSync(QR_PATH)) {
    return res.status(404).json({ error: 'No hay QR configurado' });
  }
  res.sendFile(QR_PATH);
});

router.get('/estado', (req, res) => {
  res.json({
    configurado: estaConfigurado(),
    datos: obtenerDatosQR(),
  });
});

module.exports = router;
