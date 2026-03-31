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
    .eq('therapist_id', req.user.id)
    // No mostrar citas que requieren pago online y aún no están pagadas
    .or('requires_online_payment.eq.false,payment_status.neq.unpaid');

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

  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('therapist_id', req.user.id)
    .eq('date', date)
    .eq('start_time', startTime)
    .not('status', 'in', '("cancelled","no_show")')
    .maybeSingle();

  if (existingBooking) return next(new AppError('Time slot is already booked', 409));

  const booking = await Booking.create({
    therapistId: req.user.id,
    clientId, date, startTime, endTime, therapyType,
    therapyDuration: therapyDuration || 60,
    amount: amount || 0,
    currency: currency || 'EUR',
    location, notes, meetingLink, planId,
    status: 'pending',
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
  // Use Supabase to fetch booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) return next(new AppError('Booking not found', 404));

  // Payment fields are always allowed to be updated, even on completed bookings
  const paymentFields = ['paymentStatus', 'paymentMethod'];
  const requestedFields = Object.keys(req.body);
  const isPaymentOnlyUpdate = requestedFields.length > 0 && requestedFields.every(f => paymentFields.includes(f));

  if (booking.status === 'completed' && !isPaymentOnlyUpdate) {
    return next(new AppError('Cannot update completed bookings', 400));
  }

  // Build update data
  const updateData = {};

  // Handle combined dateTime field (sent by frontend on reschedule)
  if (req.body.dateTime) {
    const dt = new Date(req.body.dateTime);
    updateData['date'] = dt.toISOString().split('T')[0];
    updateData['start_time'] = req.body.dateTime.split('T')[1]?.slice(0, 5) || dt.toISOString().split('T')[1].slice(0, 5);
  }

  // Map camelCase to snake_case
  const fieldMap = {
    'date': 'date',
    'startTime': 'start_time',
    'endTime': 'end_time',
    'therapyType': 'therapy_type',
    'therapyDuration': 'therapy_duration',
    'amount': 'amount',
    'currency': 'currency',
    'location': 'location',
    'notes': 'notes',
    'meetingLink': 'meeting_link',
    'planId': 'plan_id',
    'status': 'status',
    'paymentStatus': 'payment_status',
    'paymentMethod': 'payment_method'
  };

  Object.keys(req.body).forEach(field => {
    if (field === 'dateTime') return; // already handled above
    const dbField = fieldMap[field];
    if (dbField && req.body[field] !== undefined) {
      updateData[dbField] = req.body[field];
    }
  });

  // Update booking (don't use .select() due to RLS issues)
  const { error: updateError } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', req.params.id);

  if (updateError) {
    return next(new AppError(`Failed to update booking: ${updateError.message}`, 500));
  }

  // Fetch the updated booking separately
  const { data: updatedBooking, error: fetchAfterError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchAfterError || !updatedBooking) {
    console.log('Update succeeded but fetch failed:', { fetchAfterError, id: req.params.id, therapistId: req.user.id });
    return next(new AppError('Booking updated but could not fetch updated data', 500));
  }

  res.status(200).json({ success: true, data: updatedBooking });
});

// @desc    Complete booking
// @route   PUT /api/bookings/:id/complete
// @access  Private (Therapist)
const completeBooking = asyncHandler(async (req, res, next) => {
  const { notes, rating } = req.body;

  // Use Supabase to fetch booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) return next(new AppError('Booking not found', 404));
  if (booking.status !== 'upcoming') return next(new AppError('Only upcoming bookings can be marked as completed', 400));

  // Build update data
  const updateData = {
    status: 'completed',
    completed_at: new Date().toISOString()
  };
  if (notes) updateData.notes = notes;
  if (rating) updateData.rating = rating;

  // Update booking
  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateError) {
    return next(new AppError(`Failed to complete booking: ${updateError.message}`, 500));
  }

  // Send completion email
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', booking.client_id)
      .single();
    
    if (client) {
      await emailService.sendAppointmentCompleted({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        date: booking.date,
        time: booking.start_time
      });
    }
  } catch (error) {
    console.error('Failed to send completion email:', error);
  }

  res.status(200).json({ success: true, data: updatedBooking });
});

// @desc    Mark booking as no-show
// @route   PUT /api/bookings/:id/no-show
// @access  Private (Therapist)
const markNoShow = asyncHandler(async (req, res, next) => {
  // Use Supabase to fetch booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) return next(new AppError('Booking not found', 404));
  if (booking.status !== 'upcoming') return next(new AppError('Only upcoming bookings can be marked as no-show', 400));

  // Update booking
  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'no_show',
      no_show_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateError) {
    return next(new AppError(`Failed to mark booking as no-show: ${updateError.message}`, 500));
  }

  res.status(200).json({ success: true, data: updatedBooking });
});

// @desc    Reschedule booking
// @route   PUT /api/bookings/:id/reschedule
// @access  Private (Therapist)
const rescheduleBooking = asyncHandler(async (req, res, next) => {
  const { date, startTime, endTime, reason } = req.body;

  // Use Supabase to fetch booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) return next(new AppError('Booking not found', 404));
  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return next(new AppError('Cannot reschedule completed or cancelled bookings', 400));
  }

  // Check for conflicts
  const { data: existingBooking, error: conflictError } = await supabase
    .from('bookings')
    .select('*')
    .eq('therapist_id', req.user.id)
    .eq('date', date)
    .eq('start_time', startTime)
    .neq('id', req.params.id)
    .not('status', 'in', '("cancelled","no_show")')
    .limit(1);

  if (existingBooking && existingBooking.length > 0) {
    return next(new AppError('Time slot is already booked', 409));
  }

  const oldDate = booking.date;
  const oldTime = booking.start_time;

  // Update booking
  const updateData = {
    date: date,
    start_time: startTime,
  };
  if (endTime) updateData.end_time = endTime;

  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateError) {
    return next(new AppError(`Failed to reschedule booking: ${updateError.message}`, 500));
  }

  // Send reschedule email
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', booking.client_id)
      .single();
    
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

  res.status(200).json({ success: true, data: updatedBooking });
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
