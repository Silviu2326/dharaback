const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { body, param, query } = require('express-validator');
const therapyPlanController = require('../controllers/therapyPlanController');

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
const createPlanValidation = [
  body('name')
    .isLength({ min: 3, max: 200 })
    .withMessage('Plan name must be between 3 and 200 characters'),
  body('type')
    .isIn(['ansiedad', 'depresion', 'pareja', 'trauma', 'adicciones', 'autoestima', 'estres', 'trastornos_alimentarios', 'duelo', 'toc', 'other'])
    .withMessage('Invalid plan type'),
  body('description')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('duration')
    .isInt({ min: 1, max: 104 })
    .withMessage('Duration must be between 1 and 104 weeks'),
  body('sessionsPerWeek')
    .isInt({ min: 1, max: 7 })
    .withMessage('Sessions per week must be between 1 and 7'),
  body('objectives')
    .isArray({ min: 1 })
    .withMessage('At least one objective is required'),
  body('objectives.*')
    .isLength({ min: 5, max: 500 })
    .withMessage('Each objective must be between 5 and 500 characters')
];

const updatePlanValidation = [
  body('name')
    .optional()
    .isLength({ min: 3, max: 200 })
    .withMessage('Plan name must be between 3 and 200 characters'),
  body('type')
    .optional()
    .isIn(['ansiedad', 'depresion', 'pareja', 'trauma', 'adicciones', 'autoestima', 'estres', 'trastornos_alimentarios', 'duelo', 'toc', 'other'])
    .withMessage('Invalid plan type'),
  body('description')
    .optional()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('duration')
    .optional()
    .isInt({ min: 1, max: 104 })
    .withMessage('Duration must be between 1 and 104 weeks'),
  body('sessionsPerWeek')
    .optional()
    .isInt({ min: 1, max: 7 })
    .withMessage('Sessions per week must be between 1 and 7')
];

// Public routes (no additional authorization required)

// GET /api/plans - Get therapy plans with filters and pagination
router.get('/', therapyPlanController.getTherapyPlans);

// GET /api/plans/stats - Get therapy plan statistics
router.get('/stats', therapyPlanController.getTherapyPlanStats);

// GET /api/plans/popular - Get popular therapy plans
router.get('/popular', therapyPlanController.getPopularPlans);

// GET /api/plans/type/:type - Get plans by type
router.get('/type/:type',
  param('type').isIn(['ansiedad', 'depresion', 'pareja', 'trauma', 'adicciones', 'autoestima', 'estres', 'trastornos_alimentarios', 'duelo', 'toc', 'other'])
    .withMessage('Invalid plan type'),
  therapyPlanController.getPlansByType
);

// GET /api/plans/:planId - Get single therapy plan
router.get('/:planId',
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  therapyPlanController.getTherapyPlan
);

// GET /api/plans/:planId/schedule - Calculate session schedule
router.get('/:planId/schedule',
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  query('startDate').isISO8601().withMessage('Valid start date is required'),
  therapyPlanController.calculateSessionSchedule
);

// Protected routes (require therapist role)

// POST /api/plans - Create new therapy plan
router.post('/',
  authorize('therapist', 'admin'),
  convertObjectivesMiddleware,
  createPlanValidation,
  therapyPlanController.createTherapyPlan
);

// PUT /api/plans/:planId - Update therapy plan
router.put('/:planId',
  authorize('therapist', 'admin'),
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  updatePlanValidation,
  therapyPlanController.updateTherapyPlan
);

// DELETE /api/plans/:planId - Delete therapy plan
router.delete('/:planId',
  authorize('therapist', 'admin'),
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  therapyPlanController.deleteTherapyPlan
);

// Plan management routes

// POST /api/plans/:planId/activate - Activate therapy plan
router.post('/:planId/activate',
  authorize('therapist', 'admin'),
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  therapyPlanController.activateTherapyPlan
);

// POST /api/plans/:planId/archive - Archive therapy plan
router.post('/:planId/archive',
  authorize('therapist', 'admin'),
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  therapyPlanController.archiveTherapyPlan
);

// POST /api/plans/:planId/template - Create template from therapy plan
router.post('/:planId/template',
  authorize('therapist', 'admin'),
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  therapyPlanController.createTemplate
);

// Sharing and assignment routes

// POST /api/plans/:planId/share - Share therapy plan with another therapist
router.post('/:planId/share',
  authorize('therapist', 'admin'),
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  body('therapistId').isMongoId().withMessage('Valid therapist ID is required'),
  body('permissions').optional().isIn(['view', 'edit', 'copy']).withMessage('Invalid permissions'),
  therapyPlanController.shareTherapyPlan
);

// POST /api/plans/:planId/assign - Assign therapy plan to client
router.post('/:planId/assign',
  authorize('therapist', 'admin'),
  param('planId').isMongoId().withMessage('Invalid plan ID'),
  body('clientId').isMongoId().withMessage('Valid client ID is required'),
  body('startDate').optional().isISO8601().withMessage('Invalid start date'),
  therapyPlanController.assignToClient
);

module.exports = router;
