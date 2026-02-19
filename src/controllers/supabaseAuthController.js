const asyncHandler = require('../middleware/asyncHandler');
const User = require('../models/User');
const { generateToken } = require('../utils/tokenUtils');

/**
 * @desc    Sincronizar usuario de Supabase con base de datos local
 * @route   POST /api/auth/supabase/sync
 * @access  Public (con token de Supabase)
 */
const syncSupabaseUser = asyncHandler(async (req, res, next) => {
  const { supabaseId, email, name, avatar, provider, emailVerified } = req.body;

  // Validar datos requeridos
  if (!supabaseId || !email) {
    return res.status(400).json({
      success: false,
      message: 'Supabase ID and email are required'
    });
  }

  try {
    // Buscar usuario existente por supabaseId o email
    let user = await User.findOne({
      $or: [
        { supabaseId },
        { email: email.toLowerCase() }
      ]
    });

    if (user) {
      // Usuario existe - actualizar datos
      user.supabaseId = supabaseId;
      user.name = name || user.name;
      user.avatar = avatar || user.avatar;
      user.emailVerified = emailVerified || user.emailVerified;
      user.lastLogin = new Date();

      // Si el usuario se autenticó con Google, marcarlo como verificado
      if (provider === 'google') {
        user.emailVerified = true;
      }

      await user.save();

      console.log(`✅ User synced from Supabase: ${user.email}`);
    } else {
      // Usuario no existe - crear nuevo
      user = await User.create({
        supabaseId,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        avatar,
        emailVerified: provider === 'google' ? true : emailVerified,
        authProvider: provider || 'google',
        role: 'professional', // Por defecto todos son profesionales
        status: 'active',
        lastLogin: new Date()
      });

      console.log(`✅ New user created from Supabase: ${user.email}`);
    }

    // Generar token JWT para usar con el backend
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'User synced successfully',
      user: {
        id: user._id,
        supabaseId: user.supabaseId,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        emailVerified: user.emailVerified
      },
      token
    });
  } catch (error) {
    console.error('❌ Error syncing Supabase user:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing user with database'
    });
  }
});

/**
 * @desc    Verificar token de Supabase
 * @route   POST /api/auth/supabase/verify
 * @access  Public
 */
const verifySupabaseToken = asyncHandler(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Token is required'
    });
  }

  try {
    // Aquí podrías verificar el token con Supabase si fuera necesario
    // Por ahora solo retornamos que el endpoint está disponible

    res.status(200).json({
      success: true,
      message: 'Token verification endpoint ready'
    });
  } catch (error) {
    console.error('❌ Error verifying Supabase token:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying token'
    });
  }
});

module.exports = {
  syncSupabaseUser,
  verifySupabaseToken
};
