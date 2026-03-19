// Script simple para verificar variables de entorno
require('dotenv').config();

console.log('🔍 VERIFICACIÓN DE VARIABLES DE ENTORNO\n');

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'DATABASE_URL',
  'PORT'
];

let allOk = true;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Ocultar parte del valor por seguridad
    const displayValue = value.length > 20 
      ? value.substring(0, 10) + '...' + value.substring(value.length - 5)
      : '*** configurado ***';
    console.log(`✅ ${varName}: ${displayValue}`);
  } else {
    console.log(`❌ ${varName}: NO CONFIGURADO`);
    allOk = false;
  }
});

if (!allOk) {
  console.log('\n⚠️  Faltan variables de entorno. Verifica tu archivo .env');
  console.log('📄 El archivo .env debe estar en: backend/.env');
} else {
  console.log('\n✅ Todas las variables de entorno están configuradas');
}
