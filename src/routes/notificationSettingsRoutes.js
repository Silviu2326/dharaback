const express = require('express');
const { body, param } = require('express-validator');
const notificationSettingsController = require('../controllers/notificationSettingsController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

const emailValidation = [
  body('enabled').optional().isBoolean(),
  body('address').optional().isEmail(),
  body('frequency').optional().isIn(['immediate', 'hourly', 'daily', 'weekly', 'never']),
  body('preferences.booking').optional().isBoolean(),
  body('preferences.payment').optional().isBoolean(),
  body('preferences.reminder').optional().isBoolean(),
  body('preferences.marketing').optional().isBoolean()
];

const smsValidation = [
  body('enabled').optional().isBoolean(),
  body('phoneNumber').optional().isMobilePhone(),
  body('frequency').optional().isIn(['immediate', 'hourly', 'daily', 'never']),
  body('preferences.urgentOnly').optional().isBoolean(),
  body('preferences.booking').optional().isBoolean(),
  body('preferences.payment').optional().isBoolean(),
  body('preferences.reminder').optional().isBoolean()
];

const pushValidation = [
  body('enabled').optional().isBoolean(),
  body('frequency').optional().isIn(['immediate', 'hourly', 'daily', 'never']),
  body('quietHours.enabled').optional().isBoolean(),
  body('quietHours.start').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('quietHours.end').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('preferences.booking').optional().isBoolean(),
  body('preferences.payment').optional().isBoolean(),
  body('preferences.reminder').optional().isBoolean()
];

const categoryValidation = [
  body('enabled').optional().isBoolean(),
  body('channels').optional().isArray(),
  body('channels.*').optional().isIn(['email', 'sms', 'push', 'inApp', 'webhook']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('frequency').optional().isIn(['daily', 'weekly', 'monthly', 'never'])
];

const doNotDisturbValidation = [
  body('enabled').optional().isBoolean(),
  body('start').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('end').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('days').optional().isArray(),
  body('days.*').optional().isIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
  body('timezone').optional().isString()
];

const testNotificationValidation = [
  body('channel').isIn(['email', 'sms', 'push', 'inApp']).withMessage('Invalid channel'),
  body('category').optional().isIn(['booking', 'payment', 'reminder', 'message', 'marketing', 'system', 'security'])
];

const categoryParamValidation = [
  param('category').isIn(['booking', 'payment', 'reminder', 'message', 'marketing', 'system', 'security'])
];

// Main settings routes
router.get('/', notificationSettingsController.getSettings);
router.put('/', notificationSettingsController.updateSettings);

// Channel-specific settings
router.put('/email', emailValidation, notificationSettingsController.updateEmailSettings);
router.put('/sms', smsValidation, notificationSettingsController.updateSmsSettings);
router.put('/push', pushValidation, notificationSettingsController.updatePushSettings);

// Category settings
router.put('/categories/:category', categoryParamValidation, categoryValidation, notificationSettingsController.updateCategorySettings);
router.get('/categories/:category/channels', categoryParamValidation, notificationSettingsController.getPreferredChannels);

// Do Not Disturb
router.put('/do-not-disturb', doNotDisturbValidation, notificationSettingsController.updateDoNotDisturb);

// Test notification
router.post('/test', testNotificationValidation, notificationSettingsController.testNotification);

// Stats (admin only)
router.get('/stats', authorize(['admin']), notificationSettingsController.getChannelStats);

module.exports = router;
