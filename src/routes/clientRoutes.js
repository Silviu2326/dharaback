const express = require('express');
const {
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getClientsStats,
  getClientTags,
  updateClientAvatar,
  getClientSummary,
  bulkUpdateClients,
  registerClient,
  loginClient,
  getAvailableTherapists,
  getTherapistById,
  generateInvitationCode,
  sendInvitationEmail,
  validateInvitationCode,
  invalidateInvitationCodes,
  regenerateInvitationCode,
  getClientSettings,
  updateClientSettings,
  exportClientData
} = require('../controllers/clientController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', registerClient);
router.post('/login', loginClient);
router.get('/available-therapists', getAvailableTherapists);
router.get('/therapists/:id', getTherapistById);

// All other routes are protected
router.use(protect);

// Bulk operations
router.put('/bulk', bulkUpdateClients);

// Statistics and tags
router.get('/stats', getClientsStats);
router.get('/tags', getClientTags);

// Client CRUD routes
router.route('/')
  .get(getClients)
  .post(createClient);

router.route('/:id')
  .get(getClient)
  .put(updateClient)
  .delete(deleteClient);

// Client specific actions
router.post('/:id/avatar', updateClientAvatar);
router.get('/:id/summary', getClientSummary);
router.get('/:id/export', exportClientData);

// Invitation code routes
router.post('/invitation-code', protect, generateInvitationCode);
router.post('/send-invitation', protect, sendInvitationEmail);
router.get('/validate-invitation', validateInvitationCode);
router.post('/invalidate-codes', protect, invalidateInvitationCodes);
router.post('/:id/regenerate-code', protect, regenerateInvitationCode);

// Client settings routes
router.get('/settings', protect, getClientSettings);
router.put('/settings', protect, updateClientSettings);

module.exports = router;