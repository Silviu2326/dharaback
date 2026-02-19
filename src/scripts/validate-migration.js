#!/usr/bin/env node
/**
 * Script de Validación de Migración MongoDB → Supabase
 * 
 * Este script verifica la integridad de los datos migrados comparando
 * conteos y muestras entre MongoDB y Supabase.
 * 
 * Uso:
 *   node validate-migration.js [options]
 * 
 * Opciones:
 *   --tables        Tablas específicas a validar (comma-separated)
 *   --sample-size   Tamaño de muestra para validación profunda (default: 100)
 *   --verbose       Mostrar información detallada
 * 
 * Ejemplo:
 *   node validate-migration.js --verbose
 *   node validate-migration.js --tables=users,clients --sample-size=50
 */

const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuración
const CONFIG = {
  verbose: process.argv.includes('--verbose'),
  sampleSize: parseInt(getArgValue('--sample-size')) || 100,
  specificTables: getArgValue('--tables')?.split(',') || null
};

// Tablas a validar
const TABLES = [
  'users',
  'clients',
  'bookings',
  'professional_profiles',
  'therapy_plans',
  'payments',
  'subscriptions',
  'reviews',
  'session_notes',
  'documents',
  'conversations',
  'messages',
  'notifications',
  'favorites',
  'credentials'
];

// Helpers
function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : null;
}

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  
  if (level === 'error') {
    console.error(`[${timestamp}] ❌ ${message}`);
  } else if (level === 'success') {
    console.log(`[${timestamp}] ✅ ${message}`);
  } else if (level === 'warning') {
    console.log(`[${timestamp}] ⚠️  ${message}`);
  } else if (CONFIG.verbose || level === 'important') {
    console.log(`[${timestamp}] ℹ️  ${message}`);
  }
}

// Función para contar registros en MongoDB
async function countMongoDB(mongoModel) {
  try {
    const MongoModel = mongoose.model(mongoModel);
    return await MongoModel.countDocuments();
  } catch (error) {
    log(`Error contando en MongoDB (${mongoModel}): ${error.message}`, 'error');
    return -1;
  }
}

// Función para contar registros en Supabase
async function countSupabase(supabase, table) {
  try {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return count || 0;
  } catch (error) {
    log(`Error contando en Supabase (${table}): ${error.message}`, 'error');
    return -1;
  }
}

// Función para obtener muestra de MongoDB
async function getSampleMongoDB(mongoModel, limit) {
  try {
    const MongoModel = mongoose.model(mongoModel);
    return await MongoModel.find().limit(limit).lean();
  } catch (error) {
    log(`Error obteniendo muestra de MongoDB (${mongoModel}): ${error.message}`, 'error');
    return [];
  }
}

// Función para obtener muestra de Supabase
async function getSampleSupabase(supabase, table, limit) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    log(`Error obteniendo muestra de Supabase (${table}): ${error.message}`, 'error');
    return [];
  }
}

// Validar campos de un documento
function validateDocument(mongoDoc, supabaseDoc, table) {
  const issues = [];
  
  // Mapeo de campos por tabla
  const fieldMappings = {
    users: ['email', 'name', 'role', 'is_active'],
    clients: ['name', 'email', 'phone', 'status'],
    bookings: ['date', 'start_time', 'end_time', 'status'],
    payments: ['amount', 'currency', 'status', 'method'],
    reviews: ['rating', 'title', 'comment', 'is_public'],
    session_notes: ['title', 'type', 'is_encrypted'],
    documents: ['title', 'type', 'category'],
    notifications: ['type', 'title', 'is_read'],
    favorites: ['notes'],
    messages: ['content', 'type', 'status']
  };
  
  const fields = fieldMappings[table] || [];
  
  for (const field of fields) {
    const mongoValue = mongoDoc[field];
    const supabaseValue = supabaseDoc[field];
    
    // Comparar valores (manejar diferentes tipos)
    if (typeof mongoValue === 'boolean' && typeof supabaseValue === 'boolean') {
      if (mongoValue !== supabaseValue) {
        issues.push(`Campo ${field}: ${mongoValue} ≠ ${supabaseValue}`);
      }
    } else if (mongoValue instanceof Date) {
      const mongoTime = new Date(mongoValue).getTime();
      const supabaseTime = new Date(supabaseValue).getTime();
      if (Math.abs(mongoTime - supabaseTime) > 1000) { // 1 segundo de tolerancia
        issues.push(`Campo ${field}: fechas diferentes`);
      }
    } else if (mongoValue !== undefined && supabaseValue !== undefined) {
      if (String(mongoValue) !== String(supabaseValue)) {
        issues.push(`Campo ${field}: "${mongoValue}" ≠ "${supabaseValue}"`);
      }
    }
  }
  
  return issues;
}

// Función principal de validación
async function validateTable(table, mongoModel, supabase) {
  log(`Validando tabla: ${table}`, 'important');
  
  const result = {
    table,
    mongoCount: 0,
    supabaseCount: 0,
    countMatch: false,
    sampleValidated: 0,
    sampleIssues: 0,
    errors: []
  };
  
  try {
    // Contar registros
    result.mongoCount = await countMongoDB(mongoModel);
    result.supabaseCount = await countSupabase(supabase, table);
    
    result.countMatch = result.mongoCount === result.supabaseCount;
    
    log(`  MongoDB: ${result.mongoCount} registros`);
    log(`  Supabase: ${result.supabaseCount} registros`);
    
    if (!result.countMatch) {
      const diff = result.mongoCount - result.supabaseCount;
      log(`  ⚠️  Diferencia: ${Math.abs(diff)} registros ${diff > 0 ? 'faltantes' : 'de más'}`, 'warning');
      result.errors.push(`Diferencia de conteo: ${diff}`);
    } else {
      log(`  ✅ Conteos coinciden`, 'success');
    }
    
    // Validación profunda con muestra
    if (result.mongoCount > 0 && result.supabaseCount > 0) {
      log(`  Validando muestra de ${Math.min(CONFIG.sampleSize, result.mongoCount)} registros...`);
      
      const mongoSample = await getSampleMongoDB(mongoModel, CONFIG.sampleSize);
      
      for (const mongoDoc of mongoSample) {
        const docId = mongoDoc._id?.toString();
        
        // Buscar en Supabase
        const { data: supabaseDocs, error } = await supabase
          .from(table)
          .select('*')
          .eq('id', docId);
        
        if (error) {
          result.sampleIssues++;
          result.errors.push(`Error buscando documento ${docId}: ${error.message}`);
          continue;
        }
        
        if (!supabaseDocs || supabaseDocs.length === 0) {
          result.sampleIssues++;
          result.errors.push(`Documento ${docId} no encontrado en Supabase`);
          continue;
        }
        
        const supabaseDoc = supabaseDocs[0];
        
        // Validar campos
        const issues = validateDocument(mongoDoc, supabaseDoc, table);
        if (issues.length > 0) {
          result.sampleIssues++;
          if (CONFIG.verbose) {
            result.errors.push(`Documento ${docId}: ${issues.join(', ')}`);
          }
        }
        
        result.sampleValidated++;
      }
      
      log(`  Muestra validada: ${result.sampleValidated} documentos`);
      
      if (result.sampleIssues === 0) {
        log(`  ✅ Todos los documentos de la muestra son válidos`, 'success');
      } else {
        log(`  ⚠️  ${result.sampleIssues} documentos con problemas`, 'warning');
      }
    }
    
  } catch (error) {
    log(`Error validando ${table}: ${error.message}`, 'error');
    result.errors.push(error.message);
  }
  
  return result;
}

// Mapeo de modelos MongoDB
const MODEL_MAPPING = {
  users: 'User',
  clients: 'Client',
  bookings: 'Booking',
  professional_profiles: 'ProfessionalProfile',
  therapy_plans: 'TherapyPlan',
  payments: 'Payment',
  subscriptions: 'Subscription',
  reviews: 'Review',
  session_notes: 'SessionNote',
  documents: 'Document',
  conversations: 'Conversation',
  messages: 'Message',
  notifications: 'Notification',
  favorites: 'Favorite',
  credentials: 'Credentials'
};

// Función principal
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        VALIDACIÓN DE MIGRACIÓN A SUPABASE              ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Conectar a MongoDB
  log('Conectando a MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    log('Conectado a MongoDB', 'success');
  } catch (error) {
    log(`Error conectando a MongoDB: ${error.message}`, 'error');
    process.exit(1);
  }
  
  // Conectar a Supabase
  log('Conectando a Supabase...');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  log('Conectado a Supabase', 'success');
  console.log('\n');
  
  // Determinar tablas a validar
  const tablesToValidate = CONFIG.specificTables || TABLES;
  
  log(`Tablas a validar: ${tablesToValidate.join(', ')}`);
  log(`Tamaño de muestra: ${CONFIG.sampleSize}`);
  console.log('\n');
  
  // Resultados
  const results = [];
  
  // Validar cada tabla
  const startTime = Date.now();
  
  for (const table of tablesToValidate) {
    const mongoModel = MODEL_MAPPING[table];
    
    if (!mongoModel) {
      log(`Modelo MongoDB no encontrado para tabla: ${table}`, 'warning');
      continue;
    }
    
    const result = await validateTable(table, mongoModel, supabase);
    results.push(result);
    console.log('\n');
  }
  
  // Generar reporte
  const duration = (Date.now() - startTime) / 1000;
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                 REPORTE DE VALIDACIÓN                  ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  
  let totalTables = results.length;
  let validTables = 0;
  let tablesWithIssues = 0;
  
  for (const result of results) {
    const status = result.countMatch && result.sampleIssues === 0 ? '✅' : '⚠️';
    const countStatus = result.countMatch ? 'OK' : 'DIF';
    
    console.log(`║  ${status} ${result.table.padEnd(30)} ${countStatus.padStart(5)} ${String(result.supabaseCount).padStart(6)} regs ║`);
    
    if (result.countMatch && result.sampleIssues === 0) {
      validTables++;
    } else {
      tablesWithIssues++;
    }
  }
  
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Tablas válidas:     ${String(validTables).padStart(3)} / ${String(totalTables).padEnd(25)} ║`);
  console.log(`║  Tablas con issues:  ${String(tablesWithIssues).padStart(3).padEnd(32)} ║`);
  console.log(`║  Duración:           ${duration.toFixed(2).padStart(6)}s${''.padEnd(25)} ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Mostrar errores detallados si hay issues
  if (tablesWithIssues > 0) {
    console.log('DETALLES DE ISSUES:');
    console.log('─────────────────────────────────────────────────────');
    
    for (const result of results) {
      if (result.errors.length > 0) {
        console.log(`\n${result.table}:`);
        result.errors.slice(0, 10).forEach(error => {
          console.log(`  - ${error}`);
        });
        if (result.errors.length > 10) {
          console.log(`  ... y ${result.errors.length - 10} errores más`);
        }
      }
    }
    
    console.log('\n');
  }
  
  // Resumen final
  if (validTables === totalTables) {
    log('✅ TODAS LAS TABLAS VALIDADAS CORRECTAMENTE', 'success');
  } else {
    log(`⚠️  ${tablesWithIssues} tabla(s) con problemas detectados`, 'warning');
  }
  
  // Cerrar conexiones
  await mongoose.connection.close();
  
  // Guardar reporte en archivo si hay issues
  if (tablesWithIssues > 0) {
    const fs = require('fs');
    const reportPath = `migration-validation-report-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    log(`Reporte detallado guardado en: ${reportPath}`, 'important');
  }
  
  process.exit(tablesWithIssues > 0 ? 1 : 0);
}

// Manejo de errores
process.on('unhandledRejection', (error) => {
  log(`Error no manejado: ${error.message}`, 'error');
  process.exit(1);
});

process.on('SIGINT', async () => {
  log('\nValidación interrumpida por el usuario', 'warning');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(0);
});

// Ejecutar
main().catch(error => {
  log(`Error fatal: ${error.message}`, 'error');
  process.exit(1);
});
