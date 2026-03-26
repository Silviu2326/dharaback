const express = require('express');
const { checkClientTherapistRelation } = require('../controllers/clientTherapistRelationController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Check if client has relation with therapist
router.get('/check-relation', checkClientTherapistRelation);

module.exports = router;
