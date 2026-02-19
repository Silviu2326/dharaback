/**
 * Script de Migración de MongoDB a Supabase
 * Migra todos los datos de MongoDB a PostgreSQL/Supabase
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

// Configuración
const MONGODB_URI = process.env.MONGODB_URI;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!MONGODB_URI || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Se requieren las variables de entorno:');
  console.error('  - MONGODB_URI');
  console.error('  - SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// Cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Conectar a MongoDB
const connectMongo = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
};

// Modelos MongoDB (requerir dinámicamente)
const getMongoModels = () => {
  return {
    User: require('../src/models/User'),
    Client: require('../src/models/Client'),
    Booking: require('../src/models/Booking'),
    ProfessionalProfile: require('../src/models/ProfessionalProfile'),
    SessionNote: require('../src/models/SessionNote'),
    AvailabilitySlot: require('../src/models/AvailabilitySlot'),
    Absence: require('../src/models/Absence'),
    WorkLocation: require('../src/models/WorkLocation'),
    Notification: require('../src/models/Notification'),
    Payment: require('../src/models/Payment'),
    Subscription: require('../src/models/Subscription'),
    Conversation: require('../src/models/Conversation'),
    Message: require('../src/models/Message'),
    Document: require('../src/models/Document'),
    Note: require('../src/models/Note'),
    TherapyPlan: require('../src/models/TherapyPlan'),
    PlanAssignment: require('../src/models/PlanAssignment'),
    ClientPlanProgress: require('../src/models/ClientPlanProgress'),
    Review: require('../src/models/Review'),
    Favorite: require('../src/models/Favorite'),
    Coupon: require('../src/models/Coupon'),
    Rates: require('../src/models/Rates'),
    Integration: require('../src/models/Integration'),
    NotificationSettings: require('../src/models/NotificationSettings'),
    Credentials: require('../src/models/Credentials'),
    VerificationDocument: require('../src/models/VerificationDocument'),
    PricingPackage: require('../src/models/PricingPackage'),
    PayoutRequest: require('../src/models/PayoutRequest'),
    Webhook: require('../src/models/Webhook'),
    AuditLog: require('../src/models/AuditLog')
  };
};

// Utilidades de migración
const utils = {
  // Convertir ObjectId de Mongo a UUID/string
  toUUID: (objectId) => objectId ? objectId.toString() : null,
  
  // Convertir fecha
  toDate: (date) => date ? new Date(date).toISOString() : null,
  
  // Limpiar objeto
  cleanObject: (obj) => {
    const cleaned = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    });
    return cleaned;
  },

  // Batch insert helper
  batchInsert: async (table, data, batchSize = 100) => {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }

    let inserted = 0;
    for (const batch of batches) {
      const { error } = await supabase.from(table).insert(batch);
      if (error) {
        console.error(`❌ Error insertando en ${table}:`, error.message);
        throw error;
      }
      inserted += batch.length;
      process.stdout.write(`\r  Progreso: ${inserted}/${data.length}`);
    }
    console.log(); // Nueva línea
    return inserted;
  }
};

// Mapeadores de datos
const mappers = {
  user: (doc) => ({
    id: utils.toUUID(doc._id),
    email: doc.email,
    password: doc.password,
    supabase_id: doc.supabaseId,
    auth_provider: doc.authProvider || 'local',
    email_verified: doc.emailVerified || false,
    name: doc.name,
    avatar: doc.avatar,
    banner: doc.banner,
    is_verified: doc.isVerified || false,
    verification_status: doc.verificationStatus || 'not_submitted',
    role: doc.role || 'therapist',
    is_active: doc.isActive !== false,
    last_login: utils.toDate(doc.lastLogin),
    reset_password_token: doc.resetPasswordToken,
    reset_password_expire: utils.toDate(doc.resetPasswordExpire),
    email_verification_token: doc.emailVerificationToken,
    email_verification_expire: utils.toDate(doc.emailVerificationExpire),
    preferences: doc.preferences || {
      language: 'es',
      timezone: 'Europe/Madrid',
      notifications: { email: true, push: true, sms: false },
      privacy: { showProfile: true, allowMessages: true }
    },
    stripe_customer_id: doc.stripeCustomerId,
    stripe_subscription_id: doc.stripeSubscriptionId,
    subscription_status: doc.subscriptionStatus || 'none',
    created_at: utils.toDate(doc.createdAt),
    updated_at: utils.toDate(doc.updatedAt)
  }),

  client: (doc) => ({
    id: utils.toUUID(doc._id),
    name: doc.name,
    email: doc.email,
    password: doc.password,
    phone: doc.phone,
    avatar: doc.avatar,
    status: doc.status || 'active',
    age: doc.age,
    address: doc.address,
    emergency_contact: doc.emergencyContact || {},
    notes: doc.notes,
    tags: doc.tags || [],
    therapist_id: utils.toUUID(doc.therapistId),
    last_session: utils.toDate(doc.lastSession),
    sessions_count: doc.sessionsCount || 0,
    rating: doc.rating,
    payments_count: doc.paymentsCount || 0,
    documents_count: doc.documentsCount || 0,
    messages_count: doc.messagesCount || 0,
    preferences: doc.preferences || {
      preferredTime: 'any',
      preferredLocation: 'both',
      reminderEnabled: true,
      reminderTime: 24
    },
    gdpr_consent: doc.gdprConsent || { given: false },
    created_at: utils.toDate(doc.createdAt),
    updated_at: utils.toDate(doc.updatedAt)
  }),

  booking: (doc) => ({
    id: utils.toUUID(doc._id),
    date: doc.date ? new Date(doc.date).toISOString().split('T')[0] : null,
    start_time: doc.startTime,
    end_time: doc.endTime,
    client_id: utils.toUUID(doc.clientId),
    therapist_id: utils.toUUID(doc.therapistId),
    therapy_type: doc.therapyType,
    therapy_duration: doc.therapyDuration || 60,
    status: doc.status || 'upcoming',
    amount: doc.amount,
    currency: doc.currency || 'EUR',
    payment_status: doc.paymentStatus || 'unpaid',
    payment_method: doc.paymentMethod,
    location: doc.location,
    notes: doc.notes,
    meeting_link: doc.meetingLink,
    session_document: doc.sessionDocument,
    plan_id: utils.toUUID(doc.planId),
    reminder_sent: doc.reminderSent || false,
    cancellation_reason: doc.cancellationReason,
    cancelled_by: doc.cancelledBy,
    cancelled_at: utils.toDate(doc.cancelledAt),
    last_status_change: utils.toDate(doc.lastStatusChange) || utils.toDate(doc.updatedAt),
    created_at: utils.toDate(doc.createdAt),
    updated_at: utils.toDate(doc.updatedAt)
  }),

  professional_profile: (doc) => ({
    id: utils.toUUID(doc._id),
    user_id: utils.toUUID(doc.userId),
    about: doc.about,
    therapies: doc.therapies || [],
    is_available: doc.isAvailable !== false,
    video_presentation: doc.videoPresentation,
    stats: doc.stats || {
      totalSessions: 0,
      activeClients: 0,
      averageRating: 0,
      totalClients: 0,
      responseTime: 24,
      completionRate: 0,
      satisfactionRate: 0
    },
    specializations: (doc.specializations || []).map(s => ({
      name: s.name,
      certification: s.certification,
      yearObtained: s.yearObtained
    })),
    languages: (doc.languages || []).map(l => ({
      language: l.language,
      level: l.level
    })),
    education: (doc.education || []).map(e => ({
      degree: e.degree,
      institution: e.institution,
      year: e.year,
      description: e.description
    })),
    experience: (doc.experience || []).map(e => ({
      id: e.id,
      position: e.position,
      company: e.company,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      isCurrent: e.isCurrent,
      description: e.description,
      achievements: e.achievements || []
    })),
    rates: doc.rates || {},
    work_locations: (doc.workLocations || []).map(w => ({
      name: w.name,
      address: w.address,
      city: w.city,
      postalCode: w.postalCode,
      isPrimary: w.isPrimary,
      offersOnline: w.offersOnline
    })),
    social_media: doc.socialMedia,
    external_links: doc.externalLinks || [],
    pricing_packages: doc.pricingPackages,
    preferences: doc.preferences || {},
    legal_info: doc.legalInfo || {},
    created_at: utils.toDate(doc.createdAt),
    updated_at: utils.toDate(doc.updatedAt)
  }),

  session_note: (doc) => ({
    id: utils.toUUID(doc._id),
    booking_id: utils.toUUID(doc.bookingId),
    therapist_id: utils.toUUID(doc.therapistId),
    client_id: utils.toUUID(doc.clientId),
    notes: doc.notes,
    objectives: doc.objectives || [],
    homework: doc.homework || [],
    next_steps: doc.nextSteps,
    mood: doc.mood,
    progress: doc.progress,
    is_confidential: doc.isConfidential !== false,
    session_type: doc.sessionType || 'follow_up',
    treatment_plan: doc.treatmentPlan,
    risk_assessment: doc.riskAssessment || { level: 'none', flagged: false },
    clinical_measures: doc.clinicalMeasures,
    session_duration: doc.sessionDuration,
    tags: doc.tags || [],
    last_edited_by: utils.toUUID(doc.lastEditedBy),
    edit_history: (doc.editHistory || []).map(h => ({
      editedBy: utils.toUUID(h.editedBy),
      editedAt: utils.toDate(h.editedAt),
      changes: h.changes,
      ipAddress: h.ipAddress
    })),
    created_at: utils.toDate(doc.createdAt),
    updated_at: utils.toDate(doc.updatedAt)
  })
  // ... más mappers para otros modelos
};

// Funciones de migración
const migrations = {
  async users() {
    console.log('\n📦 Migrando Users...');
    const { User } = getMongoModels();
    const docs = await User.find({}).lean();
    const data = docs.map(mappers.user).map(utils.cleanObject);
    return await utils.batchInsert('users', data);
  },

  async clients() {
    console.log('\n📦 Migrando Clients...');
    const { Client } = getMongoModels();
    const docs = await Client.find({}).lean();
    const data = docs.map(mappers.client).map(utils.cleanObject);
    return await utils.batchInsert('clients', data);
  },

  async bookings() {
    console.log('\n📦 Migrando Bookings...');
    const { Booking } = getMongoModels();
    const docs = await Booking.find({}).lean();
    const data = docs.map(mappers.booking).map(utils.cleanObject);
    return await utils.batchInsert('bookings', data);
  },

  async professional_profiles() {
    console.log('\n📦 Migrando ProfessionalProfiles...');
    const { ProfessionalProfile } = getMongoModels();
    const docs = await ProfessionalProfile.find({}).lean();
    const data = docs.map(mappers.professional_profile).map(utils.cleanObject);
    return await utils.batchInsert('professional_profiles', data);
  },

  async session_notes() {
    console.log('\n📦 Migrando SessionNotes...');
    const { SessionNote } = getMongoModels();
    const docs = await SessionNote.find({}).lean();
    const data = docs.map(mappers.session_note).map(utils.cleanObject);
    return await utils.batchInsert('session_notes', data);
  }
  // ... más migraciones
};

// Función principal
const runMigration = async () => {
  console.log('🚀 Iniciando migración de MongoDB a Supabase\n');
  console.log('='.repeat(50));

  await connectMongo();

  const results = {};
  const startTime = Date.now();

  try {
    // Migrar en orden (respetando dependencias de FK)
    results.users = await migrations.users();
    results.clients = await migrations.clients();
    results.profiles = await migrations.professional_profiles();
    results.bookings = await migrations.bookings();
    results.session_notes = await migrations.session_notes();
    // ... más migraciones

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Migración completada exitosamente!');
    console.log(`⏱️  Duración: ${duration}s`);
    console.log('\n📊 Resumen:');
    Object.entries(results).forEach(([table, count]) => {
      console.log(`  - ${table}: ${count} registros`);
    });

  } catch (error) {
    console.error('\n❌ Error durante la migración:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexiones cerradas');
  }
};

// Ejecutar
runMigration();
