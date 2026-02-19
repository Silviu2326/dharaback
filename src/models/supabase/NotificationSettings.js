/**
 * Modelo NotificationSettings migrado a Supabase
 * Reemplaza el modelo Mongoose de NotificationSettings
 */

const SupabaseService = require('../../services/supabaseService');

class NotificationSettings {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.emailEnabled = data.email_enabled !== false;
    this.pushEnabled = data.push_enabled !== false;
    this.smsEnabled = data.sms_enabled || false;
    this.whatsappEnabled = data.whatsapp_enabled || false;
    this.bookingConfirmations = data.booking_confirmations !== false;
    this.bookingReminders = data.booking_reminders !== false;
    this.bookingCancellations = data.booking_cancellations !== false;
    this.newMessages = data.new_messages !== false;
    this.paymentNotifications = data.payment_notifications !== false;
    this.marketingEmails = data.marketing_emails || false;
    this.reminderTime = data.reminder_time || 24;
    this.quietHours = data.quiet_hours || {};
    this.customPreferences = data.custom_preferences || {};
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Verificar si tiene canales activos
   */
  get hasActiveChannels() {
    return this.emailEnabled || this.smsEnabled || this.pushEnabled || this.whatsappEnabled;
  }

  /**
   * Verificar si está en horas de silencio
   */
  get isInQuietHours() {
    if (!this.quietHours?.enabled) return false;

    const now = new Date();
    const timezone = this.quietHours.timezone || 'Europe/Madrid';

    const currentTime = now.toLocaleTimeString('en-GB', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    const quietStart = this.quietHours.start || '22:00';
    const quietEnd = this.quietHours.end || '08:00';

    if (quietStart > quietEnd) {
      return currentTime >= quietStart || currentTime <= quietEnd;
    } else {
      return currentTime >= quietStart && currentTime <= quietEnd;
    }
  }

  /**
   * Verificar si debe enviar notificación
   */
  shouldSendNotification(category, channel, priority = 'medium') {
    // Verificar si el canal está habilitado
    const channelEnabled = {
      email: this.emailEnabled,
      sms: this.smsEnabled,
      push: this.pushEnabled,
      whatsapp: this.whatsappEnabled
    }[channel];

    if (!channelEnabled) return false;

    // Verificar horas de silencio
    if (this.isInQuietHours) {
      const exceptions = this.quietHours.exceptions || [];
      if (!exceptions.includes(priority) && priority !== 'urgent') return false;
    }

    // Verificar configuración por categoría
    const categoryEnabled = {
      booking: this.bookingConfirmations,
      reminder: this.bookingReminders,
      cancellation: this.bookingCancellations,
      message: this.newMessages,
      payment: this.paymentNotifications,
      marketing: this.marketingEmails
    }[category];

    return categoryEnabled !== false;
  }

  /**
   * Obtener canales preferidos para una categoría
   */
  getPreferredChannels(category) {
    const availableChannels = [];

    if (this.emailEnabled) availableChannels.push('email');
    if (this.smsEnabled) availableChannels.push('sms');
    if (this.pushEnabled) availableChannels.push('push');
    if (this.whatsappEnabled) availableChannels.push('whatsapp');

    // Filtrar por categoría específica
    const categoryChannels = {
      booking: this.bookingConfirmations ? availableChannels : [],
      reminder: this.bookingReminders ? availableChannels : [],
      cancellation: this.bookingCancellations ? availableChannels : [],
      message: this.newMessages ? availableChannels : [],
      payment: this.paymentNotifications ? availableChannels : [],
      marketing: this.marketingEmails ? ['email'] : []
    }[category];

    return categoryChannels || availableChannels;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('notification_settings');

    const data = {
      user_id: this.userId,
      email_enabled: this.emailEnabled,
      push_enabled: this.pushEnabled,
      sms_enabled: this.smsEnabled,
      whatsapp_enabled: this.whatsappEnabled,
      booking_confirmations: this.bookingConfirmations,
      booking_reminders: this.bookingReminders,
      booking_cancellations: this.bookingCancellations,
      new_messages: this.newMessages,
      payment_notifications: this.paymentNotifications,
      marketing_emails: this.marketingEmails,
      reminder_time: this.reminderTime,
      quiet_hours: this.quietHours,
      custom_preferences: this.customPreferences
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new NotificationSettings(result);
    } else {
      const result = await service.create(data);
      return new NotificationSettings(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      emailEnabled: this.emailEnabled,
      pushEnabled: this.pushEnabled,
      smsEnabled: this.smsEnabled,
      whatsappEnabled: this.whatsappEnabled,
      bookingConfirmations: this.bookingConfirmations,
      bookingReminders: this.bookingReminders,
      bookingCancellations: this.bookingCancellations,
      newMessages: this.newMessages,
      paymentNotifications: this.paymentNotifications,
      marketingEmails: this.marketingEmails,
      reminderTime: this.reminderTime,
      quietHours: this.quietHours,
      customPreferences: this.customPreferences,
      hasActiveChannels: this.hasActiveChannels,
      isInQuietHours: this.isInQuietHours,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class NotificationSettingsModel {
  constructor() {
    this.service = new SupabaseService('notification_settings');
  }

  /**
   * Crear nuevas configuraciones
   */
  async create(data) {
    const settingsData = {
      user_id: data.userId,
      email_enabled: data.emailEnabled !== false,
      push_enabled: data.pushEnabled !== false,
      sms_enabled: data.smsEnabled || false,
      whatsapp_enabled: data.whatsappEnabled || false,
      booking_confirmations: data.bookingConfirmations !== false,
      booking_reminders: data.bookingReminders !== false,
      booking_cancellations: data.bookingCancellations !== false,
      new_messages: data.newMessages !== false,
      payment_notifications: data.paymentNotifications !== false,
      marketing_emails: data.marketingEmails || false,
      reminder_time: data.reminderTime || 24,
      quiet_hours: data.quietHours || {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'Europe/Madrid'
      },
      custom_preferences: data.customPreferences || {}
    };

    const result = await this.service.create(settingsData);
    return new NotificationSettings(result);
  }

  /**
   * Buscar todas
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new NotificationSettings(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new NotificationSettings(result) : null;
  }

  /**
   * Buscar una
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new NotificationSettings(result) : null;
  }

  /**
   * Buscar por userId
   */
  async findByUserId(userId) {
    return await this.findOne({ user_id: userId });
  }

  /**
   * Crear configuraciones por defecto
   */
  async createDefault(userId) {
    return await this.create({ userId });
  }

  /**
   * Obtener o crear configuraciones
   */
  async getOrCreate(userId) {
    let settings = await this.findByUserId(userId);
    if (!settings) {
      settings = await this.createDefault(userId);
    }
    return settings;
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.emailEnabled !== undefined) data.email_enabled = updateData.emailEnabled;
    if (updateData.pushEnabled !== undefined) data.push_enabled = updateData.pushEnabled;
    if (updateData.smsEnabled !== undefined) data.sms_enabled = updateData.smsEnabled;
    if (updateData.whatsappEnabled !== undefined) data.whatsapp_enabled = updateData.whatsappEnabled;
    if (updateData.bookingConfirmations !== undefined) data.booking_confirmations = updateData.bookingConfirmations;
    if (updateData.bookingReminders !== undefined) data.booking_reminders = updateData.bookingReminders;
    if (updateData.bookingCancellations !== undefined) data.booking_cancellations = updateData.bookingCancellations;
    if (updateData.newMessages !== undefined) data.new_messages = updateData.newMessages;
    if (updateData.paymentNotifications !== undefined) data.payment_notifications = updateData.paymentNotifications;
    if (updateData.marketingEmails !== undefined) data.marketing_emails = updateData.marketingEmails;
    if (updateData.reminderTime !== undefined) data.reminder_time = updateData.reminderTime;
    if (updateData.quietHours) data.quiet_hours = updateData.quietHours;
    if (updateData.customPreferences) data.custom_preferences = updateData.customPreferences;

    const result = await this.service.update(id, data);
    return options.new !== false ? new NotificationSettings(result) : null;
  }

  /**
   * Actualizar por userId
   */
  async updateByUserId(userId, updateData) {
    const settings = await this.findByUserId(userId);
    if (!settings) {
      throw new Error('Notification settings not found for user');
    }
    return await this.findByIdAndUpdate(settings.id, updateData);
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new NotificationSettings(result) : null;
  }

  /**
   * Eliminar por userId
   */
  async deleteByUserId(userId) {
    const settings = await this.findByUserId(userId);
    if (settings) {
      await this.service.delete(settings.id);
    }
    return settings;
  }

  /**
   * Buscar usuarios con canal habilitado
   */
  async findByChannelEnabled(channel) {
    const columnMap = {
      email: 'email_enabled',
      push: 'push_enabled',
      sms: 'sms_enabled',
      whatsapp: 'whatsapp_enabled'
    };

    return await this.find({
      filters: { [columnMap[channel]]: true }
    });
  }
}

module.exports = new NotificationSettingsModel();
module.exports.NotificationSettings = NotificationSettings;
module.exports.NotificationSettingsModel = NotificationSettingsModel;
