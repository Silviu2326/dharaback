console.log('🔥 Starting SIMPLE server...');

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5001; // Using different port to avoid conflicts

// Basic middleware
app.use(cors());
app.use(express.json());

// Simple test routes
app.get('/test', (req, res) => {
  console.log('✅ Simple GET /test called');
  res.json({
    success: true,
    message: 'Simple server working!',
    timestamp: new Date().toISOString()
  });
});

app.post('/test-login', (req, res) => {
  console.log('✅ Simple POST /test-login called');
  console.log('Body:', req.body);

  const { email, password } = req.body;

  if (email === 'admin@demo.com' && password === 'password123') {
    res.json({
      success: true,
      message: 'Simple login successful!',
      data: {
        token: 'simple-token-123',
        user: { id: 1, name: 'Test User', email }
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Simple login failed'
    });
  }
});

// No catch-all for now - let's just test the specific routes

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SIMPLE Server running on port ${PORT}`);
  console.log(`📍 Test: http://localhost:${PORT}/test`);
  console.log(`📍 Login: http://localhost:${PORT}/test-login`);
});