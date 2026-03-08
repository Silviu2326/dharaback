const { Booking, Client, User } = require('../models');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');

// @desc    Get all bookings for therapist
// @route   GET /api/bookings
// @access  Private
const getBookings = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const {
    status,
    clientId,
    startDate,
    endDate,
    therapyType,
    sortBy = 'date',
    sortOrder = 'desc'
  } = req.query;

  // Mapear nombres de columnas del frontend a nombres reales en Supabase
  const columnMap = {
    dateTime: 'date',
    startTime: 'start_time',
    endTime: 'end_time',
    clientId: 'client_id',
    therapistId: 'therapist_id',
    therapyType: 'therapy_type',
    createdAt: 'created_at'
  };
  const sortColumn = columnMap[sortBy] || sortBy;

  // Build filters
  const filters = { therapist_id: req.user.id || req.user._id };

  if (status && status !== 'all') {
    filters.status = status;
  }

  if (clientId) {
    filters.client_id = clientId;
  }

  if (therapyType && therapyType !== 'all') {
    filters.therapy_type = therapyType;
  }

  // Date range filter
  if (startDate || endDate) {
    filters.date = {};
    if (startDate) filters.date.gte = startDate;
    if (endDate) filters.date.lte = endDate;
  }

  // Get bookings with pagination
  const result = await Booking.paginate({
    page,
    limit,
    filters,
    order: { column: sortColumn, ascending: sortOrder === 'asc' }
  });

  // Get client data for each booking
  const bookingsWithClients = await Promise.all(
    result.data.map(async (booking) => {
      try {
        const client = await Client.findById(booking.clientId);
        return {
          ...booking.toJSON(),
          client: client ? {
            id: client.id || client._id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            avatar: client.avatar
          } : null
        };
      } catch (err) {
        return booking.toJSON();
      }
    })
  );

  res.status(200).json({
    success: true,
    data: bookingsWithClients,
    pagination: {
      currentPage: page,
      totalPages: result.pagination.totalPages,
      totalItems: result.pagination.total,
      itemsPerPage: limit,
      hasNextPage: page < result.pagination.totalPages,
      hasPrevPage: page > 1
    }
  });
});

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
const getBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    id: req.params.id,
    therapistId: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Get related data
  const [client, sessionNotes] = await Promise.all([
    Client.findById(booking.clientId).catch(() => null),
    // Session notes would be fetched here if needed
    Promise.resolve([])
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...booking.toJSON(),
      client: client ? {
        id: client.id || client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        avatar: client.avatar,
        emergencyContact: client.emergencyContact
      } : null
    }
  });
});

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
const createBooking = asyncHandler(async (req, res, next) => {
  const {
    date,
    startTime,
    endTime,
    clientId,
    therapyType,
    therapyDuration,
    amount,
    currency = 'EUR',
    location,
    notes,
    meetingLink,
    planId
  } = req.body;

  // Validate required fields
  if (!date || !startTime || !endTime || !clientId || !therapyType || !amount || !location) {
    return next(new AppError('All required fields must be provided', 400));
  }

  // Verify client belongs to therapist
  const client = await Client.findOne({
    id: clientId,
    therapistId: req.user.id || req.user._id,
    status: 'active'
  });

  if (!client) {
    return next(new AppError('Client not found or inactive', 404));
  }

  // Check for time conflicts
  const conflicts = await Booking.findConflicts(
    req.user.id || req.user._id,
    date,
    startTime,
    endTime
  );

  if (conflicts.length > 0) {
    return next(new AppError('Time slot conflicts with existing booking', 400));
  }

  // Validate time logic
  const startDateTime = new Date(`${date}T${startTime}`);
  const endDateTime = new Date(`${date}T${endTime}`);

  if (startDateTime >= endDateTime) {
    return next(new AppError('End time must be after start time', 400));
  }

  // Check if booking is in the past
  if (startDateTime < new Date()) {
    return next(new AppError('Cannot create booking in the past', 400));
  }

  const booking = await Booking.create({
    date: new Date(date),
    startTime,
    endTime,
    clientId,
    therapistId: req.user.id || req.user._id,
    therapyType,
    therapyDuration: therapyDuration || 60,
    amount,
    currency,
    location,
    notes,
    meetingLink,
    planId: planId || null
  });

  // Send confirmation email
  try {
    await emailService.sendBookingConfirmation(booking);
  } catch (emailError) {
    console.error('Failed to send booking confirmation email:', emailError);
    // Don't fail the booking creation if email fails
  }

  res.status(201).json({
    success: true,
    data: {
      ...booking.toJSON(),
      client: {
        id: client.id || client._id,
        name: client.name,
        email: client.email,
        phone: client.phone
      }
    },
    message: 'Booking created successfully'
  });
});

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private
const updateBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    id: req.params.id,
    therapistId: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Check if booking can be modified
  const now = new Date();
  const bookingDateTime = new Date(`${booking.date}T${booking.startTime}`);

  if (bookingDateTime <= now && booking.status === 'completed') {
    return next(new AppError('Cannot modify completed booking', 400));
  }

  // If updating time/date, check for conflicts
  if (req.body.date || req.body.startTime || req.body.endTime) {
    const newDate = req.body.date || booking.date;
    const newStartTime = req.body.startTime || booking.startTime;
    const newEndTime = req.body.endTime || booking.endTime;

    const conflicts = await Booking.findConflicts(
      req.user.id || req.user._id,
      newDate,
      newStartTime,
      newEndTime,
      booking.id || booking._id
    );

    if (conflicts.length > 0) {
      return next(new AppError('Time slot conflicts with existing booking', 400));
    }

    // Validate time logic
    const newStartDateTime = new Date(`${newDate}T${newStartTime}`);
    const newEndDateTime = new Date(`${newDate}T${newEndTime}`);

    if (newStartDateTime >= newEndDateTime) {
      return next(new AppError('End time must be after start time', 400));
    }
  }

  // Filter allowed fields
  const allowedFields = [
    'date',
    'startTime',
    'endTime',
    'therapyType',
    'therapyDuration',
    'amount',
    'currency',
    'location',
    'notes',
    'meetingLink',
    'status',
    'planId'
  ];

  const updateData = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      updateData[key] = req.body[key];
    }
  });

  const updatedBooking = await Booking.findByIdAndUpdate(
    req.params.id,
    updateData,
    {
      new: true
    }
  );

  // Get client data for response
  const client = await Client.findById(updatedBooking.clientId).catch(() => null);

  res.status(200).json({
    success: true,
    data: {
      ...updatedBooking.toJSON(),
      client: client ? {
        id: client.id || client._id,
        name: client.name,
        email: client.email,
        phone: client.phone
      } : null
    },
    message: 'Booking updated successfully'
  });
});

// @desc    Cancel booking
// @route   DELETE /api/bookings/:id
// @access  Private
const cancelBooking = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const booking = await Booking.findOne({
    id: req.params.id,
    therapistId: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Check if booking can be cancelled
  if (!booking.canBeCancelled()) {
    return next(new AppError('Booking cannot be cancelled (less than 24 hours notice)', 400));
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    req.params.id,
    {
      status: 'cancelled',
      cancellationReason: reason,
      cancelledBy: 'therapist',
      cancelledAt: new Date()
    },
    { new: true }
  );

  res.status(200).json({
    success: true,
    data: updatedBooking.toJSON(),
    message: 'Booking cancelled successfully'
  });
});

// @desc    Mark booking as completed
// @route   PUT /api/bookings/:id/complete
// @access  Private
const completeBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    id: req.params.id,
    therapistId: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (booking.status === 'completed') {
    return next(new AppError('Booking is already completed', 400));
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status: 'completed' },
    { new: true }
  );

  res.status(200).json({
    success: true,
    data: updatedBooking.toJSON(),
    message: 'Booking marked as completed'
  });
});

// @desc    Mark booking as no-show
// @route   PUT /api/bookings/:id/no-show
// @access  Private
const markNoShow = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    id: req.params.id,
    therapistId: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status: 'no_show' },
    { new: true }
  );

  res.status(200).json({
    success: true,
    data: updatedBooking.toJSON(),
    message: 'Booking marked as no-show'
  });
});

// @desc    Get booking statistics
// @route   GET /api/bookings/stats
// @access  Private
const getBookingStats = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const therapistId = req.user.id || req.user._id;

  const supabase = require('../config/supabase').supabase;

  // Build query
  let query = supabase
    .from('bookings')
    .select('status, amount, client_id')
    .eq('therapist_id', therapistId);

  if (startDate) {
    query = query.gte('date', startDate);
  }
  if (endDate) {
    query = query.lte('date', endDate);
  }

  const { data: bookings, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  // Calculate stats
  const result = {
    totalBookings: bookings?.length || 0,
    completedBookings: 0,
    cancelledBookings: 0,
    noShowBookings: 0,
    upcomingBookings: 0,
    totalRevenue: 0,
    avgSessionDuration: 0,
    totalUniqueClients: 0,
    activeUniqueClients: 0,
    completionRate: 0,
    bookingsByType: []
  };

  const uniqueClients = new Set();
  const typeStats = {};

  bookings?.forEach(booking => {
    // Count by status
    switch (booking.status) {
      case 'completed':
        result.completedBookings++;
        result.totalRevenue += booking.amount || 0;
        break;
      case 'cancelled':
        result.cancelledBookings++;
        break;
      case 'no_show':
        result.noShowBookings++;
        break;
      case 'upcoming':
      case 'pending':
        result.upcomingBookings++;
        break;
    }

    // Track unique clients
    if (booking.client_id) {
      uniqueClients.add(booking.client_id);
    }

    // Track by therapy type (if available in the data)
    // This would need therapy_type field in the query
  });

  result.totalUniqueClients = uniqueClients.size;
  result.completionRate = result.totalBookings > 0 
    ? Math.round((result.completedBookings / result.totalBookings) * 100) 
    : 0;

  // Get registered client counts
  const { count: registeredClients } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('therapist_id', therapistId);

  result.totalUniqueClients = registeredClients || 0;

  // Get active clients (clients with upcoming bookings)
  const { data: upcomingClients } = await supabase
    .from('bookings')
    .select('client_id')
    .eq('therapist_id', therapistId)
    .in('status', ['upcoming', 'pending']);

  const activeClientIds = new Set(upcomingClients?.map(b => b.client_id));
  result.activeUniqueClients = activeClientIds.size;

  // Get bookings by therapy type
  const { data: bookingsByType } = await supabase
    .from('bookings')
    .select('therapy_type, count, amount')
    .eq('therapist_id', therapistId);

  // Group by therapy type
  const typeMap = {};
  bookings?.forEach(booking => {
    const type = booking.therapy_type || 'Unknown';
    if (!typeMap[type]) {
      typeMap[type] = { count: 0, revenue: 0 };
    }
    typeMap[type].count++;
    if (booking.status === 'completed') {
      typeMap[type].revenue += booking.amount || 0;
    }
  });

  result.bookingsByType = Object.entries(typeMap).map(([type, stats]) => ({
    _id: type,
    count: stats.count,
    revenue: stats.revenue
  }));

  res.status(200).json({
    success: true,
    data: result
  });
});

// @desc    Get upcoming bookings
// @route   GET /api/bookings/upcoming
// @access  Private
const getUpcomingBookings = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 5;
  const today = new Date().toISOString().split('T')[0];

  const upcomingBookings = await Booking.find({
    filters: {
      therapistId: req.user.id || req.user._id,
      status: { in: ['upcoming', 'pending'] },
      date: { gte: today }
    },
    limit,
    order: { column: 'date', ascending: true }
  });

  // Get client data for each booking
  const bookingsWithClients = await Promise.all(
    upcomingBookings.map(async (booking) => {
      try {
        const client = await Client.findById(booking.clientId);
        return {
          ...booking.toJSON(),
          client: client ? {
            id: client.id || client._id,
            name: client.name,
            avatar: client.avatar,
            phone: client.phone
          } : null
        };
      } catch (err) {
        return booking.toJSON();
      }
    })
  );

  res.status(200).json({
    success: true,
    data: bookingsWithClients
  });
});

// @desc    Reschedule booking
// @route   PUT /api/bookings/:id/reschedule
// @access  Private
const rescheduleBooking = asyncHandler(async (req, res, next) => {
  const { newDate, newStartTime, newEndTime } = req.body;

  if (!newDate || !newStartTime || !newEndTime) {
    return next(new AppError('New date, start time, and end time are required', 400));
  }

  const booking = await Booking.findOne({
    id: req.params.id,
    therapistId: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (!booking.canBeRescheduled()) {
    return next(new AppError('Booking cannot be rescheduled (less than 48 hours notice)', 400));
  }

  // Check for conflicts
  const conflicts = await Booking.findConflicts(
    req.user.id || req.user._id,
    newDate,
    newStartTime,
    newEndTime,
    booking.id || booking._id
  );

  if (conflicts.length > 0) {
    return next(new AppError('New time slot conflicts with existing booking', 400));
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    req.params.id,
    {
      date: new Date(newDate),
      startTime: newStartTime,
      endTime: newEndTime
    },
    { new: true }
  );

  res.status(200).json({
    success: true,
    data: updatedBooking.toJSON(),
    message: 'Booking rescheduled successfully'
  });
});

// @desc    Get all bookings for client
// @route   GET /api/bookings/client
// @access  Private (Client)
const getClientBookings = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const {
    status,
    startDate,
    endDate,
    therapyType,
    sortBy = 'date',
    sortOrder = 'desc'
  } = req.query;

  // Build filters
  const filters = { client_id: req.user.id || req.user._id };

  if (status && status !== 'all') {
    filters.status = status;
  }

  if (therapyType && therapyType !== 'all') {
    filters.therapy_type = therapyType;
  }

  // Date range filter
  if (startDate || endDate) {
    filters.date = {};
    if (startDate) filters.date.gte = startDate;
    if (endDate) filters.date.lte = endDate;
  }

  // Get bookings
  const result = await Booking.paginate({
    page,
    limit,
    filters,
    order: { column: sortBy, ascending: sortOrder === 'asc' }
  });

  // Get therapist data for each booking
  const bookingsWithTherapists = await Promise.all(
    result.data.map(async (booking) => {
      try {
        const therapist = await User.findById(booking.therapistId);
        return {
          ...booking.toJSON(),
          therapist: therapist ? {
            id: therapist.id || therapist._id,
            name: therapist.name,
            email: therapist.email,
            phone: therapist.phone,
            avatar: therapist.avatar
          } : null
        };
      } catch (err) {
        return booking.toJSON();
      }
    })
  );

  res.status(200).json({
    success: true,
    data: bookingsWithTherapists,
    pagination: {
      currentPage: page,
      totalPages: result.pagination.totalPages,
      totalItems: result.pagination.total,
      itemsPerPage: limit,
      hasNextPage: page < result.pagination.totalPages,
      hasPrevPage: page > 1
    }
  });
});

// @desc    Get single booking for client
// @route   GET /api/bookings/client/:id
// @access  Private (Client)
const getClientBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findOne({
    id: req.params.id,
    client_id: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Get related data
  const therapist = await User.findById(booking.therapistId).catch(() => null);

  res.status(200).json({
    success: true,
    data: {
      ...booking.toJSON(),
      therapist: therapist ? {
        id: therapist.id || therapist._id,
        name: therapist.name,
        email: therapist.email,
        phone: therapist.phone,
        avatar: therapist.avatar
      } : null
    }
  });
});

// @desc    Get upcoming bookings for client
// @route   GET /api/bookings/client/upcoming
// @access  Private (Client)
const getClientUpcomingBookings = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 5;
  const today = new Date().toISOString().split('T')[0];

  const upcomingBookings = await Booking.find({
    filters: {
      client_id: req.user.id || req.user._id,
      status: { in: ['upcoming', 'pending', 'confirmed'] },
      date: { gte: today }
    },
    limit,
    order: { column: 'date', ascending: true }
  });

  // Get therapist data for each booking
  const bookingsWithTherapists = await Promise.all(
    upcomingBookings.map(async (booking) => {
      try {
        const therapist = await User.findById(booking.therapistId);
        return {
          ...booking.toJSON(),
          therapist: therapist ? {
            id: therapist.id || therapist._id,
            name: therapist.name,
            avatar: therapist.avatar,
            phone: therapist.phone
          } : null
        };
      } catch (err) {
        return booking.toJSON();
      }
    })
  );

  res.status(200).json({
    success: true,
    data: bookingsWithTherapists
  });
});

// @desc    Cancel booking (client side)
// @route   DELETE /api/bookings/client/:id
// @access  Private (Client)
const cancelClientBooking = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const booking = await Booking.findOne({
    id: req.params.id,
    client_id: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Check if booking can be cancelled
  if (!booking.canBeCancelled()) {
    return next(new AppError('Booking cannot be cancelled (less than 24 hours notice)', 400));
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    req.params.id,
    {
      status: 'cancelled',
      cancellationReason: reason,
      cancelledBy: 'client',
      cancelledAt: new Date()
    },
    { new: true }
  );

  res.status(200).json({
    success: true,
    data: updatedBooking.toJSON(),
    message: 'Booking cancelled successfully'
  });
});

// @desc    Request reschedule booking (client side)
// @route   PUT /api/bookings/client/:id/reschedule-request
// @access  Private (Client)
const requestReschedule = asyncHandler(async (req, res, next) => {
  const { preferredDate, preferredStartTime, preferredEndTime, reason } = req.body;

  if (!preferredDate || !preferredStartTime || !preferredEndTime) {
    return next(new AppError('Preferred date, start time, and end time are required', 400));
  }

  const booking = await Booking.findOne({
    id: req.params.id,
    client_id: req.user.id || req.user._id
  });

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  if (!booking.canBeRescheduled()) {
    return next(new AppError('Booking cannot be rescheduled (less than 48 hours notice)', 400));
  }

  // Add reschedule request to booking (stored in notes or a separate field)
  const rescheduleNote = `Reschedule request: ${preferredDate} ${preferredStartTime}-${preferredEndTime}. Reason: ${reason || 'Not specified'}`;
  
  const updatedBooking = await Booking.findByIdAndUpdate(
    req.params.id,
    {
      notes: booking.notes ? `${booking.notes}\n${rescheduleNote}` : rescheduleNote
    },
    { new: true }
  );

  res.status(200).json({
    success: true,
    data: updatedBooking.toJSON(),
    message: 'Reschedule request submitted successfully'
  });
});

// Create booking by client
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
  const clientId = req.user.id || req.user._id;

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

  // Validate time logic
  const startDateTime = new Date(`${date}T${startTime}`);
  const endDateTime = new Date(`${date}T${endTime}`);

  if (startDateTime >= endDateTime) {
    return next(new AppError('End time must be after start time', 400));
  }

  // Check if booking is in the past
  if (startDateTime < new Date()) {
    return next(new AppError('Cannot create booking in the past', 400));
  }

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

  // Send confirmation email
  try {
    await emailService.sendBookingConfirmation(booking);
  } catch (emailError) {
    console.error('Failed to send booking confirmation email:', emailError);
  }

  res.status(201).json({
    success: true,
    data: booking.toJSON(),
    message: 'Booking created successfully'
  });
});

module.exports = {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  cancelBooking,
  completeBooking,
  markNoShow,
  getBookingStats,
  getUpcomingBookings,
  rescheduleBooking,
  // Client functions
  getClientBookings,
  getClientBooking,
  getClientUpcomingBookings,
  cancelClientBooking,
  requestReschedule,
  createClientBooking
};
