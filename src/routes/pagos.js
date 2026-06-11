const express = require('express');
const router = express.Router();
const { autenticar } = require('../middleware/auth');
const {
  crearPago, obtenerPago, obtenerQRImagen,
  listarPagos, confirmarPago, cancelarPago,
} = require('../controllers/pagosController');

router.post('/', autenticar, crearPago);
router.get('/', autenticar, listarPagos);
router.get('/:id', autenticar, obtenerPago);
router.get('/:id/qr', autenticar, obtenerQRImagen);
router.post('/:id/confirmar', autenticar, confirmarPago);
router.post('/:id/cancelar', autenticar, cancelarPago);

module.exports = router;
