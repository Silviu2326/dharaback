#!/usr/bin/env node
/**
 * Script de Rollback MongoDB ← Supabase
 * 
 * Este script documenta y ejecuta el plan de rollback en caso de
 * necesitar revertir la migración de Supabase a MongoDB.
 * 
 * ADVERTENCIA: Este script es destructivo. Usar con precaución.
 * 
 * Uso:
 *   node rollback-to-mongodb.js [options]
 * 
 * Opciones:
 *   --dry-run       Simular rollback sin ejecutar cambios
 *   --plan-only     Solo mostrar el plan de rollback
 *   --verbose       Mostrar información detallada
 * 
 * Ejemplo:
 *   node rollback-to-mongodb.js --plan-only
 *   node rollback-to-mongodb.js --dry-run
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración
const CONFIG = {
  dryRun: process.argv.includes('--dry-run'),
  planOnly: process.argv.includes('--plan-only'),
  verbose: process.argv.includes('--verbose'),
  backupDir: process.env.BACKUP_DIR || './backups'
};

// Helpers
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = CONFIG.dryRun ? '[DRY-RUN]' : '[ROLLBACK]';
  
  if (level === 'error') {
    console.error(`${prefix} [${timestamp}] ❌ ${message}`);
  } else if (level === 'success') {
    console.log(`${prefix} [${timestamp}] ✅ ${message}`);
  } else if (level === 'warning') {
    console.log(`${prefix} [${timestamp}] ⚠️  ${message}`);
  } else if (level === 'critical') {
    console.log(`${prefix} [${timestamp}] 🚨 ${message}`);
  } else if (CONFIG.verbose || level === 'important') {
    console.log(`${prefix} [${timestamp}] ℹ️  ${message}`);
  }
}

function executeCommand(command, description) {
  log(description, 'important');
  
  if (CONFIG.dryRun || CONFIG.planOnly) {
    log(`  [SIMULADO] ${command}`);
    return { success: true, output: '' };
  }
  
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    log(`  ✅ Comando ejecutado exitosamente`, 'success');
    return { success: true, output };
  } catch (error) {
    log(`  ❌ Error: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

// Plan de Rollback
const ROLLBACK_PLAN = {
  preRollback: [
    {
      id: 'backup-supabase',
      description: 'Crear backup de datos actuales en Supabase',
      command: 'npx supabase db dump --data-only > backup-supabase-pre-rollback.sql',
      critical: true
    },
    {
      id: 'verify-backup',
      description: 'Verificar integridad del backup de Supabase',
      command: 'ls -la backup-supabase-pre-rollback.sql',
      critical: true
    }
  ],
  
  rollbackSteps: [
    {
      id: 'restore-mongodb',
      description: 'Restaurar MongoDB desde backup pre-migración',
      command: 'mongorestore --uri="$MONGODB_URI" --drop backup-mongodb-pre-migration/',
      critical: true,
      note: 'Requiere backup creado antes de la migración'
    },
    {
      id: 'verify-mongodb',
      description: 'Verificar restauración de MongoDB',
      command: 'node -e "const mongoose = require(\'mongoose\'); mongoose.connect(process.env.MONGODB_URI).then(() => console.log(\'MongoDB OK\')).catch(e => console.error(e))"',
      critical: true
    }
  ],
  
  postRollback: [
    {
      id: 'switch-env',
      description: 'Actualizar variables de entorno para usar MongoDB',
      command: 'cp .env.mongodb .env',
      critical: true
    },
    {
      id: 'restart-app',
      description: 'Reiniciar aplicación con configuración MongoDB',
      command: 'pm2 restart app || npm restart',
      critical: false
    },
    {
      id: 'health-check',
      description: 'Verificar salud de la aplicación',
      command: 'curl -f http://localhost:3000/api/health || echo "Health check falló"',
      critical: false
    }
  ]
};

// Función para mostrar el plan
function showPlan() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║            PLAN DE ROLLBACK A MONGODB                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  console.log('⚠️  ADVERTENCIA: Este plan revertirá la migración a Supabase');
  console.log('   y restaurará MongoDB como base de datos principal.\n');
  
  // Pre-rollback
  console.log('─────────────────────────────────────────────────────────');
  console.log('FASE 1: PRE-ROLLBACK (Backup de seguridad)');
  console.log('─────────────────────────────────────────────────────────\n');
  
  ROLLBACK_PLAN.preRollback.forEach((step, index) => {
    const critical = step.critical ? '🚨 CRÍTICO' : '';
    console.log(`${index + 1}. ${step.description}`);
    console.log(`   Comando: ${step.command}`);
    if (critical) console.log(`   ${critical}`);
    console.log('');
  });
  
  // Rollback principal
  console.log('─────────────────────────────────────────────────────────');
  console.log('FASE 2: ROLLBACK (Restauración de MongoDB)');
  console.log('─────────────────────────────────────────────────────────\n');
  
  ROLLBACK_PLAN.rollbackSteps.forEach((step, index) => {
    const critical = step.critical ? '🚨 CRÍTICO' : '';
    console.log(`${index + 1}. ${step.description}`);
    console.log(`   Comando: ${step.command}`);
    if (step.note) console.log(`   Nota: ${step.note}`);
    if (critical) console.log(`   ${critical}`);
    console.log('');
  });
  
  // Post-rollback
  console.log('─────────────────────────────────────────────────────────');
  console.log('FASE 3: POST-ROLLBACK (Configuración y verificación)');
  console.log('─────────────────────────────────────────────────────────\n');
  
  ROLLBACK_PLAN.postRollback.forEach((step, index) => {
    const critical = step.critical ? '🚨 CRÍTICO' : '';
    console.log(`${index + 1}. ${step.description}`);
    console.log(`   Comando: ${step.command}`);
    if (critical) console.log(`   ${critical}`);
    console.log('');
  });
  
  console.log('─────────────────────────────────────────────────────────');
  console.log('\n');
}

// Función para ejecutar pasos
async function executeSteps(steps, phaseName) {
  console.log('\n');
  console.log(`╔════════════════════════════════════════════════════════╗`);
  console.log(`║  ${phaseName.padEnd(52)} ║`);
  console.log(`╚════════════════════════════════════════════════════════╝`);
  console.log('\n');
  
  const results = [];
  
  for (const step of steps) {
    log(`Ejecutando: ${step.description}`, 'important');
    
    if (step.note) {
      log(`Nota: ${step.note}`, 'warning');
    }
    
    const result = executeCommand(step.command, '');
    
    results.push({
      step: step.id,
      success: result.success,
      critical: step.critical
    });
    
    if (!result.success && step.critical) {
      log(`Paso crítico falló. Abortando rollback.`, 'critical');
      return { success: false, aborted: true, results };
    }
    
    console.log('');
  }
  
  return { success: true, results };
}

// Verificar prerequisitos
async function checkPrerequisites() {
  log('Verificando prerequisitos...', 'important');
  
  const checks = [];
  
  // Verificar backup de MongoDB
  const mongoBackupExists = fs.existsSync(path.join(CONFIG.backupDir, 'mongodb-pre-migration'));
  checks.push({
    name: 'Backup de MongoDB pre-migración',
    exists: mongoBackupExists,
    critical: true
  });
  
  // Verificar conexión a MongoDB
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.close();
    checks.push({
      name: 'Conexión a MongoDB',
      exists: true,
      critical: true
    });
  } catch (error) {
    checks.push({
      name: 'Conexión a MongoDB',
      exists: false,
      critical: true,
      error: error.message
    });
  }
  
  // Mostrar resultados
  console.log('\n');
  console.log('Prerequisitos:');
  console.log('─────────────────────────────────────────────────────────');
  
  let allCriticalPassed = true;
  
  for (const check of checks) {
    const status = check.exists ? '✅ OK' : '❌ FALTA';
    const critical = check.critical ? '(CRÍTICO)' : '';
    console.log(`  ${status} ${check.name} ${critical}`);
    
    if (!check.exists && check.critical) {
      allCriticalPassed = false;
    }
  }
  
  console.log('─────────────────────────────────────────────────────────\n');
  
  if (!allCriticalPassed) {
    log('No se cumplen todos los prerequisitos críticos.', 'critical');
    log('Por favor, asegúrate de tener:');
    log('  1. Backup de MongoDB creado antes de la migración');
    log('  2. Conexión válida a MongoDB');
    return false;
  }
  
  log('Todos los prerequisitos críticos cumplidos.', 'success');
  return true;
}

// Función principal
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     ROLLBACK: SUPABASE → MONGODB                      ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  if (CONFIG.planOnly) {
    showPlan();
    process.exit(0);
  }
  
  // Advertencia
  console.log('⚠️  ADVERTENCIA ⚠️\n');
  console.log('Esta operación:');
  console.log('  1. Creará un backup de los datos actuales en Supabase');
  console.log('  2. Restaurará MongoDB desde el backup pre-migración');
  console.log('  3. Cambiará la configuración para usar MongoDB\n');
  
  if (!CONFIG.dryRun) {
    console.log('🚨 ESTA OPERACIÓN ES DESTRUCTIVA 🚨\n');
    console.log('Presiona Ctrl+C para cancelar o espera 5 segundos para continuar...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Verificar prerequisitos
  const prerequisitesMet = await checkPrerequisites();
  if (!prerequisitesMet) {
    process.exit(1);
  }
  
  // Mostrar plan
  showPlan();
  
  if (CONFIG.dryRun) {
    log('Modo dry-run: No se ejecutarán cambios reales', 'warning');
  }
  
  // Confirmación
  if (!CONFIG.dryRun) {
    console.log('\n');
    console.log('¿Deseas continuar con el rollback? (yes/no): ');
    
    // En un script real, aquí iría una confirmación interactiva
    // Por simplicidad, asumimos que se requiere flag --confirm
    if (!process.argv.includes('--confirm')) {
      log('Rollback cancelado. Usa --confirm para ejecutar.', 'warning');
      log('O usa --dry-run para simular sin cambios reales.');
      process.exit(0);
    }
  }
  
  // Ejecutar rollback
  const results = {
    preRollback: null,
    rollback: null,
    postRollback: null
  };
  
  // Fase 1: Pre-rollback
  results.preRollback = await executeSteps(ROLLBACK_PLAN.preRollback, 'FASE 1: PRE-ROLLBACK');
  
  if (!results.preRollback.success) {
    log('Fase pre-rollback falló. Abortando.', 'critical');
    process.exit(1);
  }
  
  // Fase 2: Rollback
  results.rollback = await executeSteps(ROLLBACK_PLAN.rollbackSteps, 'FASE 2: ROLLBACK');
  
  if (!results.rollback.success) {
    log('Fase de rollback falló. El sistema puede estar en estado inconsistente.', 'critical');
    log('Por favor, revisa los logs y contacta al equipo de soporte.', 'critical');
    process.exit(1);
  }
  
  // Fase 3: Post-rollback
  results.postRollback = await executeSteps(ROLLBACK_PLAN.postRollback, 'FASE 3: POST-ROLLBACK');
  
  // Resumen final
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║              ROLLBACK COMPLETADO                       ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Pre-rollback:    ${results.preRollback.success ? '✅ OK' : '❌ Falló'}${''.padEnd(35)} ║`);
  console.log(`║  Rollback:        ${results.rollback.success ? '✅ OK' : '❌ Falló'}${''.padEnd(35)} ║`);
  console.log(`║  Post-rollback:   ${results.postRollback.success ? '✅ OK' : '⚠️  Advertencias'}${''.padEnd(35)} ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  if (results.rollback.success) {
    log('Rollback completado exitosamente!', 'success');
    log('MongoDB ha sido restaurado como base de datos principal.');
    log('La aplicación debe estar funcionando con MongoDB.');
  } else {
    log('Rollback falló. Revisa los logs para más detalles.', 'critical');
  }
  
  // Guardar reporte
  const reportPath = `rollback-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  log(`Reporte guardado en: ${reportPath}`, 'important');
  
  process.exit(results.rollback.success ? 0 : 1);
}

// Manejo de errores
process.on('unhandledRejection', (error) => {
  log(`Error no manejado: ${error.message}`, 'critical');
  process.exit(1);
});

process.on('SIGINT', () => {
  log('\nRollback interrumpido por el usuario', 'warning');
  process.exit(0);
});

// Ejecutar
main().catch(error => {
  log(`Error fatal: ${error.message}`, 'critical');
  process.exit(1);
});
