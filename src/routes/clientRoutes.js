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
  getAvailableTherapists
} = require('../controllers/clientController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', registerClient);
router.post('/login', loginClient);
router.get('/available-therapists', getAvailableTherapists);

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

module.exports = router;