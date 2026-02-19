/**
 * Modelo Favorite migrado a Supabase
 * Reemplaza el modelo Mongoose de Favorite
 * Gestiona clientes favoritos de los terapeutas
 */

const SupabaseService = require('../../services/supabaseService');

class Favorite {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.clientId = data.client_id;
    this.notes = data.notes;
    this.createdAt = data.created_at;

    // Campos raw de la base de datos
    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Virtual: ¿Tiene notas?
   */
  get hasNotes() {
    return !!this.notes && this.notes.trim().length > 0;
  }

  /**
   * Virtual: Tiempo transcurrido desde que se agregó
   */
  get timeSinceAdded() {
    if (!this.createdAt) return null;
    const created = new Date(this.createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return created.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
  }

  /**
   * Agregar o actualizar notas
   */
  async setNotes(notes) {
    const service = new SupabaseService('favorites');
    
    const result = await service.update(this.id, { notes });
    this.notes = result.notes;
    return this;
  }

  /**
   * Agregar nota adicional
   */
  async addNote(note) {
    const newNotes = this.notes 
      ? `${this.notes}\n${new Date().toLocaleDateString()}: ${note}`
      : `${new Date().toLocaleDateString()}: ${note}`;

    return await this.setNotes(newNotes);
  }

  /**
   * Limpiar notas
   */
  async clearNotes() {
    return await this.setNotes(null);
  }

  /**
   * Obtener información del cliente
   */
  async getClient() {
    const Client = require('./Client');
    return await Client.findById(this.clientId);
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('favorites');

    const data = {
      user_id: this.userId,
      client_id: this.clientId,
      notes: this.notes
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Favorite(result);
    } else {
      const result = await service.create(data);
      return new Favorite(result);
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
      notes: this.notes,
      hasNotes: this.hasNotes,
      timeSinceAdded: this.timeSinceAdded,
      createdAt: this.createdAt
    };
  }
}

/**
 * Métodos estáticos
 */
class FavoriteModel {
  constructor() {
    this.service = new SupabaseService('favorites');
    this.tableName = 'favorites';
  }

  /**
   * Crear nuevo favorito
   */
  async create(data) {
    // Verificar si ya existe
    const existing = await this.findOne({
      user_id: data.userId,
      client_id: data.clientId
    });

    if (existing) {
      throw new Error('El cliente ya está en favoritos');
    }

    const favoriteData = {
      user_id: data.userId,
      client_id: data.clientId,
      notes: data.notes
    };

    const result = await this.service.create(favoriteData);
    return new Favorite(result);
  }

  /**
   * Buscar todos los favoritos
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Favorite(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Favorite(result) : null;
  }

  /**
   * Buscar un favorito por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Favorite(result) : null;
  }

  /**
   * Buscar favoritos por usuario (terapeuta)
   */
  async findByUser(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId }
    });
  }

  /**
   * Buscar favoritos por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Verificar si un cliente es favorito de un usuario
   */
  async isFavorite(userId, clientId) {
    const count = await this.count({
      user_id: userId,
      client_id: clientId
    });
    return count > 0;
  }

  /**
   * Obtener o crear favorito
   */
  async getOrCreate(userId, clientId, notes = null) {
    const existing = await this.findOne({
      user_id: userId,
      client_id: clientId
    });

    if (existing) {
      return existing;
    }

    return await this.create({
      userId,
      clientId,
      notes
    });
  }

  /**
   * Toggle favorito (agregar o quitar)
   */
  async toggle(userId, clientId) {
    const existing = await this.findOne({
      user_id: userId,
      client_id: clientId
    });

    if (existing) {
      await this.findByIdAndDelete(existing.id);
      return { isFavorite: false, favorite: null };
    } else {
      const favorite = await this.create({ userId, clientId });
      return { isFavorite: true, favorite };
    }
  }

  /**
   * Buscar favoritos con notas
   */
  async findWithNotes(userId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('favorites')
      .select(options.select || '*')
      .eq('user_id', userId)
      .not('notes', 'is', null)
      .neq('notes', '');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Favorite(d));
  }

  /**
   * Actualizar favorito
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.userId !== undefined) data.user_id = updateData.userId;
    if (updateData.clientId !== undefined) data.client_id = updateData.clientId;
    if (updateData.notes !== undefined) data.notes = updateData.notes;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Favorite(result) : null;
  }

  /**
   * Eliminar favorito
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Favorite(result) : null;
  }

  /**
   * Eliminar favorito por usuario y cliente
   */
  async deleteByUserAndClient(userId, clientId) {
    const favorite = await this.findOne({
      user_id: userId,
      client_id: clientId
    });

    if (favorite) {
      return await this.findByIdAndDelete(favorite.id);
    }
    return null;
  }

  /**
   * Contar favoritos
   */
  async count(filters = {}) {
    return await this.service.count(filters);
  }

  /**
   * Contar favoritos de un usuario
   */
  async countByUser(userId) {
    return await this.count({ user_id: userId });
  }

  /**
   * Buscar con paginación
   */
  async paginate(options = {}) {
    const result = await this.service.paginate(options);
    return {
      ...result,
      data: result.data.map(data => new Favorite(data))
    };
  }

  /**
   * Obtener IDs de clientes favoritos de un usuario
   */
  async getFavoriteClientIds(userId) {
    const supabase = require('../../config/supabase').supabase;

    const { data, error } = await supabase
      .from('favorites')
      .select('client_id')
      .eq('user_id', userId);

    if (error) throw new Error(error.message);

    return (data || []).map(f => f.client_id);
  }

  /**
   * Obtener estadísticas de favoritos de un usuario
   */
  async getStats(userId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, withNotesResult] = await Promise.all([
      supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('notes', 'is', null).neq('notes', '')
    ]);

    return {
      total: totalResult.count || 0,
      withNotes: withNotesResult.count || 0,
      withoutNotes: (totalResult.count || 0) - (withNotesResult.count || 0)
    };
  }
}

module.exports = new FavoriteModel();
module.exports.Favorite = Favorite;
module.exports.FavoriteModel = FavoriteModel;
