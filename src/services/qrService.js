const QRCode = require('qrcode');

const MERCHANT_NAME = process.env.MERCHANT_NAME || 'Santos Mamani Vargas';
const MERCHANT_CITY = process.env.MERCHANT_CITY || 'Bolivia';
const BANK_ACCOUNT = process.env.BANK_ACCOUNT || '2979441-000-001';
const BANK_NAME = process.env.BANK_NAME || 'BancoSol';

function tlv(tag, value) {
  const len = value.length.toString().padStart(2, '0');
  return tag + len + value;
}

function calcularCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function generarDatosQR(monto, referencia, descripcion) {
  let qrString = '';
  qrString += tlv('00', '01');
  qrString += tlv('01', '12');
  const merchantInfo =
    tlv('00', 'com.bancosol') +
    tlv('01', BANK_ACCOUNT) +
    tlv('02', BANK_NAME);
  qrString += tlv('26', merchantInfo);
  qrString += tlv('52', '0000');
  qrString += tlv('53', '068');
  if (monto) {
    qrString += tlv('54', monto.toFixed(2));
  }
  qrString += tlv('58', 'BO');
  qrString += tlv('59', MERCHANT_NAME.substring(0, 25));
  qrString += tlv('60', MERCHANT_CITY.substring(0, 15));
  const glosa = descripcion || 'VARIOS';
  let additionalData = '';
  if (referencia) additionalData += tlv('05', referencia.substring(0, 25));
  additionalData += tlv('08', glosa.substring(0, 50));
  qrString += tlv('62', additionalData);
  const crcPlaceholder = qrString + '6304';
  const crc = calcularCRC16(crcPlaceholder);
  qrString += '6304' + crc;
  return qrString;
}

async function generarImagenQR(datosQR, opciones = {}) {
  const config = {
    type: 'png',
    width: opciones.width || 400,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  };
  if (opciones.formato === 'base64') {
    return await QRCode.toDataURL(datosQR, config);
  }
  return await QRCode.toBuffer(datosQR, config);
}

async function generarQRSvg(datosQR) {
  return await QRCode.toString(datosQR, { type: 'svg', margin: 2 });
}

module.exports = { generarDatosQR, generarImagenQR, generarQRSvg };
