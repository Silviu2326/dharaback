const express = require('express');
const router = express.Router();
const {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
  createRefund
} = require('../controllers/stripeController');
const { protect } = require('../middleware/authMiddleware');

// Rutas protegidas
router.post('/create-intent', protect, createPaymentIntent);
router.post('/confirm', protect, confirmPayment);
router.post('/refund', protect, createRefund);

// Webhook (público pero validado con firma)
// IMPORTANTE: Esta ruta debe usar raw body, no JSON parsed
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

module.exports = router;
