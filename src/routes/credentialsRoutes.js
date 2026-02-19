const express = require('express');
const { body, param, query } = require('express-validator');
const credentialsController = require('../controllers/credentialsController');
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Configure multer for credential document uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/credentials/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'credential-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /image\/|application\/pdf|application\/msword|application\/vnd|text\//.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Invalid file type.'));
  }
});

// Validation rules
const createValidation = [
  body('title').notEmpty().withMessage('Credential title is required').isLength({ max: 200 }),
  body('institution').notEmpty().withMessage('Institution is required').isLength({ max: 200 }),
  body('year').notEmpty().matches(/^\d{4}$/).withMessage('Year must be a 4-digit number'),
  body('description').optional().isLength({ max: 2000 }),
  body('credentialType').optional().isIn(['degree', 'certification', 'license', 'specialization', 'course', 'training', 'membership', 'award']),
  body('level').optional().isIn(['bachelor', 'master', 'doctorate', 'postgraduate', 'professional', 'continuing_education']),
  body('field').optional().isLength({ max: 100 }),
  body('grade').optional().isLength({ max: 50 }),
  body('expiryDate').optional().isISO8601(),
  body('priority').optional().isInt({ min: 0, max: 100 }),
  body('tags').optional().isArray()
];

const updateValidation = [
  body('title').optional().isLength({ max: 200 }),
  body('institution').optional().isLength({ max: 200 }),
  body('year').optional().matches(/^\d{4}$/),
  body('description').optional().isLength({ max: 2000 }),
  body('credentialType').optional().isIn(['degree', 'certification', 'license', 'specialization', 'course', 'training', 'membership', 'award']),
  body('level').optional().isIn(['bachelor', 'master', 'doctorate', 'postgraduate', 'professional', 'continuing_education']),
  body('field').optional().isLength({ max: 100 }),
  body('grade').optional().isLength({ max: 50 }),
  body('expiryDate').optional().isISO8601(),
  body('priority').optional().isInt({ min: 0, max: 100 }),
  body('tags').optional().isArray()
];

const idValidation = [
  param('credentialId').isUUID().withMessage('Credential ID must be valid')
];

// Main routes
router.get('/', credentialsController.getCredentials);
router.post('/', upload.single('document'), createValidation, credentialsController.createCredential);
router.get('/stats', credentialsController.getCredentialStats);
router.get('/expiring', credentialsController.getExpiringCredentials);

// Individual credential routes
router.get('/:credentialId', idValidation, credentialsController.getCredential);
router.put('/:credentialId', idValidation, upload.single('document'), updateValidation, credentialsController.updateCredential);
router.delete('/:credentialId', idValidation, credentialsController.deleteCredential);

// Document download
router.get('/:credentialId/download', idValidation, credentialsController.downloadDocument);

module.exports = router;
