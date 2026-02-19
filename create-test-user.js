const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./src/models/User');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dharaterapeutas');
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const createTestUser = async () => {
  try {
    console.log('🔧 Finding or creating test user...');

    // Check if user already exists by ID or email
    let user = await User.findById('68ce20c17931a40b74af366a') ||
               await User.findOne({ email: 'test@example.com' });

    if (user) {
      console.log('👤 Test user already exists');
    } else {
      // Hash password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash('password123', salt);

      // Create user with a different ID
      user = await User.create({
        name: 'Test Therapist',
        email: 'test@example.com',
        password: hashedPassword,
        role: 'therapist',
        isActive: true,
        isVerified: true,
        profession: 'Psychologist',
        specialties: ['ansiedad', 'depresion', 'pareja'],
        experience: 5,
        location: {
          city: 'Madrid',
          country: 'Spain'
        },
        contactInfo: {
          phone: '+34123456789',
          email: 'test@example.com'
        },
        professionalInfo: {
          licenseNumber: 'PSY-12345',
          university: 'Universidad de Madrid',
          graduationYear: 2018
        }
      });

      console.log('✅ Test user created successfully');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('\n🔑 TOKEN PARA USAR EN DESARROLLO:');
    console.log(token);
    console.log('\n📋 User info:');
    console.log({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role
    });

    console.log('\n💡 Para usar en la aplicación:');
    console.log(`localStorage.setItem('dhara_access_token', '${token}');`);

  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔐 Database connection closed');
  }
};

const main = async () => {
  await connectDB();
  await createTestUser();
};

if (require.main === module) {
  main();
}

module.exports = { createTestUser };