const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getClientReviews,
  getClientReview,
  createReview,
  updateClientReview,
  deleteClientReview,
  getClientReviewStats
} = require('../controllers/reviewController');
const { protectClient } = require('../middleware/auth');

const router = express.Router();

// All routes require client authentication
router.use(protectClient);

// Validation rules
const reviewIdValidation = [
  param('reviewId')
    .isMongoId()
    .withMessage('Review ID must be valid')
];

const createReviewValidation = [
  body('therapistId')
    .isMongoId()
    .withMessage('Therapist ID must be valid'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('title')
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('comment')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Comment must be between 10 and 1000 characters'),
  body('bookingId')
    .optional()
    .isMongoId()
    .withMessage('Booking ID must be valid'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .isLength({ max: 30 })
    .withMessage('Each tag cannot exceed 30 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean')
];

const updateReviewValidation = [
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('title')
    .optional()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('comment')
    .optional()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Comment must be between 10 and 1000 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .isLength({ max: 30 })
    .withMessage('Each tag cannot exceed 30 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean')
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
    .isIn(['createdAt', 'rating', 'title', 'updatedAt'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

// Client review routes

// Get all reviews written by the client
router.get('/',
  paginationValidation,
  getClientReviews
);

// Get client's review statistics
router.get('/stats',
  getClientReviewStats
);

// Create a new review
router.post('/',
  createReviewValidation,
  createReview
);

// Get a specific review written by the client
router.get('/:reviewId',
  reviewIdValidation,
  getClientReview
);

// Update a review written by the client
router.put('/:reviewId',
  reviewIdValidation,
  updateReviewValidation,
  updateClientReview
);

// Delete a review written by the client
router.delete('/:reviewId',
  reviewIdValidation,
  deleteClientReview
);

module.exports = router;