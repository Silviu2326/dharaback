const express = require('express');
const {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  cancelBooking,
  completeBooking,
  markNoShow,
  getBookingStats,
  getUpcomingBookings,
  rescheduleBooking,
  // Client functions
  getClientBookings,
  getClientBooking,
  getClientUpcomingBookings,
  cancelClientBooking,
  requestReschedule,
  createClientBooking
} = require('../controllers/bookingController');
const { protect, protectClient } = require('../middleware/auth');

const router = express.Router();

// Client specific routes - use protectClient middleware only (no general protect middleware)
router.post('/client/book', protectClient, createClientBooking);
router.get('/client/upcoming', protectClient, getClientUpcomingBookings);
router.route('/client')
  .get(protectClient, getClientBookings);

router.route('/client/:id')
  .get(protectClient, getClientBooking)
  .delete(protectClient, cancelClientBooking);

router.put('/client/:id/reschedule-request', protectClient, requestReschedule);

// All other routes are protected with therapist/user authentication
router.use(protect);

// Statistics and special queries
router.get('/stats', getBookingStats);
router.get('/statistics', getBookingStats);
router.get('/upcoming', getUpcomingBookings);

// Main booking CRUD routes
router.route('/')
  .get(getBookings)
  .post(createBooking);

router.route('/:id')
  .get(getBooking)
  .put(updateBooking)
  .delete(cancelBooking);

// Booking status actions
router.put('/:id/complete', completeBooking);
router.put('/:id/no-show', markNoShow);
router.put('/:id/reschedule', rescheduleBooking);

module.exports = router;