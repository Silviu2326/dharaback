const express = require('express');
const { body, param, query } = require('express-validator');
const auditLogController = require('../controllers/auditLogController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const createValidation = [
  body('action')
    .isIn([
      'login', 'logout', 'login_failed', 'password_change', 'profile_update',
      'create', 'read', 'update', 'delete', 'export', 'import',
      'booking_create', 'booking_update', 'booking_cancel',
      'payment_process', 'payment_refund', 'file_upload', 'file_download', 'file_delete',
      'email_send', 'sms_send', 'integration_connect', 'integration_disconnect',
      'webhook_trigger', 'data_sync', 'backup_create', 'backup_restore',
      'permission_change', 'role_change', 'subscription_create', 'subscription_update', 'subscription_cancel',
      'coupon_create', 'coupon_use', 'notification_send', 'security_alert', 'api_call',
      'bulk_operation', 'data_migration', 'system_maintenance'
    ])
    .withMessage('Invalid action'),
  body('resource.type')
    .isIn([
      'user', 'client', 'booking', 'payment', 'document', 'session', 'review',
      'notification', 'integration', 'webhook', 'subscription', 'coupon', 'plan',
      'credential', 'rate', 'package', 'location', 'setting', 'file', 'report',
      'backup', 'system'
    ])
    .withMessage('Invalid resource type'),
  body('resource.id')
    .optional()
    .isMongoId()
    .withMessage('Resource ID must be valid'),
  body('resource.name')
    .optional()
    .isString()
    .withMessage('Resource name must be string'),
  body('category')
    .isIn(['security', 'data', 'system', 'user', 'api', 'integration', 'payment', 'communication'])
    .withMessage('Invalid category'),
  body('severity')
    .optional()
    .isIn(['info', 'warning', 'error', 'critical'])
    .withMessage('Invalid severity'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('context.clientId')
    .optional()
    .isMongoId()
    .withMessage('Client ID must be valid'),
  body('context.bookingId')
    .optional()
    .isMongoId()
    .withMessage('Booking ID must be valid'),
  body('context.integrationId')
    .optional()
    .isMongoId()
    .withMessage('Integration ID must be valid'),
  body('context.correlationId')
    .optional()
    .isString()
    .withMessage('Correlation ID must be string')
];

const archiveValidation = [
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO8601 date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO8601 date'),
  body('category')
    .optional()
    .isIn(['security', 'data', 'system', 'user', 'api', 'integration', 'payment', 'communication'])
    .withMessage('Invalid category'),
  body('severity')
    .optional()
    .isIn(['info', 'warning', 'error', 'critical'])
    .withMessage('Invalid severity')
];

const exportValidation = [
  query('format')
    .optional()
    .isIn(['json', 'csv'])
    .withMessage('Format must be json or csv'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO8601 date'),
  query('userId')
    .optional()
    .isMongoId()
    .withMessage('User ID must be valid'),
  query('category')
    .optional()
    .isIn(['security', 'data', 'system', 'user', 'api', 'integration', 'payment', 'communication'])
    .withMessage('Invalid category'),
  query('severity')
    .optional()
    .isIn(['info', 'warning', 'error', 'critical'])
    .withMessage('Invalid severity'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Limit must be between 1 and 10000')
];

const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),
  query('userId')
    .optional()
    .isMongoId()
    .withMessage('User ID must be valid'),
  query('action')
    .optional()
    .isString()
    .withMessage('Action must be string'),
  query('category')
    .optional()
    .isIn(['security', 'data', 'system', 'user', 'api', 'integration', 'payment', 'communication'])
    .withMessage('Invalid category'),
  query('severity')
    .optional()
    .isIn(['info', 'warning', 'error', 'critical'])
    .withMessage('Invalid severity'),
  query('resourceType')
    .optional()
    .isString()
    .withMessage('Resource type must be string'),
  query('resourceId')
    .optional()
    .isMongoId()
    .withMessage('Resource ID must be valid'),
  query('success')
    .optional()
    .isBoolean()
    .withMessage('Success must be boolean'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO8601 date')
];

const activityValidation = [
  query('timeframe')
    .optional()
    .isIn(['1h', '24h', '7d', '30d'])
    .withMessage('Invalid timeframe'),
  query('userId')
    .optional()
    .isMongoId()
    .withMessage('User ID must be valid')
];

const securityValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO8601 date'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000')
];

const suspiciousValidation = [
  query('since')
    .optional()
    .isISO8601()
    .withMessage('Since must be valid ISO8601 date'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage('Limit must be between 1 and 500')
];

const resourceValidation = [
  param('resourceType')
    .isIn([
      'user', 'client', 'booking', 'payment', 'document', 'session', 'review',
      'notification', 'integration', 'webhook', 'subscription', 'coupon', 'plan',
      'credential', 'rate', 'package', 'location', 'setting', 'file', 'report',
      'backup', 'system'
    ])
    .withMessage('Invalid resource type'),
  param('resourceId')
    .isMongoId()
    .withMessage('Resource ID must be valid')
];

const logIdValidation = [
  param('logId')
    .isMongoId()
    .withMessage('Log ID must be valid')
];

const searchValidation = [
  query('q')
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 3 })
    .withMessage('Search query must be at least 3 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const statisticsValidation = [
  query('timeframe')
    .optional()
    .isIn(['24h', '7d', '30d', '90d'])
    .withMessage('Invalid timeframe')
];

// Allow anonymous audit log creation
router.post('/', createValidation, auditLogController.createLog);

// Apply protection to all other routes
router.use(protect);

router.get('/', queryValidation, auditLogController.getLogs);

router.get('/activity', activityValidation, auditLogController.getUserActivity);
router.get('/security', authorize(['admin']), securityValidation, auditLogController.getSecurityEvents);
router.get('/suspicious', authorize(['admin']), suspiciousValidation, auditLogController.getSuspiciousActivity);
router.get('/statistics', authorize(['admin']), statisticsValidation, auditLogController.getLogStatistics);

router.get('/search', searchValidation, auditLogController.searchLogs);
router.get('/export', authorize(['admin']), exportValidation, auditLogController.exportLogs);

router.post('/archive', authorize(['admin']), archiveValidation, auditLogController.archiveLogs);
router.delete('/cleanup', authorize(['admin']), auditLogController.deleteExpiredLogs);

router.get('/resource/:resourceType/:resourceId', resourceValidation, auditLogController.getLogsByResource);

router.get('/:logId', logIdValidation, auditLogController.getLog);
router.post('/:logId/anonymize', authorize(['admin']), logIdValidation, auditLogController.anonymizeLog);

module.exports = router;
