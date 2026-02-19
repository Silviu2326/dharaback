const express = require('express');
const { body, param, query } = require('express-validator');
const clientPlanProgressController = require('../controllers/clientPlanProgressController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Validation rules
const createValidation = [
  body('clientId')
    .isMongoId()
    .withMessage('Client ID must be valid'),
  body('planId')
    .isMongoId()
    .withMessage('Plan ID must be valid'),
  body('objective')
    .notEmpty()
    .withMessage('Objective is required')
    .isLength({ max: 500 })
    .withMessage('Objective cannot exceed 500 characters'),
  body('status')
    .optional()
    .isIn(['not_started', 'in_progress', 'completed'])
    .withMessage('Status must be one of: not_started, in_progress, completed'),
  body('notes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Notes cannot exceed 2000 characters')
];

const updateValidation = [
  body('objective')
    .optional()
    .notEmpty()
    .withMessage('Objective cannot be empty')
    .isLength({ max: 500 })
    .withMessage('Objective cannot exceed 500 characters'),
  body('status')
    .optional()
    .isIn(['not_started', 'in_progress', 'completed'])
    .withMessage('Status must be one of: not_started, in_progress, completed'),
  body('notes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Notes cannot exceed 2000 characters')
];

const bulkUpdateValidation = [
  body('progressIds')
    .isArray({ min: 1 })
    .withMessage('Progress IDs array is required and must not be empty'),
  body('progressIds.*')
    .isMongoId()
    .withMessage('Each progress ID must be valid'),
  body('status')
    .isIn(['not_started', 'in_progress', 'completed'])
    .withMessage('Status must be one of: not_started, in_progress, completed'),
  body('notes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Notes cannot exceed 2000 characters')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('ID must be valid')
];

const clientPlanValidation = [
  param('clientId')
    .isMongoId()
    .withMessage('Client ID must be valid'),
  param('planId')
    .isMongoId()
    .withMessage('Plan ID must be valid')
];

const clientIdValidation = [
  param('clientId')
    .isMongoId()
    .withMessage('Client ID must be valid')
];

const planIdValidation = [
  param('planId')
    .isMongoId()
    .withMessage('Plan ID must be valid')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const statusFilterValidation = [
  query('status')
    .optional()
    .isIn(['not_started', 'in_progress', 'completed'])
    .withMessage('Status must be one of: not_started, in_progress, completed')
];

// Main routes for client-plan progress
router.get('/:clientId/:planId',
  clientPlanValidation,
  clientPlanProgressController.getAllProgress
);

router.get('/:id',
  idValidation,
  clientPlanProgressController.getProgressById
);

router.post('/',
  createValidation,
  clientPlanProgressController.createProgress
);

router.put('/:id',
  idValidation,
  updateValidation,
  clientPlanProgressController.updateProgress
);

router.delete('/:id',
  idValidation,
  clientPlanProgressController.deleteProgress
);

// Progress by plan routes
router.get('/plan/:planId',
  planIdValidation,
  paginationValidation,
  statusFilterValidation,
  clientPlanProgressController.getProgressByPlan
);

// Progress by client routes
router.get('/client/:clientId',
  clientIdValidation,
  paginationValidation,
  statusFilterValidation,
  [
    query('planId')
      .optional()
      .isMongoId()
      .withMessage('Plan ID must be valid')
  ],
  clientPlanProgressController.getProgressByClient
);

// Therapist overview route
router.get('/overview/therapist',
  [
    query('therapistId')
      .optional()
      .isMongoId()
      .withMessage('Therapist ID must be valid')
  ],
  clientPlanProgressController.getTherapistOverview
);

// Bulk operations
router.patch('/bulk/status',
  bulkUpdateValidation,
  clientPlanProgressController.bulkUpdateStatus
);

module.exports = router;