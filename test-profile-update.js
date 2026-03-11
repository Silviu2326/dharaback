/**
 * Script de prueba para verificar actualización de perfil con servicios
 */

require('dotenv').config();
const { ProfessionalProfile } = require('./src/models');

async function testProfileUpdate() {
  try {
    // Buscar un perfil existente
    const profile = await ProfessionalProfile.findOne({ user_id: '68ce20c17931a40b74af366a' });
    
    if (!profile) {
      console.log('❌ No se encontró el perfil');
      return;
    }
    
    console.log('✅ Perfil encontrado:', profile.id);
    console.log('📊 Rates actuales:', JSON.stringify(profile.rates, null, 2));
    
    // Datos de prueba
    const testService = {
      id: 'test-' + Date.now(),
      name: 'Servicio de Prueba',
      type: 'individual',
      duration: 60,
      price: 80,
      description: 'Servicio creado para prueba'
    };
    
    const updateData = {
      rates: {
        currency: 'EUR',
        customRates: {
          currency: 'EUR',
          sessions: [testService],
          packages: []
        }
      }
    };
    
    console.log('📝 Actualizando con datos:', JSON.stringify(updateData, null, 2));
    
    // Actualizar perfil
    const updatedProfile = await ProfessionalProfile.findByIdAndUpdate(
      profile.id,
      updateData,
      { new: true }
    );
    
    console.log('✅ Perfil actualizado');
    console.log('📊 Nuevos rates:', JSON.stringify(updatedProfile.rates, null, 2));
    
    // Verificar que los datos se guardaron
    const verifyProfile = await ProfessionalProfile.findById(profile.id);
    console.log('🔍 Verificación - Rates:', JSON.stringify(verifyProfile.rates, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testProfileUpdate();
