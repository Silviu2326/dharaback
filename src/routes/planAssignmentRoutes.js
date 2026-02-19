const express = require('express');
const { body, param } = require('express-validator');
const planAssignmentController = require('../controllers/planAssignmentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Validation rules
const createValidation = [
  body('therapyPlanId')
    .isUUID(4)
    .withMessage('Therapy plan ID must be valid'),
  body('clientId')
    .isUUID(4)
    .withMessage('Client ID must be valid'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date'),
  body('goals')
    .optional()
    .isArray()
    .withMessage('Goals must be an array'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
];

const updateValidation = [
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  body('goals')
    .optional()
    .isArray()
    .withMessage('Goals must be an array'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date')
];

const sessionCompletionValidation = [
  body('sessionId')
    .optional()
    .isUUID(4)
    .withMessage('Session ID must be valid'),
  body('notes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Session notes cannot exceed 2000 characters'),
  body('milestonesCompleted')
    .optional()
    .isArray()
    .withMessage('Milestones completed must be an array')
];

const milestoneValidation = [
  body('milestoneIndex')
    .isInt({ min: 0 })
    .withMessage('Milestone index must be a non-negative integer')
];

const pauseValidation = [
  body('reason')
    .notEmpty()
    .withMessage('Pause reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const completeValidation = [
  body('finalNotes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Completion notes cannot exceed 2000 characters'),
  body('outcome')
    .optional()
    .isIn(['successful', 'partial', 'discontinued', 'transferred'])
    .withMessage('Invalid outcome value')
];

const idValidation = [
  param('assignmentId')
    .isUUID(4)
    .withMessage('Assignment ID must be valid')
];

const clientIdValidation = [
  param('clientId')
    .isUUID(4)
    .withMessage('Client ID must be valid')
];

// Main routes
router.get('/', planAssignmentController.getPlanAssignments);
router.post('/', createValidation, planAssignmentController.createPlanAssignment);
router.get('/stats', planAssignmentController.getAssignmentStats);

// Individual assignment routes
router.get('/:assignmentId', idValidation, planAssignmentController.getPlanAssignment);
router.put('/:assignmentId', idValidation, updateValidation, planAssignmentController.updatePlanAssignment);
router.delete('/:assignmentId', idValidation, planAssignmentController.deletePlanAssignment);

// Session management
router.post('/:assignmentId/session-completion', idValidation, sessionCompletionValidation, planAssignmentController.recordSessionCompletion);

// Milestone tracking
router.post('/:assignmentId/milestone', idValidation, milestoneValidation, planAssignmentController.completeMilestone);

// Assignment workflow
router.post('/:assignmentId/pause', idValidation, pauseValidation, planAssignmentController.pauseAssignment);
router.post('/:assignmentId/resume', idValidation, planAssignmentController.resumeAssignment);
router.post('/:assignmentId/complete', idValidation, completeValidation, planAssignmentController.completeAssignment);

module.exports = router;
