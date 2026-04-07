const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getClientPayments,
  getClientPayment,
  getClientPaymentSummary,
  requestInvoice
} = require('../controllers/paymentController');
const { protectClient } = require('../middleware/auth');

const router = express.Router();

// All routes require client authentication
router.use(protectClient);

// Validation rules
const paymentIdValidation = [
  param('paymentId')
    .isMongoId()
    .withMessage('Payment ID must be valid')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'amount', 'status', 'method'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

const dateRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date')
];

const periodValidation = [
  query('period')
    .optional()
    .isIn(['week', 'month', 'quarter', 'year'])
    .withMessage('Period must be one of: week, month, quarter, year')
];

const invoiceRequestValidation = [
  body('nombreFiscal')
    .notEmpty()
    .withMessage('Nombre fiscal es obligatorio')
    .trim(),
  body('nif')
    .notEmpty()
    .withMessage('NIF es obligatorio')
    .trim()
];

// Client payment routes

// Get all payments for the client
router.get('/',
  paginationValidation,
  dateRangeValidation,
  getClientPayments
);

// Get client's payment summary
router.get('/summary',
  getClientPaymentSummary
);

// Get a specific payment for the client
router.get('/:paymentId',
  paymentIdValidation,
  getClientPayment
);

// Request invoice for a specific payment
router.post('/:paymentId/request-invoice',
  paymentIdValidation,
  invoiceRequestValidation,
  requestInvoice
);

module.exports = router;