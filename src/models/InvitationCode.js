/**
 * Modelo InvitationCode para Supabase
 * Gestiona códigos de invitación para clientes
 */

class InvitationCode {
  constructor(data = {}) {
    this.id = data.id;
    this.clientId = data.client_id;
    this.therapistId = data.therapist_id;
    this.code = data.code;
    this.email = data.email;
    this.status = data.status || 'active';
    this.usedAt = data.used_at;
    this.registeredClientId = data.registered_client_id || data.registered_user_id;
    this.expiresAt = data.expires_at;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
    this.metadata = data.metadata || {};
    this._data = data;
  }

  // Virtual: ¿El código ha expirado?
  get isExpired() {
    if (!this.expiresAt) return false;
    return new Date(this.expiresAt) < new Date();
  }

  // Virtual: ¿El código es válido?
  get isValid() {
    return this.status === 'active' && !this.isExpired;
  }

  /**
   * Marcar código como usado
   */
  async markAsUsed(clientId) {
    const supabase = require('../config/supabase').supabase;
    
    const { data, error } = await supabase
      .from('invitation_codes')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        registered_client_id: clientId,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    this.status = 'used';
    this.usedAt = data.used_at;
    this.registeredClientId = clientId;
    
    return this;
  }

  /**
   * Invalidar código
   */
  async invalidate() {
    const supabase = require('../config/supabase').supabase;
    
    const { data, error } = await supabase
      .from('invitation_codes')
      .update({
        status: 'invalidated',
        updated_at: new Date().toISOString()
      })
      .eq('id', this.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    this.status = 'invalidated';
    return this;
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      clientId: this.clientId,
      therapistId: this.therapistId,
      code: this.code,
      email: this.email,
      status: this.status,
      isValid: this.isValid,
      isExpired: this.isExpired,
      usedAt: this.usedAt,
      registeredClientId: this.registeredClientId,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata
    };
  }
}

/**
 * Métodos estáticos
 */
class InvitationCodeModel {
  constructor() {
    this.tableName = 'invitation_codes';
  }

  /**
   * Crear nuevo código de invitación
   */
  async create(data) {
    const supabase = require('../config/supabase').supabase;

    const codeData = {
      client_id: data.clientId,
      therapist_id: data.therapistId,
      code: data.code,
      email: data.email || null,
      status: 'active',
      expires_at: data.expiresAt || null,
      metadata: data.metadata || {}
    };

    const { data: result, error } = await supabase
      .from(this.tableName)
      .insert(codeData)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return new InvitationCode(result);
  }

  /**
   * Buscar por ID
   */
  async findById(id) {
    const supabase = require('../config/supabase').supabase;

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return new InvitationCode(data);
  }

  /**
   * Buscar por código
   */
  async findByCode(code) {
    const supabase = require('../config/supabase').supabase;

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('code', code)
      .single();

    if (error) return null;
    return new InvitationCode(data);
  }

  /**
   * Buscar códigos por cliente
   */
  async findByClient(clientId, options = {}) {
    const supabase = require('../config/supabase').supabase;
    
    let query = supabase
      .from(this.tableName)
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data.map(d => new InvitationCode(d));
  }

  /**
   * Invalidar códigos por cliente
   */
  async invalidateByClient(clientId) {
    const supabase = require('../config/supabase').supabase;

    const { data, error } = await supabase
      .from(this.tableName)
      .update({
        status: 'invalidated',
        updated_at: new Date().toISOString()
      })
      .eq('client_id', clientId)
      .eq('status', 'active');

    if (error) throw new Error(error.message);
    return data;
  }
}

// Exportar ambos
InvitationCode.InvitationCodeModel = InvitationCodeModel;
module.exports = { InvitationCode, InvitationCodeModel };
