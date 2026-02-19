/**
 * Modelo Note migrado a Supabase
 * Reemplaza el modelo Mongoose de Note
 */

const SupabaseService = require('../../services/supabaseService');

class Note {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.clientId = data.client_id;
    this.title = data.title;
    this.content = data.content;
    this.category = data.category || 'general';
    this.isPinned = data.is_pinned || false;
    this.color = data.color;
    this.tags = data.tags || [];
    this.reminders = data.reminders || [];
    this.hiddenFrom = data.hidden_from || [];
    this.responses = data.responses || [];
    this.editHistory = data.edit_history || [];
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
   * Virtual isExpired - Verifica si la nota tiene recordatorios vencidos
   */
  get isExpired() {
    if (!this.reminders || this.reminders.length === 0) return false;
    const now = new Date();
    return this.reminders.some(reminder => {
      const reminderDate = new Date(reminder.date);
      return reminderDate < now && !reminder.completed;
    });
  }

  /**
   * Verificar si un usuario puede ver la nota
   */
  canBeViewedBy(userId) {
    if (!userId) return false;
    // El autor siempre puede ver la nota
    if (this.userId === userId) return true;
    // Verificar si está oculta para este usuario
    if (this.hiddenFrom && this.hiddenFrom.includes(userId)) return false;
    return true;
  }

  /**
   * Agregar una respuesta a la nota
   */
  async addResponse(userId, content) {
    const response = {
      id: Date.now().toString(),
      userId,
      content,
      createdAt: new Date().toISOString(),
      read: false
    };

    this.responses = [...(this.responses || []), response];

    const service = new SupabaseService('notes');
    await service.update(this.id, { responses: this.responses });

    return response;
  }

  /**
   * Marcar respuesta como leída
   */
  async markResponseAsRead(responseId) {
    const responseIndex = this.responses?.findIndex(r => r.id === responseId);
    if (responseIndex === -1 || responseIndex === undefined) {
      throw new Error('Respuesta no encontrada');
    }

    this.responses[responseIndex].read = true;

    const service = new SupabaseService('notes');
    await service.update(this.id, { responses: this.responses });

    return this.responses[responseIndex];
  }

  /**
   * Ocultar nota para un usuario específico
   */
  async hideFromUser(userId) {
    if (!this.hiddenFrom) {
      this.hiddenFrom = [];
    }
    
    if (!this.hiddenFrom.includes(userId)) {
      this.hiddenFrom.push(userId);
    }

    const service = new SupabaseService('notes');
    await service.update(this.id, { hidden_from: this.hiddenFrom });

    return this;
  }

  /**
   * Agregar entrada al historial de ediciones
   */
  async addEditHistory(userId, changes) {
    const editEntry = {
      id: Date.now().toString(),
      userId,
      changes,
      editedAt: new Date().toISOString()
    };

    this.editHistory = [...(this.editHistory || []), editEntry];

    const service = new SupabaseService('notes');
    await service.update(this.id, { edit_history: this.editHistory });

    return editEntry;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('notes');

    const data = {
      user_id: this.userId,
      client_id: this.clientId,
      title: this.title,
      content: this.content,
      category: this.category,
      is_pinned: this.isPinned,
      color: this.color,
      tags: this.tags,
      reminders: this.reminders,
      hidden_from: this.hiddenFrom,
      responses: this.responses,
      edit_history: this.editHistory
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Note(result);
    } else {
      const result = await service.create(data);
      return new Note(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      clientId: this.clientId,
      title: this.title,
      content: this.content,
      category: this.category,
      isPinned: this.isPinned,
      color: this.color,
      tags: this.tags,
      reminders: this.reminders,
      hiddenFrom: this.hiddenFrom,
      responses: this.responses,
      editHistory: this.editHistory,
      isExpired: this.isExpired,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class NoteModel {
  constructor() {
    this.service = new SupabaseService('notes');
  }

  /**
   * Crear nueva nota
   */
  async create(data) {
    const noteData = {
      user_id: data.userId,
      client_id: data.clientId,
      title: data.title,
      content: data.content,
      category: data.category || 'general',
      is_pinned: data.isPinned || false,
      color: data.color,
      tags: data.tags || [],
      reminders: data.reminders || [],
      hidden_from: data.hiddenFrom || [],
      responses: data.responses || [],
      edit_history: data.editHistory || []
    };

    const result = await this.service.create(noteData);
    return new Note(result);
  }

  /**
   * Buscar todas las notas
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Note(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Note(result) : null;
  }

  /**
   * Buscar una nota por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Note(result) : null;
  }

  /**
   * Buscar por usuario
   */
  async findByUser(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId }
    });
  }

  /**
   * Buscar por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Buscar notas visibles para un usuario
   */
  async getVisibleNotes(userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('notes')
      .select(options.select || '*')
      .or(`user_id.eq.${userId},and(hidden_from.is.null,hidden_from.not.cs.{${userId}})`);

    if (options.category) {
      query = query.eq('category', options.category);
    }

    if (options.clientId) {
      query = query.eq('client_id', options.clientId);
    }

    // Ordenar por pinned primero, luego por fecha de creación
    query = query.order('is_pinned', { ascending: false })
                 .order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Note(d));
  }

  /**
   * Buscar notas de emergencia (recordatorios vencidos)
   */
  async getEmergencyNotes(userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    const now = new Date().toISOString();

    let query = supabase
      .from('notes')
      .select(options.select || '*')
      .eq('user_id', userId)
      .not('reminders', 'is', null)
      .filter('reminders', 'cs', `[{"completed":false}]`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Filtrar manualmente las que tienen recordatorios vencidos
    const notes = (data || []).map(d => new Note(d));
    return notes.filter(note => note.isExpired);
  }

  /**
   * Buscar notas con respuestas pendientes
   */
  async getPendingResponses(userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('notes')
      .select(options.select || '*')
      .eq('user_id', userId)
      .not('responses', 'is', null)
      .filter('responses', 'cs', `[{"read":false}]`);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Note(d));
  }

  /**
   * Actualizar nota
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.userId !== undefined) data.user_id = updateData.userId;
    if (updateData.clientId !== undefined) data.client_id = updateData.clientId;
    if (updateData.title !== undefined) data.title = updateData.title;
    if (updateData.content !== undefined) data.content = updateData.content;
    if (updateData.category !== undefined) data.category = updateData.category;
    if (updateData.isPinned !== undefined) data.is_pinned = updateData.isPinned;
    if (updateData.color !== undefined) data.color = updateData.color;
    if (updateData.tags !== undefined) data.tags = updateData.tags;
    if (updateData.reminders !== undefined) data.reminders = updateData.reminders;
    if (updateData.hiddenFrom !== undefined) data.hidden_from = updateData.hiddenFrom;
    if (updateData.responses !== undefined) data.responses = updateData.responses;
    if (updateData.editHistory !== undefined) data.edit_history = updateData.editHistory;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Note(result) : null;
  }

  /**
   * Eliminar nota
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Note(result) : null;
  }

  /**
   * Contar notas
   */
  async count(filters = {}) {
    return await this.service.count(filters);
  }

  /**
   * Buscar con paginación
   */
  async paginate(options = {}) {
    const result = await this.service.paginate(options);
    return {
      ...result,
      data: result.data.map(data => new Note(data))
    };
  }

  /**
   * Buscar por tags
   */
  async findByTags(tags, userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('notes')
      .select(options.select || '*')
      .eq('user_id', userId)
      .overlaps('tags', tags);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Note(d));
  }

  /**
   * Buscar por categoría
   */
  async findByCategory(category, userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, category, user_id: userId }
    });
  }

  /**
   * Buscar notas fijadas
   */
  async findPinned(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, is_pinned: true, user_id: userId }
    });
  }
}

module.exports = new NoteModel();
module.exports.Note = Note;
module.exports.NoteModel = NoteModel;
