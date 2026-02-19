#!/usr/bin/env node
/**
 * Script de Migración MongoDB → Supabase
 * 
 * Este script migra datos de MongoDB a Supabase/PostgreSQL.
 * 
 * Uso:
 *   node migrate-to-supabase.js [options]
 * 
 * Opciones:
 *   --dry-run       Simular migración sin escribir datos
 *   --batch-size N  Tamaño de lote (default: 100)
 *   --tables        Tablas específicas a migrar (comma-separated)
 *   --skip-existing No migrar registros que ya existen
 *   --verbose       Mostrar información detallada
 * 
 * Ejemplo:
 *   node migrate-to-supabase.js --dry-run --verbose
 *   node migrate-to-supabase.js --tables=users,clients
 */

const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Importar modelos de MongoDB para registrarlos en Mongoose
// IMPORTANTE: Estos son los modelos originales de MongoDB, no los de Supabase
const modelsPath = path.resolve(__dirname, '../models');
const MongoModels = {
  User: require(path.join(modelsPath, 'User')),
  Client: require(path.join(modelsPath, 'Client')),
  Booking: require(path.join(modelsPath, 'Booking')),
  ProfessionalProfile: require(path.join(modelsPath, 'ProfessionalProfile')),
  TherapyPlan: require(path.join(modelsPath, 'TherapyPlan')),
  Payment: require(path.join(modelsPath, 'Payment')),
  Subscription: require(path.join(modelsPath, 'Subscription')),
  Review: require(path.join(modelsPath, 'Review')),
  SessionNote: require(path.join(modelsPath, 'SessionNote')),
  Document: require(path.join(modelsPath, 'Document')),
  Conversation: require(path.join(modelsPath, 'Conversation')),
  Message: require(path.join(modelsPath, 'Message')),
  Notification: require(path.join(modelsPath, 'Notification')),
  Favorite: require(path.join(modelsPath, 'Favorite')),
  Credentials: require(path.join(modelsPath, 'Credentials')),
};

// Configuración
const CONFIG = {
  batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE) || 100,
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
  skipExisting: process.argv.includes('--skip-existing'),
  specificTables: getArgValue('--tables')?.split(',') || null
};

// Mapeo de tablas y sus modelos MongoDB
const TABLE_MAPPING = {
  users: {
    mongoModel: 'User',
    supabaseTable: 'users',
    transform: transformUser
  },
  clients: {
    mongoModel: 'Client',
    supabaseTable: 'clients',
    transform: transformClient
  },
  bookings: {
    mongoModel: 'Booking',
    supabaseTable: 'bookings',
    transform: transformBooking
  },
  professional_profiles: {
    mongoModel: 'ProfessionalProfile',
    supabaseTable: 'professional_profiles',
    transform: transformProfile
  },
  therapy_plans: {
    mongoModel: 'TherapyPlan',
    supabaseTable: 'therapy_plans',
    transform: transformTherapyPlan
  },
  payments: {
    mongoModel: 'Payment',
    supabaseTable: 'payments',
    transform: transformPayment
  },
  subscriptions: {
    mongoModel: 'Subscription',
    supabaseTable: 'subscriptions',
    transform: transformSubscription
  },
  reviews: {
    mongoModel: 'Review',
    supabaseTable: 'reviews',
    transform: transformReview
  },
  session_notes: {
    mongoModel: 'SessionNote',
    supabaseTable: 'session_notes',
    transform: transformSessionNote
  },
  documents: {
    mongoModel: 'Document',
    supabaseTable: 'documents',
    transform: transformDocument
  },
  conversations: {
    mongoModel: 'Conversation',
    supabaseTable: 'conversations',
    transform: transformConversation
  },
  messages: {
    mongoModel: 'Message',
    supabaseTable: 'messages',
    transform: transformMessage
  },
  notifications: {
    mongoModel: 'Notification',
    supabaseTable: 'notifications',
    transform: transformNotification
  },
  favorites: {
    mongoModel: 'Favorite',
    supabaseTable: 'favorites',
    transform: transformFavorite
  },
  credentials: {
    mongoModel: 'Credentials',
    supabaseTable: 'credentials',
    transform: transformCredentials
  }
};

// Helpers
function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : null;
}

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = CONFIG.dryRun ? '[DRY-RUN]' : '[MIGRATION]';
  
  if (level === 'error') {
    console.error(`${prefix} [${timestamp}] ❌ ${message}`);
  } else if (level === 'success') {
    console.log(`${prefix} [${timestamp}] ✅ ${message}`);
  } else if (level === 'warning') {
    console.log(`${prefix} [${timestamp}] ⚠️  ${message}`);
  } else if (CONFIG.verbose || level === 'important') {
    console.log(`${prefix} [${timestamp}] ℹ️  ${message}`);
  }
}

// Transformadores de datos
function transformUser(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    email: doc.email,
    password: doc.password,
    name: doc.name,
    role: doc.role || 'therapist',
    is_active: doc.isActive !== false,
    is_verified: doc.isVerified || false,
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    last_login: doc.lastLogin,
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformClient(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    therapist_id: doc.therapistId?.toString(),
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    age: doc.age,
    address: doc.address,
    status: doc.status || 'active',
    notes: doc.notes,
    tags: doc.tags || [],
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformBooking(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    therapist_id: doc.therapistId?.toString(),
    client_id: doc.clientId?.toString(),
    date: doc.date,
    start_time: doc.startTime,
    end_time: doc.endTime,
    status: doc.status || 'upcoming',
    therapy_type: doc.therapyType,
    location: doc.location,
    amount: doc.amount,
    currency: doc.currency || 'EUR',
    notes: doc.notes,
    meeting_link: doc.meetingLink,
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformProfile(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    user_id: doc.userId?.toString() || doc.therapistId?.toString(),
    about: doc.about,
    therapies: doc.therapies || [],
    specialties: doc.specialties || [],
    languages: doc.languages || [],
    education: doc.education || [],
    experience: doc.experience || [],
    certifications: doc.certifications || [],
    video_presentation: doc.videoPresentation,
    is_available: doc.isAvailable !== false,
    years_experience: doc.yearsExperience,
    accepts_insurance: doc.acceptsInsurance,
    insurance_providers: doc.insuranceProviders || [],
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformTherapyPlan(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    therapist_id: doc.therapistId?.toString(),
    name: doc.name,
    description: doc.description,
    type: doc.type,
    category: doc.category,
    duration: doc.duration,
    sessions_per_week: doc.sessionsPerWeek,
    total_sessions: doc.totalSessions,
    objectives: doc.objectives || [],
    status: doc.status || 'draft',
    is_template: doc.isTemplate || false,
    is_public: doc.isPublic || false,
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformPayment(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    therapist_id: doc.therapistId?.toString(),
    client_id: doc.clientId?.toString(),
    booking_id: doc.bookingId?.toString(),
    amount: doc.amount,
    currency: doc.currency || 'EUR',
    status: doc.status || 'pending',
    method: doc.method,
    stripe_payment_intent_id: doc.stripePaymentIntentId,
    platform_fee: doc.platformFee || 0,
    net_amount: doc.netAmount || doc.amount,
    description: doc.description,
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformSubscription(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    user_id: doc.userId?.toString(),
    plan_id: doc.planId,
    status: doc.status || 'active',
    billing_cycle: doc.billingCycle || 'monthly',
    start_date: doc.startDate,
    end_date: doc.endDate,
    price: doc.price,
    currency: doc.currency || 'EUR',
    features: doc.features || {},
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformReview(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    therapist_id: doc.therapistId?.toString(),
    client_id: doc.clientId?.toString(),
    booking_id: doc.bookingId?.toString(),
    rating: doc.rating,
    title: doc.title,
    comment: doc.comment,
    tags: doc.tags || [],
    is_public: doc.isPublic !== false,
    moderation_status: doc.moderationStatus || 'approved',
    helpful_count: doc.helpfulCount || 0,
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformSessionNote(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    therapist_id: doc.therapistId?.toString(),
    client_id: doc.clientId?.toString(),
    booking_id: doc.bookingId?.toString(),
    title: doc.title,
    content: doc.content,
    type: doc.type || 'general',
    is_encrypted: doc.isEncrypted || false,
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformDocument(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    therapist_id: doc.therapistId?.toString(),
    client_id: doc.clientId?.toString(),
    title: doc.title,
    type: doc.type,
    url: doc.url,
    size: doc.size,
    mime_type: doc.mimeType,
    category: doc.category,
    tags: doc.tags || [],
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformConversation(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    participant_1_id: doc.participant1Id?.toString(),
    participant_2_id: doc.participant2Id?.toString(),
    type: doc.type || 'direct',
    status: doc.status || 'active',
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformMessage(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    conversation_id: doc.conversationId?.toString(),
    sender_id: doc.senderId?.toString(),
    content: doc.content,
    type: doc.type || 'text',
    status: doc.status || 'sent',
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformNotification(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    user_id: doc.userId?.toString(),
    type: doc.type,
    title: doc.title,
    message: doc.message,
    data: doc.data || {},
    is_read: doc.isRead || false,
    created_at: doc.createdAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformFavorite(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    client_id: doc.clientId?.toString(),
    therapist_id: doc.therapistId?.toString(),
    notes: doc.notes,
    added_at: doc.addedAt || doc.createdAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

function transformCredentials(doc) {
  return {
    id: doc._id?.toString() || uuidv4(),
    user_id: doc.userId?.toString(),
    provider: doc.provider,
    type: doc.type,
    access_token: doc.accessToken,
    refresh_token: doc.refreshToken,
    expires_at: doc.expiresAt,
    is_active: doc.isActive !== false,
    created_at: doc.createdAt || new Date(),
    updated_at: doc.updatedAt || new Date(),
    metadata: {
      originalId: doc._id?.toString()
    }
  };
}

// Función principal de migración
async function migrateTable(tableName, config, supabase) {
  log(`Migrando tabla: ${tableName}`, 'important');
  
  // Usar MongoModels directamente (modelos Mongoose originales de MongoDB)
  const MongoModel = MongoModels[config.mongoModel];
  if (!MongoModel) {
    log(`Modelo MongoDB no encontrado para: ${config.mongoModel}`, 'warning');
    return { processed: 0, inserted: 0, errors: 0, skipped: 0 };
  }

  let processed = 0;
    log(`Total de documentos en MongoDB: ${totalCount}`);

    if (totalCount === 0) {
      log(`No hay datos para migrar en ${tableName}`);
      return { processed: 0, inserted: 0, errors: 0, skipped: 0 };
    }

    let batch = [];
    const cursor = MongoModel.find().cursor();

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      processed++;
      
      try {
        const transformed = config.transform(doc);
        
        // Verificar si ya existe
        if (CONFIG.skipExisting && !CONFIG.dryRun) {
          const { data: existing } = await supabase
            .from(config.supabaseTable)
            .select('id')
            .eq('id', transformed.id)
            .single();
          
          if (existing) {
            skipped++;
            if (CONFIG.verbose) {
              log(`  Saltando ${transformed.id} - ya existe`);
            }
            continue;
          }
        }

        batch.push(transformed);

        // Insertar en lotes
        if (batch.length >= CONFIG.batchSize) {
          if (!CONFIG.dryRun) {
            const { error } = await supabase
              .from(config.supabaseTable)
              .insert(batch);

            if (error) {
              log(`Error insertando lote en ${tableName}: ${error.message}`, 'error');
              errors += batch.length;
            } else {
              inserted += batch.length;
            }
          } else {
            inserted += batch.length;
          }
          
          batch = [];
          
          if (processed % 100 === 0) {
            log(`  Progreso: ${processed}/${totalCount} (${Math.round(processed/totalCount*100)}%)`);
          }
        }
      } catch (error) {
        log(`Error transformando documento: ${error.message}`, 'error');
        errors++;
      }
    }

    // Insertar lote restante
    if (batch.length > 0) {
      if (!CONFIG.dryRun) {
        const { error } = await supabase
          .from(config.supabaseTable)
          .insert(batch);

        if (error) {
          log(`Error insertando lote final en ${tableName}: ${error.message}`, 'error');
          errors += batch.length;
        } else {
          inserted += batch.length;
        }
      } else {
        inserted += batch.length;
      }
    }

    log(`Tabla ${tableName} completada: ${inserted} insertados, ${skipped} saltados, ${errors} errores`, 
      errors > 0 ? 'warning' : 'success');

    return { processed, inserted, errors, skipped };

  } catch (error) {
    log(`Error migrando ${tableName}: ${error.message}`, 'error');
    return { processed, inserted: 0, errors: processed, skipped: 0 };
  }
}

// Función principal
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     MIGRACIÓN MONGODB → SUPABASE/POSTGRESQL           ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\n');

  if (CONFIG.dryRun) {
    log('⚠️  MODO DRY-RUN: No se escribirán datos', 'warning');
    console.log('\n');
  }

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

  // Determinar tablas a migrar
  const tablesToMigrate = CONFIG.specificTables || Object.keys(TABLE_MAPPING);
  
  log(`Tablas a migrar: ${tablesToMigrate.join(', ')}`);
  console.log('\n');

  // Estadísticas globales
  const globalStats = {
    processed: 0,
    inserted: 0,
    errors: 0,
    skipped: 0
  };

  // Migrar cada tabla
  const startTime = Date.now();

  for (const tableName of tablesToMigrate) {
    const config = TABLE_MAPPING[tableName];
    
    if (!config) {
      log(`Tabla desconocida: ${tableName}`, 'warning');
      continue;
    }

    const stats = await migrateTable(tableName, config, supabase);
    
    globalStats.processed += stats.processed;
    globalStats.inserted += stats.inserted;
    globalStats.errors += stats.errors;
    globalStats.skipped += stats.skipped;
    
    console.log('\n');
  }

  // Resumen final
  const duration = (Date.now() - startTime) / 1000;
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                  RESUMEN DE MIGRACIÓN                  ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Total procesados:  ${globalStats.processed.toString().padStart(6)}                        ║`);
  console.log(`║  Total insertados:  ${globalStats.inserted.toString().padStart(6)}                        ║`);
  console.log(`║  Total saltados:    ${globalStats.skipped.toString().padStart(6)}                        ║`);
  console.log(`║  Total errores:     ${globalStats.errors.toString().padStart(6)}                        ║`);
  console.log(`║  Duración:          ${duration.toFixed(2)}s                                  ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\n');

  if (CONFIG.dryRun) {
    log('Modo dry-run completado. No se escribieron datos.', 'warning');
    log('Para ejecutar la migración real, remueve --dry-run', 'important');
  } else if (globalStats.errors === 0) {
    log('Migración completada exitosamente!', 'success');
  } else {
    log('Migración completada con errores.', 'warning');
  }

  // Cerrar conexiones
  await mongoose.connection.close();
  process.exit(globalStats.errors > 0 ? 1 : 0);
}

// Manejo de errores
process.on('unhandledRejection', (error) => {
  log(`Error no manejado: ${error.message}`, 'error');
  process.exit(1);
});

process.on('SIGINT', async () => {
  log('\nMigración interrumpida por el usuario', 'warning');
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
