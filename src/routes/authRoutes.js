const express = require('express');
const {
  register,
  login,
  logout,
  getMe,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  registerCliente
} = require('../controllers/authController');

const { protect, authRateLimit } = require('../middleware/auth');

const router = express.Router();

// Public routes with rate limiting (temporarily disabled for testing)
router.post('/register', register);
router.post('/register-cliente', registerCliente);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.use(protect); // All routes after this are protected

router.get('/me', getMe);
router.post('/logout', logout);
router.post('/change-password', changePassword);

module.exports = router;