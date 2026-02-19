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

// Check user and test password
const checkUser = async () => {
  try {
    const user = await User.findOne({ email: 'admin@demo.com' }).select('+password');

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User found:', {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      hasPassword: !!user.password,
      passwordLength: user.password ? user.password.length : 0,
      passwordStartsWith: user.password ? user.password.substring(0, 10) + '...' : 'N/A'
    });

    // Test password comparison
    if (user.password) {
      const isMatch = await user.comparePassword('password123');
      console.log('Password comparison result:', isMatch);

      // Also test direct bcrypt comparison
      const directMatch = await bcrypt.compare('password123', user.password);
      console.log('Direct bcrypt comparison:', directMatch);
    }

  } catch (error) {
    console.error('Error checking user:', error);
  }
};

// Run the checker
const runChecker = async () => {
  await connectDB();
  await checkUser();
  process.exit(0);
};

runChecker();