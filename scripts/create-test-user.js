/**
 * Script para crear usuario de prueba en desarrollo
 * Uso: node scripts/create-test-user.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

// Configuración del usuario de prueba
const TEST_USER = {
  email: 'terapeuta@test.com',
  password: 'Test1234!',  // El modelo hará el hash automáticamente
  name: 'Terapeuta de Prueba',
  role: 'therapist',
  isActive: true,
  isVerified: true,
  verificationStatus: 'approved',
  authProvider: 'local'
};

async function createTestUser() {
  try {
    console.log('🚀 Creando usuario de prueba...');
    console.log('📧 Email:', TEST_USER.email);
    console.log('🔑 Password:', TEST_USER.password);

    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dharaterapeutas';
    console.log('🗄️  Conectando a:', mongoUri);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email: TEST_USER.email });
    
    if (existingUser) {
      console.log('⚠️  El usuario ya existe. Eliminando para recrear...');
      await User.deleteOne({ email: TEST_USER.email });
      console.log('✅ Usuario anterior eliminado');
    }
    
    // Crear usuario - el middleware pre-save hará el hash de la contraseña
    const user = new User(TEST_USER);
    await user.save();
    
    console.log('✅ Usuario creado correctamente');

    // Verificar que el usuario se puede autenticar
    const savedUser = await User.findOne({ email: TEST_USER.email }).select('+password');
    const isMatch = await savedUser.comparePassword(TEST_USER.password);
    
    if (isMatch) {
      console.log('✅ Verificación de contraseña exitosa');
    } else {
      console.error('❌ Error: La contraseña no coincide');
    }

    console.log('\n📋 Credenciales de prueba:');
    console.log('   Email:', TEST_USER.email);
    console.log('   Password:', TEST_USER.password);
    console.log('   Role:', TEST_USER.role);
    console.log('   ID:', savedUser._id);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createTestUser();
