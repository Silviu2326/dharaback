/**
 * Script para crear un usuario de prueba en Supabase
 * Uso: node backend/create-supabase-test-user.js
 *
 * Opciones:
 *   --email    Email del usuario (default: test@dharaterapeutas.es)
 *   --password Contraseña       (default: Test1234!)
 *   --name     Nombre completo  (default: Terapeuta Demo)
 *   --role     Rol              (default: therapist)
 *   --delete   Eliminar usuario existente antes de crear
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const jwt = require('jsonwebtoken');

// --- Parsear argumentos de línea de comandos ---
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const idx = args.findIndex(a => a === `--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
};

const USER_EMAIL    = getArg('email',    'test@dharaterapeutas.es');
const USER_PASSWORD = getArg('password', 'Test1234!');
const USER_NAME     = getArg('name',     'Terapeuta Demo');
const USER_ROLE     = getArg('role',     'therapist');
const DELETE_FIRST  = args.includes('--delete');

// ─────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  CREAR USUARIO DE PRUEBA EN SUPABASE         ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Verificar variables de entorno necesarias
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Faltan variables de entorno:');
    console.error('   SUPABASE_URL         =', process.env.SUPABASE_URL ? '✅' : '❌ FALTA');
    console.error('   SUPABASE_SERVICE_KEY =', process.env.SUPABASE_SERVICE_KEY ? '✅' : '❌ FALTA');
    process.exit(1);
  }

  if (!process.env.JWT_SECRET) {
    console.error('❌ Falta variable JWT_SECRET en .env');
    process.exit(1);
  }

  // Importar modelo User (carga supabase internamente)
  const User = require('./src/models').User;
  const { supabase } = require('./src/config/supabase');

  try {
    // 1. Comprobar si el usuario ya existe
    console.log(`🔍 Buscando usuario existente: ${USER_EMAIL}`);
    const existing = await User.findOne({ email: USER_EMAIL });

    if (existing) {
      if (DELETE_FIRST) {
        console.log(`🗑️  Eliminando usuario existente (--delete activado)...`);
        const { error: delError } = await supabase
          .from('users')
          .delete()
          .eq('id', existing.id);
        if (delError) throw delError;
        console.log('✅ Usuario eliminado');
      } else {
        console.log('⚠️  El usuario ya existe. Generando token sin recrear...');
        console.log('   (usa --delete para eliminarlo y crearlo de nuevo)\n');
        printResult(existing);
        return;
      }
    }

    // 2. Crear el usuario
    console.log(`\n🔧 Creando usuario de prueba...`);
    console.log(`   Email    : ${USER_EMAIL}`);
    console.log(`   Nombre   : ${USER_NAME}`);
    console.log(`   Rol      : ${USER_ROLE}`);
    console.log(`   Password : ${USER_PASSWORD}\n`);

    const user = await User.create({
      email:              USER_EMAIL,
      password:           USER_PASSWORD,
      name:               USER_NAME,
      role:               USER_ROLE,
      isActive:           true,
      isVerified:         true,
      verificationStatus: 'approved',
      authProvider:       'local',
      emailVerified:      true,
      preferences: {
        language: 'es',
        timezone: 'Europe/Madrid',
        notifications: { email: true, push: true, sms: false },
        privacy: { showProfile: true, allowMessages: true }
      }
    });

    console.log('✅ Usuario creado exitosamente\n');
    printResult(user);

  } catch (err) {
    console.error('\n❌ Error:', err.message || err);
    if (err.details) console.error('   Detalle:', err.details);
    if (err.hint)    console.error('   Sugerencia:', err.hint);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────
function printResult(user) {
  // Generar token JWT (24h)
  const token = jwt.sign(
    { id: user.id || user._id },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const refreshToken = jwt.sign(
    { id: user.id || user._id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║             CREDENCIALES DE PRUEBA           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('📋 Datos del usuario:');
  console.log(`   ID    : ${user.id || user._id}`);
  console.log(`   Nombre: ${user.name}`);
  console.log(`   Email : ${user.email}`);
  console.log(`   Rol   : ${user.role}`);
  console.log('');
  console.log('🔑 ACCESS TOKEN (24h):');
  console.log('─'.repeat(60));
  console.log(token);
  console.log('─'.repeat(60));
  console.log('');
  console.log('🔄 REFRESH TOKEN (30d):');
  console.log('─'.repeat(60));
  console.log(refreshToken);
  console.log('─'.repeat(60));
  console.log('');
  console.log('💡 Para usar en el navegador (F12 → Consola):');
  console.log('─'.repeat(60));
  console.log(`localStorage.setItem('dhara_access_token', '${token}');`);
  console.log(`localStorage.setItem('dhara_refresh_token', '${refreshToken}');`);
  console.log(`localStorage.setItem('dhara_user', JSON.stringify({id:'${user.id || user._id}',name:'${user.name}',email:'${user.email}',role:'${user.role}'}));`);
  console.log('location.reload();');
  console.log('─'.repeat(60));
  console.log('');
  console.log('🔐 Para login manual:');
  console.log(`   Email    : ${user.email}`);
  console.log(`   Password : ${USER_PASSWORD}`);
  console.log('');
  console.log('🌐 URL de login: http://localhost:5173/login');
  console.log('');
}

main();
