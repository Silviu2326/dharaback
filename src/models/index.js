/**
 * Índice de Modelos
 * FASE 2: Todos los modelos migrados a Supabase
 */

console.log('📦 Usando modelos de Supabase (PostgreSQL)');

// Modelos de Supabase (Fase 2 - Completada)
module.exports = {
  // Core
  User: require('./supabase/User'),
  Client: require('./supabase/Client'),
  Booking: require('./supabase/Booking'),
  
  // Perfil y Configuración
  ProfessionalProfile: require('./supabase/ProfessionalProfile'),
  AvailabilitySlot: require('./supabase/AvailabilitySlot'),
  Absence: require('./supabase/Absence'),
  WorkLocation: require('./supabase/WorkLocation'),
  NotificationSettings: require('./supabase/NotificationSettings'),
  Rates: require('./supabase/Rates'),
  Integration: require('./supabase/Integration'),
  
  // Documentación
  SessionNote: require('./supabase/SessionNote'),
  Document: require('./supabase/Document'),
  Note: require('./supabase/Note'),
  VerificationDocument: require('./supabase/VerificationDocument'),
  
  // Comunicación
  Conversation: require('./supabase/Conversation'),
  Message: require('./supabase/Message'),
  Notification: require('./supabase/Notification'),
  
  // Pagos
  Payment: require('./supabase/Payment'),
  Subscription: require('./supabase/Subscription'),
  PricingPackage: require('./supabase/PricingPackage'),
  PlanAssignment: require('./supabase/PlanAssignment'),
  PayoutRequest: require('./supabase/PayoutRequest'),
  
  // Terapia
  TherapyPlan: require('./supabase/TherapyPlan'),
  ClientPlanProgress: require('./supabase/ClientPlanProgress'),
  Credentials: require('./supabase/Credentials'),
  
  // Miscelaneos
  Review: require('./supabase/Review'),
  Favorite: require('./supabase/Favorite'),
  Coupon: require('./supabase/Coupon'),
  AuditLog: require('./supabase/AuditLog'),
  Webhook: require('./supabase/Webhook')
};

// Flag para saber qué base de datos se está usando
module.exports.USE_SUPABASE = true;
