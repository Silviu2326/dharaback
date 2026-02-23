const express = require('express');
const { body, param, query } = require('express-validator');
const subscriptionController = require('../controllers/subscriptionController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Test route without authentication
router.get('/payout-data', subscriptionController.getPayoutData);

// Apply authentication to all other routes
router.use(protect);

// Validation rules
const createValidation = [
  body('planId')
    .isMongoId()
    .withMessage('Plan ID must be valid'),
  body('billingCycle')
    .optional()
    .isIn(['monthly', 'yearly'])
    .withMessage('Billing cycle must be monthly or yearly'),
  body('paymentMethodId')
    .optional()
    .isString()
    .withMessage('Payment method ID must be a string')
];

const cancelValidation = [
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Cancellation reason cannot exceed 500 characters')
];

const suspendValidation = [
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Suspension reason cannot exceed 500 characters')
];

const planChangeValidation = [
  body('newPlanId')
    .isMongoId()
    .withMessage('New plan ID must be valid'),
  body('effectiveImmediately')
    .optional()
    .isBoolean()
    .withMessage('Effective immediately must be a boolean')
];

const idValidation = [
  param('subscriptionId')
    .isMongoId()
    .withMessage('Subscription ID must be valid')
];

const therapistIdValidation = [
  param('therapistId')
    .isMongoId()
    .withMessage('Therapist ID must be valid')
];

// Main routes
router.get('/', subscriptionController.getSubscriptions);
router.post('/', createValidation, subscriptionController.createSubscription);
router.get('/stats', authorize(['admin']), subscriptionController.getSubscriptionStats);
router.get('/test-route', (req, res) => {
  res.json({ success: true, message: 'Subscription routes are working' });
});

// Therapist-specific routes
router.get('/therapist/:therapistId/current', therapistIdValidation, subscriptionController.getCurrentSubscription);

// Individual subscription routes
router.get('/:subscriptionId', idValidation, subscriptionController.getCurrentSubscription);
router.post('/:subscriptionId/cancel', idValidation, cancelValidation, subscriptionController.cancelSubscription);
router.post('/:subscriptionId/suspend', idValidation, suspendValidation, authorize(['admin']), subscriptionController.suspendSubscription);
router.post('/:subscriptionId/reactivate', idValidation, authorize(['admin']), subscriptionController.reactivateSubscription);

// Plan changes
router.post('/:subscriptionId/change-plan', idValidation, planChangeValidation, subscriptionController.changePlan);

// Usage tracking
router.get('/:subscriptionId/check-limits/:limitType', idValidation, subscriptionController.checkLimits);
router.get('/:subscriptionId/usage', idValidation, subscriptionController.getUsage);

module.exports = router;
