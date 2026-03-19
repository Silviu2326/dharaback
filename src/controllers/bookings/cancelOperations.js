/**
 * Cancel Operations Controller
 * Funciones relacionadas con cancelación de citas
 */

const { AppError, asyncHandler } = require('../../middleware/errorHandler');
const { supabase } = require('../../config/supabase');
const { sendCancellationEmail, validateCancellation } = require('./bookingUtils');

// @desc    Cancel booking
// @route   DELETE /api/bookings/:id
// @access  Private (Therapist)
const cancelBooking = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) return next(new AppError('Booking not found', 404));

  const validationError = validateCancellation(booking);
  if (validationError) return next(new AppError(validationError.message, validationError.statusCode));

  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_reason: reason || 'Cancelled by therapist'
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateError) return next(new AppError('Failed to cancel booking', 500));

  await sendCancellationEmail({ booking, reason }, supabase);

  res.status(200).json({ success: true, data: updatedBooking });
});

// @desc    Cancel booking via PATCH (alternative endpoint for frontend compatibility)
// @route   PATCH /api/bookings/:id/cancel
// @access  Private (Therapist)
const patchCancelBooking = asyncHandler(async (req, res, next) => {
  const { reason, cancellationReason } = req.body;

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) return next(new AppError('Booking not found', 404));

  const validationError = validateCancellation(booking);
  if (validationError) return next(new AppError(validationError.message, validationError.statusCode));

  const reasonText = reason || cancellationReason || 'Other';
  const updateData = {
    status: 'cancelled',
    cancellation_reason: reasonText.substring(0, 20) // Limit to 20 chars
  };

  console.log('🔄 Cancelling booking:', req.params.id);

  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Cancel error:', updateError);
    return next(new AppError(`Failed to cancel booking: ${updateError.message}`, 500));
  }

  console.log('✅ Booking cancelled:', updatedBooking.id);

  await sendCancellationEmail({ booking, reason: reasonText }, supabase);

  res.status(200).json({ success: true, data: updatedBooking });
});

// @desc    Cancel reminders for a booking
// @route   DELETE /api/bookings/:id/reminders
// @access  Private (Therapist)
const cancelBookingReminders = asyncHandler(async (req, res, next) => {
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) return next(new AppError('Booking not found', 404));

  const { error: updateError } = await supabase
    .from('bookings')
    .update({ reminder_cancelled: true })
    .eq('id', req.params.id);

  if (updateError) return next(new AppError('Failed to cancel reminders', 500));

  res.status(200).json({
    success: true,
    message: 'Reminders cancelled successfully',
    data: { id: booking.id, reminderCancelled: true }
  });
});

// @desc    Send cancellation notification
// @route   POST /api/bookings/:id/cancel-notify
// @access  Private (Therapist)
const sendCancelNotification = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) return next(new AppError('Booking not found', 404));

  try {
    await sendCancellationEmail({ 
      booking, 
      reason: reason || booking.cancellation_reason 
    }, supabase);

    res.status(200).json({
      success: true,
      message: 'Cancellation notification sent successfully',
      data: { id: booking.id, notified: true }
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
    return next(new AppError('Failed to send cancellation notification', 500));
  }
});

module.exports = {
  cancelBooking,
  patchCancelBooking,
  cancelBookingReminders,
  sendCancelNotification
};
