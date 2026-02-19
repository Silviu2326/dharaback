const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('./src/models/User');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Create test user
const createTestUser = async () => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: 'admin@demo.com' });

    if (existingUser) {
      console.log('Test user already exists');
      return;
    }

    // Create test user
    const testUser = await User.create({
      name: 'Admin Demo',
      email: 'admin@demo.com',
      password: 'password123',
      role: 'therapist',
      isVerified: true,
      isActive: true,
      verificationStatus: 'approved'
    });

    console.log('Test user created successfully:', {
      id: testUser._id,
      name: testUser.name,
      email: testUser.email,
      role: testUser.role
    });

  } catch (error) {
    console.error('Error creating test user:', error);
  }
};

// Run the seeder
const runSeeder = async () => {
  await connectDB();
  await createTestUser();
  process.exit(0);
};

runSeeder();