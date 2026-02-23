const express = require('express');
const { body, param, query } = require('express-validator');
const webhookController = require('../controllers/webhookController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

const createValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('url')
    .isURL()
    .withMessage('URL must be valid'),
  body('method')
    .optional()
    .isIn(['POST', 'PUT', 'PATCH'])
    .withMessage('Invalid HTTP method'),
  body('events')
    .isArray({ min: 1 })
    .withMessage('Events array is required and must not be empty'),
  body('events.*')
    .isIn([
      'booking.created',
      'booking.updated',
      'booking.cancelled',
      'booking.completed',
      'payment.received',
      'payment.failed',
      'client.created',
      'client.updated',
      'session.started',
      'session.ended',
      'document.uploaded',
      'review.created',
      'plan.assigned',
      'subscription.created',
      'subscription.cancelled',
      'coupon.used',
      'user.login',
      'user.logout',
      'integration.connected',
      'integration.disconnected',
      'sync.completed',
      'sync.failed'
    ])
    .withMessage('Invalid event type'),
  body('integrationId')
    .optional()
    .isMongoId()
    .withMessage('Integration ID must be valid'),
  body('therapistId')
    .optional()
    .isMongoId()
    .withMessage('Therapist ID must be valid'),
  body('authentication.type')
    .optional()
    .isIn(['none', 'bearer', 'basic', 'api_key', 'custom'])
    .withMessage('Invalid authentication type'),
  body('retryPolicy.maxRetries')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Max retries must be between 0 and 10'),
  body('timeout')
    .optional()
    .isInt({ min: 1000, max: 120000 })
    .withMessage('Timeout must be between 1000 and 120000 milliseconds')
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
  body('url')
    .optional()
    .isURL()
    .withMessage('URL must be valid'),
  body('method')
    .optional()
    .isIn(['POST', 'PUT', 'PATCH'])
    .withMessage('Invalid HTTP method'),
  body('events')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Events array must not be empty'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'error', 'suspended'])
    .withMessage('Invalid status'),
  body('retryPolicy.maxRetries')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Max retries must be between 0 and 10'),
  body('timeout')
    .optional()
    .isInt({ min: 1000, max: 120000 })
    .withMessage('Timeout must be between 1000 and 120000 milliseconds')
];

const filterValidation = [
  body('filters.conditions')
    .optional()
    .isArray()
    .withMessage('Conditions must be an array'),
  body('filters.conditions.*.field')
    .optional()
    .isString()
    .withMessage('Field must be a string'),
  body('filters.conditions.*.operator')
    .optional()
    .isIn(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'in', 'not_in'])
    .withMessage('Invalid operator'),
  body('filters.logic')
    .optional()
    .isIn(['AND', 'OR'])
    .withMessage('Logic must be AND or OR')
];

const disableValidation = [
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const idValidation = [
  param('webhookId')
    .isMongoId()
    .withMessage('Webhook ID must be valid')
];

const eventValidation = [
  param('event')
    .isIn([
      'booking.created',
      'booking.updated',
      'booking.cancelled',
      'booking.completed',
      'payment.received',
      'payment.failed',
      'client.created',
      'client.updated',
      'session.started',
      'session.ended',
      'document.uploaded',
      'review.created',
      'plan.assigned',
      'subscription.created',
      'subscription.cancelled',
      'coupon.used',
      'user.login',
      'user.logout',
      'integration.connected',
      'integration.disconnected',
      'sync.completed',
      'sync.failed'
    ])
    .withMessage('Invalid event type')
];

const therapistIdValidation = [
  param('therapistId')
    .isMongoId()
    .withMessage('Therapist ID must be valid')
];

const cleanupValidation = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
];

router.get('/', webhookController.getWebhooks);
router.post('/', createValidation, webhookController.createWebhook);

router.get('/unhealthy', authorize(['admin']), webhookController.getUnhealthyWebhooks);
router.post('/cleanup-logs', authorize(['admin']), cleanupValidation, webhookController.cleanupOldLogs);

router.get('/events/:event', eventValidation, webhookController.getWebhooksByEvent);

router.get('/:webhookId', idValidation, webhookController.getWebhook);
router.put('/:webhookId', idValidation, updateValidation, webhookController.updateWebhook);
router.delete('/:webhookId', idValidation, webhookController.deleteWebhook);

router.post('/:webhookId/test', idValidation, webhookController.testWebhook);
router.post('/:webhookId/enable', idValidation, webhookController.enableWebhook);
router.post('/:webhookId/disable', idValidation, disableValidation, webhookController.disableWebhook);

router.post('/:webhookId/regenerate-secret', idValidation, webhookController.regenerateSecret);
router.post('/:webhookId/retry-failed', idValidation, webhookController.retryFailedDeliveries);

router.get('/:webhookId/logs', idValidation, webhookController.getDeliveryLogs);
router.get('/:webhookId/statistics', idValidation, webhookController.getStatistics);

module.exports = router;