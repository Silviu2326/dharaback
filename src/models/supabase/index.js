/**
 * Índice de Modelos Supabase
 * Exporta todos los modelos migrados
 */

const User = require('./User');
const Client = require('./Client');
const Booking = require('./Booking');
const ProfessionalProfile = require('./ProfessionalProfile');
const AvailabilitySlot = require('./AvailabilitySlot');
const Absence = require('./Absence');
const WorkLocation = require('./WorkLocation');
const NotificationSettings = require('./NotificationSettings');
const Rates = require('./Rates');
const Integration = require('./Integration');
const SessionNote = require('./SessionNote');
const Document = require('./Document');
const Note = require('./Note');
const VerificationDocument = require('./VerificationDocument');
const Conversation = require('./Conversation');
const Message = require('./Message');
const Notification = require('./Notification');
const Payment = require('./Payment');
const Subscription = require('./Subscription');
const PricingPackage = require('./PricingPackage');
const PlanAssignment = require('./PlanAssignment');
const PayoutRequest = require('./PayoutRequest');
const TherapyPlan = require('./TherapyPlan');
const ClientPlanProgress = require('./ClientPlanProgress');
const Credentials = require('./Credentials');
const Review = require('./Review');
const Favorite = require('./Favorite');
const Coupon = require('./Coupon');
const AuditLog = require('./AuditLog');
const Webhook = require('./Webhook');

module.exports = {
  User,
  Client,
  Booking,
  ProfessionalProfile,
  AvailabilitySlot,
  Absence,
  WorkLocation,
  NotificationSettings,
  Rates,
  Integration,
  SessionNote,
  Document,
  Note,
  VerificationDocument,
  Conversation,
  Message,
  Notification,
  Payment,
  Subscription,
  PricingPackage,
  PlanAssignment,
  PayoutRequest,
  TherapyPlan,
  ClientPlanProgress,
  Credentials,
  Review,
  Favorite,
  Coupon,
  AuditLog,
  Webhook,
  
  // Clases para instancias
  UserClass: User.User,
  ClientClass: Client.Client,
  BookingClass: Booking.Booking,
  ProfessionalProfileClass: ProfessionalProfile.ProfessionalProfile,
  AvailabilitySlotClass: AvailabilitySlot.AvailabilitySlot,
  AbsenceClass: Absence.Absence,
  WorkLocationClass: WorkLocation.WorkLocation,
  NotificationSettingsClass: NotificationSettings.NotificationSettings,
  RatesClass: Rates.Rates,
  IntegrationClass: Integration.Integration,
  SessionNoteClass: SessionNote.SessionNote,
  DocumentClass: Document.Document,
  NoteClass: Note.Note,
  VerificationDocumentClass: VerificationDocument.VerificationDocument,
  ConversationClass: Conversation.Conversation,
  MessageClass: Message.Message,
  NotificationClass: Notification.Notification,
  PaymentClass: Payment.Payment,
  SubscriptionClass: Subscription.Subscription,
  PricingPackageClass: PricingPackage.PricingPackage,
  PlanAssignmentClass: PlanAssignment.PlanAssignment,
  PayoutRequestClass: PayoutRequest.PayoutRequest,
  TherapyPlanClass: TherapyPlan.TherapyPlan,
  ClientPlanProgressClass: ClientPlanProgress.ClientPlanProgress,
  CredentialsClass: Credentials.Credentials,
  ReviewClass: Review.Review,
  FavoriteClass: Favorite.Favorite,
  CouponClass: Coupon.Coupon,
  AuditLogClass: AuditLog.AuditLog,
  WebhookClass: Webhook.Webhook,
  
  // Modelos para métodos estáticos
  UserModel: User,
  ClientModel: Client,
  BookingModel: Booking,
  ProfessionalProfileModel: ProfessionalProfile,
  AvailabilitySlotModel: AvailabilitySlot,
  AbsenceModel: Absence,
  WorkLocationModel: WorkLocation,
  NotificationSettingsModel: NotificationSettings,
  RatesModel: Rates,
  IntegrationModel: Integration,
  SessionNoteModel: SessionNote,
  DocumentModel: Document,
  NoteModel: Note,
  VerificationDocumentModel: VerificationDocument,
  ConversationModel: Conversation,
  MessageModel: Message,
  NotificationModel: Notification,
  PaymentModel: Payment,
  SubscriptionModel: Subscription,
  PricingPackageModel: PricingPackage,
  PlanAssignmentModel: PlanAssignment,
  PayoutRequestModel: PayoutRequest,
  TherapyPlanModel: TherapyPlan,
  ClientPlanProgressModel: ClientPlanProgress,
  CredentialsModel: Credentials,
  ReviewModel: Review,
  FavoriteModel: Favorite,
  CouponModel: Coupon,
  AuditLogModel: AuditLog,
  WebhookModel: Webhook
};
