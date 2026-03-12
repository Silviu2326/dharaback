const express = require('express');
const { body, param, query } = require('express-validator');
const conversationController = require('../controllers/conversationController');
const messageController = require('../controllers/messageController');
const { protect, protectMixed } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

router.use(protectMixed);

// Moderate content endpoint (compatibility with frontend)
router.post('/moderate', async (req, res) => {
  // Simple moderation - always approve for now
  // In production, implement actual content moderation
  res.json({
    approved: true,
    violations: [],
    confidence: 1.0
  });
});

// Direct message endpoints (alternative to nested routes)
router.get('/messages', messageController.getMessagesDirect);
router.post('/messages', messageController.sendMessageDirect);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/attachments/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files per upload
  },
  fileFilter: function (req, file, cb) {
    // Allow images and documents
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and documents are allowed.'));
    }
  }
});

// Validation rules
const createConversationValidation = [
  body('clientId')
    .isMongoId()
    .withMessage('Client ID must be valid')
];

const sendMessageValidation = [
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 2000 })
    .withMessage('Message content cannot exceed 2000 characters'),
  body('type')
    .optional()
    .isIn(['text', 'image', 'file', 'audio', 'video'])
    .withMessage('Invalid message type'),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Invalid priority level'),
  body('replyTo')
    .optional()
    .isMongoId()
    .withMessage('Reply to must be valid')
];

const editMessageValidation = [
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 2000 })
    .withMessage('Message content cannot exceed 2000 characters')
];

const reactionValidation = [
  body('emoji')
    .notEmpty()
    .withMessage('Emoji is required')
    .isLength({ max: 10 })
    .withMessage('Emoji cannot exceed 10 characters')
];

const idValidation = [
  param('conversationId')
    .isMongoId()
    .withMessage('Conversation ID must be valid')
];

const messageIdValidation = [
  param('messageId')
    .isMongoId()
    .withMessage('Message ID must be valid')
];

// Conversation Routes
router.get('/conversations', conversationController.getConversations);
router.post('/conversations', createConversationValidation, conversationController.createConversation);
router.get('/conversations/:conversationId', idValidation, conversationController.getConversation);
router.put('/conversations/:conversationId', idValidation, conversationController.updateConversation);
router.post('/conversations/:conversationId/read', idValidation, conversationController.markAsRead);
router.post('/conversations/:conversationId/typing', idValidation, conversationController.updateTypingStatus);
router.post('/conversations/:conversationId/archive', idValidation, conversationController.archiveConversation);
router.post('/conversations/:conversationId/unarchive', idValidation, conversationController.unarchiveConversation);

// Message Routes
router.get('/conversations/:conversationId/messages', idValidation, messageController.getMessages);
router.post('/conversations/:conversationId/messages',
  idValidation,
  upload.array('attachments', 5),
  sendMessageValidation,
  messageController.sendMessage
);
router.get('/messages/:messageId', messageIdValidation, messageController.getMessage);
router.put('/messages/:messageId', messageIdValidation, editMessageValidation, messageController.editMessage);
router.delete('/messages/:messageId', messageIdValidation, messageController.deleteMessage);
router.post('/messages/:messageId/read', messageIdValidation, messageController.markMessageAsRead);
router.post('/conversations/:conversationId/messages/read-all', idValidation, messageController.markAllAsRead);

// Message Reactions
router.post('/messages/:messageId/reactions', messageIdValidation, reactionValidation, messageController.addReaction);
router.delete('/messages/:messageId/reactions', messageIdValidation, messageController.removeReaction);

// Search and Statistics
router.get('/search/messages', conversationController.searchMessages);
router.get('/conversations/:conversationId/search', idValidation, messageController.searchConversationMessages);
router.get('/conversations/:conversationId/unread-count', idValidation, messageController.getUnreadCount);
router.get('/stats', conversationController.getConversationStats);
router.get('/conversations/:conversationId/response-time', idValidation, conversationController.calculateResponseTime);

module.exports = router;
