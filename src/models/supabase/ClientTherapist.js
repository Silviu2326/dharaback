/**
 * Modelo ClientTherapist - Relación muchos a muchos entre clientes y terapeutas
 */

const SupabaseService = require('../../services/supabaseService');

class ClientTherapist {
  constructor(data = {}) {
    this.id = data.id;
    this.clientId = data.client_id || data.clientId;
    this.therapistId = data.therapist_id || data.therapistId;
    this.status = data.status || 'active';
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
    this._data = data;
  }

  toJSON() {
    return {
      id: this.id,
      clientId: this.clientId,
      therapistId: this.therapistId,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

class ClientTherapistModel {
  constructor() {
    this.service = new SupabaseService('client_therapists');
  }

  /**
   * Crear relación cliente-terapeuta
   */
  async create(clientId, therapistId, status = 'active') {
    const data = {
      client_id: clientId,
      therapist_id: therapistId,
      status
    };
    
    const result = await this.service.create(data);
    return new ClientTherapist(result);
  }

  /**
   * Buscar relación por ID
   */
  async findById(id) {
    const result = await this.service.findById(id);
    return result ? new ClientTherapist(result) : null;
  }

  /**
   * Buscar relación por cliente y terapeuta
   */
  async findByClientAndTherapist(clientId, therapistId) {
    const result = await this.service.findOne({
      client_id: clientId,
      therapist_id: therapistId
    });
    return result ? new ClientTherapist(result) : null;
  }

  /**
   * Obtener todos los terapeutas de un cliente
   */
  async findByClient(clientId, options = {}) {
    const supabase = require('../../config/supabase').supabase;
    
    let query = supabase
      .from('client_therapists')
      .select(options.select || '*')
      .eq('client_id', clientId);

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).map(d => new ClientTherapist(d));
  }

  /**
   * Obtener todos los clientes de un terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    const supabase = require('../../config/supabase').supabase;
    
    let query = supabase
      .from('client_therapists')
      .select(options.select || '*')
      .eq('therapist_id', therapistId);

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).map(d => new ClientTherapist(d));
  }

  /**
   * Obtener IDs de clientes de un terapeuta
   */
  async getClientIdsByTherapist(therapistId, status = 'active') {
    const supabase = require('../../config/supabase').supabase;
    
    const { data, error } = await supabase
      .from('client_therapists')
      .select('client_id')
      .eq('therapist_id', therapistId)
      .eq('status', status);

    if (error) throw new Error(error.message);
    
    return (data || []).map(d => d.client_id);
  }

  /**
   * Verificar si existe relación activa
   */
  async hasActiveRelation(clientId, therapistId) {
    const relation = await this.findByClientAndTherapist(clientId, therapistId);
    return relation && relation.status === 'active';
  }

  /**
   * Actualizar estado de la relación
   */
  async updateStatus(id, status) {
    const result = await this.service.update(id, { status });
    return new ClientTherapist(result);
  }

  /**
   * Actualizar estado por cliente y terapeuta
   */
  async updateStatusByClientAndTherapist(clientId, therapistId, status) {
    const supabase = require('../../config/supabase').supabase;
    
    const { data, error } = await supabase
      .from('client_therapists')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('therapist_id', therapistId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }
    
    return data ? new ClientTherapist(data) : null;
  }

  /**
   * Eliminar relación (cambiar a 'archived')
   */
  async archive(clientId, therapistId) {
    return await this.updateStatusByClientAndTherapist(clientId, therapistId, 'archived');
  }

  /**
   * Reactivar relación
   */
  async reactivate(clientId, therapistId) {
    return await this.updateStatusByClientAndTherapist(clientId, therapistId, 'active');
  }

  /**
   * Eliminar relación permanentemente
   */
  async delete(id) {
    const result = await this.service.delete(id);
    return result ? new ClientTherapist(result) : null;
  }

  /**
   * Eliminar relación por cliente y terapeuta
   */
  async deleteByClientAndTherapist(clientId, therapistId) {
    const supabase = require('../../config/supabase').supabase;
    
    const { data, error } = await supabase
      .from('client_therapists')
      .delete()
      .eq('client_id', clientId)
      .eq('therapist_id', therapistId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }
    
    return data ? new ClientTherapist(data) : null;
  }

  /**
   * Contar terapeutas activos de un cliente
   */
  async countActiveTherapists(clientId) {
    const supabase = require('../../config/supabase').supabase;
    
    const { count, error } = await supabase
      .from('client_therapists')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'active');

    if (error) throw new Error(error.message);
    
    return count || 0;
  }

  /**
   * Contar clientes activos de un terapeuta
   */
  async countActiveClients(therapistId) {
    const supabase = require('../../config/supabase').supabase;
    
    const { count, error } = await supabase
      .from('client_therapists')
      .select('*', { count: 'exact', head: true })
      .eq('therapist_id', therapistId)
      .eq('status', 'active');

    if (error) throw new Error(error.message);
    
    return count || 0;
  }

  // Métodos estáticos
  static async findById(id) {
    const instance = new ClientTherapistModel();
    return await instance.findById(id);
  }

  static async findByClientAndTherapist(clientId, therapistId) {
    const instance = new ClientTherapistModel();
    return await instance.findByClientAndTherapist(clientId, therapistId);
  }

  static async findByTherapist(therapistId, options = {}) {
    const instance = new ClientTherapistModel();
    return await instance.findByTherapist(therapistId, options);
  }

  static async getClientIdsByTherapist(therapistId, status = 'active') {
    const instance = new ClientTherapistModel();
    return await instance.getClientIdsByTherapist(therapistId, status);
  }

  static async create(clientId, therapistId, status = 'active') {
    const instance = new ClientTherapistModel();
    return await instance.create(clientId, therapistId, status);
  }

  static async archive(clientId, therapistId) {
    const instance = new ClientTherapistModel();
    return await instance.archive(clientId, therapistId);
  }

  static async reactivate(clientId, therapistId) {
    const instance = new ClientTherapistModel();
    return await instance.reactivate(clientId, therapistId);
  }

  static async countActiveTherapists(clientId) {
    const instance = new ClientTherapistModel();
    return await instance.countActiveTherapists(clientId);
  }
}

module.exports = new ClientTherapistModel();
module.exports.ClientTherapist = ClientTherapist;
module.exports.ClientTherapistModel = ClientTherapistModel;