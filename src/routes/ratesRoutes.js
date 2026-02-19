const express = require('express');
const { body, param, query } = require('express-validator');
const ratesController = require('../controllers/ratesController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Validation rules
const createValidation = [
  body('sessionPrice').isFloat({ min: 0, max: 10000 }).withMessage('Session price must be between 0 and 10,000'),
  body('followUpPrice').optional().isFloat({ min: 0, max: 10000 }),
  body('packagePrice').optional().isFloat({ min: 0, max: 100000 }),
  body('coupleSessionPrice').optional().isFloat({ min: 0, max: 10000 }),
  body('currency').optional().isIn(['EUR', 'USD', 'GBP']),
  body('validFrom').optional().isISO8601(),
  body('validUntil').optional().isISO8601(),
  body('sessionTypes').optional().isArray(),
  body('paymentMethods').optional().isArray(),
  body('paymentMethods.*').optional().isIn(['cash', 'card', 'transfer', 'paypal', 'bizum', 'insurance'])
];

const updateValidation = [
  body('sessionPrice').optional().isFloat({ min: 0, max: 10000 }),
  body('followUpPrice').optional().isFloat({ min: 0, max: 10000 }),
  body('packagePrice').optional().isFloat({ min: 0, max: 100000 }),
  body('coupleSessionPrice').optional().isFloat({ min: 0, max: 10000 }),
  body('currency').optional().isIn(['EUR', 'USD', 'GBP']),
  body('validFrom').optional().isISO8601(),
  body('validUntil').optional().isISO8601(),
  body('sessionTypes').optional().isArray(),
  body('paymentMethods').optional().isArray()
];

const idValidation = [
  param('rateId').isUUID().withMessage('Rate ID must be valid')
];

const therapistIdValidation = [
  param('therapistId').isUUID().withMessage('Therapist ID must be valid')
];

const calculationValidation = [
  query('sessionType').optional().isIn(['individual', 'couple', 'family', 'group', 'consultation', 'emergency', 'online', 'phone']),
  query('duration').optional().isInt({ min: 15, max: 300 })
];

// Main routes
router.get('/', ratesController.getRates);
router.post('/', createValidation, ratesController.createRate);
router.get('/stats', ratesController.getPricingStats);

// Therapist-specific routes
router.get('/therapist/:therapistId/current', therapistIdValidation, ratesController.getCurrentRates);

// Individual rate routes
router.get('/:rateId', idValidation, ratesController.getRate);
router.put('/:rateId', idValidation, updateValidation, ratesController.updateRate);
router.delete('/:rateId', idValidation, ratesController.deleteRate);

// Price calculation
router.get('/:rateId/calculate', idValidation, calculationValidation, ratesController.calculateSessionPrice);

module.exports = router;
