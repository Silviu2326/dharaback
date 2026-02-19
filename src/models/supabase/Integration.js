/**
 * Modelo Integration migrado a Supabase
 * Reemplaza el modelo Mongoose de Integration
 */

const SupabaseService = require('../../services/supabaseService');
const crypto = require('crypto');

class Integration {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.provider = data.provider;
    this.name = data.name;
    this.isActive = data.is_active !== false;
    this.credentials = data.credentials || {};
    this.settings = data.settings || {};
    this.lastSyncAt = data.last_sync_at;
    this.lastSyncStatus = data.last_sync_status;
    this.lastSyncError = data.last_sync_error;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Verificar si está saludable
   */
  get isHealthy() {
    return this.isActive && this.lastSyncStatus !== 'error';
  }

  /**
   * Verificar si la sincronización está atrasada
   */
  get isOverdue() {
    if (!this.lastSyncAt) return true;
    
    const lastSync = new Date(this.lastSyncAt);
    const now = new Date();
    const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);
    
    // Considerar atrasado si pasaron más de 24 horas
    return hoursSinceLastSync > 24;
  }

  /**
   * Generar secreto para webhook
   */
  generateWebhookSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validar firma de webhook
   */
  validateWebhook(signature, payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const calculatedSignature = hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature), 
      Buffer.from(calculatedSignature)
    );
  }

  /**
   * Encriptar datos sensibles
   */
  encrypt(data) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex')
    };
  }

  /**
   * Desencriptar datos
   */
  decrypt(encryptedData) {
    if (typeof encryptedData === 'string') return encryptedData;

    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const decipher = crypto.createDecipheriv(
      algorithm, 
      key, 
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Actualizar estado de sincronización
   */
  async updateSyncStatus(status, error = null) {
    const service = new SupabaseService('integrations');

    const updateData = {
      last_sync_at: new Date().toISOString(),
      last_sync_status: status
    };

    if (error) {
      updateData.last_sync_error = error;
    } else {
      updateData.last_sync_error = null;
    }

    const result = await service.update(this.id, updateData);
    return new Integration(result);
  }

  /**
   * Realizar sincronización
   */
  async triggerSync() {
    try {
      await this.updateSyncStatus('in_progress');

      // Aquí iría la lógica específica de sincronización según el proveedor
      // Por ahora simulamos éxito
      
      const result = await this.updateSyncStatus('success');
      return result;
    } catch (error) {
      await this.updateSyncStatus('error', error.message);
      throw error;
    }
  }

  /**
   * Activar integración
   */
  async activate() {
    const service = new SupabaseService('integrations');
    const result = await service.update(this.id, { is_active: true });
    return new Integration(result);
  }

  /**
   * Desactivar integración
   */
  async deactivate() {
    const service = new SupabaseService('integrations');
    const result = await service.update(this.id, { is_active: false });
    return new Integration(result);
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('integrations');

    const data = {
      user_id: this.userId,
      provider: this.provider,
      name: this.name,
      is_active: this.isActive,
      credentials: this.credentials,
      settings: this.settings,
      last_sync_at: this.lastSyncAt,
      last_sync_status: this.lastSyncStatus,
      last_sync_error: this.lastSyncError
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Integration(result);
    } else {
      const result = await service.create(data);
      return new Integration(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      provider: this.provider,
      name: this.name,
      isActive: this.isActive,
      settings: this.settings,
      lastSyncAt: this.lastSyncAt,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError,
      isHealthy: this.isHealthy,
      isOverdue: this.isOverdue,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class IntegrationModel {
  constructor() {
    this.service = new SupabaseService('integrations');
  }

  /**
   * Crear nueva integración
   */
  async create(data) {
    const integrationData = {
      user_id: data.userId,
      provider: data.provider,
      name: data.name || data.provider,
      is_active: data.isActive !== false,
      credentials: data.credentials || {},
      settings: data.settings || {},
      last_sync_at: data.lastSyncAt,
      last_sync_status: data.lastSyncStatus || 'never_synced',
      last_sync_error: data.lastSyncError
    };

    const result = await this.service.create(integrationData);
    return new Integration(result);
  }

  /**
   * Buscar todas
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Integration(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Integration(result) : null;
  }

  /**
   * Buscar una
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Integration(result) : null;
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
   * Buscar por usuario y proveedor
   */
  async findByUserAndProvider(userId, provider) {
    return await this.findOne({ user_id: userId, provider });
  }

  /**
   * Buscar integraciones activas
   */
  async findActive(userId) {
    return await this.find({
      filters: { user_id: userId, is_active: true }
    });
  }

  /**
   * Buscar por proveedor
   */
  async findByProvider(provider, userId = null) {
    const filters = { provider, is_active: true };
    if (userId) filters.user_id = userId;
    
    return await this.find({ filters });
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.name) data.name = updateData.name;
    if (updateData.isActive !== undefined) data.is_active = updateData.isActive;
    if (updateData.credentials) data.credentials = updateData.credentials;
    if (updateData.settings) data.settings = updateData.settings;
    if (updateData.lastSyncAt) data.last_sync_at = updateData.lastSyncAt;
    if (updateData.lastSyncStatus) data.last_sync_status = updateData.lastSyncStatus;
    if (updateData.lastSyncError !== undefined) data.last_sync_error = updateData.lastSyncError;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Integration(result) : null;
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Integration(result) : null;
  }

  /**
   * Eliminar por usuario y proveedor
   */
  async deleteByUserAndProvider(userId, provider) {
    const integration = await this.findByUserAndProvider(userId, provider);
    if (integration) {
      await this.service.delete(integration.id);
    }
    return integration;
  }

  /**
   * Buscar integraciones atrasadas
   */
  async findOverdue(hours = 24) {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const supabase = require('../../config/supabase').supabase;
    
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('is_active', true)
      .or(`last_sync_at.lt.${cutoffDate},last_sync_at.is.null`);

    if (error) throw new Error(error.message);

    return (data || []).map(d => new Integration(d));
  }

  /**
   * Obtener estadísticas de integraciones
   */
  async getIntegrationStats() {
    const integrations = await this.find();
    
    const stats = {
      total: integrations.length,
      active: 0,
      inactive: 0,
      healthy: 0,
      error: 0,
      byProvider: {}
    };

    integrations.forEach(integration => {
      if (integration.isActive) {
        stats.active++;
      } else {
        stats.inactive++;
      }

      if (integration.isHealthy) {
        stats.healthy++;
      } else if (integration.lastSyncStatus === 'error') {
        stats.error++;
      }

      // Estadísticas por proveedor
      if (!stats.byProvider[integration.provider]) {
        stats.byProvider[integration.provider] = {
          total: 0,
          active: 0,
          error: 0
        };
      }
      
      stats.byProvider[integration.provider].total++;
      if (integration.isActive) {
        stats.byProvider[integration.provider].active++;
      }
      if (integration.lastSyncStatus === 'error') {
        stats.byProvider[integration.provider].error++;
      }
    });

    return stats;
  }

  /**
   * Sincronizar todas las integraciones de un usuario
   */
  async syncAllForUser(userId) {
    const integrations = await this.findActive(userId);
    const results = [];

    for (const integration of integrations) {
      try {
        const result = await integration.triggerSync();
        results.push({ provider: integration.provider, success: true, result });
      } catch (error) {
        results.push({ 
          provider: integration.provider, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }
}

module.exports = new IntegrationModel();
module.exports.Integration = Integration;
module.exports.IntegrationModel = IntegrationModel;
