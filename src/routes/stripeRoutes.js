const express = require('express');
const router = express.Router();
const {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
  createRefund
} = require('../controllers/stripeController');
const {
  createConnectAccount,
  getConnectStatus,
  getDashboardUrl,
  disconnectAccount,
  handleConnectWebhook
} = require('../controllers/stripeConnectController');
const { protect } = require('../middleware/authMiddleware');

// Rutas protegidas - Pagos estándar
router.post('/create-intent', protect, createPaymentIntent);
router.post('/confirm', protect, confirmPayment);
router.post('/refund', protect, createRefund);

// Rutas protegidas - Stripe Connect
router.post('/connect/create-account', protect, createConnectAccount);
router.get('/connect/status', protect, getConnectStatus);
router.get('/connect/dashboard-url', protect, getDashboardUrl);
router.delete('/connect/disconnect', protect, disconnectAccount);

// Webhooks (públicos pero validados con firma)
// IMPORTANTE: Estas rutas deben usar raw body, no JSON parsed
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);
router.post('/connect/webhook', express.raw({ type: 'application/json' }), handleConnectWebhook);

module.exports = router;
