const jwt = require('jsonwebtoken');

/**
 * Genera un token JWT para el usuario
 * @param {string} userId - ID del usuario
 * @param {Object} options - Opciones adicionales
 * @returns {string} Token JWT generado
 */
const generateToken = (userId, options = {}) => {
  const payload = {
    id: userId,
    ...options
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '24h'
  });

  return token;
};

/**
 * Genera un token de refresh
 * @param {string} userId - ID del usuario
 * @returns {string} Refresh token JWT
 */
const generateRefreshToken = (userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
  });

  return token;
};

/**
 * Verifica y decodifica un token JWT
 * @param {string} token - Token JWT a verificar
 * @returns {Object} Payload decodificado
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Verifica un refresh token
 * @param {string} token - Refresh token a verificar
 * @returns {Object} Payload decodificado
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken
};
