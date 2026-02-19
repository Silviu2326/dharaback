const express = require('express');
const { body, param, query } = require('express-validator');
const therapyPlanController = require('../controllers/therapyPlanController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Middleware to convert objectives from object { '0': 'text' } to array ['text']
const convertObjectivesMiddleware = (req, res, next) => {
  if (req.body && req.body.objectives && typeof req.body.objectives === 'object' && !Array.isArray(req.body.objectives)) {
    const objectivesArray = Object.values(req.body.objectives).filter(v => v && typeof v === 'string');
    if (objectivesArray.length > 0) {
      req.body.objectives = objectivesArray;
      console.log('🔄 Converted objectives to array:', req.body.objectives);
    }
  }
  next();
};

// Apply authentication to all routes
router.use(protect);

// Validation rules
const createValidation = [
  body('name')
    .notEmpty()
    .withMessage('Plan name is required')
    .isLength({ max: 200 })
    .withMessage('Plan name cannot exceed 200 characters'),
  body('type')
    .isIn(['ansiedad', 'depresion', 'pareja', 'trauma', 'adicciones', 'autoestima', 'estres', 'trastornos_alimentarios', 'duelo', 'toc', 'other'])
    .withMessage('Invalid plan type'),
  body('description')
    .notEmpty()
    .withMessage('Plan description is required')
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('duration')
    .isInt({ min: 1, max: 104 })
    .withMessage('Duration must be between 1 and 104 weeks'),
  body('sessionsPerWeek')
    .isInt({ min: 1, max: 7 })
    .withMessage('Sessions per week must be between 1 and 7'),
  body('objectives')
    .customSanitizer(value => {
      // Accept both array and object with numeric keys
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        // Convert object { '0': 'text' } to array ['text']
        const arr = Object.values(value).filter(v => v && typeof v === 'string');
        return arr.length > 0 ? arr : value;
      }
      return value;
    })
    .isArray({ min: 1 })
    .withMessage('At least one objective is required'),
  body('objectives.*')
    .isLength({ max: 500 })
    .withMessage('Each objective cannot exceed 500 characters'),
  body('category')
    .optional()
    .isIn(['individual', 'couple', 'family', 'group'])
    .withMessage('Invalid category'),
  body('ageGroup')
    .optional()
    .isIn(['child', 'adolescent', 'adult', 'elderly', 'all'])
    .withMessage('Invalid age group'),
  body('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid difficulty level')
];

const updateValidation = [
  body('name')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Plan name cannot exceed 200 characters'),
  body('type')
    .optional()
    .isIn(['ansiedad', 'depresion', 'pareja', 'trauma', 'adicciones', 'autoestima', 'estres', 'trastornos_alimentarios', 'duelo', 'toc', 'other'])
    .withMessage('Invalid plan type'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('duration')
    .optional()
    .isInt({ min: 1, max: 104 })
    .withMessage('Duration must be between 1 and 104 weeks'),
  body('sessionsPerWeek')
    .optional()
    .isInt({ min: 1, max: 7 })
    .withMessage('Sessions per week must be between 1 and 7'),
  body('objectives')
    .optional()
    .customSanitizer(value => {
      // Accept both array and object with numeric keys
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        const arr = Object.values(value).filter(v => v && typeof v === 'string');
        return arr.length > 0 ? arr : value;
      }
      return value;
    })
    .isArray()
    .withMessage('Objectives must be an array'),
  body('objectives.*')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Each objective cannot exceed 500 characters'),
  body('category')
    .optional()
    .isIn(['individual', 'couple', 'family', 'group'])
    .withMessage('Invalid category'),
  body('ageGroup')
    .optional()
    .isIn(['child', 'adolescent', 'adult', 'elderly', 'all'])
    .withMessage('Invalid age group'),
  body('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid difficulty level')
];

const shareValidation = [
  body('therapistId')
    .isUUID(4)
    .withMessage('Therapist ID must be valid'),
  body('permissions')
    .optional()
    .isIn(['view', 'edit', 'copy'])
    .withMessage('Invalid permissions')
];

const assignValidation = [
  body('clientId')
    .isUUID(4)
    .withMessage('Client ID must be valid'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('customizations')
    .optional()
    .isObject()
    .withMessage('Customizations must be an object')
];

const idValidation = [
  param('planId')
    .isUUID(4)
    .withMessage('Plan ID must be valid')
];

const typeValidation = [
  param('type')
    .isIn(['ansiedad', 'depresion', 'pareja', 'trauma', 'adicciones', 'autoestima', 'estres', 'trastornos_alimentarios', 'duelo', 'toc', 'other'])
    .withMessage('Invalid plan type')
];

// Main routes
router.get('/', therapyPlanController.getTherapyPlans);
router.post('/', authorize('therapist', 'admin'), convertObjectivesMiddleware, createValidation, therapyPlanController.createTherapyPlan);
router.get('/stats', therapyPlanController.getTherapyPlanStats);
router.get('/popular', therapyPlanController.getPopularPlans);

// Type-based routes
router.get('/type/:type', typeValidation, therapyPlanController.getPlansByType);

// Individual plan routes
router.get('/:planId', idValidation, therapyPlanController.getTherapyPlan);
router.put('/:planId', idValidation, updateValidation, therapyPlanController.updateTherapyPlan);
router.delete('/:planId', idValidation, therapyPlanController.deleteTherapyPlan);

// Plan workflow routes
router.post('/:planId/activate', idValidation, therapyPlanController.activateTherapyPlan);
router.post('/:planId/archive', idValidation, therapyPlanController.archiveTherapyPlan);
router.post('/:planId/template', idValidation, therapyPlanController.createTemplate);

// Sharing and collaboration
router.post('/:planId/share', idValidation, shareValidation, therapyPlanController.shareTherapyPlan);

// Assignment to clients
router.post('/:planId/assign', idValidation, assignValidation, therapyPlanController.assignToClient);

// Schedule calculation
router.get('/:planId/schedule', idValidation, [
  query('startDate')
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Start date must be a valid date')
], therapyPlanController.calculateSessionSchedule);

module.exports = router;
