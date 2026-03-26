// Custom error class
class AppError extends Error {
  constructor(message, statusCode, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errors = errors; // For validation errors array

    Error.captureStackTrace(this, this.constructor);
  }
}

// Handle Supabase/PostgreSQL errors
const handleSupabaseError = (err) => {
  // PostgreSQL unique violation
  if (err.code === '23505') {
    const match = err.message?.match(/Key \(([^)]+)\)=\(([^)]+)\)/);
    const field = match ? match[1] : 'value';
    const value = match ? match[2] : 'unknown';
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists. Please use another value.`;
    return new AppError(message, 409);
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return new AppError('Referenced record does not exist.', 400);
  }

  // PostgreSQL not null violation
  if (err.code === '23502') {
    const match = err.message?.match(/column "([^"]+)"/);
    const column = match ? match[1] : 'field';
    return new AppError(`${column} is required.`, 400);
  }

  // PostgreSQL check violation
  if (err.code === '23514') {
    return new AppError('Data validation failed. Please check your input.', 400);
  }

  // Supabase specific errors
  if (err.message?.includes('JWT') || err.message?.includes('token')) {
    return new AppError('Invalid or expired token. Please log in again.', 401);
  }

  if (err.message?.includes('permission denied') || err.message?.includes('row-level security')) {
    return new AppError('Access denied. You do not have permission to perform this action.', 403);
  }

  // Default Supabase error
  return new AppError(err.message || 'Database error occurred.', 500);
};

// Handle Mongoose validation errors (legacy compatibility)
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map(val => val.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

// Handle Mongoose duplicate key errors (legacy compatibility)
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists. Please use another value.`;
  return new AppError(message, 400);
};

// Handle Mongoose cast errors (legacy compatibility)
const handleCastError = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

// Handle JWT errors
const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again.', 401);
};

const handleJWTExpiredError = () => {
  return new AppError('Your token has expired. Please log in again.', 401);
};

// Handle validation errors from express-validator
const handleExpressValidationError = (err) => {
  return new AppError(err.message, 400, err.errors);
};

// Send error response in development
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    error: err,
    message: err.message,
    stack: err.stack,
    errors: err.errors
  });
};

// Send error response in production
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    const response = {
      success: false,
      message: err.message
    };
    
    // Include validation errors if present
    if (err.errors) {
      response.errors = err.errors;
    }
    
    res.status(err.statusCode).json(response);
  } else {
    // Programming or other unknown error: don't leak error details
    console.error('ERROR 💥', err);

    res.status(500).json({
      success: false,
      message: 'Something went wrong! Please try again later.'
    });
  }
};

// Main error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('Error:', err);

  // Ensure CORS headers are always present on error responses
  const origin = req.headers.origin;
  if (origin && !res.getHeader('Access-Control-Allow-Origin')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Supabase/PostgreSQL errors
  if (err.code && err.code.startsWith('23')) {
    error = handleSupabaseError(err);
  }

  // Supabase connection errors
  if (err.message?.includes('supabase') || err.message?.includes('postgrest')) {
    error = handleSupabaseError(err);
  }

  // Legacy: Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error = handleCastError(error);
  }

  // Legacy: Mongoose validation error
  if (err.name === 'ValidationError') {
    error = handleValidationError(error);
  }

  // Legacy: Mongoose duplicate key
  if (err.code === 11000) {
    error = handleDuplicateKeyError(error);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  }

  if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }

  // Express validation errors
  if (err.name === 'ValidationError' && err.errors) {
    error = handleExpressValidationError(err);
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = new AppError('File too large. Maximum size is 50MB.', 400);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = new AppError('Too many files uploaded or unexpected file field.', 400);
  }

  // Set default error values
  error.statusCode = error.statusCode || 500;
  error.status = error.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 error handler for undefined routes
const notFound = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
  notFound
};
