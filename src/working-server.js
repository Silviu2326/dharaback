console.log('🔥 Starting WORKING server...');

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Basic middleware ONLY
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

console.log('✅ Basic setup complete');

// Test route FIRST
app.get('/test', (req, res) => {
  console.log('✅ Test route called');
  res.json({
    success: true,
    message: 'Working server test route!',
    timestamp: new Date().toISOString()
  });
});

// Health route SECOND
app.get('/health', (req, res) => {
  console.log('✅ Health route called');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    server: 'working-server'
  });
});

console.log('✅ Basic routes registered');

// Auth routes THIRD
try {
  const authRoutes = require('./routes/authRoutes');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes registered');
} catch (error) {
  console.log('❌ Auth routes failed:', error.message);
}

// 404 handler LAST
app.use((req, res) => {
  console.log(`❌ Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Start server function
const startWorkingServer = async () => {
  try {
    // Connect to MongoDB
    const connectDB = require('./config/database');
    await connectDB();
    console.log('✅ MongoDB connected');

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 WORKING server running on port ${PORT}`);
      console.log('Test these routes:');
      console.log(`  GET  http://localhost:${PORT}/test`);
      console.log(`  GET  http://localhost:${PORT}/health`);
      console.log(`  POST http://localhost:${PORT}/api/auth/login`);
    });

  } catch (error) {
    console.error('❌ Failed to start:', error);
  }
};

startWorkingServer();