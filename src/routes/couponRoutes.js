const express = require('express');
const { body, param, query } = require('express-validator');
const couponController = require('../controllers/couponController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Validation rules
const createValidation = [
  body('code')
    .optional()
    .isLength({ min: 3, max: 20 })
    .withMessage('Coupon code must be between 3 and 20 characters')
    .matches(/^[A-Z0-9\-]+$/)
    .withMessage('Coupon code can only contain uppercase letters, numbers, and hyphens'),
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('type')
    .isIn(['percentage', 'fixed'])
    .withMessage('Type must be either percentage or fixed'),
  body('value')
    .isFloat({ min: 0 })
    .withMessage('Value must be a positive number'),
  body('maxDiscount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Max discount must be a positive number'),
  body('minOrderAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum order amount must be a positive number'),
  body('maxUsageCount')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Maximum usage count must be a positive integer'),
  body('maxUsagePerClient')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Maximum usage per client must be a positive integer'),
  body('validFrom')
    .optional()
    .isISO8601()
    .withMessage('Valid from date must be a valid date'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until date must be a valid date'),
  body('targetAudience')
    .optional()
    .isIn(['all', 'new_clients', 'existing_clients'])
    .withMessage('Invalid target audience')
];

const updateValidation = [
  body('name')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('minOrderAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum order amount must be a positive number'),
  body('maxUsageCount')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Maximum usage count must be a positive integer'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until date must be a valid date')
];

const applyValidation = [
  body('orderAmount')
    .isFloat({ min: 0 })
    .withMessage('Order amount must be a positive number'),
  body('serviceType')
    .optional()
    .isString()
    .withMessage('Service type must be a string')
];

const extendValidityValidation = [
  body('newValidUntil')
    .isISO8601()
    .withMessage('New valid until date must be a valid date')
];

const usageLimitValidation = [
  body('additionalLimit')
    .isInt({ min: 1 })
    .withMessage('Additional limit must be a positive integer')
];

const idValidation = [
  param('couponId')
    .isUUID(4)
    .withMessage('Coupon ID must be valid')
];

const codeValidation = [
  param('code')
    .isLength({ min: 3, max: 20 })
    .withMessage('Coupon code must be between 3 and 20 characters')
];

// Main routes
router.get('/', couponController.getCoupons);
router.post('/', createValidation, couponController.createCoupon);
router.get('/stats', couponController.getAllCouponStats);

// Validation and application routes
router.get('/validate/:code', codeValidation, couponController.validateCoupon);
router.post('/:couponId/apply', idValidation, applyValidation, couponController.applyCoupon);

// Individual coupon routes
router.get('/:couponId', idValidation, couponController.getCoupon);
router.put('/:couponId', idValidation, updateValidation, couponController.updateCoupon);
router.delete('/:couponId', idValidation, couponController.deleteCoupon);

// Coupon management routes
router.post('/:couponId/deactivate', idValidation, couponController.deactivateCoupon);
router.post('/:couponId/reactivate', idValidation, couponController.reactivateCoupon);
router.post('/:couponId/extend-validity', idValidation, extendValidityValidation, couponController.extendValidity);
router.post('/:couponId/increase-usage-limit', idValidation, usageLimitValidation, couponController.increaseUsageLimit);

// Usage tracking
router.get('/:couponId/stats', idValidation, couponController.getCouponStats);

module.exports = router;
