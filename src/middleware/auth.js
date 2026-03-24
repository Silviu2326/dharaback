const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies (optional)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log(`🔐 [protect] Token decodificado:`, decoded);

      let user;
      let userError;

      // Check if token is for client
      if (decoded.type === 'client') {
        console.log(`🔐 [protect] Token es de cliente, buscando en clients`);
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq('id', decoded.id)
          .single();
        
        user = client;
        userError = clientError;

        if (clientError) {
          console.error('❌ [protect] Error de Supabase (clients):', clientError);
          return res.status(401).json({
            success: false,
            message: 'Access denied. Client not found.'
          });
        }

        if (!client) {
          console.error('❌ [protect] Cliente no encontrado en Supabase para ID:', decoded.id);
          return res.status(401).json({
            success: false,
            message: 'Access denied. Client not found.'
          });
        }

        console.log(`✅ [protect] Cliente encontrado:`, { id: client.id, email: client.email });

        // Check if client is active
        if (client.status !== 'active') {
          console.log(`❌ [protect] Cliente no está activo. status:`, client.status);
          return res.status(401).json({
            success: false,
            message: 'Access denied. Client account is not active.'
          });
        }

        req.user = client;
        req.user.role = 'client'; // Ensure role is set for clients
        console.log(`✅ [protect] Cliente agregado a req.user, llamando next()`);
        next();
        return;
      }

      // Get user from Supabase (for non-client tokens)
      console.log(`🔐 [protect] Buscando usuario en Supabase con ID:`, decoded.id);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', decoded.id)
        .single();

      user = data;
      userError = error;

      console.log(`🔐 [protect] Resultado consulta Supabase:`, { user: user ? 'ENCONTRADO' : 'NO ENCONTRADO', error: userError });

      if (userError) {
        console.error('❌ [protect] Error de Supabase:', userError);
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }

      if (!user) {
        console.error('❌ [protect] Usuario no encontrado en Supabase para ID:', decoded.id);
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }

      console.log(`✅ [protect] Usuario encontrado:`, { id: user.id, email: user.email, role: user.role });

      // Check if user is active
      if (user.status !== 'active' && user.isActive === false) {
        console.log(`❌ [protect] Usuario no está activo. status:`, user.status, 'isActive:', user.isActive);
        return res.status(401).json({
          success: false,
          message: 'Access denied. User account is deactivated.'
        });
      }

      // Add user to request object
      req.user = user;
      console.log(`✅ [protect] Usuario agregado a req.user, llamando next()`);
      next();

    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.'
      });
    }

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Authorize specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not authenticated.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Role '${req.user.role}' is not authorized to access this resource.`
      });
    }

    next();
  };
};

// Check if user is verified (for therapist-specific actions)
const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. User not authenticated.'
    });
  }

  if (!req.user.isVerified && req.user.role === 'therapist') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Account verification required to perform this action.'
    });
  }

  next();
};

// Optional auth - doesn't require token but adds user if present
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from Supabase
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', decoded.id)
          .single();

        if (user && (user.status === 'active' || user.isActive !== false)) {
          req.user = user;
        }
      } catch (error) {
        // Invalid token - continue without user
        console.log('Invalid token in optional auth:', error.message);
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(); // Continue even if there's an error
  }
};

// Check if user owns resource (for user-specific resources)
const checkOwnership = (resourcePath = 'user') => {
  return (req, res, next) => {
    // For admin users, allow access to all resources
    if (req.user && req.user.role === 'admin') {
      return next();
    }

    let resourceUserId;

    // Extract user ID from different possible paths
    switch (resourcePath) {
      case 'user':
        resourceUserId = req.params.userId || req.params.id;
        break;
      case 'therapist':
        resourceUserId = req.params.therapistId;
        break;
      case 'body':
        resourceUserId = req.body.userId || req.body.therapistId;
        break;
      default:
        resourceUserId = req.params[resourcePath];
    }

    // If no specific user ID, check if accessing own resources
    if (!resourceUserId) {
      return next(); // Let the route handler decide
    }

    // Check if user is accessing their own resource
    // Support both id and _id for compatibility
    const userId = req.user.id || req.user._id;
    if (userId && userId.toString() === resourceUserId.toString()) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own resources.'
    });
  };
};

// Rate limiting for authentication endpoints
const authRateLimit = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Protect routes for clients - require client authentication
const protectClient = async (req, res, next) => {
  try {
    console.log('🔐 protectClient middleware - URL:', req.url);
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('🔑 Token encontrado en headers');
    }

    // Check for token in cookies (optional)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
      console.log('🔑 Token encontrado en cookies');
    }

    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      console.log('🔍 Verificando token...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ Token decodificado:', decoded);

      // Check if token is for client
      if (decoded.type !== 'client') {
        console.log('❌ Token type no es client:', decoded.type);
        return res.status(401).json({
          success: false,
          message: 'Access denied. Invalid token type.'
        });
      }

      // Get client from Supabase
      console.log('👤 Buscando cliente con ID:', decoded.id);
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', decoded.id)
        .single();

      if (clientError || !client) {
        console.log('❌ Cliente no encontrado en la base de datos:', clientError);
        return res.status(401).json({
          success: false,
          message: 'Access denied. Client not found.'
        });
      }

      console.log('✅ Cliente encontrado:', client.name);

      // Check if client is active
      if (client.status !== 'active') {
        console.log('❌ Cliente no está activo. Status:', client.status);
        return res.status(401).json({
          success: false,
          message: 'Access denied. Client account is not active.'
        });
      }

      // Add client to request object
      req.user = client;
      next();

    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.'
      });
    }

  } catch (error) {
    console.error('Client auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Mixed protection - supports both User and Client tokens
const protectMixed = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies (optional)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      let user;
      let userType = 'therapist'; // default

      // Check token type and get appropriate user from Supabase
      if (decoded.type === 'client') {
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq('id', decoded.id)
          .single();
        
        user = client;
        userType = 'client';
        
        if (user && user.status !== 'active') {
          return res.status(401).json({
            success: false,
            message: 'Access denied. Client account is not active.'
          });
        }
      } else {
        // Default to users table for therapists
        const { data: therapist, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', decoded.id)
          .single();
        
        user = therapist;
        
        if (user && (user.status !== 'active' && user.isActive === false)) {
          return res.status(401).json({
            success: false,
            message: 'Access denied. User account is deactivated.'
          });
        }
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }

      // Add type info to user object
      req.user = {
        ...user,
        type: userType,
        role: userType === 'client' ? 'client' : (user.role || 'therapist')
      };
      next();

    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.'
      });
    }

  } catch (error) {
    console.error('Mixed auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

module.exports = {
  protect,
  authorize,
  requireVerified,
  optionalAuth,
  checkOwnership,
  authRateLimit,
  protectClient,
  protectMixed
};
