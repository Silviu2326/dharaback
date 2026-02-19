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

// Debug login process step by step
const debugLogin = async () => {
  try {
    const email = 'admin@demo.com';
    const password = 'password123';

    console.log('=== DEBUGGING LOGIN PROCESS ===');
    console.log('Email:', email);
    console.log('Password:', password);

    // Step 1: Check if user exists
    console.log('\n1. Looking for user...');
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ User found:', {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      verificationStatus: user.verificationStatus
    });

    // Step 2: Check password
    console.log('\n2. Testing password...');
    const isMatch = await user.comparePassword(password);
    console.log('Password match result:', isMatch);

    if (!isMatch) {
      console.log('❌ Password does not match');

      // Let's also test direct bcrypt
      const directMatch = await bcrypt.compare(password, user.password);
      console.log('Direct bcrypt result:', directMatch);

      // Show password hash info
      console.log('Password hash starts with:', user.password ? user.password.substring(0, 20) + '...' : 'NO PASSWORD');
      return;
    }

    // Step 3: Check if account is active
    console.log('\n3. Checking account status...');
    if (!user.isActive) {
      console.log('❌ Account is not active');
      return;
    }

    console.log('✅ Account is active');

    // Step 4: All checks passed
    console.log('\n✅ All login checks passed - login should work!');

  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
};

// Run the debugger
const runDebugger = async () => {
  await connectDB();
  await debugLogin();
  process.exit(0);
};

runDebugger();