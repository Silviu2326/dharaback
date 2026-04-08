/**
 * Booking Controller
 * Maneja todas las operaciones relacionadas con citas/reservas
 * 
 * Este archivo actúa como punto de entrada central que re-exporta
 * todas las funciones desde los módulos especializados.
 * 
 * Estructura:
 * - ./bookings/therapistBookings.js - Funciones para terapeutas
 * - ./bookings/clientBookings.js - Funciones para clientes  
 * - ./bookings/cancelOperations.js - Operaciones de cancelación
 * - ./bookings/bookingUtils.js - Utilidades compartidas
 */

// Therapist functions
const {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  completeBooking,
  markNoShow,
  rescheduleBooking,
  getBookingStats,
  getUpcomingBookings,
  markPackPaid
} = require('./bookings/therapistBookings');

// Client functions
const {
  getClientBookings,
  getClientBooking,
  getClientUpcomingBookings,
  cancelClientBooking,
  requestReschedule,
  createClientBooking,
  completeClientBooking,
  getClientCompletedTherapists
} = require('./bookings/clientBookings');

// Cancel operations
const {
  cancelBooking,
  patchCancelBooking,
  cancelBookingReminders,
  sendCancelNotification
} = require('./bookings/cancelOperations');

module.exports = {
  // Therapist functions
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  completeBooking,
  markNoShow,
  rescheduleBooking,
  getBookingStats,
  getUpcomingBookings,
  markPackPaid,

  // Client functions
  getClientBookings,
  getClientBooking,
  getClientUpcomingBookings,
  cancelClientBooking,
  requestReschedule,
  createClientBooking,
  completeClientBooking,
  getClientCompletedTherapists,
  
  // Cancel operations
  cancelBooking,
  patchCancelBooking,
  cancelBookingReminders,
  sendCancelNotification
};
