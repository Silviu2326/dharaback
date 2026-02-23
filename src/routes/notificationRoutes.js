const express = require('express');
const { body, param, query } = require('express-validator');
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Validation rules
const createNotificationValidation = [
  body('userId')
    .isMongoId()
    .withMessage('User ID must be valid'),
  body('type')
    .isIn(['appointment', 'message', 'document', 'payment', 'system', 'review', 'reminder', 'cancellation'])
    .withMessage('Invalid notification type'),
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),
  body('summary')
    .notEmpty()
    .withMessage('Summary is required')
    .isLength({ max: 500 })
    .withMessage('Summary cannot exceed 500 characters'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority level'),
  body('channels')
    .optional()
    .isArray()
    .withMessage('Channels must be an array'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expires at must be a valid date')
];

const settingsValidation = [
  body('email')
    .optional()
    .isBoolean()
    .withMessage('Email setting must be boolean'),
  body('push')
    .optional()
    .isBoolean()
    .withMessage('Push setting must be boolean'),
  body('sms')
    .optional()
    .isBoolean()
    .withMessage('SMS setting must be boolean'),
  body('types')
    .optional()
    .isObject()
    .withMessage('Types must be an object')
];

const bulkValidation = [
  body('notificationIds')
    .isArray({ min: 1 })
    .withMessage('Notification IDs must be a non-empty array'),
  body('notificationIds.*')
    .isMongoId()
    .withMessage('Each notification ID must be valid')
];

const deliveryStatusValidation = [
  body('channel')
    .isIn(['in_app', 'email', 'sms', 'push'])
    .withMessage('Invalid channel'),
  body('status')
    .isObject()
    .withMessage('Status must be an object')
];

const idValidation = [
  param('notificationId')
    .isMongoId()
    .withMessage('Notification ID must be valid')
];

const typeValidation = [
  param('type')
    .isIn(['appointment', 'message', 'document', 'payment', 'system', 'review', 'reminder', 'cancellation'])
    .withMessage('Invalid notification type')
];

// Notification management routes
router.get('/', notificationController.getNotifications);
router.post('/', createNotificationValidation, notificationController.createNotification);
router.get('/counts', notificationController.getNotificationCounts);
router.get('/analytics', notificationController.getNotificationAnalytics);
router.post('/mark-all-read', notificationController.markAllAsRead);
router.post('/clean-expired', notificationController.cleanExpiredNotifications);

// Individual notification routes
router.get('/:notificationId', idValidation, notificationController.getNotification);
router.post('/:notificationId/read', idValidation, notificationController.markAsRead);
router.post('/:notificationId/dismiss', idValidation, notificationController.dismissNotification);
router.post('/:notificationId/archive', idValidation, notificationController.archiveNotification);
router.post('/:notificationId/click', idValidation, notificationController.trackClick);

// Type-specific routes
router.get('/type/:type', typeValidation, notificationController.getNotificationsByType);

// Bulk operations
router.post('/bulk/mark-read', bulkValidation, notificationController.bulkMarkAsRead);
router.post('/bulk/archive', bulkValidation, notificationController.bulkArchive);

module.exports = router;
