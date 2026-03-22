const { body, param, query, validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
const validateUserUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  body('preferences.language')
    .optional()
    .isIn(['es', 'en', 'ca'])
    .withMessage('Language must be es, en, or ca'),

  body('preferences.timezone')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Timezone is required if provided'),

  handleValidationErrors
];

// Professional Profile validation rules
const validateProfileUpdate = [
  body('about')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('About section cannot exceed 2000 characters'),

  body('therapies')
    .optional()
    .isArray()
    .withMessage('Therapies must be an array'),

  body('therapies.*')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Each therapy cannot exceed 100 characters'),

  body('videoPresentation.url')
    .optional()
    .isURL()
    .withMessage('Video URL must be a valid URL'),

  body('rates.sessionPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Session price must be a positive number'),

  body('rates.currency')
    .optional()
    .isIn(['EUR', 'USD', 'GBP'])
    .withMessage('Currency must be EUR, USD, or GBP'),

  handleValidationErrors
];

const validateEducation = [
  body('degree')
    .notEmpty()
    .trim()
    .withMessage('Degree is required'),

  body('institution')
    .notEmpty()
    .trim()
    .withMessage('Institution is required'),

  body('year')
    .optional()
    .isInt({ min: 1950, max: new Date().getFullYear() })
    .withMessage('Year must be between 1950 and current year'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  handleValidationErrors
];

const validateExperience = [
  body('position')
    .notEmpty()
    .trim()
    .withMessage('Position is required'),

  body('company')
    .notEmpty()
    .trim()
    .withMessage('Company is required'),

  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid date'),

  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),

  handleValidationErrors
];

// Client validation rules
const validateClientCreate = [
  body('name')
    .notEmpty()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name is required and must be between 2 and 100 characters'),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),

  body('phone')
    .notEmpty()
    .trim()
    .matches(/^(\+34|0034|34)?[6-9]\d{8}$/)
    .withMessage('Please provide a valid Spanish phone number'),

  body('age')
    .optional()
    .isInt({ min: 16, max: 120 })
    .withMessage('Age must be between 16 and 120'),

  body('address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address cannot exceed 200 characters'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Notes cannot exceed 2000 characters'),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),

  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Each tag cannot exceed 30 characters'),

  handleValidationErrors
];

const validateClientUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),

  body('phone')
    .optional()
    .trim()
    .matches(/^(\+34|0034|34)?[6-9]\d{8}$/)
    .withMessage('Please provide a valid Spanish phone number'),

  body('age')
    .optional()
    .isInt({ min: 16, max: 120 })
    .withMessage('Age must be between 16 and 120'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'demo'])
    .withMessage('Status must be active, inactive, or demo'),

  handleValidationErrors
];

// Booking validation rules
const validateBookingCreate = [
  body('date')
    .isISO8601()
    .withMessage('Date must be a valid date')
    .custom((value) => {
      const bookingDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (bookingDate < today) {
        throw new Error('Booking date cannot be in the past');
      }
      return true;
    }),

  body('startTime')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:mm format'),

  body('endTime')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:mm format')
    .custom((value, { req }) => {
      const startTime = req.body.startTime;
      if (startTime && value <= startTime) {
        throw new Error('End time must be after start time');
      }
      return true;
    }),

  body('clientId')
    .isUUID(4)
    .withMessage('Valid client ID (UUID) is required'),

  body('therapyType')
    .notEmpty()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Therapy type is required and cannot exceed 100 characters'),

  body('therapyDuration')
    .optional()
    .isInt({ min: 15, max: 240 })
    .withMessage('Therapy duration must be between 15 and 240 minutes'),

  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),

  body('currency')
    .optional()
    .isIn(['EUR', 'USD', 'GBP'])
    .withMessage('Currency must be EUR, USD, or GBP'),

  body('location')
    .notEmpty()
    .trim()
    .withMessage('Location is required'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),

  body('meetingLink')
    .optional()
    .isURL()
    .withMessage('Meeting link must be a valid URL'),

  handleValidationErrors
];

const validateBookingUpdate = [
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid date'),

  body('startTime')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:mm format'),

  body('endTime')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:mm format'),

  body('status')
    .optional()
    .isIn(['upcoming', 'pending', 'completed', 'cancelled', 'no_show', 'client_arrived'])
    .withMessage('Invalid booking status'),

  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),

  handleValidationErrors
];

// Parameter validation - UUID for Supabase
const validateUUID = [
  param('id')
    .isUUID(4)
    .withMessage('Invalid ID format. Must be a valid UUID'),

  handleValidationErrors
];

// Keep validateMongoId as alias for backward compatibility
const validateMongoId = validateUUID;

// Query validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  handleValidationErrors
];

const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date')
    .custom((value, { req }) => {
      if (req.query.startDate && value < req.query.startDate) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),

  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUserUpdate,
  validateProfileUpdate,
  validateEducation,
  validateExperience,
  validateClientCreate,
  validateClientUpdate,
  validateBookingCreate,
  validateBookingUpdate,
  validateUUID,
  validateMongoId, // Alias for backward compatibility
  validatePagination,
  validateDateRange
};
