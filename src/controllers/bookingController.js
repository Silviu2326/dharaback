/**
 * Booking Controller
 * Maneja todas las operaciones relacionadas con citas/reservas
 * Optimizado para PostgreSQL/Supabase
 */

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const Booking = require('../models/supabase/Booking');
const User = require('../models/supabase/User');
const Client = require('../models/supabase/Client');
const Conversation = require('../models/supabase/Conversation');
const emailService = require('../services/emailService');
const { validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');

// @desc    Get all bookings for therapist
// @route   GET /api/bookings
// @access  Private (Therapist)
const getBookings = asyncHandler(async (req, res, next) => {
  const { status, startDate, endDate, clientId, page = 1, limit = 20, sortBy = 'date', sortOrder = 'asc' } = req.query;

  // Build query
  let query = supabase
    .from('bookings')
    .select('*, client:clients(id, name, email, phone, avatar)', { count: 'exact' })
    .eq('therapist_id', req.user.id);

  if (status) {
    query = query.eq('status', status);
  }

  if (startDate && endDate) {
    query = query.gte('date', startDate).lte('date', endDate);
  } else if (startDate) {
    query = query.gte('date', startDate);
  } else if (endDate) {
    query = query.lte('date', endDate);
  }

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  // Apply sorting
  // Map frontend field names to database column names
  const sortColumnMap = {
    'dateTime': 'date',
    'startTime': 'start_time',
    'endTime': 'end_time',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at'
  };
  const dbSortBy = sortColumnMap[sortBy] || sortBy || 'date';
  query = query.order(dbSortBy, { ascending: sortOrder.toLowerCase() !== 'desc' });

  // Apply pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: bookings, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  // Transform snake_case to camelCase for frontend compatibility
  const transformedBookings = (bookings || []).map(booking => ({
    id: booking.id,
    date: booking.date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    clientId: booking.client_id,
    therapistId: booking.therapist_id,
    therapyType: booking.therapy_type,
    therapyDuration: booking.therapy_duration,
    status: booking.status,
    amount: booking.amount,
    currency: booking.currency,
    paymentStatus: booking.payment_status,
    paymentMethod: booking.payment_method,
    location: booking.location,
    notes: booking.notes,
    meetingLink: booking.meeting_link,
    sessionDocument: booking.session_document,
    planId: booking.plan_id,
    reminderSent: booking.reminder_sent,
    cancellationReason: booking.cancellation_reason,
    cancelledBy: booking.cancelled_by,
    cancelledAt: booking.cancelled_at,
    lastStatusChange: booking.last_status_change,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    client: booking.client ? {
      id: booking.client.id,
      name: booking.client.name,
      email: booking.client.email,
      phone: booking.client.phone,
      avatar: booking.client.avatar
    } : null
  }));

  res.status(200).json({
    success: true,
    data: transformedBookings,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalItems: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      hasNextPage: (page * limit) < (count || 0)
    }
  });
});

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
const getBooking = asyncHandler(async (req, res, next) => {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, client:clients(id, name, email, phone, avatar, notes)')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (error || !booking) {
    return next(new AppError('Booking not found', 404));
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Create new booking (therapist)
// @route   POST /api/bookings
// @access  Private (Therapist)
const createBooking = asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  const {
    clientId,
    date,
    startTime,
    endTime,
    therapyType,
    amount,
    location,
    notes,
    meetingLink
  } = req.body;

  // Verify client belongs to therapist
  const client = await Client.findOne({
    id: clientId,
    therapistId: req.user.id,
    status: 'active'
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  // Check for conflicts
  const conflicts = await Booking.findConflicts(
    req.user.id,
    date,
    startTime,
    endTime
  );

  if (conflicts.length > 0) {
    return next(new AppError('Time slot conflicts with existing booking', 400));
  }

  const booking = await Booking.create({
    date: new Date(date),
    startTime,
    endTime,
    clientId,
    therapistId: req.user.id,
    therapyType,
    amount,
    location,
    notes,
    meetingLink,
    status: 'upcoming'
  });

  // Get full booking with associations
  const bookingWithDetails = await Booking.findByPk(booking.id, {
    include: [
      {
        model: Client,
        as: 'client',
        attributes: ['id', 'name', 'email', 'phone']
      }
    ]
  });

  // Send confirmation email
  try {
    await emailService.sendAppointmentConfirmation({
      to: client.email,
      clientName: client.name,
      therapistName: req.user.name,
      date: booking.date,
      time: booking.startTime,
      location: booking.location
    });
  } catch (error) {
    console.error('Failed to send booking confirmation email:', error);
  }

  res.status(201).json({
    success: true,
    data: bookingWithDetails
  });
});

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private (Therapist)
const updateBooking = asyncHandler(async (req, res, next) => {
  let booking = await Booking.findOne({
    where: {
      id: req.params.id,
      therapistId: req.user.id
    }
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Check if booking can be modified
  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return next(new AppError('Cannot modify completed or cancelled bookings', 400));
  }

  const { date, startTime, endTime, therapyType, amount, location, notes, meetingLink } = req.body;

  // If time changed, check for conflicts
  if ((date && date !== booking.date) || 
      (startTime && startTime !== booking.startTime) || 
      (endTime && endTime !== booking.endTime)) {
    
    const conflicts = await Booking.findConflicts(
      req.user.id,
      date || booking.date,
      startTime || booking.startTime,
      endTime || booking.endTime,
      booking.id
    );

    if (conflicts.length > 0) {
      return next(new AppError('New time conflicts with existing booking', 400));
    }
  }

  // Update fields
  if (date) booking.date = new Date(date);
  if (startTime) booking.startTime = startTime;
  if (endTime) booking.endTime = endTime;
  if (therapyType) booking.therapyType = therapyType;
  if (amount !== undefined) booking.amount = amount;
  if (location) booking.location = location;
  if (notes !== undefined) booking.notes = notes;
  if (meetingLink !== undefined) booking.meetingLink = meetingLink;

  await booking.save();

  // Get updated booking with associations
  const updatedBooking = await Booking.findByPk(booking.id, {
    include: [
      {
        model: Client,
        as: 'client',
        attributes: ['id', 'name', 'email', 'phone']
      }
    ]
  });

  res.status(200).json({
    success: true,
    data: updatedBooking
  });
});

// @desc    Cancel booking
// @route   DELETE /api/bookings/:id
// @access  Private
const cancelBooking = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const booking = await Booking.findOne({
    where: {
      id: req.params.id,
      therapistId: req.user.id
    }
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status === 'completed') {
    return next(new AppError('Cannot cancel completed bookings', 400));
  }

  if (booking.status === 'cancelled') {
    return next(new AppError('Booking is already cancelled', 400));
  }

  booking.status = 'cancelled';
  booking.cancellationReason = reason || 'Cancelled by therapist';
  booking.cancelledAt = new Date();
  booking.cancelledBy = req.user.id;

  await booking.save();

  // Send cancellation email
  try {
    const client = await Client.findByPk(booking.clientId);
    if (client) {
      await emailService.sendAppointmentCancellation({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        date: booking.date,
        time: booking.startTime,
        reason: booking.cancellationReason
      });
    }
  } catch (error) {
    console.error('Failed to send cancellation email:', error);
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Complete booking
// @route   PUT /api/bookings/:id/complete
// @access  Private (Therapist)
const completeBooking = asyncHandler(async (req, res, next) => {
  const { notes, rating } = req.body;

  const booking = await Booking.findOne({
    where: {
      id: req.params.id,
      therapistId: req.user.id
    }
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status !== 'upcoming') {
    return next(new AppError('Only upcoming bookings can be marked as completed', 400));
  }

  booking.status = 'completed';
  booking.completedAt = new Date();
  if (notes) booking.notes = notes;
  if (rating) booking.rating = rating;

  await booking.save();

  // Update client last session
  try {
    const client = await Client.findByPk(booking.clientId);
    if (client) {
      client.lastSession = new Date();
      client.sessionsCount += 1;
      await client.save();
    }
  } catch (error) {
    console.error('Failed to update client stats:', error);
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Complete booking (Client version)
// @route   PUT /api/bookings/:id/complete-client
// @access  Private (Client)
const completeClientBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    where: {
      id: req.params.id,
      clientId: req.user.id
    }
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status !== 'upcoming') {
    return next(new AppError('Only upcoming bookings can be marked as completed', 400));
  }

  booking.status = 'completed';
  booking.completedAt = new Date();
  await booking.save();

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Mark booking as no-show
// @route   PUT /api/bookings/:id/no-show
// @access  Private (Therapist)
const markNoShow = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    where: {
      id: req.params.id,
      therapistId: req.user.id
    }
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status !== 'upcoming') {
    return next(new AppError('Only upcoming bookings can be marked as no-show', 400));
  }

  booking.status = 'no_show';
  await booking.save();

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Get booking statistics
// @route   GET /api/bookings/stats/overview
// @access  Private (Therapist)
const getBookingStats = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const where = { therapistId: req.user.id };

  if (startDate && endDate) {
    where.date = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  const stats = await Booking.findAll({
    where,
    attributes: [
      'status',
      [Booking.sequelize.fn('COUNT', Booking.sequelize.col('id')), 'count'],
      [Booking.sequelize.fn('SUM', Booking.sequelize.col('amount')), 'totalAmount']
    ],
    group: ['status'],
    raw: true
  });

  const totalBookings = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
  const totalRevenue = stats.reduce((sum, stat) => sum + parseFloat(stat.totalAmount || 0), 0);

  res.status(200).json({
    success: true,
    data: {
      totalBookings,
      totalRevenue,
      byStatus: stats
    }
  });
});

// @desc    Get upcoming bookings
// @route   GET /api/bookings/upcoming
// @access  Private
const getUpcomingBookings = asyncHandler(async (req, res, next) => {
  const { limit = 5 } = req.query;

  const where = {
    status: 'upcoming',
    date: {
      [Op.gte]: new Date()
    }
  };

  if (req.user.role === 'therapist') {
    where.therapistId = req.user.id;
  } else {
    where.clientId = req.user.id;
  }

  const bookings = await Booking.findAll({
    where,
    order: [
      ['date', 'ASC'],
      ['startTime', 'ASC']
    ],
    limit: parseInt(limit),
    include: [
      {
        model: Client,
        as: 'client',
        attributes: ['id', 'name', 'email', 'phone', 'avatar']
      }
    ]
  });

  res.status(200).json({
    success: true,
    data: bookings
  });
});

// @desc    Reschedule booking
// @route   PUT /api/bookings/:id/reschedule
// @access  Private
const rescheduleBooking = asyncHandler(async (req, res, next) => {
  const { date, startTime, endTime, reason } = req.body;

  if (!date || !startTime || !endTime) {
    return next(new AppError('New date, start time and end time are required', 400));
  }

  let where = { id: req.params.id };
  
  if (req.user.role === 'therapist') {
    where.therapistId = req.user.id;
  } else {
    where.clientId = req.user.id;
  }

  const booking = await Booking.findOne({ where });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return next(new AppError('Cannot reschedule completed or cancelled bookings', 400));
  }

  // Check for conflicts
  const conflicts = await Booking.findConflicts(
    booking.therapistId,
    date,
    startTime,
    endTime,
    booking.id
  );

  if (conflicts.length > 0) {
    return next(new AppError('New time conflicts with existing booking', 400));
  }

  // Save old values for notification
  const oldDate = booking.date;
  const oldStartTime = booking.startTime;

  booking.date = new Date(date);
  booking.startTime = startTime;
  booking.endTime = endTime;
  booking.isRescheduled = true;
  booking.rescheduledAt = new Date();
  booking.rescheduledBy = req.user.id;
  booking.rescheduleReason = reason || 'Rescheduled';

  await booking.save();

  // Send rescheduling notification
  try {
    const client = await Client.findByPk(booking.clientId);
    if (client) {
      await emailService.sendAppointmentRescheduled({
        to: client.email,
        clientName: client.name,
        oldDate,
        oldTime: oldStartTime,
        newDate: booking.date,
        newTime: booking.startTime,
        reason: booking.rescheduleReason
      });
    }
  } catch (error) {
    console.error('Failed to send rescheduling email:', error);
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// ============================================================================
// CLIENT BOOKING FUNCTIONS
// ============================================================================

// @desc    Get client bookings
// @route   GET /api/bookings/client
// @access  Private (Client)
const getClientBookings = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 20 } = req.query;

  // Build query
  let query = supabase
    .from('bookings')
    .select('*, therapist:users(id, name, email, avatar)', { count: 'exact' })
    .eq('client_id', req.user.id);

  if (status) {
    query = query.eq('status', status);
  }

  // Apply sorting
  query = query.order('date', { ascending: false });

  // Apply pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: bookings, error, count: total } = await query;

  if (error) {
    return next(new AppError(error.message, 500));
  }

  // Transform snake_case to camelCase for frontend compatibility
  const transformedBookings = (bookings || []).map(booking => ({
    id: booking.id,
    date: booking.date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    clientId: booking.client_id,
    therapistId: booking.therapist_id,
    therapyType: booking.therapy_type,
    therapyDuration: booking.therapy_duration,
    status: booking.status,
    amount: booking.amount,
    currency: booking.currency,
    paymentStatus: booking.payment_status,
    paymentMethod: booking.payment_method,
    location: booking.location,
    notes: booking.notes,
    meetingLink: booking.meeting_link,
    sessionDocument: booking.session_document,
    planId: booking.plan_id,
    reminderSent: booking.reminder_sent,
    cancellationReason: booking.cancellation_reason,
    cancelledBy: booking.cancelled_by,
    cancelledAt: booking.cancelled_at,
    lastStatusChange: booking.last_status_change,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    therapist: booking.therapist ? {
      id: booking.therapist.id,
      name: booking.therapist.name,
      email: booking.therapist.email,
      avatar: booking.therapist.avatar
    } : null
  }));

  res.status(200).json({
    success: true,
    data: transformedBookings,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total || 0,
      pages: Math.ceil((total || 0) / limit)
    }
  });
});

// @desc    Get client booking
// @route   GET /api/bookings/client/:id
// @access  Private (Client)
const getClientBooking = asyncHandler(async (req, res, next) => {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, therapist:users(id, name, email, avatar)')
    .eq('id', req.params.id)
    .eq('client_id', req.user.id)
    .single();

  if (error || !booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Transform snake_case to camelCase
  const transformedBooking = {
    id: booking.id,
    date: booking.date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    clientId: booking.client_id,
    therapistId: booking.therapist_id,
    therapyType: booking.therapy_type,
    therapyDuration: booking.therapy_duration,
    status: booking.status,
    amount: booking.amount,
    currency: booking.currency,
    paymentStatus: booking.payment_status,
    paymentMethod: booking.payment_method,
    location: booking.location,
    notes: booking.notes,
    meetingLink: booking.meeting_link,
    sessionDocument: booking.session_document,
    planId: booking.plan_id,
    reminderSent: booking.reminder_sent,
    cancellationReason: booking.cancellation_reason,
    cancelledBy: booking.cancelled_by,
    cancelledAt: booking.cancelled_at,
    lastStatusChange: booking.last_status_change,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    therapist: booking.therapist ? {
      id: booking.therapist.id,
      name: booking.therapist.name,
      email: booking.therapist.email,
      avatar: booking.therapist.avatar
    } : null
  };

  res.status(200).json({
    success: true,
    data: transformedBooking
  });
});

// @desc    Get client upcoming bookings
// @route   GET /api/bookings/client/upcoming
// @access  Private (Client)
const getClientUpcomingBookings = asyncHandler(async (req, res, next) => {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*, therapist:users(id, name, email, avatar)')
    .eq('client_id', req.user.id)
    .eq('status', 'upcoming')
    .gte('date', today)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    return next(new AppError(error.message, 500));
  }

  // Transform snake_case to camelCase
  const transformedBookings = (bookings || []).map(booking => ({
    id: booking.id,
    date: booking.date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    clientId: booking.client_id,
    therapistId: booking.therapist_id,
    therapyType: booking.therapy_type,
    therapyDuration: booking.therapy_duration,
    status: booking.status,
    amount: booking.amount,
    currency: booking.currency,
    paymentStatus: booking.payment_status,
    paymentMethod: booking.payment_method,
    location: booking.location,
    notes: booking.notes,
    meetingLink: booking.meeting_link,
    sessionDocument: booking.session_document,
    planId: booking.plan_id,
    reminderSent: booking.reminder_sent,
    cancellationReason: booking.cancellation_reason,
    cancelledBy: booking.cancelled_by,
    cancelledAt: booking.cancelled_at,
    lastStatusChange: booking.last_status_change,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    therapist: booking.therapist ? {
      id: booking.therapist.id,
      name: booking.therapist.name,
      email: booking.therapist.email,
      avatar: booking.therapist.avatar
    } : null
  }));

  res.status(200).json({
    success: true,
    data: transformedBookings
  });
});

// @desc    Cancel booking (Client)
// @route   DELETE /api/bookings/client/:id
// @access  Private (Client)
const cancelClientBooking = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const booking = await Booking.findOne({
    where: {
      id: req.params.id,
      clientId: req.user.id
    }
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status === 'completed') {
    return next(new AppError('Cannot cancel completed bookings', 400));
  }

  if (booking.status === 'cancelled') {
    return next(new AppError('Booking is already cancelled', 400));
  }

  booking.status = 'cancelled';
  booking.cancellationReason = reason || 'Cancelled by client';
  booking.cancelledAt = new Date();
  booking.cancelledBy = req.user.id;

  await booking.save();

  // Notify therapist
  try {
    const therapist = await User.findByPk(booking.therapistId);
    if (therapist) {
      await emailService.sendAppointmentCancelledByClient({
        to: therapist.email,
        therapistName: therapist.name,
        date: booking.date,
        time: booking.startTime,
        reason: booking.cancellationReason
      });
    }
  } catch (error) {
    console.error('Failed to send cancellation notification:', error);
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Request reschedule (Client)
// @route   POST /api/bookings/client/:id/reschedule-request
// @access  Private (Client)
const requestReschedule = asyncHandler(async (req, res, next) => {
  const { preferredDate, preferredTime, reason } = req.body;

  const booking = await Booking.findOne({
    where: {
      id: req.params.id,
      clientId: req.user.id
    }
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return next(new AppError('Cannot reschedule completed or cancelled bookings', 400));
  }

  booking.rescheduleRequested = true;
  booking.rescheduleRequestDate = new Date();
  booking.preferredDate = preferredDate ? new Date(preferredDate) : null;
  booking.preferredTime = preferredTime;
  booking.rescheduleReason = reason;

  await booking.save();

  // Notify therapist
  try {
    const therapist = await User.findByPk(booking.therapistId);
    if (therapist) {
      await emailService.sendRescheduleRequest({
        to: therapist.email,
        therapistName: therapist.name,
        currentDate: booking.date,
        currentTime: booking.startTime,
        preferredDate,
        preferredTime,
        reason
      });
    }
  } catch (error) {
    console.error('Failed to send reschedule request:', error);
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// ============================================================================
// CREATE CLIENT BOOKING
// ============================================================================

// @desc    Create booking by client
// @route   POST /api/bookings/client/book
// @access  Private (Client)
const createClientBooking = asyncHandler(async (req, res, next) => {
  const {
    therapistId,
    date,
    startTime,
    endTime,
    therapyType,
    therapyDuration,
    amount,
    currency = 'EUR',
    location,
    notes,
    meetingLink
  } = req.body;

  // Validate required fields
  if (!therapistId || !date || !startTime || !endTime || !therapyType || !amount || !location) {
    return next(new AppError('All required fields must be provided', 400));
  }

  // Get client ID from authenticated user
  const authClientId = req.user.id;

  // Find or create client record for this therapist
  let client = await Client.findOne({
    id: authClientId,
    therapistId: therapistId
  });

  if (!client) {
    // Check if a client with this email already exists for this therapist
    client = await Client.findOne({
      email: req.user.email,
      therapistId: therapistId
    });
  }

  if (!client) {
    // Create new client record for this therapist
    client = await Client.create({
      id: authClientId,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      therapistId: therapistId,
      status: 'active'
    });
  }
  
  // Use the client record's ID for the booking
  const clientId = client.id;

  // Check for time conflicts
  const conflicts = await Booking.findConflicts(
    therapistId,
    date,
    startTime,
    endTime
  );

  if (conflicts.length > 0) {
    return next(new AppError('Time slot conflicts with existing booking', 400));
  }

  // Create the booking
  const booking = await Booking.create({
    date: new Date(date),
    startTime,
    endTime,
    clientId,
    therapistId,
    therapyType,
    therapyDuration: therapyDuration || 60,
    amount,
    currency,
    location,
    notes,
    meetingLink,
    status: 'upcoming'
  });

  // Create or reactivate conversation between client and therapist
  let conversation = null;
  try {
    conversation = await Conversation.findBetweenUsers(clientId, therapistId);
    
    if (!conversation) {
      conversation = await Conversation.create({
        clientId: clientId,
        therapistId: therapistId,
        status: 'active',
        metadata: {
          title: `Chat with therapist`,
          type: 'therapy_session',
          bookingId: booking.id,
          therapyType: therapyType,
          createdFromBooking: true
        }
      });
    } else if (conversation.isArchived) {
      await conversation.reactivate();
    }
  } catch (chatError) {
    console.error('Failed to create/reactivate conversation:', chatError);
  }

  // Send confirmation email
  try {
    const [clientInfo, therapistInfo] = await Promise.all([
      Client.findById(clientId),
      User.findById(therapistId)
    ]);

    await emailService.sendAppointmentConfirmation({
      to: clientInfo?.email,
      clientName: clientInfo?.name,
      therapistName: therapistInfo?.name,
      date: booking.date,
      time: booking.startTime,
      location: booking.location
    });
  } catch (emailError) {
    console.error('Failed to send booking confirmation email:', emailError);
  }

  res.status(201).json({
    success: true,
    data: {
      ...booking.toJSON(),
      conversation: conversation ? {
        id: conversation.id,
        status: conversation.status
      } : null
    },
    message: 'Booking created successfully'
  });
});

// @desc    Get therapists with completed bookings for client
// @route   GET /api/bookings/client/completed-therapists
// @access  Private (Client)
const getClientCompletedTherapists = asyncHandler(async (req, res, next) => {
  try {
    const clientId = req.user.id;

    // Get all completed bookings for this client
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('therapist_id')
      .eq('client_id', clientId)
      .eq('status', 'completed');

    if (error) {
      throw new Error(error.message);
    }

    // Get unique therapist IDs
    const therapistIds = [...new Set(bookings?.map(b => b.therapist_id) || [])];

    if (therapistIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          therapists: []
        }
      });
    }

    // Get therapist details
    const { data: therapists, error: therapistError } = await supabase
      .from('users')
      .select('id, name, email, avatar, specialties, rating')
      .in('id', therapistIds)
      .eq('role', 'therapist')
      .eq('is_active', true);

    if (therapistError) {
      throw new Error(therapistError.message);
    }

    // Format response
    const formattedTherapists = therapists?.map(therapist => ({
      id: therapist.id,
      name: therapist.name,
      email: therapist.email,
      avatar: therapist.avatar,
      specialties: therapist.specialties || [],
      rating: therapist.rating
    })) || [];

    res.status(200).json({
      success: true,
      data: {
        therapists: formattedTherapists
      }
    });
  } catch (error) {
    console.error('Error getting completed therapists:', error);
    next(error);
  }
});

module.exports = {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  cancelBooking,
  completeBooking,
  completeClientBooking,
  markNoShow,
  getBookingStats,
  getUpcomingBookings,
  rescheduleBooking,
  getClientCompletedTherapists,
  // Client functions
  getClientBookings,
  getClientBooking,
  getClientUpcomingBookings,
  cancelClientBooking,
  requestReschedule,
  createClientBooking
};
