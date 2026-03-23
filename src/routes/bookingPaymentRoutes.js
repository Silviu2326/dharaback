const express = require('express');
const { body } = require('express-validator');
const {
  createBookingWithPayment,
  handleStripeWebhook,
  getPaymentPermissions
} = require('../controllers/bookingPaymentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Webhook route - must be raw body for Stripe signature verification
router.post('/webhook', 
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// Protected routes
router.use(protect);

// Validation rules
const createBookingValidation = [
  body('therapistId')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Therapist ID must be a valid UUID'),
  body('serviceId')
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage('Service ID must be a valid UUID'),
  body('appointments')
    .isArray({ min: 1 })
    .withMessage('At least one appointment is required'),
  body('appointments.*.date')
    .isISO8601()
    .withMessage('Invalid date format'),
  body('appointments.*.time')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Invalid time format'),
  body('paymentMethod')
    .optional()
    .isIn(['stripe', 'manual', 'exempt'])
    .withMessage('Invalid payment method'),
  body('couponCode')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Coupon code too long')
];

// Routes

// Create booking with payment
router.post('/create-with-payment', createBookingValidation, createBookingWithPayment);

// Get payment permissions for a therapist
router.get('/payment-permissions/:therapistId', getPaymentPermissions);

module.exports = router;