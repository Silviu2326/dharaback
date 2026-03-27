require('dotenv').config();

// Forzar destino al email de prueba
process.env.ADMIN_NOTIFICATION_EMAIL = 'silxarseb@gmail.com';

const emailService = require('./src/services/emailService');

async function testEmail() {
  console.log('📧 Enviando email de prueba...');
  console.log('   Proveedor:', process.env.EMAIL_PROVIDER || 'smtp');
  console.log('   Desde:    ', process.env.EMAIL_USER);
  console.log('   Para:      silxarseb@gmail.com\n');

  try {
    const result = await emailService.sendNewTherapistAdminNotification({
      nombre: 'Ana',
      apellidos: 'García López',
      email: 'ana.garcia@ejemplo.com',
      telefono: '612345678',
      plan: 'avanzado-pro',
      especialidades: ['Reiki', 'Meditación', 'PNL'],
      ciudad: 'Madrid'
    });

    if (result && result.success === false) {
      console.error('❌ Error:', result.error);
    } else {
      console.log('✅ Email enviado correctamente a silxarseb@gmail.com');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message?.includes('Invalid login') || err.message?.includes('auth') || err.message?.includes('535')) {
      console.error('\n⚠️  Credenciales incorrectas. Configura en el .env:');
      console.error('   EMAIL_USER=tu@gmail.com');
      console.error('   EMAIL_PASS=xxxx xxxx xxxx xxxx  (contraseña de aplicación de Google)');
      console.error('\n   Para crear una contraseña de aplicación:');
      console.error('   https://myaccount.google.com/apppasswords');
    }
  }
}

testEmail();
