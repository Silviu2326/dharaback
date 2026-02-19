const express = require('express');
const {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  checkIsFavorite,
  updateFavoriteNotes,
  getFavoriteStats,
  getPopularTherapists,
  bulkManageFavorites
} = require('../controllers/favoriteController');
const { protectClient } = require('../middleware/auth');

const router = express.Router();

// Public routes (no authentication required)
router.get('/popular', getPopularTherapists);
router.get('/stats/:therapistId', getFavoriteStats);

// Client specific routes - require client authentication
router.use(protectClient);

// Main favorites routes
router.route('/')
  .get(getFavorites); // Get client's favorite therapists

// Bulk operations
router.post('/bulk', bulkManageFavorites);

// Check if specific therapist is favorite
router.get('/check/:therapistId', checkIsFavorite);

// Manage individual favorites
router.route('/:therapistId')
  .post(addToFavorites)        // Add therapist to favorites
  .put(updateFavoriteNotes)    // Update favorite notes
  .delete(removeFromFavorites); // Remove from favorites

module.exports = router;