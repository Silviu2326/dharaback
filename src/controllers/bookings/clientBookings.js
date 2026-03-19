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

  const whereClause = { clientId: req.user.id };
  if (status) whereClause.status = status;

  const bookings = await Booking.findAll({
    where: whereClause,
    order: [['date', 'DESC'], ['startTime', 'DESC']],
    limit: parseInt(limit),
    offset: (page - 1) * limit,
    include: [{ model: User, as: 'therapist', attributes: ['id', 'name', 'email', 'avatar', 'specialties'] }]
  });

  const count = await Booking.count({ where: whereClause });

  res.status(200).json({
    success: true,
    count: bookings.length,
    total: count,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    },
    data: bookings
  });
});

// @desc    Get single booking for client
// @route   GET /api/bookings/client/:id
// @access  Private (Client)
const getClientBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    where: { id: req.params.id, clientId: req.user.id },
    include: [{ model: User, as: 'therapist', attributes: ['id', 'name', 'email', 'avatar', 'specialties', 'phone'] }]
  });

  if (!booking) return next(new AppError('Booking not found', 404));

  res.status(200).json({ success: true, data: booking });
});

// @desc    Get upcoming bookings for client
// @route   GET /api/bookings/client/upcoming
// @access  Private (Client)
const getClientUpcomingBookings = asyncHandler(async (req, res, next) => {
  const bookings = await Booking.findAll({
    where: { clientId: req.user.id, status: 'upcoming', date: { gte: new Date() } },
    order: [['date', 'ASC'], ['startTime', 'ASC']],
    include: [{ model: User, as: 'therapist', attributes: ['id', 'name', 'email', 'avatar', 'specialties'] }]
  });

  res.status(200).json({ success: true, count: bookings.length, data: bookings });
});

// @desc    Cancel booking (Client)
// @route   DELETE /api/bookings/client/:id
// @access  Private (Client)
const cancelClientBooking = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const booking = await Booking.findOne({
    where: { id: req.params.id, clientId: req.user.id }
  });

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.status === 'completed') return next(new AppError('Cannot cancel completed bookings', 400));
  if (booking.status === 'cancelled') return next(new AppError('Booking is already cancelled', 400));

  booking.status = 'cancelled';
  booking.cancellationReason = reason || 'Cancelled by client';
  booking.cancelledAt = new Date();
  booking.cancelledBy = req.user.id;
  await booking.save();

  // Notify therapist
  try {
    const therapist = await User.findByPk(booking.therapistId);
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

  const booking = await Booking.findOne({
    where: { id: req.params.id, clientId: req.user.id }
  });

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return next(new AppError('Cannot reschedule completed or cancelled bookings', 400));
  }

  booking.rescheduleRequested = true;
  booking.rescheduleRequestedAt = new Date();
  booking.rescheduleRequestedDate = requestedDate;
  booking.rescheduleRequestedTime = requestedTime;
  booking.rescheduleRequestReason = reason;
  await booking.save();

  // Notify therapist
  try {
    const therapist = await User.findByPk(booking.therapistId);
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

  res.status(200).json({ success: true, data: booking });
});

// @desc    Create booking (Client self-booking)
// @route   POST /api/bookings/client/book
// @access  Private (Client)
const createClientBooking = asyncHandler(async (req, res, next) => {
  const { therapistId, date, startTime, endTime, therapyType, therapyDuration, location, notes } = req.body;

  const therapist = await User.findByPk(therapistId);
  if (!therapist) return next(new AppError('Therapist not found', 404));

  const existingBooking = await Booking.findOne({
    where: {
      therapistId, date, startTime,
      status: { notIn: ['cancelled', 'no_show'] }
    }
  });

  if (existingBooking) return next(new AppError('Time slot is already booked', 409));

  const booking = await Booking.create({
    therapistId,
    clientId: req.user.id,
    date, startTime, endTime, therapyType,
    therapyDuration: therapyDuration || 60,
    location, notes,
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
  const booking = await Booking.findOne({
    where: { id: req.params.id, clientId: req.user.id }
  });

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.status !== 'upcoming') return next(new AppError('Only upcoming bookings can be marked as completed', 400));

  booking.status = 'completed';
  booking.completedAt = new Date();
  await booking.save();

  res.status(200).json({ success: true, data: booking });
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
        therapist:therapists!inner(id, name, email, avatar, specialties, rating)
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
