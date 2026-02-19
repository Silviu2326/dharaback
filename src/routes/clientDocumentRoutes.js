const express = require('express');
const { param, query } = require('express-validator');
const clientDocumentController = require('../controllers/clientDocumentController');
const { protectClient } = require('../middleware/auth');

const router = express.Router();

// All routes require client authentication
router.use(protectClient);

// Validation rules
const idValidation = [
  param('documentId')
    .isMongoId()
    .withMessage('Document ID must be valid')
];

const categoryValidation = [
  param('category')
    .isIn(['session_notes', 'assessment', 'treatment_plan', 'report', 'consent_form', 'invoice', 'certificate', 'homework', 'resource', 'other'])
    .withMessage('Invalid category')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'title', 'category', 'type', 'size'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

// Client document routes
router.get('/',
  paginationValidation,
  clientDocumentController.getClientDocuments
);

router.get('/recent',
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  clientDocumentController.getRecentClientDocuments
);

router.get('/stats',
  clientDocumentController.getClientDocumentStats
);

router.get('/category/:category',
  categoryValidation,
  paginationValidation,
  clientDocumentController.getClientDocumentsByCategory
);

router.get('/:documentId',
  idValidation,
  clientDocumentController.getClientDocument
);

router.get('/:documentId/download',
  idValidation,
  clientDocumentController.downloadClientDocument
);

module.exports = router;