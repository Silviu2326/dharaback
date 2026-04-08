const express = require('express');
const {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  cancelBooking,
  patchCancelBooking,
  cancelBookingReminders,
  sendCancelNotification,
  completeBooking,
  completeClientBooking,
  markNoShow,
  getBookingStats,
  getUpcomingBookings,
  rescheduleBooking,
  markPackPaid,
  getClientCompletedTherapists,
  // Client functions
  getClientBookings,
  getClientBooking,
  getClientUpcomingBookings,
  cancelClientBooking,
  requestReschedule,
  createClientBooking
} = require('../controllers/bookingController');
const { checkAvailability } = require('../controllers/bookings/availabilityController');
const { protect, protectClient, protectMixed } = require('../middleware/auth');

const router = express.Router();

console.log('📝 Registrando rutas de bookings...');

// Client specific routes - use protectClient middleware only (no general protect middleware)
router.post('/client/book', protectClient, createClientBooking);
router.get('/client/upcoming', protectClient, getClientUpcomingBookings);
router.get('/client/completed-therapists', protectClient, (req, res, next) => {
  console.log('🎯 Ruta /client/completed-therapists alcanzada');
  getClientCompletedTherapists(req, res, next);
});
router.route('/client')
  .get(protectClient, getClientBookings);

router.route('/client/:id')
  .get(protectClient, getClientBooking)
  .delete(protectClient, cancelClientBooking);

router.put('/client/:id/reschedule-request', protectClient, requestReschedule);
router.put('/client/:id/complete', protectMixed, completeClientBooking);

// All other routes are protected with therapist/user authentication
router.use(protect);

// Statistics and special queries
router.get('/stats', getBookingStats);
router.get('/statistics', getBookingStats);
router.get('/upcoming', getUpcomingBookings);

// Check availability endpoint
router.get('/check-availability', checkAvailability);

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
router.patch('/:id/mark-pack-paid', markPackPaid);

// New routes for frontend compatibility
// PATCH /:id/cancel - Alternative cancel endpoint (returns updated booking)
router.patch('/:id/cancel', patchCancelBooking);

// DELETE /:id/reminders - Cancel reminders for a booking
router.delete('/:id/reminders', cancelBookingReminders);

// POST /:id/cancel-notify - Send cancellation notification
router.post('/:id/cancel-notify', sendCancelNotification);

module.exports = router;
