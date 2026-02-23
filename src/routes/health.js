const express = require('express');

const router = express.Router();

const startTime = Date.now();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

module.exports = router;
