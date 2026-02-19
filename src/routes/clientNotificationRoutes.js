const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getClientNotifications,
  getClientNotification,
  getClientNotificationCounts,
  markClientNotificationAsRead,
  dismissClientNotification,
  archiveClientNotification,
  getClientNotificationsByType,
  markAllClientNotificationsAsRead,
  trackClientNotificationClick
} = require('../controllers/notificationController');
const { protectClient } = require('../middleware/auth');

const router = express.Router();

// All routes require client authentication
router.use(protectClient);

// Validation rules
const notificationIdValidation = [
  param('notificationId')
    .isMongoId()
    .withMessage('Notification ID must be valid')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(['appointment', 'message', 'document', 'payment', 'system', 'review', 'reminder', 'cancellation'])
    .withMessage('Invalid notification type'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority level'),
  query('isRead')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isRead must be true or false'),
  query('includeArchived')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('includeArchived must be true or false')
];

const typeValidation = [
  param('type')
    .isIn(['appointment', 'message', 'document', 'payment', 'system', 'review', 'reminder', 'cancellation'])
    .withMessage('Invalid notification type')
];

const clickTrackingValidation = [
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

// Client notification routes

// Get all notifications for the client
router.get('/',
  paginationValidation,
  getClientNotifications
);

// Get client's notification counts
router.get('/counts',
  getClientNotificationCounts
);

// Mark all client notifications as read
router.post('/mark-all-read',
  markAllClientNotificationsAsRead
);

// Get notifications by type
router.get('/type/:type',
  typeValidation,
  getClientNotificationsByType
);

// Get a specific notification for the client
router.get('/:notificationId',
  notificationIdValidation,
  getClientNotification
);

// Mark notification as read
router.post('/:notificationId/read',
  notificationIdValidation,
  markClientNotificationAsRead
);

// Dismiss notification
router.post('/:notificationId/dismiss',
  notificationIdValidation,
  dismissClientNotification
);

// Archive notification
router.post('/:notificationId/archive',
  notificationIdValidation,
  archiveClientNotification
);

// Track notification click
router.post('/:notificationId/click',
  notificationIdValidation,
  clickTrackingValidation,
  trackClientNotificationClick
);

module.exports = router;