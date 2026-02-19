const express = require('express');
const { body, param, query } = require('express-validator');
const integrationController = require('../controllers/integrationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

const createValidation = [
  body('provider')
    .isIn([
      'google_calendar',
      'outlook_calendar',
      'zoom',
      'teams',
      'stripe',
      'paypal',
      'twilio',
      'sendgrid',
      'mailchimp',
      'whatsapp_business',
      'telegram',
      'slack',
      'discord',
      'google_drive',
      'dropbox',
      'onedrive'
    ])
    .withMessage('Invalid provider'),
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('category')
    .isIn(['calendar', 'video_conferencing', 'payment', 'communication', 'storage', 'productivity'])
    .withMessage('Invalid category'),
  body('therapistId')
    .optional()
    .isMongoId()
    .withMessage('Therapist ID must be valid'),
  body('config.webhookUrl')
    .optional()
    .isURL()
    .withMessage('Webhook URL must be valid'),
  body('syncFrequency')
    .optional()
    .isIn(['real_time', 'hourly', 'daily', 'weekly', 'manual'])
    .withMessage('Invalid sync frequency'),
  body('autoSync')
    .optional()
    .isBoolean()
    .withMessage('Auto sync must be boolean')
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
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'error', 'pending_auth', 'expired'])
    .withMessage('Invalid status'),
  body('syncFrequency')
    .optional()
    .isIn(['real_time', 'hourly', 'daily', 'weekly', 'manual'])
    .withMessage('Invalid sync frequency'),
  body('autoSync')
    .optional()
    .isBoolean()
    .withMessage('Auto sync must be boolean'),
  body('config.webhookUrl')
    .optional()
    .isURL()
    .withMessage('Webhook URL must be valid')
];

const connectValidation = [
  body('credentials')
    .isObject()
    .withMessage('Credentials object is required'),
  body('credentials.apiKey')
    .optional()
    .isString()
    .withMessage('API key must be string'),
  body('credentials.clientId')
    .optional()
    .isString()
    .withMessage('Client ID must be string'),
  body('credentials.clientSecret')
    .optional()
    .isString()
    .withMessage('Client secret must be string'),
  body('credentials.accessToken')
    .optional()
    .isString()
    .withMessage('Access token must be string'),
  body('credentials.refreshToken')
    .optional()
    .isString()
    .withMessage('Refresh token must be string')
];

const webhookValidation = [
  body('event')
    .notEmpty()
    .withMessage('Event is required')
    .isString()
    .withMessage('Event must be string'),
  body('url')
    .isURL()
    .withMessage('URL must be valid')
];

const idValidation = [
  param('integrationId')
    .isMongoId()
    .withMessage('Integration ID must be valid')
];

const therapistIdValidation = [
  param('therapistId')
    .isMongoId()
    .withMessage('Therapist ID must be valid')
];

const webhookIdValidation = [
  param('webhookId')
    .isMongoId()
    .withMessage('Webhook ID must be valid')
];

router.get('/', integrationController.getIntegrations);
router.post('/', createValidation, integrationController.createIntegration);

router.get('/provider-stats', authorize(['admin']), integrationController.getProviderStats);
router.get('/overdue-syncs', authorize(['admin']), integrationController.getOverdueSyncs);

router.get('/:integrationId', idValidation, integrationController.getIntegration);
router.put('/:integrationId', idValidation, updateValidation, integrationController.updateIntegration);
router.delete('/:integrationId', idValidation, integrationController.deleteIntegration);

router.post('/:integrationId/connect', idValidation, connectValidation, integrationController.connectIntegration);
router.post('/:integrationId/disconnect', idValidation, integrationController.disconnectIntegration);

router.post('/:integrationId/sync', idValidation, integrationController.triggerSync);
router.get('/:integrationId/sync-status', idValidation, integrationController.getSyncStatus);

router.get('/:integrationId/usage', idValidation, integrationController.getUsageStats);
router.post('/:integrationId/health-check', idValidation, integrationController.performHealthCheck);

router.get('/:integrationId/webhooks', idValidation, integrationController.getWebhooks);
router.post('/:integrationId/webhooks', idValidation, webhookValidation, integrationController.addWebhook);
router.delete('/:integrationId/webhooks/:webhookId', idValidation, webhookIdValidation, integrationController.removeWebhook);

module.exports = router;