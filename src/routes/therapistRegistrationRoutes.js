const express = require('express');
const router = express.Router();
const {
  createTherapistSubscription,
  verifyRegistration,
  processDegreeDocuments
} = require('../controllers/therapistRegistrationController');

// POST /api/terapeutas/suscribir
// Crear sesión de checkout para registro con trial
router.post('/suscribir', createTherapistSubscription);

// GET /api/terapeutas/verificar-registro
// Verificar estado después del checkout
router.get('/verificar-registro', verifyRegistration);

// POST /api/terapeutas/procesar-documentos
// Procesar documentos de titulación temporales
router.post('/procesar-documentos', processDegreeDocuments);

module.exports = router;
