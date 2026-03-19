const express = require('express');
const { body, param, query } = require('express-validator');
const documentController = require('../controllers/documentController');
const { protectMixed } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

router.use(protectMixed);

// Configure multer for document uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/documents/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1
  },
  fileFilter: function (req, file, cb) {
    // Allow common document types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|mp3|mp4|wav|avi|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /image\/|application\/pdf|application\/msword|application\/vnd|text\/|audio\/|video\//.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload documents, images, audio, or video files.'));
    }
  }
});

// UUID validator helper
const isValidUUID = (value) => {
  if (!value) return true; // Optional field
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

// Validation rules
const uploadValidation = [
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('category')
    .optional()
    .isIn(['session_notes', 'assessment', 'treatment_plan', 'report', 'consent_form', 'invoice', 'certificate', 'homework', 'resource', 'other'])
    .withMessage('Invalid category'),
  body('clientId')
    .optional()
    .custom((value) => {
      if (!value) return true;
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Client ID must be valid');
      }
      return true;
    }),
  body('visibility')
    .optional()
    .isIn(['private', 'client_shared', 'therapist_only', 'admin_only'])
    .withMessage('Invalid visibility setting'),
  body('isConfidential')
    .optional()
    .isBoolean()
    .withMessage('isConfidential must be boolean')
];

const updateValidation = [
  body('title')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('category')
    .optional()
    .isIn(['session_notes', 'assessment', 'treatment_plan', 'report', 'consent_form', 'invoice', 'certificate', 'homework', 'resource', 'other'])
    .withMessage('Invalid category'),
  body('visibility')
    .optional()
    .isIn(['private', 'client_shared', 'therapist_only', 'admin_only'])
    .withMessage('Invalid visibility setting'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

const shareValidation = [
  body('clientId')
    .custom((value) => {
      if (!value) throw new Error('Client ID is required');
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Client ID must be valid');
      }
      return true;
    }),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array')
];

const bulkValidation = [
  body('documentIds')
    .isArray({ min: 1 })
    .withMessage('Document IDs must be a non-empty array'),
  body('documentIds.*')
    .isMongoId()
    .withMessage('Each document ID must be valid')
];

const idValidation = [
  param('documentId').isMongoId().withMessage('Document ID must be valid')
];

const categoryValidation = [
  param('category')
    .isIn(['session_notes', 'assessment', 'treatment_plan', 'report', 'consent_form', 'invoice', 'certificate', 'homework', 'resource', 'other'])
    .withMessage('Invalid category')
];

// Document management routes
router.get('/', documentController.getDocuments);
router.post('/upload', upload.single('file'), uploadValidation, documentController.uploadDocument);
router.get('/recent', documentController.getRecentDocuments);
router.get('/search', documentController.searchDocuments);
router.get('/statistics', documentController.getStorageStats);

// Category routes
router.get('/category/:category', categoryValidation, documentController.getDocumentsByCategory);

// Individual document routes (must be after all static routes)
router.get('/:documentId', idValidation, documentController.getDocument);
router.put('/:documentId', idValidation, updateValidation, documentController.updateDocument);
router.delete('/:documentId', idValidation, documentController.deleteDocument);
router.get('/:documentId/download', idValidation, documentController.downloadDocument);
router.post('/:documentId/share', idValidation, shareValidation, documentController.shareDocument);
router.post('/:documentId/revoke-access', idValidation, documentController.revokeAccess);
router.post('/:documentId/archive', idValidation, documentController.archiveDocument);
router.get('/:documentId/access-log', idValidation, documentController.getAccessLog);

// Version management
router.post('/:documentId/version', idValidation, upload.single('document'), documentController.createVersion);

// Bulk operations
router.post('/bulk/delete', bulkValidation, documentController.bulkDelete);
router.post('/bulk/archive', bulkValidation, documentController.bulkArchive);

module.exports = router;