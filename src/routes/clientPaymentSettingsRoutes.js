const express = require('express');
const { body, param } = require('express-validator');
const {
  getClientPaymentMethod,
  updateClientPaymentMethod,
  getTherapistSubscription,
  initTherapistPaymentSettings
} = require('../controllers/clientPaymentSettingsController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Validation rules
const clientIdValidation = [
  param('clientId')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Client ID must be a valid UUID')
];

const updatePaymentMethodValidation = [
  param('clientId')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Client ID must be a valid UUID'),
  body('paymentMethod')
    .isIn(['stripe', 'manual'])
    .withMessage('Payment method must be either "stripe" or "manual"'),
  body('isExempt')
    .optional()
    .isBoolean()
    .withMessage('isExempt must be a boolean'),
  body('exemptionReason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Exemption reason cannot exceed 500 characters')
];

const initSettingsValidation = [
  body('plan')
    .optional()
    .isIn(['basico', 'avanzado', 'avanzado-pro'])
    .withMessage('Plan must be one of: basico, avanzado, avanzado-pro')
];

// Routes

// Get therapist subscription info
router.get('/therapists/me/subscription', getTherapistSubscription);

// Initialize therapist payment settings
router.post('/therapists/me/payment-settings/init', initSettingsValidation, initTherapistPaymentSettings);

// Get client's payment method
router.get('/clients/:clientId/payment-method', clientIdValidation, getClientPaymentMethod);

// Update client's payment method
router.put('/clients/:clientId/payment-method', updatePaymentMethodValidation, updateClientPaymentMethod);

module.exports = router;