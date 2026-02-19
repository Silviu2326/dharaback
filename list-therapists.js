const mongoose = require('mongoose');
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

// List all therapists
const listTherapists = async () => {
  try {
    const therapists = await User.find({
      role: 'therapist'
    }).select('_id name email role isVerified isActive');

    console.log('\n=== THERAPISTS IN SYSTEM ===');
    console.log(`Found ${therapists.length} therapists:\n`);

    therapists.forEach((therapist, index) => {
      console.log(`${index + 1}. ${therapist.name}`);
      console.log(`   ID: ${therapist._id}`);
      console.log(`   Email: ${therapist.email}`);
      console.log(`   Role: ${therapist.role}`);
      console.log(`   Verified: ${therapist.isVerified}`);
      console.log(`   Active: ${therapist.isActive}`);
      console.log('');
    });

    if (therapists.length > 0) {
      const firstTherapist = therapists[0];
      console.log('=== DEMO TOKEN PAYLOAD ===');
      console.log('Use this therapist ID for demo token:');
      console.log(`therapistId: "${firstTherapist._id}"`);
      console.log(`email: "${firstTherapist.email}"`);
      console.log(`name: "${firstTherapist.name}"`);
    }

  } catch (error) {
    console.error('Error listing therapists:', error);
  }
};

// Run the script
const run = async () => {
  await connectDB();
  await listTherapists();
  process.exit(0);
};

run();