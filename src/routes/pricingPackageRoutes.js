const express = require('express');
const { body, param, query } = require('express-validator');
const pricingPackageController = require('../controllers/pricingPackageController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Validation rules
const createValidation = [
  body('name')
    .notEmpty()
    .withMessage('Package name is required')
    .isLength({ max: 100 })
    .withMessage('Package name cannot exceed 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('type')
    .optional()
    .isIn(['therapy', 'consultation', 'wellness', 'specialized', 'intensive', 'maintenance'])
    .withMessage('Invalid package type'),
  body('sessions')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Sessions must be between 1 and 100'),
  body('price')
    .isFloat({ min: 0, max: 100000 })
    .withMessage('Price must be between 0 and 100,000'),
  body('originalPrice')
    .optional()
    .isFloat({ min: 0, max: 100000 })
    .withMessage('Original price must be between 0 and 100,000'),
  body('validityDays')
    .optional()
    .isInt({ min: 1, max: 1095 })
    .withMessage('Validity days must be between 1 and 1095'),
  body('features')
    .optional()
    .isArray()
    .withMessage('Features must be an array'),
  body('currency')
    .optional()
    .isIn(['EUR', 'USD', 'GBP'])
    .withMessage('Invalid currency'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('Is public must be a boolean')
];

const updateValidation = [
  body('name')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Package name cannot exceed 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('price')
    .optional()
    .isFloat({ min: 0, max: 100000 })
    .withMessage('Price must be between 0 and 100,000'),
  body('sessions')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Sessions must be between 1 and 100'),
  body('validityDays')
    .optional()
    .isInt({ min: 1, max: 1095 })
    .withMessage('Validity days must be between 1 and 1095'),
  body('features')
    .optional()
    .isArray()
    .withMessage('Features must be an array'),
  body('currency')
    .optional()
    .isIn(['EUR', 'USD', 'GBP'])
    .withMessage('Invalid currency')
];

const testimonialValidation = [
  body('clientId')
    .isUUID(4)
    .withMessage('Client ID must be valid'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .notEmpty()
    .withMessage('Comment is required')
    .isLength({ max: 500 })
    .withMessage('Comment cannot exceed 500 characters')
];

const calculatePriceValidation = [
  query('discountCode')
    .optional()
    .isLength({ min: 3, max: 20 })
    .withMessage('Discount code must be between 3 and 20 characters'),
  query('clientId')
    .optional()
    .isUUID(4)
    .withMessage('Client ID must be valid')
];

const idValidation = [
  param('packageId')
    .isUUID(4)
    .withMessage('Package ID must be valid')
];

// Main routes
router.get('/', pricingPackageController.getPricingPackages);
router.post('/', createValidation, pricingPackageController.createPricingPackage);

// Individual package routes
router.get('/:packageId', idValidation, pricingPackageController.getPricingPackage);
router.put('/:packageId', idValidation, updateValidation, pricingPackageController.updatePricingPackage);
router.delete('/:packageId', idValidation, pricingPackageController.deletePricingPackage);

// Package lifecycle management
router.post('/:packageId/activate', idValidation, pricingPackageController.activatePackage);
router.post('/:packageId/deactivate', idValidation, pricingPackageController.deactivatePackage);
router.post('/:packageId/make-public', idValidation, pricingPackageController.makePublic);
router.post('/:packageId/make-private', idValidation, pricingPackageController.makePrivate);

// Pricing calculation
router.get('/:packageId/calculate-price', idValidation, calculatePriceValidation, pricingPackageController.calculatePrice);

// Stats
router.get('/:packageId/stats', idValidation, pricingPackageController.getPackageStats);

// Testimonials
router.post('/:packageId/testimonials', idValidation, testimonialValidation, pricingPackageController.addTestimonial);

module.exports = router;
