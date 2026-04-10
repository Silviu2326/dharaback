const express = require('express');
const { checkClientTherapistRelation } = require('../controllers/clientTherapistRelationController');
const {
  getClientTherapistConnection,
  createClientTherapistConnection
} = require('../controllers/clienttherapistconecciontcontroller');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Check if client has relation with therapist (legacy endpoint)
router.get('/check-relation', checkClientTherapistRelation);

// Check if client has active connection with therapist (token-based)
router.get('/connection/:therapistId', getClientTherapistConnection);

// Create connection between client and therapist
router.post('/connection', createClientTherapistConnection);

module.exports = router;
