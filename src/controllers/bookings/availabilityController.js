/**
 * Availability Controller
 * Verifica disponibilidad de horarios
 */

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../../config/supabase');

// @desc    Check availability for a time slot
// @route   GET /api/bookings/check-availability
// @access  Private
const checkAvailability = asyncHandler(async (req, res, next) => {
  const { therapistId, date_time, duration, location_id, include_reasons } = req.query;

  if (!therapistId || !date_time) {
    return next(new AppError('therapistId and date_time are required', 400));
  }

  // Parse date_time to extract date and time
  const dateTimeObj = new Date(date_time);
  const date = dateTimeObj.toISOString().split('T')[0];
  const time = dateTimeObj.toTimeString().slice(0, 5);

  // Check for existing bookings at this time
  const { data: existingBookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('therapist_id', therapistId)
    .eq('date', date)
    .eq('start_time', time)
    .not('status', 'in', '("cancelled","no_show")')
    .limit(1);

  if (error) {
    console.error('Error checking availability:', error);
    return next(new AppError('Failed to check availability', 500));
  }

  const isAvailable = !existingBookings || existingBookings.length === 0;

  const response = {
    available: isAvailable,
    date_time: date_time,
    therapist_id: therapistId,
    duration: parseInt(duration) || 60,
    conflicts: isAvailable ? [] : existingBookings.map(b => ({
      id: b.id,
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      status: b.status
    }))
  };

  if (include_reasons === 'true' && !isAvailable) {
    response.reasons = ['Time slot already booked'];
  }

  res.status(200).json({
    success: true,
    data: response
  });
});

module.exports = {
  checkAvailability
};
