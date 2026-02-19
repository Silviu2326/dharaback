/**
 * Modelo Credentials migrado a Supabase
 * Reemplaza el modelo Mongoose de Credentials
 * Gestiona credenciales seguras para integraciones (API keys, tokens, etc.)
 */

const SupabaseService = require('../../services/supabaseService');

class Credentials {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.type = data.type;
    this.name = data.name;
    this.value = data.value;
    this.isEncrypted = data.is_encrypted !== false;
    this.expiresAt = data.expires_at;
    this.lastUsedAt = data.last_used_at;
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
   * Virtual: ¿Es una API key?
   */
  get isApiKey() {
    return this.type === 'api_key';
  }

  /**
   * Virtual: ¿Es un token OAuth?
   */
  get isOAuthToken() {
    return this.type === 'oauth_token';
  }

  /**
   * Virtual: ¿Es una contraseña?
   */
  get isPassword() {
    return this.type === 'password';
  }

  /**
   * Virtual: ¿Es un certificado?
   */
  get isCertificate() {
    return this.type === 'certificate';
  }

  /**
   * Virtual: ¿Ha expirado?
   */
  get isExpired() {
    if (!this.expiresAt) return false;
    return new Date(this.expiresAt) < new Date();
  }

  /**
   * Virtual: ¿Está por expirar (menos de 7 días)?
   */
  get isAboutToExpire() {
    if (!this.expiresAt || this.isExpired) return false;
    const daysUntilExpiry = Math.ceil((new Date(this.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 7;
  }

  /**
   * Virtual: Días hasta expiración
   */
  get daysUntilExpiry() {
    if (!this.expiresAt) return null;
    const days = Math.ceil((new Date(this.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }

  /**
   * Virtual: ¿Ha sido usada?
   */
  get hasBeenUsed() {
    return !!this.lastUsedAt;
  }

  /**
   * Virtual: Tiempo desde último uso
   */
  get timeSinceLastUse() {
    if (!this.lastUsedAt) return null;
    const lastUsed = new Date(this.lastUsedAt);
    const now = new Date();
    const diffMs = now - lastUsed;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return lastUsed.toLocaleDateString('es-ES');
  }

  /**
   * Virtual: Estado de la credencial
   */
  get status() {
    if (this.isExpired) return 'expired';
    if (this.isAboutToExpire) return 'expiring_soon';
    return 'active';
  }

  /**
   * Registrar uso
   */
  async recordUse() {
    const service = new SupabaseService('credentials');
    
    const result = await service.update(this.id, {
      last_used_at: new Date().toISOString()
    });

    this.lastUsedAt = result.last_used_at;
    return this;
  }

  /**
   * Actualizar valor
   */
  async updateValue(newValue) {
    const service = new SupabaseService('credentials');
    
    const result = await service.update(this.id, {
      value: newValue,
      is_encrypted: this.isEncrypted
    });

    this.value = result.value;
    return this;
  }

  /**
   * Actualizar metadata
   */
  async updateMetadata(newMetadata) {
    const service = new SupabaseService('credentials');
    
    const result = await service.update(this.id, {
      metadata: { ...this.metadata, ...newMetadata }
    });

    this.metadata = result.metadata;
    return this;
  }

  /**
   * Extender fecha de expiración
   */
  async extendExpiration(days) {
    const service = new SupabaseService('credentials');
    
    const newExpiration = new Date();
    newExpiration.setDate(newExpiration.getDate() + days);

    const result = await service.update(this.id, {
      expires_at: newExpiration.toISOString()
    });

    this.expiresAt = result.expires_at;
    return this;
  }

  /**
   * Establecer fecha de expiración
   */
  async setExpiration(date) {
    const service = new SupabaseService('credentials');
    
    const result = await service.update(this.id, {
      expires_at: date
    });

    this.expiresAt = result.expires_at;
    return this;
  }

  /**
   * Eliminar expiración
   */
  async removeExpiration() {
    const service = new SupabaseService('credentials');
    
    const result = await service.update(this.id, {
      expires_at: null
    });

    this.expiresAt = null;
    return this;
  }

  /**
   * Cambiar estado de encriptación
   */
  async setEncryption(encrypted) {
    const service = new SupabaseService('credentials');
    
    const result = await service.update(this.id, {
      is_encrypted: encrypted
    });

    this.isEncrypted = result.is_encrypted;
    return this;
  }

  /**
   * Renombrar
   */
  async rename(newName) {
    const service = new SupabaseService('credentials');
    
    const result = await service.update(this.id, {
      name: newName
    });

    this.name = result.name;
    return this;
  }

  /**
   * Verificar si coincide con un valor (sin desencriptar)
   */
  matches(value) {
    return this.value === value;
  }

  /**
   * Obtener valor desencriptado (simulado - en producción usaría servicio de encriptación)
   */
  async getDecryptedValue() {
    if (!this.isEncrypted) {
      return this.value;
    }
    
    // En un sistema real, aquí se desencriptaría el valor
    // Por ahora, retornamos el valor tal cual (asumiendo que no está encriptado en la BD)
    return this.value;
  }

  /**
   * Validar formato según el tipo
   */
  validateFormat() {
    switch (this.type) {
      case 'api_key':
        // Validación básica de API key
        return this.value && this.value.length >= 16;
      case 'oauth_token':
        // Validación básica de token
        return this.value && this.value.length >= 20;
      case 'password':
        // Validación básica de contraseña
        return this.value && this.value.length >= 8;
      case 'certificate':
        // Validación básica de certificado
        return this.value && this.value.includes('BEGIN');
      default:
        return true;
    }
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('credentials');

    const data = {
      user_id: this.userId,
      type: this.type,
      name: this.name,
      value: this.value,
      is_encrypted: this.isEncrypted,
      expires_at: this.expiresAt,
      last_used_at: this.lastUsedAt,
      metadata: this.metadata
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Credentials(result);
    } else {
      const result = await service.create(data);
      return new Credentials(result);
    }
  }

  /**
   * Convertir a objeto JSON (sin el valor por seguridad)
   */
  toJSON(includeValue = false) {
    return {
      id: this.id,
      userId: this.userId,
      type: this.type,
      name: this.name,
      value: includeValue ? this.value : undefined,
      valuePreview: includeValue ? undefined : this.getValuePreview(),
      isEncrypted: this.isEncrypted,
      isExpired: this.isExpired,
      isAboutToExpire: this.isAboutToExpire,
      daysUntilExpiry: this.daysUntilExpiry,
      expiresAt: this.expiresAt,
      lastUsedAt: this.lastUsedAt,
      hasBeenUsed: this.hasBeenUsed,
      timeSinceLastUse: this.timeSinceLastUse,
      status: this.status,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Obtener preview del valor (primeros y últimos caracteres)
   */
  getValuePreview() {
    if (!this.value) return '';
    if (this.value.length <= 8) return '****';
    return `${this.value.substring(0, 4)}...${this.value.substring(this.value.length - 4)}`;
  }
}

/**
 * Métodos estáticos
 */
class CredentialsModel {
  constructor() {
    this.service = new SupabaseService('credentials');
    this.tableName = 'credentials';
  }

  /**
   * Crear nueva credencial
   */
  async create(data) {
    const credentialsData = {
      user_id: data.userId,
      type: data.type,
      name: data.name,
      value: data.value,
      is_encrypted: data.isEncrypted !== false,
      expires_at: data.expiresAt,
      last_used_at: data.lastUsedAt || null,
      metadata: data.metadata || {}
    };

    const result = await this.service.create(credentialsData);
    return new Credentials(result);
  }

  /**
   * Buscar todas las credenciales
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Credentials(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Credentials(result) : null;
  }

  /**
   * Buscar una credencial por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Credentials(result) : null;
  }

  /**
   * Buscar credenciales por usuario
   */
  async findByUser(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId }
    });
  }

  /**
   * Buscar credenciales por tipo
   */
  async findByType(userId, type, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId, type }
    });
  }

  /**
   * Buscar API keys de un usuario
   */
  async findApiKeys(userId, options = {}) {
    return await this.findByType(userId, 'api_key', options);
  }

  /**
   * Buscar tokens OAuth de un usuario
   */
  async findOAuthTokens(userId, options = {}) {
    return await this.findByType(userId, 'oauth_token', options);
  }

  /**
   * Buscar credencial por nombre
   */
  async findByName(userId, name, options = {}) {
    return await this.findOne({
      user_id: userId,
      name
    }, options);
  }

  /**
   * Buscar credenciales expiradas
   */
  async findExpired(userId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('credentials')
      .select(options.select || '*')
      .lt('expires_at', new Date().toISOString());

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Credentials(d));
  }

  /**
   * Buscar credenciales por expirar
   */
  async findExpiringSoon(days = 7, userId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    let query = supabase
      .from('credentials')
      .select(options.select || '*')
      .lte('expires_at', futureDate.toISOString())
      .gt('expires_at', new Date().toISOString());

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Credentials(d));
  }

  /**
   * Buscar credenciales nunca usadas
   */
  async findUnused(userId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('credentials')
      .select(options.select || '*')
      .is('last_used_at', null);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Credentials(d));
  }

  /**
   * Actualizar credencial
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.userId !== undefined) data.user_id = updateData.userId;
    if (updateData.type !== undefined) data.type = updateData.type;
    if (updateData.name !== undefined) data.name = updateData.name;
    if (updateData.value !== undefined) data.value = updateData.value;
    if (updateData.isEncrypted !== undefined) data.is_encrypted = updateData.isEncrypted;
    if (updateData.expiresAt !== undefined) data.expires_at = updateData.expiresAt;
    if (updateData.lastUsedAt !== undefined) data.last_used_at = updateData.lastUsedAt;
    if (updateData.metadata !== undefined) data.metadata = updateData.metadata;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Credentials(result) : null;
  }

  /**
   * Eliminar credencial
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Credentials(result) : null;
  }

  /**
   * Eliminar todas las credenciales de un usuario
   */
  async deleteByUser(userId) {
    const supabase = require('../../config/supabase').supabase;

    const { data, error } = await supabase
      .from('credentials')
      .delete()
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return data?.length || 0;
  }

  /**
   * Eliminar credenciales expiradas
   */
  async deleteExpired(userId = null) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('credentials')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data?.length || 0;
  }

  /**
   * Contar credenciales
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
      data: result.data.map(data => new Credentials(data))
    };
  }

  /**
   * Obtener estadísticas de credenciales de un usuario
   */
  async getStats(userId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, expiredResult, apiKeyResult, oauthResult] = await Promise.all([
      supabase.from('credentials').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('credentials').select('*', { count: 'exact', head: true }).eq('user_id', userId).lt('expires_at', new Date().toISOString()),
      supabase.from('credentials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('type', 'api_key'),
      supabase.from('credentials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('type', 'oauth_token')
    ]);

    return {
      total: totalResult.count || 0,
      expired: expiredResult.count || 0,
      apiKeys: apiKeyResult.count || 0,
      oauthTokens: oauthResult.count || 0
    };
  }

  /**
   * Verificar si existe una credencial con el mismo nombre
   */
  async exists(userId, name) {
    const count = await this.count({
      user_id: userId,
      name
    });
    return count > 0;
  }

  /**
   * Generar API key aleatoria
   */
  generateApiKey(prefix = 'dhara') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = prefix + '_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  /**
   * Crear API key para usuario
   */
  async createApiKey(userId, name, expiresAt = null) {
    const key = this.generateApiKey();
    
    return await this.create({
      userId,
      type: 'api_key',
      name,
      value: key,
      isEncrypted: true,
      expiresAt,
      metadata: {
        generatedAt: new Date().toISOString()
      }
    });
  }
}

module.exports = new CredentialsModel();
module.exports.Credentials = Credentials;
module.exports.CredentialsModel = CredentialsModel;
