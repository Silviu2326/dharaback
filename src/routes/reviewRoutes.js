const express = require('express');
const { body, param, query } = require('express-validator');
const reviewController = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Validation rules
const responseValidation = [
  body('response')
    .notEmpty()
    .withMessage('Response is required')
    .isLength({ max: 800 })
    .withMessage('Response cannot exceed 800 characters')
];

const reportValidation = [
  body('reason')
    .isIn(['inappropriate', 'spam', 'fake', 'offensive', 'other'])
    .withMessage('Invalid report reason'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const createReviewValidation = [
  body('therapistId')
    .isUUID(4)
    .withMessage('Therapist ID must be valid'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('comment')
    .notEmpty()
    .withMessage('Comment is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Comment must be between 10 and 1000 characters'),
  body('bookingId')
    .optional()
    .isUUID(4)
    .withMessage('Booking ID must be valid'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean')
];

const visibilityValidation = [
  body('isPublic')
    .isBoolean()
    .withMessage('isPublic must be a boolean')
];

const idValidation = [
  param('reviewId')
    .isUUID(4)
    .withMessage('Review ID must be valid')
];

// Review management routes
router.get('/', reviewController.getReviews);
router.get('/summary', reviewController.getRatingSummary);
router.get('/recent', reviewController.getRecentReviews);
router.get('/search', reviewController.searchReviews);
router.get('/analytics', reviewController.getReviewAnalytics);
router.get('/statistics', reviewController.getReviewStatistics);
router.get('/tags', reviewController.getReviewsByTags);
router.get('/:reviewId', idValidation, reviewController.getReview);

// Review interaction routes
router.post('/:reviewId/response', idValidation, responseValidation, reviewController.addResponse);
router.put('/:reviewId/response', idValidation, responseValidation, reviewController.updateResponse);
router.post('/:reviewId/helpful', idValidation, reviewController.markAsHelpful);
router.post('/:reviewId/report', idValidation, reportValidation, reviewController.reportReview);
router.put('/:reviewId/visibility', idValidation, visibilityValidation, reviewController.updateVisibility);

// Client review creation (can be accessed via client auth)
router.post('/create', createReviewValidation, reviewController.createReview);

module.exports = router;
