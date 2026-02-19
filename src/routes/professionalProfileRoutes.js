const express = require('express');
const {
  getProfile,
  updateProfile,
  updateStats,
  getProfileCompleteness,
  addEducation,
  updateEducation,
  deleteEducation,
  addExperience,
  updateExperience,
  deleteExperience,
  getPublicProfile
} = require('../controllers/professionalProfileController');
const { protect, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Public route for viewing therapist profiles
router.get('/public/:userId', optionalAuth, getPublicProfile);

// All other routes are protected
router.use(protect);

// Main profile routes
router.route('/')
  .get(getProfile)
  .put(updateProfile);

// Profile stats
router.put('/stats', updateStats);

// Profile completeness
router.get('/completeness', getProfileCompleteness);

// Education routes
router.route('/education')
  .post(addEducation);

router.route('/education/:id')
  .put(updateEducation)
  .delete(deleteEducation);

// Experience routes
router.route('/experience')
  .post(addExperience);

router.route('/experience/:id')
  .put(updateExperience)
  .delete(deleteExperience);

module.exports = router;