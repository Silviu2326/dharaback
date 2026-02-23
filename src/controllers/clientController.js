const jwt = require('jsonwebtoken');
const { Client, User, Booking } = require('../models');
const { InvitationCode } = require('../models/InvitationCode');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// @desc    Get all clients for therapist
// @route   GET /api/clients
// @access  Private
const getClients = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { status, search, tags, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

  // Build filters
  const filters = { therapist_id: req.user.id || req.user._id };

  if (status && status !== 'all') {
    filters.status = status;
  }

  if (tags) {
    const tagArray = tags.split(',').map(tag => tag.trim());
    filters.tags = { overlaps: tagArray };
  }

  // Get clients
  let clients = [];
  let total = 0;

  if (search) {
    // For search, we need to fetch and filter in memory
    const allClients = await Client.find({ filters });
    const searchLower = search.toLowerCase();
    clients = allClients.filter(c => 
      c.name?.toLowerCase().includes(searchLower) ||
      c.email?.toLowerCase().includes(searchLower) ||
      c.phone?.toLowerCase().includes(searchLower)
    );
    total = clients.length;
    clients = clients.slice(skip, skip + limit);
  } else {
    const result = await Client.paginate({
      page,
      limit,
      filters,
      order: { column: sortBy, ascending: sortOrder === 'asc' }
    });
    clients = result.data;
    total = result.pagination.total;
  }

  // Get recent bookings for each client
  const clientsWithBookings = await Promise.all(
    clients.map(async (client) => {
      try {
        const recentBookings = await Booking.findByClient(client.id || client._id, {
          limit: 5,
          order: { column: 'date', ascending: false }
        });
        return {
          ...client.toJSON(),
          recentBookings: recentBookings.map(b => ({
            id: b.id,
            date: b.date,
            status: b.status,
            amount: b.amount
          }))
        };
      } catch (err) {
        return client.toJSON();
      }
    })
  );

  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    data: clientsWithBookings,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
});

// @desc    Get single client
// @route   GET /api/clients/:id
// @access  Private
const getClient = asyncHandler(async (req, res, next) => {
  const client = await Client.findOne({
    id: req.params.id,
    therapist_id: req.user.id || req.user._id
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  // Get client's bookings
  const bookings = await Booking.findByClient(client.id || client._id, {
    order: { column: 'date', ascending: false }
  });

  res.status(200).json({
    success: true,
    data: {
      ...client.toJSON(),
      bookings: bookings.map(b => b.toJSON())
    }
  });
});

// @desc    Create new client
// @route   POST /api/clients
// @access  Private
const createClient = asyncHandler(async (req, res, next) => {
  const {
    name,
    email,
    phone,
    age,
    address,
    emergencyContact,
    notes,
    tags,
    preferences
  } = req.body;

  // Check if client with same email already exists for this therapist
  const existingClient = await Client.findOne({
    email: email.toLowerCase(),
    therapist_id: req.user.id || req.user._id
  });

  if (existingClient) {
    return next(new AppError('A client with this email already exists', 400));
  }

  // Validate required fields
  if (!name || !email || !phone) {
    return next(new AppError('Name, email, and phone are required', 400));
  }

  const client = await Client.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    age,
    address: address?.trim(),
    emergencyContact,
    notes: notes?.trim(),
    tags: tags || [],
    preferences,
    therapist_id: req.user.id || req.user._id
  });

  res.status(201).json({
    success: true,
    data: client.toJSON(),
    message: 'Client created successfully'
  });
});

// @desc    Update client
// @route   PUT /api/clients/:id
// @access  Private
const updateClient = asyncHandler(async (req, res, next) => {
  let client = await Client.findOne({
    id: req.params.id,
    therapist_id: req.user.id || req.user._id
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  // Check if email is being changed and if it conflicts
  if (req.body.email && req.body.email !== client.email) {
    const existingClient = await Client.findOne({
      email: req.body.email.toLowerCase(),
      therapist_id: req.user.id || req.user._id
    });

    if (existingClient && (existingClient.id || existingClient._id) !== req.params.id) {
      return next(new AppError('A client with this email already exists', 400));
    }
  }

  // Filter allowed fields
  const allowedFields = [
    'name',
    'email',
    'phone',
    'age',
    'address',
    'emergencyContact',
    'notes',
    'tags',
    'status',
    'preferences'
  ];

  const updateData = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      updateData[key] = req.body[key];
    }
  });

  // Normalize email if provided
  if (updateData.email) {
    updateData.email = updateData.email.toLowerCase().trim();
  }

  client = await Client.findByIdAndUpdate(
    req.params.id,
    updateData,
    {
      new: true
    }
  );

  res.status(200).json({
    success: true,
    data: client.toJSON(),
    message: 'Client updated successfully'
  });
});

// @desc    Delete client
// @route   DELETE /api/clients/:id
// @access  Private
const deleteClient = asyncHandler(async (req, res, next) => {
  const client = await Client.findOne({
    id: req.params.id,
    therapist_id: req.user.id || req.user._id
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  // Check if client has upcoming bookings
  const upcomingBookings = await Booking.find({
    filters: {
      client_id: req.params.id,
      status: { in: ['upcoming', 'pending'] },
      date: { gte: new Date().toISOString().split('T')[0] }
    }
  });

  if (upcomingBookings.length > 0) {
    return next(new AppError('Cannot delete client with upcoming bookings. Please cancel all upcoming bookings first.', 400));
  }

  // Soft delete - change status to inactive instead of deleting
  await Client.findByIdAndUpdate(
    req.params.id,
    {
      status: 'inactive',
      email: `deleted_${Date.now()}_${client.email}`
    },
    { new: false }
  );

  res.status(200).json({
    success: true,
    message: 'Client deleted successfully'
  });
});

// @desc    Get client statistics
// @route   GET /api/clients/stats
// @access  Private
const getClientsStats = asyncHandler(async (req, res, next) => {
  const therapistId = req.user.id || req.user._id;
  const supabase = require('../config/supabase').supabase;

  // Get counts by status
  const { data: stats, error } = await supabase
    .from('clients')
    .select('status')
    .eq('therapist_id', therapistId);

  if (error) {
    throw new Error(error.message);
  }

  const result = {
    totalClients: stats?.length || 0,
    activeClients: stats?.filter(c => c.status === 'active').length || 0,
    inactiveClients: stats?.filter(c => c.status === 'inactive').length || 0,
    demoClients: stats?.filter(c => c.status === 'demo').length || 0,
    avgSessionsPerClient: 0,
    avgRating: 0,
    totalSessions: 0,
    recentClients: 0
  };

  // Get recent clients (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { count: recentCount } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('therapist_id', therapistId)
    .gte('created_at', thirtyDaysAgo.toISOString());

  result.recentClients = recentCount || 0;

  res.status(200).json({
    success: true,
    data: result
  });
});

// @desc    Get client tags
// @route   GET /api/clients/tags
// @access  Private
const getClientTags = asyncHandler(async (req, res, next) => {
  const supabase = require('../config/supabase').supabase;

  const { data: clients, error } = await supabase
    .from('clients')
    .select('tags')
    .eq('therapist_id', req.user.id || req.user._id);

  if (error) {
    throw new Error(error.message);
  }

  // Count tags
  const tagCounts = {};
  clients?.forEach(client => {
    client.tags?.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  const tagList = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  res.status(200).json({
    success: true,
    data: tagList
  });
});

// @desc    Update client avatar
// @route   POST /api/clients/:id/avatar
// @access  Private
const updateClientAvatar = asyncHandler(async (req, res, next) => {
  const { avatar } = req.body;

  const client = await Client.findOne({
    id: req.params.id,
    therapist_id: req.user.id || req.user._id
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  await Client.findByIdAndUpdate(
    req.params.id,
    { avatar },
    { new: false }
  );

  res.status(200).json({
    success: true,
    data: { avatar },
    message: 'Client avatar updated successfully'
  });
});

// @desc    Get client summary for dashboard
// @route   GET /api/clients/:id/summary
// @access  Private
const getClientSummary = asyncHandler(async (req, res, next) => {
  const client = await Client.findOne({
    id: req.params.id,
    therapist_id: req.user.id || req.user._id
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  const summary = await client.getSummary();

  res.status(200).json({
    success: true,
    data: summary
  });
});

// @desc    Bulk update clients
// @route   PUT /api/clients/bulk
// @access  Private
const bulkUpdateClients = asyncHandler(async (req, res, next) => {
  const { clientIds, updateData } = req.body;

  if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
    return next(new AppError('Client IDs are required', 400));
  }

  // Validate that all clients belong to the therapist
  const clients = await Client.find({
    filters: {
      id: { in: clientIds },
      therapist_id: req.user.id || req.user._id
    }
  });

  if (clients.length !== clientIds.length) {
    return next(new AppError('Some clients not found or access denied', 403));
  }

  // Filter allowed fields for bulk update
  const allowedFields = ['status', 'tags'];
  const filteredUpdateData = {};

  Object.keys(updateData).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdateData[key === 'tags' ? 'tags' : key] = updateData[key];
    }
  });

  // Update all clients
  const supabase = require('../config/supabase').supabase;
  const { data, error } = await supabase
    .from('clients')
    .update(filteredUpdateData)
    .in('id', clientIds)
    .eq('therapist_id', req.user.id || req.user._id);

  if (error) {
    throw new Error(error.message);
  }

  res.status(200).json({
    success: true,
    data: {
      modifiedCount: clientIds.length,
      matchedCount: clientIds.length
    },
    message: `${clientIds.length} clients updated successfully`
  });
});

// Generate JWT token for clients
const generateClientToken = (id) => {
  return jwt.sign({ id, type: 'client' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Send token response for clients
const sendClientTokenResponse = (client, statusCode, res) => {
  const token = generateClientToken(client.id || client._id);

  // Create clean client data without password
  const clientData = client.toJSON ? client.toJSON() : { ...client };
  delete clientData.password;

  res.status(statusCode).json({
    success: true,
    token,
    client: clientData
  });
};

// @desc    Register client (public registration)
// @route   POST /api/clients/register
// @access  Public
const registerClient = asyncHandler(async (req, res, next) => {
  const { name, email, password, phone, therapistId } = req.body;

  // Validate required fields
  if (!name || !email || !password || !phone || !therapistId) {
    return next(new AppError('Please provide all required fields', 400));
  }

  if (password.length < 6) {
    return next(new AppError('Password must be at least 6 characters long', 400));
  }

  // Check if therapist exists
  const therapist = await User.findById(therapistId);
  if (!therapist) {
    return next(new AppError('Therapist not found', 404));
  }

  // Check if client already exists for this therapist
  const existingClient = await Client.findOne({
    email: email.toLowerCase(),
    therapist_id: therapistId
  });

  if (existingClient) {
    return next(new AppError('Client with this email already exists for this therapist', 400));
  }

  // Create client
  const client = await Client.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    phone: phone.trim(),
    therapist_id: therapistId,
    gdprConsent: {
      given: true,
      date: new Date(),
      ipAddress: req.ip
    }
  });

  sendClientTokenResponse(client, 201, res);
});

// @desc    Login client
// @route   POST /api/clients/login
// @access  Public
const loginClient = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // Check for client (password is always included in Supabase model)
  const client = await Client.findOne({
    email: email.toLowerCase(),
    status: 'active'
  });

  if (!client) {
    return next(new AppError('Invalid credentials', 401));
  }

  // Check if password matches
  const isMatch = await client.comparePassword(password);

  if (!isMatch) {
    return next(new AppError('Invalid credentials', 401));
  }

  // Update last login stats (optional)
  await client.updateSessionStats();

  sendClientTokenResponse(client, 200, res);
});

// @desc    Get available therapists for clients
// @route   GET /api/clients/available-therapists
// @access  Public (no authentication required)
const getAvailableTherapists = asyncHandler(async (req, res, next) => {
  const { search, specialty } = req.query;

  // Build filters for active, verified therapists
  const filters = {
    role: 'therapist',
    is_active: true,
    is_verified: true
  };

  if (search) {
    // Search will be done in memory after fetching
    delete filters.search;
  }

  // Get therapists
  let therapists = await User.find({ filters });

  // Filter by search if provided
  if (search) {
    const searchLower = search.toLowerCase();
    therapists = therapists.filter(t => 
      t.name?.toLowerCase().includes(searchLower) ||
      t.email?.toLowerCase().includes(searchLower)
    );
  }

  // Get professional profiles for each therapist
  const therapistsWithProfiles = await Promise.all(
    therapists.map(async (therapist) => {
      try {
        const profile = await ProfessionalProfile.findOne({ user_id: therapist.id || therapist._id });
        
        // Filter by specialty if provided
        if (specialty && profile) {
          const hasSpecialty = profile.therapies?.some(
            t => t.name?.toLowerCase().includes(specialty.toLowerCase())
          );
          if (!hasSpecialty) return null;
        }

        return {
          id: therapist.id || therapist._id,
          name: therapist.name,
          email: therapist.email,
          avatar: therapist.avatar,
          isVerified: therapist.isVerified,
          joinedAt: therapist.createdAt,
          profile: profile ? {
            about: profile.about,
            isAvailable: profile.isAvailable,
            rating: profile.rating,
            clientsCount: profile.clientsCount,
            yearsExperience: profile.yearsExperience,
            languages: profile.languages,
            workLocations: profile.workLocations,
            specialties: profile.therapies?.map(therapy => therapy.name) || []
          } : null
        };
      } catch (err) {
        return {
          id: therapist.id || therapist._id,
          name: therapist.name,
          email: therapist.email,
          avatar: therapist.avatar,
          isVerified: therapist.isVerified,
          joinedAt: therapist.createdAt,
          profile: null
        };
      }
    })
  );

  // Filter out nulls (therapists that didn't match specialty filter)
  const filteredTherapists = therapistsWithProfiles.filter(t => t !== null);

  res.status(200).json({
    success: true,
    data: filteredTherapists,
    count: filteredTherapists.length,
    message: `Found ${filteredTherapists.length} available therapists`
  });
});

// @desc    Generate invitation code for client
// @route   POST /api/clients/invitation-code
// @access  Private
const generateInvitationCode = asyncHandler(async (req, res, next) => {
  const { clientId, code, expiresIn, email } = req.body;
  const therapistId = req.user.id || req.user._id;

  // Verify client exists and belongs to therapist
  const client = await Client.findOne({
    id: clientId,
    therapist_id: therapistId
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  // Calculate expiration date
  const expiresAt = expiresIn 
    ? new Date(Date.now() + expiresIn)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

  // Create invitation code
  const invitationCode = await InvitationCode.create({
    clientId,
    therapist_id: therapistId,
    code: code.toUpperCase(),
    email,
    expiresAt: expiresAt.toISOString()
  });

  res.status(201).json({
    success: true,
    data: {
      code: invitationCode.code,
      clientId,
      expiresAt: invitationCode.expiresAt,
      isValid: invitationCode.isValid
    }
  });
});

// @desc    Send invitation email
// @route   POST /api/clients/send-invitation
// @access  Private
const sendInvitationEmail = asyncHandler(async (req, res, next) => {
  const { clientId, code } = req.body;
  const therapistId = req.user.id || req.user._id;

  // Get client
  const client = await Client.findOne({
    id: clientId,
    therapist_id: therapistId
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  if (!client.email) {
    return next(new AppError('Client has no email address', 400));
  }

  // Here you would integrate with your email service (SendGrid, AWS SES, etc.)
  // For now, we'll just simulate success
  console.log(`📧 Invitation email would be sent to: ${client.email}`);
  console.log(`   Code: ${code}`);
  console.log(`   Client: ${client.name}`);

  // Update the invitation code record to mark email as sent
  const invitationCode = await InvitationCode.findByCode(code);
  if (invitationCode) {
    invitationCode.metadata.emailSent = true;
    invitationCode.metadata.emailSentAt = new Date().toISOString();
    // Note: You would need to implement an update method in InvitationCode model
  }

  res.status(200).json({
    success: true,
    message: 'Invitation email sent successfully'
  });
});

// @desc    Validate invitation code
// @route   GET /api/clients/validate-invitation
// @access  Public
const validateInvitationCode = asyncHandler(async (req, res, next) => {
  const { code } = req.query;

  if (!code) {
    return next(new AppError('Invitation code is required', 400));
  }

  const invitationCode = await InvitationCode.findByCode(code.toUpperCase());

  if (!invitationCode) {
    return res.status(200).json({
      success: true,
      data: {
        valid: false,
        message: 'Invalid invitation code'
      }
    });
  }

  if (invitationCode.isExpired) {
    return res.status(200).json({
      success: true,
      data: {
        valid: false,
        message: 'Invitation code has expired'
      }
    });
  }

  if (invitationCode.status !== 'active') {
    return res.status(200).json({
      success: true,
      data: {
        valid: false,
        message: 'Invitation code is no longer valid'
      }
    });
  }

  // Get client info
  const client = await Client.findById(invitationCode.clientId);

  res.status(200).json({
    success: true,
    data: {
      valid: true,
      code: invitationCode.code,
      clientName: client?.name,
      therapistName: client?.therapistName,
      expiresAt: invitationCode.expiresAt
    }
  });
});

// @desc    Invalidate all invitation codes for a client
// @route   POST /api/clients/invalidate-codes
// @access  Private
const invalidateInvitationCodes = asyncHandler(async (req, res, next) => {
  const { clientId } = req.body;
  const therapistId = req.user.id || req.user._id;

  // Verify client exists and belongs to therapist
  const client = await Client.findOne({
    id: clientId,
    therapist_id: therapistId
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  // Invalidate codes
  await InvitationCode.invalidateByClient(clientId);

  res.status(200).json({
    success: true,
    message: 'All invitation codes invalidated successfully'
  });
});

// @desc    Regenerate invitation code
// @route   POST /api/clients/:id/regenerate-code
// @access  Private
const regenerateInvitationCode = asyncHandler(async (req, res, next) => {
  const clientId = req.params.id;
  const therapistId = req.user.id || req.user._id;

  // Verify client exists and belongs to therapist
  const client = await Client.findOne({
    id: clientId,
    therapist_id: therapistId
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  // Invalidate old codes
  await InvitationCode.invalidateByClient(clientId);

  // Generate new code
  const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const invitationCode = await InvitationCode.create({
    clientId,
    therapist_id: therapistId,
    code: newCode,
    email: client.email,
    expiresAt: expiresAt.toISOString()
  });

  res.status(201).json({
    success: true,
    data: {
      code: invitationCode.code,
      clientId,
      expiresAt: invitationCode.expiresAt,
      isValid: invitationCode.isValid
    }
  });
});

module.exports = {
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getClientsStats,
  getClientTags,
  updateClientAvatar,
  getClientSummary,
  bulkUpdateClients,
  registerClient,
  loginClient,
  getAvailableTherapists,
  generateInvitationCode,
  sendInvitationEmail,
  validateInvitationCode,
  invalidateInvitationCodes,
  regenerateInvitationCode
};
