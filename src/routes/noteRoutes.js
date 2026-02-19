const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const noteController = require('../controllers/noteController');
const { protect } = require('../middleware/auth');

// Middleware de autenticación para todas las rutas
router.use(protect);

// Validation rules
const createValidation = [
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('content')
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 1, max: 5000 })
    .withMessage('Content must be between 1 and 5000 characters'),
  body('category')
    .optional()
    .isIn(['general', 'therapy', 'personal', 'medication', 'lifestyle', 'relationships', 'work', 'family', 'emotions', 'symptoms', 'goals', 'other'])
    .withMessage('Invalid category'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('clientId')
    .optional()
    .isUUID()
    .withMessage('Client ID must be a valid UUID')
];

const updateValidation = [
  body('title')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('content')
    .optional()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Content must be between 1 and 5000 characters'),
  body('category')
    .optional()
    .isIn(['general', 'therapy', 'personal', 'medication', 'lifestyle', 'relationships', 'work', 'family', 'emotions', 'symptoms', 'goals', 'other'])
    .withMessage('Invalid category'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('changeDescription')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Change description cannot exceed 500 characters')
];

const responseValidation = [
  body('content')
    .notEmpty()
    .withMessage('Response content is required')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be between 1 and 2000 characters')
];

const tagsValidation = [
  body('tags')
    .isArray({ min: 1 })
    .withMessage('Tags must be a non-empty array')
];

// GET /notes - Obtener notas con filtros
router.get('/', noteController.getNotes);

// GET /notes/stats - Estadísticas de notas
router.get('/stats', noteController.getNoteStats);

// GET /notes/pinned - Obtener notas fijadas
router.get('/pinned', noteController.getPinnedNotes);

// GET /notes/with-reminders - Obtener notas con recordatorios pendientes
router.get('/with-reminders', noteController.getNotesWithReminders);

// GET /notes/expired - Obtener notas con recordatorios vencidos
router.get('/expired', noteController.getExpiredNotes);

// GET /notes/pending-responses - Obtener notas con respuestas pendientes
router.get('/pending-responses', noteController.getNotesWithPendingResponses);

// GET /notes/search - Buscar notas
router.get('/search', noteController.searchNotes);

// GET /notes/category/:category - Obtener notas por categoría
router.get('/category/:category', noteController.getNotesByCategory);

// POST /notes/tags - Obtener notas por tags
router.post('/tags', tagsValidation, noteController.getNotesByTags);

// GET /notes/:id - Obtener una nota específica
router.get('/:id', noteController.getNote);

// POST /notes - Crear nueva nota
router.post('/', createValidation, noteController.createNote);

// PUT /notes/:id - Actualizar nota
router.put('/:id', updateValidation, noteController.updateNote);

// DELETE /notes/:id - Eliminar nota
router.delete('/:id', noteController.deleteNote);

// PUT /notes/:id/pin - Fijar/desfijar nota
router.put('/:id/pin', noteController.togglePin);

// POST /notes/:id/response - Añadir respuesta a una nota
router.post('/:id/response', responseValidation, noteController.addResponse);

// PUT /notes/:id/response/:responseId/read - Marcar respuesta como leída
router.put('/:id/response/:responseId/read', noteController.markResponseRead);

// PUT /notes/:id/reminder/:reminderId/complete - Completar recordatorio
router.put('/:id/reminder/:reminderId/complete', noteController.completeReminder);

module.exports = router;
