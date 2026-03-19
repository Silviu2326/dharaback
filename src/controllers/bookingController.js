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
  // Use Supabase to fetch the booking (consistent with getBookings)
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, client:clients(id, name, email, phone, avatar)')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (error || !booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Transform snake_case to camelCase for frontend compatibility
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
    client: booking.client ? {
      id: booking.client.id,
      name: booking.client.name,
      email: booking.client.email,
      phone: booking.client.phone,
      avatar: booking.client.avatar
    } : null
  };

  res.status(200).json({
    success: true,
    data: transformedBooking
  });
});

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private (Therapist)
const createBooking = asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const {
    clientId,
    date,
    startTime,
    endTime,
    therapyType,
    therapyDuration,
    amount,
    currency,
    location,
    notes,
    meetingLink,
    planId
  } = req.body;

  // Check for conflicts
  const existingBooking = await Booking.findOne({
    where: {
      therapistId: req.user.id,
      date,
      startTime,
      status: {
        notIn: ['cancelled', 'no_show']
      }
    }
  });

  if (existingBooking) {
    return next(new AppError('Time slot is already booked', 409));
  }

  const booking = await Booking.create({
    therapistId: req.user.id,
    clientId,
    date,
    startTime,
    endTime,
    therapyType,
    therapyDuration: therapyDuration || 60,
    amount: amount || 0,
    currency: currency || 'EUR',
    location,
    notes,
    meetingLink,
    planId,
    status: 'upcoming',
    paymentStatus: amount > 0 ? 'pending' : 'not_required'
  });

  // Create or get conversation for this client
  try {
    const conversation = await Conversation.findOrCreate({
      where: {
        therapistId: req.user.id,
        clientId
      },
      defaults: {
        therapistId: req.user.id,
        clientId
      }
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
        date,
        time: startTime,
        location,
        meetingLink
      });
    }
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
  }

  res.status(201).json({
    success: true,
    data: booking
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

  if (booking.status === 'completed') {
    return next(new AppError('Cannot update completed bookings', 400));
  }

  // Update fields
  const updateFields = ['date', 'startTime', 'endTime', 'therapyType', 'therapyDuration', 'amount', 'currency', 'location', 'notes', 'meetingLink', 'planId', 'status'];
  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      booking[field] = req.body[field];
    }
  });

  await booking.save();

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Cancel booking
// @route   DELETE /api/bookings/:id
// @access  Private (Therapist)
const cancelBooking = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  // Use Supabase to fetch booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status === 'completed') {
    return next(new AppError('Cannot cancel completed bookings', 400));
  }

  if (booking.status === 'cancelled') {
    return next(new AppError('Booking is already cancelled', 400));
  }

  // Update booking
  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_reason: reason || 'Cancelled by therapist',
      cancelled_at: new Date().toISOString(),
      cancelled_by: req.user.id
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateError) {
    return next(new AppError('Failed to cancel booking', 500));
  }

  // Send cancellation email
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', booking.client_id)
      .single();
    
    if (client) {
      await emailService.sendAppointmentCancellation({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        date: booking.date,
        time: booking.start_time,
        reason: reason || 'Cancelled by therapist'
      });
    }
  } catch (error) {
    console.error('Failed to send cancellation email:', error);
  }

  res.status(200).json({
    success: true,
    data: updatedBooking
  });
});

// @desc    Cancel booking via PATCH (alternative endpoint for frontend compatibility)
// @route   PATCH /api/bookings/:id/cancel
// @access  Private (Therapist)
const patchCancelBooking = asyncHandler(async (req, res, next) => {
  const { reason, cancellationReason, refundAmount } = req.body;

  // Use Supabase to fetch and update
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status === 'completed') {
    return next(new AppError('Cannot cancel completed bookings', 400));
  }

  if (booking.status === 'cancelled') {
    return next(new AppError('Booking is already cancelled', 400));
  }

  // Update booking - only status and short cancellation reason
  const updateData = {
    status: 'cancelled'
  };
  
  // Only add cancellation_reason if it's short enough (< 20 chars)
  const reasonText = reason || cancellationReason || 'Other';
  if (reasonText.length <= 20) {
    updateData.cancellation_reason = reasonText;
  } else {
    // Truncate or use short version
    updateData.cancellation_reason = reasonText.substring(0, 20);
  }
  
  console.log('🔄 Attempting to update booking:', req.params.id);
  console.log('📝 Update data:', updateData);
  
  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Supabase update error:', updateError);
    return next(new AppError(`Failed to cancel booking: ${updateError.message}`, 500));
  }
  
  console.log('✅ Booking updated successfully:', updatedBooking);

  // Send cancellation email
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', booking.client_id)
      .single();
    
    if (client) {
      await emailService.sendAppointmentCancellation({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        date: booking.date,
        time: booking.start_time,
        reason: reason || cancellationReason || 'Cancelled by therapist'
      });
    }
  } catch (error) {
    console.error('Failed to send cancellation email:', error);
  }

  res.status(200).json({
    success: true,
    data: updatedBooking
  });
});

// @desc    Cancel reminders for a booking
// @route   DELETE /api/bookings/:id/reminders
// @access  Private (Therapist)
const cancelBookingReminders = asyncHandler(async (req, res, next) => {
  // Use Supabase to fetch booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Update booking to mark reminders as cancelled
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      reminder_cancelled: true,
      reminder_cancelled_at: new Date().toISOString()
    })
    .eq('id', req.params.id);

  if (updateError) {
    return next(new AppError('Failed to cancel reminders', 500));
  }

  res.status(200).json({
    success: true,
    message: 'Reminders cancelled successfully',
    data: {
      id: booking.id,
      reminderCancelled: true
    }
  });
});

// @desc    Send cancellation notification
// @route   POST /api/bookings/:id/cancel-notify
// @access  Private (Therapist)
const sendCancelNotification = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  // Use Supabase to fetch booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .eq('therapist_id', req.user.id)
    .single();

  if (fetchError || !booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Send cancellation email
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', booking.client_id)
      .single();
    
    if (client) {
      await emailService.sendAppointmentCancellation({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        date: booking.date,
        time: booking.start_time,
        reason: reason || booking.cancellation_reason || 'Cancelled by therapist'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Cancellation notification sent successfully',
      data: {
        id: booking.id,
        notified: true
      }
    });
  } catch (error) {
    console.error('Failed to send cancellation notification:', error);
    return next(new AppError('Failed to send cancellation notification', 500));
  }
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

  // Send completion email to client
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
  booking.noShowAt = new Date();

  await booking.save();

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Get booking statistics
// @route   GET /api/bookings/stats
// @access  Private (Therapist)
const getBookingStats = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  // Get counts for different statuses
  const whereClause = {
    therapistId: req.user.id
  };

  if (startDate && endDate) {
    whereClause.date = {
      gte: new Date(startDate),
      lte: new Date(endDate)
    };
  }

  const stats = await Booking.findAll({
    where: whereClause,
    attributes: [
      'status',
      [Booking.sequelize.fn('COUNT', Booking.sequelize.col('status')), 'count']
    ],
    group: ['status']
  });

  // Calculate revenue
  const revenue = await Booking.findAll({
    where: {
      ...whereClause,
      status: 'completed',
      paymentStatus: 'paid'
    },
    attributes: [
      [Booking.sequelize.fn('SUM', Booking.sequelize.col('amount')), 'totalRevenue']
    ]
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
      date: {
        gte: new Date()
      }
    },
    order: [['date', 'ASC'], ['startTime', 'ASC']],
    limit: parseInt(limit),
    include: [{
      model: Client,
      attributes: ['id', 'name', 'email', 'phone', 'avatar']
    }]
  });

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Reschedule booking
// @route   PUT /api/bookings/:id/reschedule
// @access  Private (Therapist)
const rescheduleBooking = asyncHandler(async (req, res, next) => {
  const { date, startTime, endTime, reason } = req.body;

  const booking = await Booking.findOne({
    where: {
      id: req.params.id,
      therapistId: req.user.id
    }
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return next(new AppError('Cannot reschedule completed or cancelled bookings', 400));
  }

  // Check for conflicts
  const existingBooking = await Booking.findOne({
    where: {
      therapistId: req.user.id,
      date,
      startTime,
      id: {
        not: req.params.id
      },
      status: {
        notIn: ['cancelled', 'no_show']
      }
    }
  });

  if (existingBooking) {
    return next(new AppError('Time slot is already booked', 409));
  }

  // Save old values for notification
  const oldDate = booking.date;
  const oldTime = booking.startTime;

  booking.date = date;
  booking.startTime = startTime;
  if (endTime) booking.endTime = endTime;
  booking.rescheduleReason = reason;
  booking.rescheduledAt = new Date();

  await booking.save();

  // Send reschedule email
  try {
    const client = await Client.findByPk(booking.clientId);
    if (client) {
      await emailService.sendAppointmentRescheduled({
        to: client.email,
        clientName: client.name,
        therapistName: req.user.name,
        oldDate,
        oldTime,
        newDate: date,
        newTime: startTime,
        reason
      });
    }
  } catch (error) {
    console.error('Failed to send reschedule email:', error);
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Get therapists for completed bookings (for client reviews)
// @route   GET /api/bookings/client/completed-therapists
// @access  Private (Client)
const getClientCompletedTherapists = asyncHandler(async (req, res, next) => {
  try {
    // Find all completed bookings for this client with unique therapists
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        therapist_id,
        therapist:therapists!inner(
          id,
          name,
          email,
          avatar,
          specialties,
          rating
        )
      `)
      .eq('client_id', req.user.id)
      .eq('status', 'completed');

    if (error) {
      throw new Error(error.message);
    }

    // Get unique therapists
    const uniqueTherapists = [];
    const seenTherapistIds = new Set();

    (bookings || []).forEach(booking => {
      if (booking.therapist && !seenTherapistIds.has(booking.therapist.id)) {
        seenTherapistIds.add(booking.therapist.id);
        uniqueTherapists.push(booking.therapist);
      }
    });

    // Format response
    const formattedTherapists = uniqueTherapists.map(therapist => ({
      id: therapist.id,
      name: therapist.name,
      email: therapist.email,
      avatar: therapist.avatar,
      specialties: therapist.specialties || [],
      rating: therapist.rating
    }));

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

// ==================== CLIENT CONTROLLER FUNCTIONS ====================

// @desc    Get all bookings for client
// @route   GET /api/bookings/client
// @access  Private (Client)
const getClientBookings = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 10 } = req.query;

  const whereClause = {
    clientId: req.user.id
  };

  if (status) {
    whereClause.status = status;
  }

  const bookings = await Booking.findAll({
    where: whereClause,
    order: [['date', 'DESC'], ['startTime', 'DESC']],
    limit: parseInt(limit),
    offset: (page - 1) * limit,
    include: [{
      model: User,
      as: 'therapist',
      attributes: ['id', 'name', 'email', 'avatar', 'specialties']
    }]
  });

  const count = await Booking.count({
    where: whereClause
  });

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
    where: {
      id: req.params.id,
      clientId: req.user.id
    },
    include: [{
      model: User,
      as: 'therapist',
      attributes: ['id', 'name', 'email', 'avatar', 'specialties', 'phone']
    }]
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Get upcoming bookings for client
// @route   GET /api/bookings/client/upcoming
// @access  Private (Client)
const getClientUpcomingBookings = asyncHandler(async (req, res, next) => {
  const bookings = await Booking.findAll({
    where: {
      clientId: req.user.id,
      status: 'upcoming',
      date: {
        gte: new Date()
      }
    },
    order: [['date', 'ASC'], ['startTime', 'ASC']],
    include: [{
      model: User,
      as: 'therapist',
      attributes: ['id', 'name', 'email', 'avatar', 'specialties']
    }]
  });

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
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

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Request reschedule (Client)
// @route   PUT /api/bookings/client/:id/reschedule-request
// @access  Private (Client)
const requestReschedule = asyncHandler(async (req, res, next) => {
  const { requestedDate, requestedTime, reason } = req.body;

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
        requestedDate,
        requestedTime,
        reason
      });
    }
  } catch (error) {
    console.error('Failed to send reschedule request email:', error);
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Create booking (Client self-booking)
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
    location,
    notes
  } = req.body;

  // Check therapist exists
  const therapist = await User.findByPk(therapistId);
  if (!therapist) {
    return next(new AppError('Therapist not found', 404));
  }

  // Check for conflicts
  const existingBooking = await Booking.findOne({
    where: {
      therapistId,
      date,
      startTime,
      status: {
        notIn: ['cancelled', 'no_show']
      }
    }
  });

  if (existingBooking) {
    return next(new AppError('Time slot is already booked', 409));
  }

  const booking = await Booking.create({
    therapistId,
    clientId: req.user.id,
    date,
    startTime,
    endTime,
    therapyType,
    therapyDuration: therapyDuration || 60,
    location,
    notes,
    status: 'upcoming',
    paymentStatus: 'pending'
  });

  // Send confirmation emails
  try {
    await emailService.sendAppointmentConfirmation({
      to: req.user.email,
      clientName: req.user.name,
      therapistName: therapist.name,
      date,
      time: startTime,
      location
    });

    await emailService.sendAppointmentConfirmation({
      to: therapist.email,
      clientName: req.user.name,
      therapistName: therapist.name,
      date,
      time: startTime,
      location
    });
  } catch (error) {
    console.error('Failed to send confirmation emails:', error);
  }

  res.status(201).json({
    success: true,
    data: booking
  });
});

// @desc    Complete booking (Client marking as completed)
// @route   PUT /api/bookings/client/:id/complete
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

module.exports = {
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
  getClientCompletedTherapists,
  // Client functions
  getClientBookings,
  getClientBooking,
  getClientUpcomingBookings,
  cancelClientBooking,
  requestReschedule,
  createClientBooking
};
