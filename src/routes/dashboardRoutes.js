const express = require('express');
const {
  getClientDashboard,
  getTherapistDashboard,
  getDashboardStats
} = require('../controllers/dashboardController');
const { protect, protectClient } = require('../middleware/auth');

const router = express.Router();

// Client dashboard routes
router.get('/client', protectClient, getClientDashboard);

// Therapist dashboard routes
router.use(protect); // All routes below require therapist authentication
router.get('/therapist', getTherapistDashboard);
router.get('/stats', getDashboardStats);

module.exports = router;