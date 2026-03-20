const express = require('express');
const { body, param, query } = require('express-validator');
const workLocationController = require('../controllers/workLocationController');
const { protect, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Ruta pública para clientes - obtener ubicaciones de un terapeuta específico
router.get('/public/therapist/:therapistId', 
  param('therapistId').isUUID().withMessage('Therapist ID must be a valid UUID'),
  workLocationController.getPublicLocationsByTherapist
);

// Rutas protegidas (requieren autenticación)
router.use(protect);

// Validation rules - Alineados con la estructura de la tabla work_locations en Supabase
const createValidation = [
  body('name').notEmpty().withMessage('Location name is required').isLength({ max: 100 }),
  body('address').notEmpty().withMessage('Address is required').isString().withMessage('Address must be a string').isLength({ max: 255 }),
  body('city').notEmpty().withMessage('City is required').isLength({ max: 100 }),
  body('postalCode').notEmpty().matches(/^[0-5]\d{4}$/).withMessage('Please enter a valid Spanish postal code'),
  body('phone').optional().matches(/^(\+34|0034|34)?[6-9]\d{8}$/).withMessage('Please enter a valid Spanish phone number'),
  body('email').optional().isEmail(),
  body('isPrimary').optional().isBoolean()
];

const updateValidation = [
  body('name').optional().isLength({ max: 100 }),
  body('address').optional().isString().isLength({ max: 255 }),
  body('city').optional().isLength({ max: 100 }),
  body('postalCode').optional().matches(/^[0-5]\d{4}$/),
  body('phone').optional().matches(/^(\+34|0034|34)?[6-9]\d{8}$/),
  body('email').optional().isEmail(),
  body('isPrimary').optional().isBoolean()
];

const nearbyValidation = [
  query('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  query('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  query('maxDistance').optional().isFloat({ min: 0.1, max: 1000 })
];

const idValidation = [
  param('locationId').isUUID().withMessage('Location ID must be a valid UUID')
];

const therapistIdValidation = [
  param('therapistId').isUUID().withMessage('Therapist ID must be a valid UUID')
];

// Main routes
router.get('/', workLocationController.getWorkLocations);
router.post('/', createValidation, workLocationController.createWorkLocation);

// Search and discovery
router.get('/nearby', nearbyValidation, workLocationController.findNearbyLocations);

// Therapist-specific routes
router.get('/therapist', workLocationController.getLocationsByTherapist);
router.get('/therapist/:therapistId', therapistIdValidation, workLocationController.getLocationsByTherapist);

// Individual location routes
router.get('/:locationId', idValidation, workLocationController.getWorkLocation);
router.put('/:locationId', idValidation, updateValidation, workLocationController.updateWorkLocation);
router.delete('/:locationId', idValidation, workLocationController.deleteWorkLocation);

// Location management
router.post('/:locationId/set-primary', idValidation, workLocationController.setPrimaryLocation);

// Distance calculation
router.get('/:locationId/distance', idValidation, nearbyValidation, workLocationController.calculateDistance);

module.exports = router;
