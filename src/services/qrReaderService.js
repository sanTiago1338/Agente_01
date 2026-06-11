const Jimp = require('jimp');
const jsQR = require('jsqr');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data');
const QR_DATA_FILE = path.join(DATA_PATH, 'qr-banco-data.json');
const QR_IMAGE_PATH = path.join(DATA_PATH, 'qr-banco.png');

function ensureDataDir() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, { recursive: true });
  }
}

async function decodificarQR(imagePath) {
  const image = await Jimp.read(imagePath);
  const { data, width, height } = image.bitmap;
  const code = jsQR(new Uint8ClampedArray(data), width, height);
  if (!code) {
    throw new Error('No se pudo leer el QR de la imagen');
  }
  return code.data;
}

async function guardarDatosQR(imagePath) {
  ensureDataDir();
  const qrData = await decodificarQR(imagePath);
  const config = {
    qr_data: qrData,
    imagen: QR_IMAGE_PATH,
    actualizado: new Date().toISOString(),
  };
  fs.writeFileSync(QR_DATA_FILE, JSON.stringify(config, null, 2));
  return config;
}

function obtenerDatosQR() {
  if (!fs.existsSync(QR_DATA_FILE)) return null;
  return JSON.parse(fs.readFileSync(QR_DATA_FILE, 'utf-8'));
}

function estaConfigurado() {
  return fs.existsSync(QR_IMAGE_PATH);
}

module.exports = { decodificarQR, guardarDatosQR, obtenerDatosQR, estaConfigurado };
