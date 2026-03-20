/**
 * Client Bookings Controller
 * Funciones para que los clientes gestionen sus citas
 */

const { AppError, asyncHandler } = require('../../middleware/errorHandler');
const Booking = require('../../models/supabase/Booking');
const User = require('../../models/supabase/User');
const Client = require('../../models/supabase/Client');
const emailService = require('../../services/emailService');
const { supabase } = require('../../config/supabase');

// @desc    Get all bookings for client
// @route   GET /api/bookings/client
// @access  Private (Client)
const getClientBookings = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 10 } = req.query;

  // Use Supabase directly with join to get therapist info
  let query = supabase
    .from('bookings')
    .select(`
      *,
      therapist:users!therapist_id(id, name, email, avatar)
    `, { count: 'exact' })
    .eq('client_id', req.user.id);

  if (status) {
    query = query.eq('status', status);
  }

  const offset = (page - 1) * limit;
  query = query
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1);

  const { data: bookings, count, error } = await query;

  if (error) {
    return next(new AppError(`Error fetching bookings: ${error.message}`, 500));
  }

  res.status(200).json({
    success: true,
    count: bookings?.length || 0,
    total: count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((count || 0) / limit)
    },
    data: bookings || []
  });
});

// @desc    Get single booking for client
// @route   GET /api/bookings/client/:id
// @access  Private (Client)
const getClientBooking = asyncHandler(async (req, res, next) => {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      *,
      therapist:users!therapist_id(id, name, email, avatar, phone)
    `)
    .eq('id', req.params.id)
    .eq('client_id', req.user.id)
    .single();

  if (error || !booking) return next(new AppError('Booking not found', 404));

  res.status(200).json({ success: true, data: booking });
});

// @desc    Get upcoming bookings for client
// @route   GET /api/bookings/client/upcoming
// @access  Private (Client)
const getClientUpcomingBookings = asyncHandler(async (req, res, next) => {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      *,
      therapist:users!therapist_id(id, name, email, avatar)
    `)
    .eq('client_id', req.user.id)
    .eq('status', 'upcoming')
    .gte('date', today)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) return next(new AppError(error.message, 500));

  res.status(200).json({ success: true, count: bookings.length, data: bookings });
});

// @desc    Cancel booking (Client)
// @route   DELETE /api/bookings/client/:id
// @access  Private (Client)
const cancelClientBooking = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const booking = await Booking.findById(req.params.id);

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.clientId !== req.user.id) return next(new AppError('Not authorized', 403));
  if (booking.status === 'completed') return next(new AppError('Cannot cancel completed bookings', 400));
  if (booking.status === 'cancelled') return next(new AppError('Booking is already cancelled', 400));

  booking.status = 'cancelled';
  booking.cancellationReason = reason || 'Cancelled by client';
  booking.cancelledAt = new Date();
  booking.cancelledBy = req.user.id;
  await booking.save();

  // Notify therapist
  try {
    const therapist = await User.findById(booking.therapistId);
    if (therapist) {
      await emailService.sendAppointmentCancellation({
        to: therapist.email,
        clientName: req.user.name,
        therapistName: therapist.name,
        date: booking.date,
        time: booking.startTime,
        reason: booking.cancellationReason
      });
    }
  } catch (error) {
    console.error('Failed to send cancellation email to therapist:', error);
  }

  res.status(200).json({ success: true, data: booking });
});

// @desc    Request reschedule (Client)
// @route   PUT /api/bookings/client/:id/reschedule-request
// @access  Private (Client)
const requestReschedule = asyncHandler(async (req, res, next) => {
  const { requestedDate, requestedTime, reason } = req.body;

  const booking = await Booking.findById(req.params.id);

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.clientId !== req.user.id) return next(new AppError('Not authorized', 403));
  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return next(new AppError('Cannot reschedule completed or cancelled bookings', 400));
  }

  const { Booking: BookingClass } = require('../../models/supabase/Booking');
  const bookingInstance = new BookingClass(booking);
  
  const updateData = {
    reschedule_requested: true,
    reschedule_requested_at: new Date(),
    reschedule_requested_date: requestedDate,
    reschedule_requested_time: requestedTime,
    reschedule_request_reason: reason
  };

  const { data: updatedBooking, error } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return next(new AppError(error.message, 500));

  // Notify therapist
  try {
    const therapist = await User.findById(booking.therapistId);
    if (therapist) {
      await emailService.sendRescheduleRequest({
        to: therapist.email,
        clientName: req.user.name,
        therapistName: therapist.name,
        date: booking.date,
        time: booking.startTime,
        requestedDate, requestedTime, reason
      });
    }
  } catch (error) {
    console.error('Failed to send reschedule request email:', error);
  }

  res.status(200).json({ success: true, data: updatedBooking });
});

// @desc    Create booking (Client self-booking)
// @route   POST /api/bookings/client/book
// @access  Private (Client)
const createClientBooking = asyncHandler(async (req, res, next) => {
  const { therapistId, date, startTime, endTime, therapyType, therapyDuration, location, notes, amount, currency } = req.body;

  const therapist = await User.findById(therapistId);
  if (!therapist) return next(new AppError('Therapist not found', 404));

  // Check for conflicts
  const conflicts = await Booking.findConflicts(therapistId, date, startTime, endTime);
  if (conflicts.length > 0) {
    return next(new AppError('Time slot is already booked', 409));
  }

  // Validate amount - database requires it
  const bookingAmount = amount || 0;

  const booking = await Booking.create({
    therapistId,
    clientId: req.user.id,
    date, startTime, endTime, therapyType,
    therapyDuration: therapyDuration || 60,
    location, notes,
    amount: bookingAmount,
    currency: currency || 'EUR',
    status: 'upcoming',
    paymentStatus: 'unpaid'  // Supabase constraint: only 'unpaid' or 'paid'
  });

  // Send confirmation emails
  try {
    await emailService.sendAppointmentConfirmation({
      to: req.user.email,
      clientName: req.user.name,
      therapistName: therapist.name,
      date, time: startTime, location
    });
    await emailService.sendAppointmentConfirmation({
      to: therapist.email,
      clientName: req.user.name,
      therapistName: therapist.name,
      date, time: startTime, location
    });
  } catch (error) {
    console.error('Failed to send confirmation emails:', error);
  }

  res.status(201).json({ success: true, data: booking });
});

// @desc    Complete booking (Client marking as completed)
// @route   PUT /api/bookings/client/:id/complete
// @access  Private (Client)
const completeClientBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.clientId !== req.user.id) return next(new AppError('Not authorized', 403));
  if (booking.status !== 'upcoming') return next(new AppError('Only upcoming bookings can be marked as completed', 400));

  const { data: updatedBooking, error } = await supabase
    .from('bookings')
    .update({ 
      status: 'completed', 
      completed_at: new Date(),
      last_status_change: new Date()
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return next(new AppError(error.message, 500));

  res.status(200).json({ success: true, data: updatedBooking });
});

// @desc    Get therapists for completed bookings (for client reviews)
// @route   GET /api/bookings/client/completed-therapists
// @access  Private (Client)
const getClientCompletedTherapists = asyncHandler(async (req, res, next) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        therapist_id,
        therapist:users!inner(id, name, email, avatar)
      `)
      .eq('client_id', req.user.id)
      .eq('status', 'completed');

    if (error) throw new Error(error.message);

    const uniqueTherapists = [];
    const seenTherapistIds = new Set();

    (bookings || []).forEach(booking => {
      if (booking.therapist && !seenTherapistIds.has(booking.therapist.id)) {
        seenTherapistIds.add(booking.therapist.id);
        uniqueTherapists.push(booking.therapist);
      }
    });

    const formattedTherapists = uniqueTherapists.map(t => ({
      id: t.id, name: t.name, email: t.email, avatar: t.avatar,
      specialties: t.specialties || [], rating: t.rating
    }));

    res.status(200).json({ success: true, data: { therapists: formattedTherapists } });
  } catch (error) {
    console.error('Error getting completed therapists:', error);
    next(error);
  }
});

module.exports = {
  getClientBookings,
  getClientBooking,
  getClientUpcomingBookings,
  cancelClientBooking,
  requestReschedule,
  createClientBooking,
  completeClientBooking,
  getClientCompletedTherapists
};
