const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Client } = require('../models');
const { InvitationCodeModel } = require('../models/InvitationCode');
const InvitationCode = new InvitationCodeModel();
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// Generate JWT token
const generateToken = (id, type = null) => {
  const payload = { id };
  if (type) payload.type = type;
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Generate refresh token
const generateRefreshToken = (id, type = null) => {
  const payload = { id };
  if (type) payload.type = type;
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  });
};

// Send token response
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user.id || user._id);
  const refreshToken = generateRefreshToken(user.id || user._id);

  const options = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  // Remove password from output
  user.password = undefined;

  // Normalizar el rol para el frontend
  const role = user.role || 'therapist';
  const normalizedRole = (role === 'therapist' || role === 'user') ? 'terapeuta' : role;

  res.status(statusCode)
    .cookie('token', token, options)
    .cookie('refreshToken', refreshToken, options)
    .json({
      success: true,
      accessToken: token,
      refreshToken,
      user: {
        id: user.id || user._id,
        name: user.name,
        email: user.email,
        role: normalizedRole,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus,
        avatar: user.avatar,
        createdAt: user.createdAt
      }
    });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, confirmPassword } = req.body;

  // Validate input
  if (!name || !email || !password || !confirmPassword) {
    return next(new AppError('Please provide all required fields', 400));
  }

  if (password !== confirmPassword) {
    return next(new AppError('Passwords do not match', 400));
  }

  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters long', 400));
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return next(new AppError('User with this email already exists', 400));
  }

  // Create user
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password
  });

  // Send token response
  sendTokenResponse(user, 201, res);
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res, next) => {
  console.log('🚀 LOGIN CONTROLLER CALLED');
  const { email, password, rememberMe, userType } = req.body;

  console.log('=== LOGIN DEBUG ===');
  console.log('Request body:', { email, password: password ? '***' : 'missing', rememberMe, userType });

  // Validate input
  if (!email || !password) {
    console.log('Missing email or password');
    return next(new AppError('Please provide email and password', 400));
  }

  let user = null;
  let isClient = false;
  let client = null;

  // Si se especifica userType, buscar solo en la tabla correspondiente
  if (userType === 'terapeuta' || userType === 'profesional') {
    console.log('Searching only in USERS (therapists)...');
    user = await User.findOne({ email: email.toLowerCase() });
    console.log('User found:', user ? 'YES' : 'NO');
    
    if (!user) {
      return next(new AppError('Usuario no encontrado. Por favor, verifica tus credenciales o regístrate.', 401));
    }
  } else if (userType === 'cliente') {
    console.log('Searching only in CLIENTS...');
    client = await Client.findByEmail(email.toLowerCase());
    console.log('Client found:', client ? 'YES' : 'NO');
    
    if (client) {
      isClient = true;
    } else {
      return next(new AppError('Cliente no encontrado. Por favor, verifica tus credenciales o regístrate.', 401));
    }
  } else {
    // Si no se especifica userType, mantener comportamiento anterior (fallback)
    console.log('No userType specified, searching in both tables...');
    user = await User.findOne({ email: email.toLowerCase() });
    console.log('User found:', user ? 'YES' : 'NO');

    if (!user) {
      console.log('User not found, checking clients...');
      client = await Client.findByEmail(email.toLowerCase());
      console.log('Client found:', client ? 'YES' : 'NO');
      
      if (client) {
        isClient = true;
      }
    }
  }

  // If neither user nor client found
  if (!user && !client) {
    console.log('User/Client not found for email:', email.toLowerCase());
    return next(new AppError('Invalid credentials', 401));
  }

  // Determine which entity to use
  const entity = user || client;
  
  console.log('Entity details:', {
    id: entity.id || entity._id,
    email: entity.email,
    type: isClient ? 'client' : 'user',
    isActive: entity.isActive || entity.status === 'active',
    hasPassword: !!entity.password,
    passwordLength: entity.password ? entity.password.length : 0,
    passwordStart: entity.password ? entity.password.substring(0, 10) : 'none'
  });
  
  // Si no tiene password, no puede hacer login
  if (!entity.password) {
    console.log('ERROR: Entity has no password stored!');
    return next(new AppError('Invalid credentials - no password', 401));
  }

  // Check if password matches
  const isMatch = await entity.comparePassword(password);
  console.log('Password match:', isMatch);

  if (!isMatch) {
    console.log('Password does not match');
    return next(new AppError('Invalid credentials', 401));
  }

  // Check if account is active
  const isActive = isClient ? client.status === 'active' : user.isActive;
  if (!isActive) {
    return next(new AppError('Account is deactivated. Please contact support.', 401));
  }

  // Update last login (solo para users, clients no tienen ese campo)
  if (user) {
    await User.findByIdAndUpdate(
      user.id || user._id,
      { lastLogin: new Date() },
      { new: false }
    );
  }

  // Generate token with type for clients
  const tokenType = isClient ? 'client' : null;
  const token = generateToken(entity.id || entity._id, tokenType);

  entity.password = undefined;

  // Build response
  // Normalizar el rol: 'therapist' o 'user' -> 'terapeuta', 'client' -> 'cliente'
  let normalizedRole;
  if (isClient) {
    normalizedRole = 'cliente';
  } else {
    // Para terapeutas, normalizar el rol a 'terapeuta'
    const role = entity.role || 'therapist';
    normalizedRole = (role === 'therapist' || role === 'user') ? 'terapeuta' : role;
  }

  const responseData = {
    success: true,
    accessToken: token,
    user: {
      id: entity.id || entity._id,
      name: entity.name,
      email: entity.email,
      role: normalizedRole,
      avatar: entity.avatar
    }
  };

  // Add client-specific fields
  if (isClient) {
    responseData.user.phone = entity.phone;
    responseData.user.status = entity.status;
  } else {
    responseData.user.isVerified = entity.isVerified;
    responseData.user.verificationStatus = entity.verificationStatus;
  }

  res.status(200).json(responseData);
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.cookie('refreshToken', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res, next) => {
  // Get fresh user data from database
  const user = await User.findById(req.user.id || req.user._id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Remove password from output
  user.password = undefined;

  res.status(200).json({
    success: true,
    user
  });
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(new AppError('Refresh token is required', 400));
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Get user
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new AppError('Invalid refresh token', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Account is deactivated', 401));
    }

    // Generate new tokens
    sendTokenResponse(user, 200, res);

  } catch (error) {
    return next(new AppError('Invalid refresh token', 401));
  }
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError('Please provide email address', 400));
  }

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    return next(new AppError('No user found with that email', 404));
  }

  // Get reset token
  const resetToken = user.getResetPasswordToken();

  // Update user with reset token
  await User.findByIdAndUpdate(
    user.id || user._id,
    {
      resetPasswordToken: user.resetPasswordToken,
      resetPasswordExpire: user.resetPasswordExpire
    },
    { new: false }
  );

  // Create reset URL
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const message = `
    You are receiving this email because you (or someone else) has requested the reset of a password.
    Please click on the following link to reset your password:

    ${resetUrl}

    If you did not request this, please ignore this email and your password will remain unchanged.

    This link will expire in 10 minutes.
  `;

  try {
    // Here you would send the email
    // await sendEmail({
    //   email: user.email,
    //   subject: 'Password Reset Request',
    //   message
    // });

    // For now, just log it (in production, implement proper email service)
    console.log('Password reset email would be sent to:', user.email);
    console.log('Reset URL:', resetUrl);

    res.status(200).json({
      success: true,
      message: 'Password reset email sent'
    });

  } catch (error) {
    console.error('Error sending email:', error);

    // Clear reset token
    await User.findByIdAndUpdate(
      user.id || user._id,
      {
        resetPasswordToken: null,
        resetPasswordExpire: null
      },
      { new: false }
    );

    return next(new AppError('Email could not be sent', 500));
  }
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res, next) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return next(new AppError('Please provide all required fields', 400));
  }

  if (password !== confirmPassword) {
    return next(new AppError('Passwords do not match', 400));
  }

  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters long', 400));
  }

  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // Find user with valid reset token
  const supabase = require('../config/supabase').supabase;
  const { data: userData, error } = await supabase
    .from('users')
    .select('*')
    .eq('reset_password_token', resetPasswordToken)
    .gt('reset_password_expire', new Date().toISOString())
    .single();

  if (error || !userData) {
    return next(new AppError('Invalid or expired reset token', 400));
  }

  // Update password and clear reset token
  await supabase
    .from('users')
    .update({
      password: await require('bcryptjs').hash(password, 12),
      reset_password_token: null,
      reset_password_expire: null
    })
    .eq('id', userData.id);

  // Get updated user
  const user = await User.findById(userData.id);

  sendTokenResponse(user, 200, res);
});

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return next(new AppError('Please provide all required fields', 400));
  }

  if (newPassword !== confirmPassword) {
    return next(new AppError('New passwords do not match', 400));
  }

  if (newPassword.length < 8) {
    return next(new AppError('New password must be at least 8 characters long', 400));
  }

  // Get user with password
  const user = await User.findById(req.user.id || req.user._id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Check current password
  const isMatch = await user.comparePassword(currentPassword);

  if (!isMatch) {
    return next(new AppError('Current password is incorrect', 400));
  }

  // Update password
  await User.findByIdAndUpdate(
    req.user.id || req.user._id,
    { password: newPassword },
    { new: false }
  );

  res.status(200).json({
    success: true,
    message: 'Password updated successfully'
  });
});

// @desc    Register client
// @route   POST /api/auth/register-cliente
// @access  Public
const registerCliente = asyncHandler(async (req, res, next) => {
  const { nombre, apellidos, email, telefono, password, invitationCode: invitationCodeInput } = req.body;

  console.log('=== REGISTER CLIENTE DEBUG ===');
  console.log('Received password:', password ? `Length: ${password.length}` : 'undefined');
  console.log('Invitation code:', invitationCodeInput || 'none');

  // Validate input
  if (!nombre || !apellidos || !email || !password) {
    return next(new AppError('Por favor proporciona todos los campos requeridos', 400));
  }

  if (password.length < 8) {
    return next(new AppError('La contraseña debe tener al menos 8 caracteres', 400));
  }

  const name = `${nombre.trim()} ${apellidos.trim()}`;

  let client = null;
  let therapistId = null;
  let invitation = null;

  // Validate invitation code if provided
  if (invitationCodeInput) {
    console.log('Validating invitation code:', invitationCodeInput);
    
    invitation = await InvitationCode.findByCode(invitationCodeInput.toUpperCase());
    
    if (!invitation) {
      return next(new AppError('Código de invitación inválido', 400));
    }

    if (invitation.isExpired) {
      return next(new AppError('El código de invitación ha expirado', 400));
    }

    if (invitation.status !== 'active') {
      return next(new AppError('El código de invitación ya no es válido', 400));
    }

    therapistId = invitation.therapistId;
    const linkedClientId = invitation.clientId;
    
    console.log('Invitation code valid:', {
      therapistId,
      linkedClientId,
      email: invitation.email
    });

    // Buscar el cliente pre-registrado
    client = await Client.findById(linkedClientId);
    
    if (!client) {
      return next(new AppError('Cliente no encontrado para este código de invitación', 400));
    }

    console.log('Found pre-registered client:', {
      id: client.id,
      currentEmail: client.email,
      currentName: client.name
    });

    // ACTUALIZAR cliente existente con los nuevos datos
    const updateData = {
      name,
      email: email.toLowerCase().trim(),
      phone: telefono || client.phone,
      password,
      status: 'active'
    };

    console.log('Updating existing client with new data...');
    client = await Client.findByIdAndUpdate(linkedClientId, updateData, { new: true });
    
    console.log('Client updated:', {
      id: client.id,
      email: client.email,
      name: client.name
    });

    // Marcar el código como usado
    try {
      await invitation.markAsUsed(client.id);
      console.log('Invitation code marked as used:', invitationCodeInput);
    } catch (error) {
      console.error('Error marking invitation code as used:', error);
      // No fallar el registro si esto falla
    }

  } else {
    // SIN CÓDIGO: Registro normal de nuevo cliente
    console.log('No invitation code - creating new client...');
    
    // Check if client already exists
    const existingClient = await Client.findOne({ email: email.toLowerCase() });
    if (existingClient) {
      return next(new AppError('Ya existe un cliente con este email', 400));
    }

    // Check if user (therapist) already exists with this email
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return next(new AppError('Ya existe un usuario con este email', 400));
    }

    // Create client
    const clientData = {
      name,
      email: email.toLowerCase().trim(),
      password,
      phone: telefono || undefined,
      status: 'active'
    };

    client = await Client.create(clientData);
    
    console.log('New client created:', {
      id: client.id,
      email: client.email,
      name: client.name
    });
  }

  // Generate token for client with type 'client'
  const token = generateToken(client.id, 'client');
  const refreshToken = generateRefreshToken(client.id, 'client');

  res.status(201).json({
    success: true,
    message: invitationCodeInput ? 'Cliente vinculado exitosamente' : 'Cliente registrado exitosamente',
    accessToken: token,
    refreshToken,
    user: {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
      role: 'cliente',
      therapistId: therapistId || client.therapistId || undefined
    }
  });
});

module.exports = {
  register,
  login,
  logout,
  getMe,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  registerCliente
};
