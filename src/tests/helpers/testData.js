/**
 * testData.js
 * Helpers para generar y limpiar datos de test.
 * Usa emails únicos por timestamp para evitar conflictos.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { createClient } = require('@supabase/supabase-js');

// Cliente Supabase con service key para poder eliminar datos de test
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TEST_PREFIX = 'test_jest_';
const timestamp = Date.now();

/**
 * Genera datos de usuario de prueba únicos
 */
function generateTestUser(suffix = '') {
  return {
    name: `Test User ${suffix || timestamp}`,
    email: `${TEST_PREFIX}${suffix || timestamp}@test.dharaterapeutas.com`,
    password: 'TestPassword123!',
    confirmPassword: 'TestPassword123!'
  };
}

/**
 * Genera datos de cliente de prueba
 */
function generateTestClient(therapistId, suffix = '') {
  return {
    therapistId,
    name: `Test Client ${suffix || timestamp}`,
    email: `${TEST_PREFIX}client_${suffix || timestamp}@test.dharaterapeutas.com`,
    phone: '+34600000000',
    age: 30,
    address: 'Calle Test 123, Madrid',
    status: 'active',
    notes: 'Cliente de prueba creado por tests automáticos',
    tags: ['test', 'automatico']
  };
}

/**
 * Genera datos de booking de prueba
 */
function generateTestBooking(therapistId, clientId) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7); // 7 días en el futuro

  return {
    therapistId,
    clientId,
    date: futureDate.toISOString().split('T')[0], // YYYY-MM-DD
    startTime: '10:00',
    endTime: '11:00',
    status: 'upcoming',
    therapyType: 'individual',
    location: 'online',
    amount: 60,
    currency: 'EUR',
    notes: 'Sesión de prueba creada por tests automáticos',
    meetingLink: 'https://meet.test.com/test-session'
  };
}

/**
 * Limpia todos los datos de test de Supabase
 * Busca por el prefijo de email de test
 */
async function cleanupTestData() {
  console.log('\n🧹 [Cleanup] Eliminando datos de test...');

  try {
    // 1. Obtener IDs de usuarios de test
    const { data: testUsers, error: usersError } = await supabase
      .from('users')
      .select('id')
      .like('email', `${TEST_PREFIX}%`);

    if (usersError) {
      console.warn('⚠️  Error al buscar usuarios de test:', usersError.message);
      return;
    }

    if (!testUsers || testUsers.length === 0) {
      console.log('ℹ️  No hay datos de test para limpiar');
      return;
    }

    const testUserIds = testUsers.map(u => u.id);
    console.log(`  Encontrados ${testUserIds.length} usuarios de test`);

    // 2. Eliminar bookings de test
    const { error: bookingsError } = await supabase
      .from('bookings')
      .delete()
      .in('therapist_id', testUserIds);
    if (!bookingsError) console.log('  ✅ Bookings eliminados');

    // 3. Eliminar clientes de test
    const { error: clientsError } = await supabase
      .from('clients')
      .delete()
      .in('therapist_id', testUserIds);
    if (!clientsError) console.log('  ✅ Clientes eliminados');

    // 4. Eliminar professional_profiles de test
    await supabase
      .from('professional_profiles')
      .delete()
      .in('user_id', testUserIds);

    // 5. Eliminar los usuarios de test
    const { error: deleteUsersError } = await supabase
      .from('users')
      .delete()
      .in('id', testUserIds);

    if (!deleteUsersError) {
      console.log(`  ✅ ${testUserIds.length} usuarios de test eliminados`);
    } else {
      console.warn('⚠️  Error al eliminar usuarios de test:', deleteUsersError.message);
    }

    console.log('🧹 [Cleanup] Completado\n');
  } catch (err) {
    console.error('❌ [Cleanup] Error inesperado:', err.message);
  }
}

/**
 * Limpia un usuario específico de test por email
 */
async function cleanupUserByEmail(email) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (!user) return;

    // Eliminar datos relacionados
    await supabase.from('bookings').delete().eq('therapist_id', user.id);
    await supabase.from('clients').delete().eq('therapist_id', user.id);
    await supabase.from('users').delete().eq('id', user.id);
  } catch (err) {
    // Silenciar errores de cleanup
  }
}

module.exports = {
  supabase,
  generateTestUser,
  generateTestClient,
  generateTestBooking,
  cleanupTestData,
  cleanupUserByEmail,
  TEST_PREFIX,
  timestamp
};
