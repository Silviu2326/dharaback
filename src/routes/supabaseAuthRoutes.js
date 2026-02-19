const express = require('express');
const router = express.Router();
const {
  syncSupabaseUser,
  verifySupabaseToken
} = require('../controllers/supabaseAuthController');

// Sincronizar usuario de Supabase
router.post('/sync', syncSupabaseUser);

// Verificar token de Supabase
router.post('/verify', verifySupabaseToken);

module.exports = router;
