const express = require('express');
const {
  uploadFile,
  deleteFile,
  getSignedUrl
} = require('../controllers/storageController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// Upload file
router.post('/upload', uploadFile);

// Delete file
router.delete('/delete', deleteFile);

// Get signed URL
router.post('/signed-url', getSignedUrl);

module.exports = router;
