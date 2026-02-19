const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const sessionNoteController = require('../controllers/sessionNoteController');
const { protect } = require('../middleware/auth');

// Middleware de autenticación para todas las rutas
router.use(protect);

// Validation rules
const createValidation = [
  body('bookingId')
    .notEmpty()
    .withMessage('Booking ID is required'),
  body('clientId')
    .notEmpty()
    .withMessage('Client ID is required'),
  body('notes')
    .optional()
    .isLength({ max: 10000 })
    .withMessage('Notes cannot exceed 10000 characters'),
  body('mood')
    .optional()
    .isIn(['very_poor', 'poor', 'fair', 'good', 'excellent'])
    .withMessage('Invalid mood value'),
  body('progress')
    .optional()
    .isIn(['no_progress', 'minimal', 'moderate', 'significant', 'excellent'])
    .withMessage('Invalid progress value'),
  body('sessionType')
    .optional()
    .isIn(['initial', 'follow_up', 'review', 'crisis', 'final'])
    .withMessage('Invalid session type')
];

const updateValidation = [
  body('notes')
    .optional()
    .isLength({ max: 10000 })
    .withMessage('Notes cannot exceed 10000 characters'),
  body('mood')
    .optional()
    .isIn(['very_poor', 'poor', 'fair', 'good', 'excellent'])
    .withMessage('Invalid mood value'),
  body('progress')
    .optional()
    .isIn(['no_progress', 'minimal', 'moderate', 'significant', 'excellent'])
    .withMessage('Invalid progress value'),
  body('changeDescription')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Change description cannot exceed 500 characters')
];

const riskFlagValidation = [
  body('level')
    .isIn(['none', 'low', 'moderate', 'high', 'critical'])
    .withMessage('Invalid risk level'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Risk notes cannot exceed 1000 characters')
];

// GET /session-notes - Obtener todas las notas de sesión con filtros
router.get('/', sessionNoteController.getAllNotes);

// GET /session-notes/stats - Estadísticas del terapeuta
router.get('/stats', sessionNoteController.getTherapistStats);

// GET /session-notes/client/:clientId - Obtener notas de un cliente específico
router.get('/client/:clientId', sessionNoteController.getNotesByClient);

// GET /session-notes/booking/:bookingId - Obtener nota por booking
router.get('/booking/:bookingId', sessionNoteController.getNotesByBooking);

// GET /session-notes/:id - Obtener una nota específica
router.get('/:id', sessionNoteController.getNoteById);

// POST /session-notes - Crear nueva nota de sesión
router.post('/', createValidation, sessionNoteController.createNote);

// PUT /session-notes/:id - Actualizar nota de sesión
router.put('/:id', updateValidation, sessionNoteController.updateNote);

// DELETE /session-notes/:id - Eliminar nota de sesión
router.delete('/:id', sessionNoteController.deleteNote);

// POST /session-notes/:id/flag-risk - Marcar nivel de riesgo
router.post('/:id/flag-risk', riskFlagValidation, sessionNoteController.flagRisk);

module.exports = router;
