/**
 * Modelo Conversation migrado a Supabase
 * Reemplaza el modelo Mongoose de Conversation
 * Gestiona conversaciones entre terapeutas y clientes
 */

const SupabaseService = require('../../services/supabaseService');

class Conversation {
  constructor(data = {}) {
    this.id = data.id;
    this.clientId = data.client_id;
    this.therapistId = data.therapistId;
    this.status = data.status || 'active';
    this.lastMessageAt = data.last_message_at;
    this.unreadCount = data.unread_count || 0;
    this.metadata = data.metadata || {};
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    // Campos raw de la base de datos
    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Virtual: ¿La conversación está activa?
   */
  get isActive() {
    return this.status === 'active';
  }

  /**
   * Virtual: ¿La conversación está archivada?
   */
  get isArchived() {
    return this.status === 'archived';
  }

  /**
   * Virtual: ¿La conversación está bloqueada?
   */
  get isBlocked() {
    return this.status === 'blocked';
  }

  /**
   * Virtual: Tiempo desde el último mensaje
   */
  get lastMessageAgo() {
    if (!this.lastMessageAt) return null;

    const lastMessage = new Date(this.lastMessageAt);
    const now = new Date();
    const diffMs = now - lastMessage;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
    if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return lastMessage.toLocaleDateString('es-ES');
  }

  /**
   * Verificar si un usuario puede participar en la conversación
   */
  canParticipate(userId) {
    if (!userId) return false;
    return this.therapistId === userId || this.clientId === userId;
  }

  /**
   * Actualizar último mensaje
   */
  async updateLastMessage(timestamp = new Date().toISOString()) {
    const service = new SupabaseService('conversations');
    
    const result = await service.update(this.id, {
      last_message_at: timestamp,
      updated_at: timestamp
    });

    this.lastMessageAt = timestamp;
    this.updatedAt = timestamp;
    
    return this;
  }

  /**
   * Incrementar contador de mensajes no leídos
   */
  async incrementUnreadCount() {
    const service = new SupabaseService('conversations');
    
    const newCount = (this.unreadCount || 0) + 1;
    
    const result = await service.update(this.id, {
      unread_count: newCount
    });

    this.unreadCount = newCount;
    return this;
  }

  /**
   * Marcar como leída (resetear contador)
   */
  async markAsRead() {
    const service = new SupabaseService('conversations');
    
    const result = await service.update(this.id, {
      unread_count: 0
    });

    this.unreadCount = 0;
    return this;
  }

  /**
   * Archivar conversación
   */
  async archive() {
    const service = new SupabaseService('conversations');
    
    const result = await service.update(this.id, {
      status: 'archived'
    });

    this.status = 'archived';
    return this;
  }

  /**
   * Bloquear conversación
   */
  async block() {
    const service = new SupabaseService('conversations');
    
    const result = await service.update(this.id, {
      status: 'blocked'
    });

    this.status = 'blocked';
    return this;
  }

  /**
   * Reactivar conversación
   */
  async reactivate() {
    const service = new SupabaseService('conversations');
    
    const result = await service.update(this.id, {
      status: 'active'
    });

    this.status = 'active';
    return this;
  }

  /**
   * Obtener mensajes de la conversación
   */
  async getMessages(options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('messages')
      .select(options.select || '*')
      .eq('conversationId', this.id)
      .order('created_at', { ascending: options.ascending !== false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return data || [];
  }

  /**
   * Contar mensajes en la conversación
   */
  async countMessages() {
    const supabase = require('../../config/supabase').supabase;

    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversationId', this.id);

    if (error) throw new Error(error.message);
    return count || 0;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('conversations');

    const data = {
      client_id: this.clientId,
      therapistId: this.therapistId,
      status: this.status,
      last_message_at: this.lastMessageAt,
      unread_count: this.unreadCount,
      metadata: this.metadata
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Conversation(result);
    } else {
      const result = await service.create(data);
      return new Conversation(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      clientId: this.clientId,
      therapistId: this.therapistId,
      status: this.status,
      isActive: this.isActive,
      isArchived: this.isArchived,
      isBlocked: this.isBlocked,
      lastMessageAt: this.lastMessageAt,
      lastMessageAgo: this.lastMessageAgo,
      unreadCount: this.unreadCount,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class ConversationModel {
  constructor() {
    this.service = new SupabaseService('conversations');
    this.tableName = 'conversations';
  }

  /**
   * Crear nueva conversación
   */
  async create(data) {
    // Verificar si ya existe una conversación entre estos usuarios
    const existing = await this.findBetweenUsers(data.clientId, data.therapistId);
    if (existing) {
      // Si existe y está archivada, reactivarla
      if (existing.isArchived) {
        await existing.reactivate();
      }
      return existing;
    }

    const conversationData = {
      client_id: data.clientId,
      therapistId: data.therapistId,
      status: data.status || 'active',
      last_message_at: data.lastMessageAt,
      unread_count: data.unreadCount || 0,
      metadata: data.metadata || {}
    };

    const result = await this.service.create(conversationData);
    return new Conversation(result);
  }

  /**
   * Buscar todas las conversaciones
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Conversation(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Conversation(result) : null;
  }

  /**
   * Buscar una conversación por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Conversation(result) : null;
  }

  /**
   * Buscar conversación entre cliente y terapeuta
   */
  async findBetweenUsers(clientId, therapistId) {
    return await this.findOne({
      client_id: clientId,
      therapist_id: therapistId
    });
  }

  /**
   * Buscar conversaciones por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapist_id: therapistId }
    });
  }

  /**
   * Buscar conversaciones por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Buscar conversaciones activas de un terapeuta
   */
  async findActiveByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapist_id: therapistId,
        status: 'active'
      }
    });
  }

  /**
   * Buscar conversaciones archivadas de un terapeuta
   */
  async findArchivedByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapist_id: therapistId,
        status: 'archived'
      }
    });
  }

  /**
   * Buscar conversaciones con mensajes no leídos
   */
  async findUnreadByTherapist(therapistId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('conversations')
      .select(options.select || '*')
      .eq('therapist_id', therapistId)
      .gt('unread_count', 0)
      .order('last_message_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Conversation(d));
  }

  /**
   * Buscar conversaciones recientes
   */
  async findRecent(userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('conversations')
      .select(options.select || '*')
      .or(`therapistId.eq.${userId},client_id.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Conversation(d));
  }

  /**
   * Actualizar conversación
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.clientId !== undefined) data.client_id = updateData.clientId;
    if (updateData.therapistId !== undefined) data.therapist_id = updateData.therapistId;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.lastMessageAt !== undefined) data.last_message_at = updateData.lastMessageAt;
    if (updateData.unreadCount !== undefined) data.unread_count = updateData.unreadCount;
    if (updateData.metadata !== undefined) data.metadata = updateData.metadata;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Conversation(result) : null;
  }

  /**
   * Eliminar conversación
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Conversation(result) : null;
  }

  /**
   * Contar conversaciones
   */
  async count(filters = {}) {
    return await this.service.count(filters);
  }

  /**
   * Contar conversaciones por terapeuta
   */
  async countByTherapist(therapistId, status = null) {
    const filters = { therapist_id: therapistId };
    if (status) filters.status = status;
    return await this.count(filters);
  }

  /**
   * Buscar con paginación
   */
  async paginate(options = {}) {
    const result = await this.service.paginate(options);
    return {
      ...result,
      data: result.data.map(data => new Conversation(data))
    };
  }

  /**
   * Verificar si existe conversación
   */
  async exists(clientId, therapistId) {
    const count = await this.service.count({ 
      client_id: clientId, 
      therapist_id: therapistId 
    });
    return count > 0;
  }

  /**
   * Obtener estadísticas de conversaciones de un terapeuta
   */
  async getStats(therapistId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, activeResult, archivedResult, unreadResult] = await Promise.all([
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('status', 'active'),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('status', 'archived'),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).gt('unread_count', 0)
    ]);

    return {
      total: totalResult.count || 0,
      active: activeResult.count || 0,
      archived: archivedResult.count || 0,
      unread: unreadResult.count || 0
    };
  }
}

module.exports = new ConversationModel();
module.exports.Conversation = Conversation;
module.exports.ConversationModel = ConversationModel;
