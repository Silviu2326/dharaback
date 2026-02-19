/**
 * Script de diagnóstico: verifica que todas las rutas tengan handlers válidos
 * Ejecutar: node backend/src/tests/check-routes.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const path = require('path');
const routesDir = path.join(__dirname, '../routes');
const fs = require('fs');

const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js')).sort();
let hasErrors = false;

console.log(`\nVerificando ${files.length} archivos de rutas...\n`);

for (const file of files) {
  const fullPath = path.join(routesDir, file);
  // Limpiar caché
  Object.keys(require.cache).forEach(k => { if (k.includes('/routes/') || k.includes('/controllers/') || k.includes('/middleware/')) delete require.cache[k]; });

  try {
    require(fullPath);
    console.log(`✅ ${file}`);
  } catch (e) {
    if (e.message.includes('argument handler must be a function')) {
      const match = e.stack.match(/at Object\.\w+ \([^)]+:(\d+):\d+\)/);
      const line = match ? match[1] : '?';
      console.log(`❌ ${file} (línea ${line}): ${e.message}`);
      hasErrors = true;
    } else {
      console.log(`⚠️  ${file}: ${e.message.substring(0, 80)}`);
    }
  }
}

console.log(hasErrors ? '\n🔴 Hay errores que corregir' : '\n🟢 Todas las rutas son válidas');
process.exit(hasErrors ? 1 : 0);
