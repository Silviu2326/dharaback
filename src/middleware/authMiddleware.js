// Re-exportar desde auth.js para mantener compatibilidad
const { 
  protect, 
  authorize, 
  optionalAuth, 
  checkOwnership,
  requireVerified,
  protectClient,
  protectMixed,
  authRateLimit
} = require('./auth');

module.exports = {
  protect,
  authorize,
  optionalAuth,
  requireOwnership: checkOwnership, // Alias para compatibilidad
  checkOwnership,
  requireVerified,
  protectClient,
  protectMixed,
  authRateLimit
};
