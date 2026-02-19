const express = require('express');
const {
  getProfile,
  updateProfile,
  uploadAvatar,
  uploadBanner,
  deleteAccount,
  getUserStats,
  updatePreferences,
  getTherapists
} = require('../controllers/userController');
const { protect, authorize, checkOwnership } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// User profile routes
router.route('/profile')
  .get(getProfile)
  .put(updateProfile)
  .delete(deleteAccount);

// File upload routes
router.post('/upload-avatar', uploadAvatar);
router.post('/upload-banner', uploadBanner);

// User preferences
router.put('/preferences', updatePreferences);

// User statistics
router.get('/stats', getUserStats);

// Admin only routes
router.get('/therapists', authorize('admin'), getTherapists);

module.exports = router;