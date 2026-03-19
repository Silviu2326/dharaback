/**
 * Therapist Bookings Controller
 * Funciones para que los terapeutas gestionen sus citas
 */

const { AppError, asyncHandler } = require('../../middleware/errorHandler');
const { validationResult } = require('express-validator');
const Booking = require('../../models/supabase/Booking');
const Client = require('../../models/supabase/Client');
const Conversation = require('../../models/supabase/Conversation');
const emailService = require('../../services/emailService');
const { supabase } = require('../../config/supabase');
const { transformBookingToCamelCase, sortColumnMap } = require('./bookingUtils');

// @desc    Get all bookings for therapist
// @route   GET /api/bookings
// @access  Private (Therapist)
const getBookings = asyncHandler(async (req, res, next) => {
  const { status, startDate, endDate, clientId, page = 1, limit = 20, sortBy = 'date', sortOrder = 'asc' } = req.query;

  let query = supabase
    .from('bookings')
    .select('*, client:clients(id, name, email, phone, avatar)', { count: 'exact' })
    .eq('therapist_id', req.user.id);

  if (status) query = query.eq('status', status);
  if (startDate && endDate) query = query.gte('date', startDate).lte('date', endDate);
  else if (startDate) query = query.gte('date', startDate);
  else if (endDate) query = query.lte('date', endDate);
  if (clientId) query = query.eq('client_id', clientId);

  const dbSortBy = sortColumnMap[sortBy] || sortBy || 'date';
  query = query.order(dbSortBy, { ascending: sortOrder.toLowerCase() !== 'desc' });

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: bookings, error, count } = await query;

  if (error) throw new Error(error.message);

  const transformedBookings = (bookings || []).map(transformBookingToCamelCase);

  res.status(200).json({
    success: true,
    count: transformedBookings.length,
    total: count,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    },
    data: transformedBookings
  });
});

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
const getBooking = asyncHandler(async (req, res, next) => {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, client:clients(id, name, email, phone, avatar)')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (error || !booking) return next(new AppError('Booking not found', 404));

  res.status(200).json({
    success: true,
    data: transformBookingToCamelCase(booking)
  });
});

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private (Therapist)
const createBooking = asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { clientId, date, startTime, endTime, therapyType, therapyDuration, amount, currency, location, notes, meetingLink, planId } = req.body;

  const existingBooking = await Booking.findOne({
    where: {
      therapistId: req.user.id,
      date,
      startTime,
      status: { notIn: ['cancelled', 'no_show'] }
    }
  });

  if (existingBooking) return next(new AppError('Time slot is already booked', 409));

  const booking = await Booking.create({
    therapistId: req.user.id,
    clientId, date, startTime, endTime, therapyType,
    therapyDuration: therapyDuration || 60,
    amount: amount || 0,
    currency: currency || 'EUR',
    location, notes, meetingLink, planId,
    status: 'upcoming',
    paymentStatus: 'unpaid'  // Supabase constraint: only 'unpaid' or 'paid'
  });

  // Create conversation
  try {
    await Conversation.findOrCreate({
      where: { therapistId: req.user.id, clientId },
      defaults: { therapistId: req.user.id, clientId }
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
  }

  // Send confirmation email
  try {
    const client = await Client.findByPk(clientId);
    if (client) {
      await emailService.sendAppointmentConfirmation({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        date, time: startTime, location, meetingLink
      });
    }
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
  }

  res.status(201).json({ success: true, data: booking });
});

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private (Therapist)
const updateBooking = asyncHandler(async (req, res, next) => {
  let booking = await Booking.findOne({
    where: { id: req.params.id, therapistId: req.user.id }
  });

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.status === 'completed') return next(new AppError('Cannot update completed bookings', 400));

  const updateFields = ['date', 'startTime', 'endTime', 'therapyType', 'therapyDuration', 'amount', 'currency', 'location', 'notes', 'meetingLink', 'planId', 'status'];
  updateFields.forEach(field => {
    if (req.body[field] !== undefined) booking[field] = req.body[field];
  });

  await booking.save();
  res.status(200).json({ success: true, data: booking });
});

// @desc    Complete booking
// @route   PUT /api/bookings/:id/complete
// @access  Private (Therapist)
const completeBooking = asyncHandler(async (req, res, next) => {
  const { notes, rating } = req.body;

  const booking = await Booking.findOne({
    where: { id: req.params.id, therapistId: req.user.id }
  });

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.status !== 'upcoming') return next(new AppError('Only upcoming bookings can be marked as completed', 400));

  booking.status = 'completed';
  booking.completedAt = new Date();
  if (notes) booking.notes = notes;
  if (rating) booking.rating = rating;

  await booking.save();

  try {
    const client = await Client.findByPk(booking.clientId);
    if (client) {
      await emailService.sendAppointmentCompleted({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        date: booking.date,
        time: booking.startTime
      });
    }
  } catch (error) {
    console.error('Failed to send completion email:', error);
  }

  res.status(200).json({ success: true, data: booking });
});

// @desc    Mark booking as no-show
// @route   PUT /api/bookings/:id/no-show
// @access  Private (Therapist)
const markNoShow = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    where: { id: req.params.id, therapistId: req.user.id }
  });

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.status !== 'upcoming') return next(new AppError('Only upcoming bookings can be marked as no-show', 400));

  booking.status = 'no_show';
  booking.noShowAt = new Date();
  await booking.save();

  res.status(200).json({ success: true, data: booking });
});

// @desc    Reschedule booking
// @route   PUT /api/bookings/:id/reschedule
// @access  Private (Therapist)
const rescheduleBooking = asyncHandler(async (req, res, next) => {
  const { date, startTime, endTime, reason } = req.body;

  const booking = await Booking.findOne({
    where: { id: req.params.id, therapistId: req.user.id }
  });

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return next(new AppError('Cannot reschedule completed or cancelled bookings', 400));
  }

  const existingBooking = await Booking.findOne({
    where: {
      therapistId: req.user.id, date, startTime,
      id: { not: req.params.id },
      status: { notIn: ['cancelled', 'no_show'] }
    }
  });

  if (existingBooking) return next(new AppError('Time slot is already booked', 409));

  const oldDate = booking.date;
  const oldTime = booking.startTime;

  booking.date = date;
  booking.startTime = startTime;
  if (endTime) booking.endTime = endTime;
  booking.rescheduleReason = reason;
  booking.rescheduledAt = new Date();

  await booking.save();

  try {
    const client = await Client.findByPk(booking.clientId);
    if (client) {
      await emailService.sendAppointmentRescheduled({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        oldDate, oldTime, newDate: date, newTime: startTime, reason
      });
    }
  } catch (error) {
    console.error('Failed to send reschedule email:', error);
  }

  res.status(200).json({ success: true, data: booking });
});

// @desc    Get booking statistics
// @route   GET /api/bookings/stats
// @access  Private (Therapist)
const getBookingStats = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const whereClause = { therapistId: req.user.id };
  if (startDate && endDate) {
    whereClause.date = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const stats = await Booking.findAll({
    where: whereClause,
    attributes: ['status', [Booking.sequelize.fn('COUNT', Booking.sequelize.col('status')), 'count']],
    group: ['status']
  });

  const revenue = await Booking.findAll({
    where: { ...whereClause, status: 'completed', paymentStatus: 'paid' },
    attributes: [[Booking.sequelize.fn('SUM', Booking.sequelize.col('amount')), 'totalRevenue']]
  });

  res.status(200).json({
    success: true,
    data: {
      statusCounts: stats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.getDataValue('count'));
        return acc;
      }, {}),
      totalRevenue: parseFloat(revenue[0]?.getDataValue('totalRevenue') || 0)
    }
  });
});

// @desc    Get upcoming bookings
// @route   GET /api/bookings/upcoming
// @access  Private (Therapist)
const getUpcomingBookings = asyncHandler(async (req, res, next) => {
  const { limit = 5 } = req.query;

  const bookings = await Booking.findAll({
    where: {
      therapistId: req.user.id,
      status: 'upcoming',
      date: { gte: new Date() }
    },
    order: [['date', 'ASC'], ['startTime', 'ASC']],
    limit: parseInt(limit),
    include: [{ model: Client, attributes: ['id', 'name', 'email', 'phone', 'avatar'] }]
  });

  res.status(200).json({ success: true, count: bookings.length, data: bookings });
});

module.exports = {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  completeBooking,
  markNoShow,
  rescheduleBooking,
  getBookingStats,
  getUpcomingBookings
};
