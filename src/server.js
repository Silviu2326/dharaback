console.log('🔥 Starting server...');
require('dotenv').config();
console.log('📁 Environment loaded');

const fs = require('fs');
const path = require('path');

const uploadDirs = [
  'uploads',
  'uploads/documents',
  'uploads/credentials',
  'uploads/verification',
  'uploads/attachments',
  'uploads/temp',
  'uploads/avatars',
  'uploads/banners'
];

uploadDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📂 Created directory: ${dir}`);
  }
});

const app = require('./app');
console.log('📱 App loaded');

// Determinar qué base de datos usar
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

const connectDB = USE_SUPABASE 
  ? require('./config/database-supabase')
  : require('./config/database');

console.log(`🗄️ Database config loaded (${USE_SUPABASE ? 'Supabase' : 'MongoDB'})`);

const PORT = process.env.PORT || 5000;
console.log(`🔧 Port configured: ${PORT}`);

let server;

// Start server function
const startServer = async () => {
  try {
    // Connect to database FIRST
    console.log(`🗄️ Connecting to ${USE_SUPABASE ? 'Supabase' : 'MongoDB'}...`);
    await connectDB();
    console.log(`✅ ${USE_SUPABASE ? 'Supabase' : 'MongoDB'} connected successfully`);

    // THEN start the server
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`📊 Database: ${USE_SUPABASE ? 'Supabase (PostgreSQL)' : 'MongoDB'}`);
      console.log(`📍 Test route available at: http://localhost:${PORT}/test`);
      console.log(`📍 Health check at: http://localhost:${PORT}/health`);
      console.log(`📍 API routes at: http://localhost:${PORT}/api/auth/login`);
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('❌ Unhandled Promise Rejection:', err.message);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      console.log('✅ Process terminated');
    });
  }
});
