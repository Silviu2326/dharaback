console.log('🔥 Starting MINIMAL server...');
require('dotenv').config();
console.log('📁 Environment loaded');

const express = require('express');
const cors = require('cors');

console.log('📦 Express loaded');

const app = express();
const PORT = 5000; // Using main port

console.log('🔧 Basic setup');

// Minimal middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
}));
app.use(express.json());

console.log('⚙️ Middleware loaded');

// Import MongoDB connection (don't call it yet)
const connectDB = require('./config/database');

// Test route
app.get('/test', (req, res) => {
  console.log('✅ Minimal GET /test called');
  res.json({
    success: true,
    message: 'Minimal server working!',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Load auth routes only
console.log('🚨 Loading authRoutes...');
try {
  const authRoutes = require('./routes/authRoutes');
  app.use('/api/auth', authRoutes);
  console.log('✅ AuthRoutes loaded successfully');
} catch (error) {
  console.log('❌ Error loading authRoutes:', error.message);
}

// Add error handling middleware (MUST be last)
app.use((req, res) => {
  console.log(`❌ Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server function
const startMinimalServer = async () => {
  try {
    // Connect to MongoDB FIRST
    console.log('🗄️ Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connected successfully');

    // THEN start the server
    const server = app.listen(PORT, () => {
      console.log(`🚀 MINIMAL Server running on port ${PORT}`);
      console.log(`📍 Test: http://localhost:${PORT}/test`);
      console.log(`📍 Health: http://localhost:${PORT}/health`);
      console.log(`📍 Login: http://localhost:${PORT}/api/auth/login`);
      console.log(`📍 Frontend should use: http://localhost:${PORT}/api`);
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the minimal server
startMinimalServer();