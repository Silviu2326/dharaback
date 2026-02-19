const express = require('express');
const router = express.Router();
const {
  sendSMS,
  sendAppointmentReminder,
  sendAppointmentConfirmation,
  getMessageStatus
} = require('../controllers/smsController');
const { protect } = require('../middleware/authMiddleware');

// Todas las rutas están protegidas
router.use(protect);

// Enviar SMS genérico
router.post('/send', sendSMS);

// Recordatorios y confirmaciones de citas
router.post('/appointment-reminder', sendAppointmentReminder);
router.post('/appointment-confirmation', sendAppointmentConfirmation);

// Obtener estado de mensaje
router.get('/status/:messageSid', getMessageStatus);

module.exports = router;
