/**
 * Modelo Message migrado a Supabase
 * Reemplaza el modelo Mongoose de Message
 * Gestiona mensajes dentro de conversaciones
 */

const SupabaseService = require('../../services/supabaseService');

class Message {
  constructor(data = {}) {
    this.id = data.id;
    this.conversationId = data.conversationId;
    this.senderId = data.sender_id;
    this.senderType = data.sender_type || 'therapist';
    this.content = data.content;
    this.type = data.type || 'text';
    this.attachments = data.attachments || [];
    this.isRead = data.is_read || false;
    this.readAt = data.read_at;
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
   * Virtual: ¿El mensaje es del terapeuta?
   */
  get isFromTherapist() {
    return this.senderType === 'therapist';
  }

  /**
   * Virtual: ¿El mensaje es del cliente?
   */
  get isFromClient() {
    return this.senderType === 'client';
  }

  /**
   * Virtual: ¿El mensaje es del sistema?
   */
  get isSystemMessage() {
    return this.senderType === 'system';
  }

  /**
   * Virtual: ¿El mensaje tiene adjuntos?
   */
  get hasAttachments() {
    return this.attachments && this.attachments.length > 0;
  }

  /**
   * Virtual: ¿El mensaje es solo texto?
   */
  get isTextOnly() {
    return this.type === 'text' && !this.hasAttachments;
  }

  /**
   * Virtual: Tiempo transcurrido desde el envío
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
    return created.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  /**
   * Marcar mensaje como leído
   */
  async markAsRead() {
    if (this.isRead) return this;

    const service = new SupabaseService('messages');
    
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
   * Marcar mensaje como no leído
   */
  async markAsUnread() {
    if (!this.isRead) return this;

    const service = new SupabaseService('messages');
    
    const result = await service.update(this.id, {
      is_read: false,
      read_at: null
    });

    this.isRead = false;
    this.readAt = null;
    return this;
  }

  /**
   * Editar contenido del mensaje
   */
  async editContent(newContent) {
    if (this.type !== 'text') {
      throw new Error('Solo se pueden editar mensajes de texto');
    }

    const service = new SupabaseService('messages');
    
    // Agregar historial de edición al metadata
    const editHistory = this.metadata?.editHistory || [];
    editHistory.push({
      previousContent: this.content,
      editedAt: new Date().toISOString()
    });

    const result = await service.update(this.id, {
      content: newContent,
      metadata: {
        ...this.metadata,
        editHistory,
        edited: true,
        editedAt: new Date().toISOString()
      }
    });

    this.content = newContent;
    this.metadata = result.metadata;
    return this;
  }

  /**
   * Agregar adjunto al mensaje
   */
  async addAttachment(attachment) {
    const service = new SupabaseService('messages');
    
    const newAttachments = [...(this.attachments || []), {
      id: attachment.id || Date.now().toString(),
      name: attachment.name,
      url: attachment.url,
      type: attachment.type,
      size: attachment.size,
      uploadedAt: new Date().toISOString()
    }];

    const result = await service.update(this.id, {
      attachments: newAttachments
    });

    this.attachments = newAttachments;
    return this;
  }

  /**
   * Eliminar adjunto del mensaje
   */
  async removeAttachment(attachmentId) {
    const service = new SupabaseService('messages');
    
    const newAttachments = (this.attachments || []).filter(
      att => att.id !== attachmentId
    );

    const result = await service.update(this.id, {
      attachments: newAttachments
    });

    this.attachments = newAttachments;
    return this;
  }

  /**
   * Verificar si el mensaje puede ser editado por un usuario
   */
  canBeEditedBy(userId) {
    // Solo el remitente puede editar sus mensajes
    if (this.senderId !== userId) return false;
    // No se pueden editar mensajes del sistema
    if (this.isSystemMessage) return false;
    // No se pueden editar mensajes con más de 24 horas
    const created = new Date(this.createdAt);
    const now = new Date();
    const diffHours = (now - created) / (1000 * 60 * 60);
    return diffHours <= 24;
  }

  /**
   * Verificar si el mensaje puede ser eliminado por un usuario
   */
  canBeDeletedBy(userId, isAdmin = false) {
    // Los admins pueden eliminar cualquier mensaje
    if (isAdmin) return true;
    // El remitente puede eliminar sus mensajes
    return this.senderId === userId;
  }

  /**
   * Obtener información resumida del mensaje
   */
  getPreview(maxLength = 50) {
    if (this.type !== 'text') {
      return `[${this.type.toUpperCase()}]`;
    }
    if (!this.content) return '';
    if (this.content.length <= maxLength) return this.content;
    return this.content.substring(0, maxLength) + '...';
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('messages');

    const data = {
      conversationId: this.conversationId,
      sender_id: this.senderId,
      sender_type: this.senderType,
      content: this.content,
      type: this.type,
      attachments: this.attachments,
      is_read: this.isRead,
      read_at: this.readAt,
      metadata: this.metadata
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Message(result);
    } else {
      const result = await service.create(data);
      return new Message(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      senderType: this.senderType,
      isFromTherapist: this.isFromTherapist,
      isFromClient: this.isFromClient,
      isSystemMessage: this.isSystemMessage,
      content: this.content,
      preview: this.getPreview(),
      type: this.type,
      attachments: this.attachments,
      hasAttachments: this.hasAttachments,
      isTextOnly: this.isTextOnly,
      isRead: this.isRead,
      readAt: this.readAt,
      timeAgo: this.timeAgo,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class MessageModel {
  constructor() {
    this.service = new SupabaseService('messages');
    this.tableName = 'messages';
  }

  /**
   * Crear nuevo mensaje
   */
  async create(data) {
    const messageData = {
      conversationId: data.conversationId,
      sender_id: data.senderId,
      sender_type: data.senderType || 'therapist',
      content: data.content,
      type: data.type || 'text',
      attachments: data.attachments || [],
      is_read: data.isRead || false,
      read_at: data.readAt || null,
      metadata: data.metadata || {}
    };

    const result = await this.service.create(messageData);
    const message = new Message(result);

    // Actualizar la conversación con el último mensaje
    const Conversation = require('./Conversation');
    const conversation = await Conversation.findById(data.conversationId);
    if (conversation) {
      await conversation.updateLastMessage(result.created_at);
      
      // Incrementar contador de no leídos si el mensaje no es del remitente principal
      if (data.senderType === 'client') {
        await conversation.incrementUnreadCount();
      }
    }

    return message;
  }

  /**
   * Buscar todos los mensajes
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Message(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Message(result) : null;
  }

  /**
   * Buscar un mensaje por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Message(result) : null;
  }

  /**
   * Buscar mensajes por conversación
   */
  async findByConversation(conversationId, options = {}) {
    const supabase = require('../../config/supabase').supabase;
    const { logger } = require('../../utils/logger');

    try {
      let query = supabase
        .from('messages')
        .select(options.select || '*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: options.ascending !== false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error } = await query;
      
      if (error) {
        // If table doesn't exist, return empty array instead of throwing
        if (error.message && error.message.includes('relation "messages" does not exist')) {
          logger.warn('Messages table does not exist in database, returning empty array');
          return [];
        }
        throw new Error(error.message);
      }

      return (data || []).map(d => new Message(d));
    } catch (error) {
      // Log error but return empty array to avoid breaking the frontend
      logger.error('Error in findByConversation:', { error: error.message, conversationId });
      return [];
    }
  }

  /**
   * Buscar mensajes por remitente
   */
  async findBySender(senderId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, sender_id: senderId }
    });
  }

  /**
   * Buscar mensajes no leídos por conversación
   */
  async findUnreadByConversation(conversationId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        conversationId: conversationId,
        is_read: false
      }
    });
  }

  /**
   * Buscar mensajes no leídos por usuario
   */
  async findUnreadForUser(userId, conversationId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    // Obtener la conversación para saber el rol del usuario
    const { data: conversation } = await supabase
      .from('conversations')
      .select('therapistId, client_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) return [];

    // Determinar qué tipo de mensajes no leídos buscar
    const isTherapist = conversation.therapistId === userId;
    const senderType = isTherapist ? 'client' : 'therapist';

    let query = supabase
      .from('messages')
      .select(options.select || '*')
      .eq('conversationId', conversationId)
      .eq('is_read', false)
      .eq('sender_type', senderType);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Message(d));
  }

  /**
   * Buscar mensajes recientes
   */
  async findRecent(conversationId, limit = 20) {
    return await this.findByConversation(conversationId, { 
      limit, 
      ascending: false 
    });
  }

  /**
   * Buscar mensajes por tipo
   */
  async findByType(type, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, type }
    });
  }

  /**
   * Buscar mensajes con adjuntos
   */
  async findWithAttachments(conversationId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('messages')
      .select(options.select || '*')
      .eq('conversationId', conversationId)
      .not('attachments', 'is', null)
      .filter('attachments', 'neq', '[]')
      .order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Message(d));
  }

  /**
   * Buscar mensajes por contenido (búsqueda de texto)
   */
  async search(conversationId, searchTerm, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('messages')
      .select(options.select || '*')
      .eq('conversationId', conversationId)
      .ilike('content', `%${searchTerm}%`)
      .order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Message(d));
  }

  /**
   * Actualizar mensaje
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.conversationId !== undefined) data.conversationId = updateData.conversationId;
    if (updateData.senderId !== undefined) data.sender_id = updateData.senderId;
    if (updateData.senderType !== undefined) data.sender_type = updateData.senderType;
    if (updateData.content !== undefined) data.content = updateData.content;
    if (updateData.type !== undefined) data.type = updateData.type;
    if (updateData.attachments !== undefined) data.attachments = updateData.attachments;
    if (updateData.isRead !== undefined) data.is_read = updateData.isRead;
    if (updateData.readAt !== undefined) data.read_at = updateData.readAt;
    if (updateData.metadata !== undefined) data.metadata = updateData.metadata;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Message(result) : null;
  }

  /**
   * Eliminar mensaje
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Message(result) : null;
  }

  /**
   * Marcar todos los mensajes de una conversación como leídos
   */
  async markAllAsRead(conversationId, userId) {
    const supabase = require('../../config/supabase').supabase;

    // Obtener la conversación para saber el rol del usuario
    const { data: conversation } = await supabase
      .from('conversations')
      .select('therapistId, client_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) return 0;

    const isTherapist = conversation.therapistId === userId;
    const senderType = isTherapist ? 'client' : 'therapist';

    const readAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('messages')
      .update({ is_read: true, read_at: readAt })
      .eq('conversationId', conversationId)
      .eq('is_read', false)
      .eq('sender_type', senderType);

    if (error) throw new Error(error.message);

    // Resetear contador de no leídos en la conversación
    const Conversation = require('./Conversation');
    const conversationObj = await Conversation.findById(conversationId);
    if (conversationObj && isTherapist) {
      await conversationObj.markAsRead();
    }

    return data?.length || 0;
  }

  /**
   * Contar mensajes
   */
  async count(filters = {}) {
    return await this.service.count(filters);
  }

  /**
   * Contar mensajes por conversación
   */
  async countByConversation(conversationId) {
    return await this.count({ conversationId: conversationId });
  }

  /**
   * Contar mensajes no leídos
   */
  async countUnread(conversationId) {
    return await this.count({ 
      conversationId: conversationId, 
      is_read: false 
    });
  }

  /**
   * Buscar con paginación
   */
  async paginate(options = {}) {
    const result = await this.service.paginate(options);
    return {
      ...result,
      data: result.data.map(data => new Message(data))
    };
  }

  /**
   * Obtener estadísticas de mensajes de una conversación
   */
  async getStats(conversationId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, unreadResult, therapistResult, clientResult] = await Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('conversationId', conversationId),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('conversationId', conversationId).eq('is_read', false),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('conversationId', conversationId).eq('sender_type', 'therapist'),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('conversationId', conversationId).eq('sender_type', 'client')
    ]);

    return {
      total: totalResult.count || 0,
      unread: unreadResult.count || 0,
      byTherapist: therapistResult.count || 0,
      byClient: clientResult.count || 0
    };
  }
}

module.exports = new MessageModel();
module.exports.Message = Message;
module.exports.MessageModel = MessageModel;
