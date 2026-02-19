/**
 * Modelo Notification migrado a Supabase
 * Reemplaza el modelo Mongoose de Notification
 * Gestiona notificaciones del sistema para usuarios
 */

const SupabaseService = require('../../services/supabaseService');

class Notification {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.type = data.type;
    this.title = data.title;
    this.message = data.message;
    this.data = data.data || {};
    this.isRead = data.is_read || false;
    this.readAt = data.read_at;
    this.priority = data.priority || 'normal';
    this.actionUrl = data.action_url;
    this.expiresAt = data.expires_at;
    this.createdAt = data.created_at;

    // Campos raw de la base de datos
    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Virtual: ¿La notificación está leída?
   */
  get read() {
    return this.isRead;
  }

  /**
   * Virtual: ¿La notificación ha expirado?
   */
  get isExpired() {
    if (!this.expiresAt) return false;
    return new Date(this.expiresAt) < new Date();
  }

  /**
   * Virtual: ¿Es urgente?
   */
  get isUrgent() {
    return this.priority === 'urgent';
  }

  /**
   * Virtual: ¿Es de alta prioridad?
   */
  get isHighPriority() {
    return this.priority === 'high' || this.priority === 'urgent';
  }

  /**
   * Virtual: Tiempo transcurrido desde la creación
   */
  get timeAgo() {
    if (!this.createdAt) return null;

    const created = new Date(this.createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Ahora mismo';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return created.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  /**
   * Virtual: Icono según el tipo de notificación
   */
  get icon() {
    const icons = {
      booking: '📅',
      message: '💬',
      payment: '💳',
      reminder: '⏰',
      system: '⚙️',
      alert: '⚠️',
      success: '✅',
      info: 'ℹ️',
      review: '⭐',
      client: '👤',
      security: '🔒'
    };
    return icons[this.type] || '🔔';
  }

  /**
   * Marcar como leída
   */
  async markAsRead() {
    if (this.isRead) return this;

    const service = new SupabaseService('notifications');
    
    const readAt = new Date().toISOString();
    const result = await service.update(this.id, {
      is_read: true,
      read_at: readAt
    });

    this.isRead = true;
    this.readAt = readAt;
    return this;
  }

  /**
   * Marcar como no leída
   */
  async markAsUnread() {
    if (!this.isRead) return this;

    const service = new SupabaseService('notifications');
    
    const result = await service.update(this.id, {
      is_read: false,
      read_at: null
    });

    this.isRead = false;
    this.readAt = null;
    return this;
  }

  /**
   * Archivar notificación (establecer fecha de expiración)
   */
  async archive() {
    const service = new SupabaseService('notifications');
    
    // Establecer expiración a ahora (la notificación expira inmediatamente)
    const result = await service.update(this.id, {
      expires_at: new Date().toISOString()
    });

    this.expiresAt = result.expires_at;
    return this;
  }

  /**
   * Extender fecha de expiración
   */
  async extendExpiration(days = 30) {
    const service = new SupabaseService('notifications');
    
    const newExpiration = new Date();
    newExpiration.setDate(newExpiration.getDate() + days);

    const result = await service.update(this.id, {
      expires_at: newExpiration.toISOString()
    });

    this.expiresAt = result.expires_at;
    return this;
  }

  /**
   * Verificar si la notificación requiere acción
   */
  requiresAction() {
    return this.data?.requiresAction === true && !this.isRead;
  }

  /**
   * Obtener acción principal de la notificación
   */
  getPrimaryAction() {
    if (!this.data?.actions || this.data.actions.length === 0) {
      return null;
    }
    return this.data.actions[0];
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('notifications');

    const data = {
      user_id: this.userId,
      type: this.type,
      title: this.title,
      message: this.message,
      data: this.data,
      is_read: this.isRead,
      read_at: this.readAt,
      priority: this.priority,
      action_url: this.actionUrl,
      expires_at: this.expiresAt
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Notification(result);
    } else {
      const result = await this.service.create(data);
      return new Notification(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      type: this.type,
      title: this.title,
      message: this.message,
      data: this.data,
      isRead: this.isRead,
      read: this.read,
      readAt: this.readAt,
      priority: this.priority,
      isUrgent: this.isUrgent,
      isHighPriority: this.isHighPriority,
      isExpired: this.isExpired,
      actionUrl: this.actionUrl,
      icon: this.icon,
      timeAgo: this.timeAgo,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt
    };
  }
}

/**
 * Métodos estáticos
 */
class NotificationModel {
  constructor() {
    this.service = new SupabaseService('notifications');
    this.tableName = 'notifications';
  }

  /**
   * Crear nueva notificación
   */
  async create(data) {
    const notificationData = {
      user_id: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data || {},
      is_read: data.isRead || false,
      read_at: data.readAt || null,
      priority: data.priority || 'normal',
      action_url: data.actionUrl,
      expires_at: data.expiresAt
    };

    const result = await this.service.create(notificationData);
    return new Notification(result);
  }

  /**
   * Crear múltiples notificaciones (bulk)
   */
  async createMany(notifications) {
    const supabase = require('../../config/supabase').supabase;

    const notificationsData = notifications.map(data => ({
      user_id: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data || {},
      is_read: data.isRead || false,
      read_at: data.readAt || null,
      priority: data.priority || 'normal',
      action_url: data.actionUrl,
      expires_at: data.expiresAt
    }));

    const { data, error } = await supabase
      .from('notifications')
      .insert(notificationsData)
      .select();

    if (error) throw new Error(error.message);
    return (data || []).map(d => new Notification(d));
  }

  /**
   * Buscar todas las notificaciones
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Notification(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Notification(result) : null;
  }

  /**
   * Buscar una notificación por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Notification(result) : null;
  }

  /**
   * Buscar notificaciones por usuario
   */
  async findByUser(userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('notifications')
      .select(options.select || '*')
      .eq('user_id', userId);

    // Filtrar por estado de lectura
    if (options.read === true) {
      query = query.eq('is_read', true);
    } else if (options.read === false) {
      query = query.eq('is_read', false);
    }

    // Filtrar por tipo
    if (options.type) {
      query = query.eq('type', options.type);
    }

    // Filtrar por prioridad
    if (options.priority) {
      query = query.eq('priority', options.priority);
    }

    // No mostrar notificaciones expiradas
    if (options.includeExpired !== true) {
      query = query.or('expires_at.is.null,expires_at.gt.now()');
    }

    // Ordenar por fecha de creación (más recientes primero)
    query = query.order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Notification(d));
  }

  /**
   * Buscar notificaciones no leídas por usuario
   */
  async findUnread(userId, options = {}) {
    return await this.findByUser(userId, { ...options, read: false });
  }

  /**
   * Buscar notificaciones leídas por usuario
   */
  async findRead(userId, options = {}) {
    return await this.findByUser(userId, { ...options, read: true });
  }

  /**
   * Buscar notificaciones urgentes
   */
  async findUrgent(userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('notifications')
      .select(options.select || '*')
      .eq('user_id', userId)
      .eq('priority', 'urgent')
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Notification(d));
  }

  /**
   * Buscar notificaciones por tipo
   */
  async findByType(userId, type, options = {}) {
    return await this.findByUser(userId, { ...options, type });
  }

  /**
   * Buscar notificaciones recientes
   */
  async findRecent(userId, limit = 10) {
    return await this.findByUser(userId, { limit });
  }

  /**
   * Actualizar notificación
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.userId !== undefined) data.user_id = updateData.userId;
    if (updateData.type !== undefined) data.type = updateData.type;
    if (updateData.title !== undefined) data.title = updateData.title;
    if (updateData.message !== undefined) data.message = updateData.message;
    if (updateData.data !== undefined) data.data = updateData.data;
    if (updateData.isRead !== undefined) data.is_read = updateData.isRead;
    if (updateData.readAt !== undefined) data.read_at = updateData.readAt;
    if (updateData.priority !== undefined) data.priority = updateData.priority;
    if (updateData.actionUrl !== undefined) data.action_url = updateData.actionUrl;
    if (updateData.expiresAt !== undefined) data.expires_at = updateData.expiresAt;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Notification(result) : null;
  }

  /**
   * Eliminar notificación
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Notification(result) : null;
  }

  /**
   * Marcar todas las notificaciones de un usuario como leídas
   */
  async markAllAsRead(userId) {
    const supabase = require('../../config/supabase').supabase;

    const readAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: readAt })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw new Error(error.message);
    return data?.length || 0;
  }

  /**
   * Marcar notificaciones específicas como leídas
   */
  async markManyAsRead(notificationIds) {
    const supabase = require('../../config/supabase').supabase;

    const readAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: readAt })
      .in('id', notificationIds)
      .eq('is_read', false);

    if (error) throw new Error(error.message);
    return data?.length || 0;
  }

  /**
   * Eliminar notificaciones antiguas
   */
  async deleteOld(days = 30) {
    const supabase = require('../../config/supabase').supabase;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .eq('is_read', true);

    if (error) throw new Error(error.message);
    return data?.length || 0;
  }

  /**
   * Eliminar todas las notificaciones de un usuario
   */
  async deleteByUser(userId) {
    const supabase = require('../../config/supabase').supabase;

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return data?.length || 0;
  }

  /**
   * Contar notificaciones
   */
  async count(filters = {}) {
    return await this.service.count(filters);
  }

  /**
   * Contar notificaciones por usuario
   */
  async countByUser(userId, filters = {}) {
    return await this.count({ ...filters, user_id: userId });
  }

  /**
   * Contar notificaciones no leídas
   */
  async countUnread(userId) {
    return await this.count({ user_id: userId, is_read: false });
  }

  /**
   * Obtener estadísticas de notificaciones
   */
  async getStats(userId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, unreadResult, urgentResult] = await Promise.all([
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('priority', 'urgent').eq('is_read', false)
    ]);

    return {
      total: totalResult.count || 0,
      unread: unreadResult.count || 0,
      urgent: urgentResult.count || 0
    };
  }

  /**
   * Buscar con paginación
   */
  async paginate(userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options.read !== undefined) {
      query = query.eq('is_read', options.read);
    }

    if (options.type) {
      query = query.eq('type', options.type);
    }

    // No mostrar expiradas
    query = query.or('expires_at.is.null,expires_at.gt.now()');

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    return {
      data: (data || []).map(d => new Notification(d)),
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    };
  }

  // ==================== Factory Methods ====================

  /**
   * Crear notificación de nueva cita
   */
  async createBookingNotification(userId, bookingData) {
    return await this.create({
      userId,
      type: 'booking',
      title: 'Nueva cita programada',
      message: `Tienes una nueva cita con ${bookingData.clientName} el ${bookingData.date}`,
      priority: 'normal',
      actionUrl: `/bookings/${bookingData.id}`,
      data: {
        bookingId: bookingData.id,
        clientId: bookingData.clientId,
        date: bookingData.date,
        time: bookingData.time
      }
    });
  }

  /**
   * Crear notificación de nuevo mensaje
   */
  async createMessageNotification(userId, messageData) {
    return await this.create({
      userId,
      type: 'message',
      title: 'Nuevo mensaje',
      message: `${messageData.senderName}: ${messageData.preview}`,
      priority: 'normal',
      actionUrl: `/messages/${messageData.conversationId}`,
      data: {
        conversationId: messageData.conversationId,
        senderId: messageData.senderId,
        senderName: messageData.senderName,
        messageId: messageData.messageId
      }
    });
  }

  /**
   * Crear notificación de pago
   */
  async createPaymentNotification(userId, paymentData) {
    return await this.create({
      userId,
      type: 'payment',
      title: paymentData.success ? 'Pago recibido' : 'Pago fallido',
      message: paymentData.success 
        ? `Has recibido un pago de ${paymentData.amount}` 
        : `El pago de ${paymentData.amount} no pudo procesarse`,
      priority: paymentData.success ? 'normal' : 'high',
      actionUrl: `/payments/${paymentData.id}`,
      data: {
        paymentId: paymentData.id,
        amount: paymentData.amount,
        clientId: paymentData.clientId,
        status: paymentData.status
      }
    });
  }

  /**
   * Crear notificación de recordatorio
   */
  async createReminderNotification(userId, reminderData) {
    return await this.create({
      userId,
      type: 'reminder',
      title: 'Recordatorio',
      message: reminderData.message,
      priority: 'normal',
      actionUrl: reminderData.actionUrl,
      data: reminderData.data || {}
    });
  }

  /**
   * Crear notificación del sistema
   */
  async createSystemNotification(userId, notificationData) {
    return await this.create({
      userId,
      type: 'system',
      title: notificationData.title,
      message: notificationData.message,
      priority: notificationData.priority || 'low',
      actionUrl: notificationData.actionUrl,
      data: notificationData.data || {}
    });
  }
}

module.exports = new NotificationModel();
module.exports.Notification = Notification;
module.exports.NotificationModel = NotificationModel;
