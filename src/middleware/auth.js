const jwt = require('jsonwebtoken');
const { User, Client } = require('../models');

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

      // Get user from token (password is not included by default)
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User account is deactivated.'
        });
      }

      // Remove password from user object
      user.password = undefined;

      // Add user to request object
      req.user = user;
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

        // Get user from token
        const user = await User.findById(decoded.id);

        if (user && user.isActive) {
          user.password = undefined;
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

      // Check if token is for client
      if (decoded.type !== 'client') {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Invalid token type.'
        });
      }

      // Get client from token
      const client = await Client.findById(decoded.id);

      if (!client) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Client not found.'
        });
      }

      // Check if client is active
      if (client.status !== 'active') {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Client account is not active.'
        });
      }

      // Remove password from client object
      client.password = undefined;

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

      // Check token type and get appropriate user
      if (decoded.type === 'client') {
        user = await Client.findById(decoded.id);
        if (user && user.status !== 'active') {
          return res.status(401).json({
            success: false,
            message: 'Access denied. Client account is not active.'
          });
        }
      } else {
        // Default to User model for backward compatibility
        user = await User.findById(decoded.id);
        if (user && !user.isActive) {
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

      // Remove password from user object
      user.password = undefined;

      // Add user to request object
      req.user = user;
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
