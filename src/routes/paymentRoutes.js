const express = require('express');
const { body, param, query } = require('express-validator');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Validation rules
const createPaymentValidation = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .optional()
    .isIn(['EUR', 'USD', 'GBP'])
    .withMessage('Invalid currency'),
  body('method')
    .isIn(['card', 'transfer', 'cash', 'paypal', 'stripe', 'other'])
    .withMessage('Invalid payment method'),
  body('clientId')
    .optional({ nullable: true })
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Client ID must be a valid UUID'),
  body('bookingId')
    .optional({ nullable: true })
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Booking ID must be a valid UUID'),
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
];

const updatePaymentStatusValidation = [
  body('status')
    .isIn(['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'])
    .withMessage('Invalid payment status'),
  body('transactionId')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Transaction ID cannot exceed 100 characters'),
  body('failureReason')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Failure reason cannot exceed 200 characters')
];

const refundValidation = [
  body('refundAmount')
    .isFloat({ min: 0.01 })
    .withMessage('Refund amount must be greater than 0'),
  body('reason')
    .notEmpty()
    .withMessage('Refund reason is required')
    .isLength({ max: 1000 })
    .withMessage('Refund reason cannot exceed 1000 characters')
];

const createPayoutRequestValidation = [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Minimum payout amount is €1'),
  body('currency')
    .optional()
    .isIn(['EUR', 'USD', 'GBP'])
    .withMessage('Invalid currency'),
  body('bankAccount.accountNumber')
    .notEmpty()
    .withMessage('Account number is required')
    .isLength({ min: 8, max: 34 })
    .withMessage('Account number must be between 8 and 34 characters'),
  body('bankAccount.routingNumber')
    .notEmpty()
    .withMessage('Routing number is required')
    .isLength({ min: 4, max: 11 })
    .withMessage('Routing number must be between 4 and 11 characters'),
  body('bankAccount.accountHolderName')
    .notEmpty()
    .withMessage('Account holder name is required')
    .isLength({ max: 100 })
    .withMessage('Account holder name cannot exceed 100 characters'),
  body('bankAccount.bankName')
    .notEmpty()
    .withMessage('Bank name is required')
    .isLength({ max: 100 })
    .withMessage('Bank name cannot exceed 100 characters'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
];

const idValidation = [
  param('paymentId')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Payment ID must be a valid UUID')
];

const payoutIdValidation = [
  param('payoutId')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Payout ID must be a valid UUID')
];

// Payment Routes
router.get('/', paymentController.getPayments);
router.post('/', createPaymentValidation, paymentController.createPayment);
router.get('/stats', paymentController.getPaymentStats);
router.get('/statistics', paymentController.getPaymentStats);
router.get('/balance', paymentController.getBalanceSummary);
router.get('/providers', paymentController.getProviders);
router.get('/methods', paymentController.getPaymentMethods);
router.get('/:paymentId', idValidation, paymentController.getPayment);
router.put('/:paymentId/status', idValidation, updatePaymentStatusValidation, paymentController.updatePaymentStatus);
router.post('/:paymentId/refund', idValidation, refundValidation, paymentController.processRefund);

// Payout Request Routes
router.get('/payouts/requests', paymentController.getPayoutRequests);
router.post('/payouts/requests', createPayoutRequestValidation, paymentController.createPayoutRequest);

module.exports = router;
