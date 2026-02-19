/**
 * Modelo Webhook migrado a Supabase
 * Reemplaza el modelo Mongoose de Webhook
 * Gestiona webhooks para integraciones externas
 */

const SupabaseService = require('../../services/supabaseService');

class Webhook {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.name = data.name;
    this.url = data.url;
    this.secret = data.secret;
    this.events = data.events || [];
    this.isActive = data.is_active !== false;
    this.lastTriggeredAt = data.last_triggered_at;
    this.lastResponseStatus = data.last_response_status;
    this.lastResponseBody = data.last_response_body;
    this.failureCount = data.failure_count || 0;
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
   * Virtual: ¿Está activo?
   */
  get active() {
    return this.isActive;
  }

  /**
   * Virtual: ¿Tiene secret?
   */
  get hasSecret() {
    return !!this.secret;
  }

  /**
   * Virtual: ¿Tiene eventos configurados?
   */
  get hasEvents() {
    return this.events && this.events.length > 0;
  }

  /**
   * Virtual: Número de eventos
   */
  get eventsCount() {
    return (this.events || []).length;
  }

  /**
   * Virtual: ¿Ha sido activado alguna vez?
   */
  get hasBeenTriggered() {
    return !!this.lastTriggeredAt;
  }

  /**
   * Virtual: ¿Tuvo éxito la última llamada?
   */
  get lastCallSuccessful() {
    if (this.lastResponseStatus === null || this.lastResponseStatus === undefined) return null;
    return this.lastResponseStatus >= 200 && this.lastResponseStatus < 300;
  }

  /**
   * Virtual: ¿Tiene fallos consecutivos?
   */
  get hasConsecutiveFailures() {
    return this.failureCount > 0;
  }

  /**
   * Virtual: ¿Debe desactivarse por fallos?
   */
  get shouldDisable() {
    return this.failureCount >= 5;
  }

  /**
   * Virtual: Tiempo desde última activación
   */
  get timeSinceLastTrigger() {
    if (!this.lastTriggeredAt) return null;
    const last = new Date(this.lastTriggeredAt);
    const now = new Date();
    const diffMs = now - last;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    return `Hace ${diffDays} días`;
  }

  /**
   * Activar webhook
   */
  async activate() {
    if (this.isActive) return this;

    const service = new SupabaseService('webhooks');
    
    const result = await service.update(this.id, {
      is_active: true,
      failure_count: 0
    });

    this.isActive = true;
    this.failureCount = 0;
    return this;
  }

  /**
   * Desactivar webhook
   */
  async deactivate() {
    if (!this.isActive) return this;

    const service = new SupabaseService('webhooks');
    
    const result = await service.update(this.id, {
      is_active: false
    });

    this.isActive = false;
    return this;
  }

  /**
   * Registrar activación
   */
  async recordTrigger(responseStatus, responseBody = null) {
    const service = new SupabaseService('webhooks');
    
    const data = {
      last_triggered_at: new Date().toISOString(),
      last_response_status: responseStatus,
      last_response_body: responseBody
    };

    // Incrementar contador de fallos si no fue exitoso
    if (responseStatus < 200 || responseStatus >= 300) {
      data.failure_count = this.failureCount + 1;
    } else {
      data.failure_count = 0;
    }

    const result = await service.update(this.id, data);

    this.lastTriggeredAt = result.last_triggered_at;
    this.lastResponseStatus = result.last_response_status;
    this.lastResponseBody = result.last_response_body;
    this.failureCount = result.failure_count;

    // Desactivar automáticamente si hay demasiados fallos
    if (this.shouldDisable && this.isActive) {
      await this.deactivate();
    }

    return this;
  }

  /**
   * Agregar evento
   */
  async addEvent(event) {
    if (this.events.includes(event)) {
      return this;
    }

    const service = new SupabaseService('webhooks');
    
    const result = await service.update(this.id, {
      events: [...this.events, event]
    });

    this.events = result.events;
    return this;
  }

  /**
   * Remover evento
   */
  async removeEvent(event) {
    if (!this.events.includes(event)) {
      return this;
    }

    const service = new SupabaseService('webhooks');
    
    const result = await service.update(this.id, {
      events: this.events.filter(e => e !== event)
    });

    this.events = result.events;
    return this;
  }

  /**
   * Actualizar URL
   */
  async updateUrl(newUrl) {
    const service = new SupabaseService('webhooks');
    
    const result = await service.update(this.id, {
      url: newUrl
    });

    this.url = result.url;
    return this;
  }

  /**
   * Actualizar secret
   */
  async updateSecret(newSecret) {
    const service = new SupabaseService('webhooks');
    
    const result = await service.update(this.id, {
      secret: newSecret
    });

    this.secret = result.secret;
    return this;
  }

  /**
   * Verificar si maneja un evento
   */
  handlesEvent(event) {
    return this.events.includes(event) || this.events.includes('*');
  }

  /**
   * Resetear contador de fallos
   */
  async resetFailures() {
    if (this.failureCount === 0) return this;

    const service = new SupabaseService('webhooks');
    
    const result = await service.update(this.id, {
      failure_count: 0
    });

    this.failureCount = 0;
    return this;
  }

  /**
   * Limpiar última respuesta
   */
  async clearLastResponse() {
    const service = new SupabaseService('webhooks');
    
    const result = await service.update(this.id, {
      last_response_body: null
    });

    this.lastResponseBody = null;
    return this;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('webhooks');

    const data = {
      user_id: this.userId,
      name: this.name,
      url: this.url,
      secret: this.secret,
      events: this.events,
      is_active: this.isActive,
      last_triggered_at: this.lastTriggeredAt,
      last_response_status: this.lastResponseStatus,
      last_response_body: this.lastResponseBody,
      failure_count: this.failureCount
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Webhook(result);
    } else {
      const result = await service.create(data);
      return new Webhook(result);
    }
  }

  /**
   * Convertir a objeto JSON (ocultando secret)
   */
  toJSON(includeSecret = false) {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      url: this.url,
      secret: includeSecret ? this.secret : undefined,
      hasSecret: this.hasSecret,
      events: this.events,
      eventsCount: this.eventsCount,
      hasEvents: this.hasEvents,
      isActive: this.isActive,
      active: this.active,
      lastTriggeredAt: this.lastTriggeredAt,
      hasBeenTriggered: this.hasBeenTriggered,
      timeSinceLastTrigger: this.timeSinceLastTrigger,
      lastResponseStatus: this.lastResponseStatus,
      lastCallSuccessful: this.lastCallSuccessful,
      failureCount: this.failureCount,
      hasConsecutiveFailures: this.hasConsecutiveFailures,
      shouldDisable: this.shouldDisable,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class WebhookModel {
  constructor() {
    this.service = new SupabaseService('webhooks');
    this.tableName = 'webhooks';
  }

  /**
   * Crear nuevo webhook
   */
  async create(data) {
    const webhookData = {
      user_id: data.userId,
      name: data.name,
      url: data.url,
      secret: data.secret || null,
      events: data.events || [],
      is_active: data.isActive !== false,
      last_triggered_at: null,
      last_response_status: null,
      last_response_body: null,
      failure_count: 0
    };

    const result = await this.service.create(webhookData);
    return new Webhook(result);
  }

  /**
   * Buscar todos los webhooks
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Webhook(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Webhook(result) : null;
  }

  /**
   * Buscar un webhook por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Webhook(result) : null;
  }

  /**
   * Buscar webhooks por usuario
   */
  async findByUser(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId }
    });
  }

  /**
   * Buscar webhooks activos de un usuario
   */
  async findActiveByUser(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        user_id: userId,
        is_active: true
      }
    });
  }

  /**
   * Buscar webhooks por evento
   */
  async findByEvent(event, userId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('webhooks')
      .select(options.select || '*')
      .eq('is_active', true)
      .or(`events.cs.{${event}},events.cs.{*}`);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Webhook(d));
  }

  /**
   * Buscar webhooks con fallos
   */
  async findWithFailures(userId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('webhooks')
      .select(options.select || '*')
      .gt('failure_count', 0);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Webhook(d));
  }

  /**
   * Buscar webhooks inactivos por fallos
   */
  async findDisabledByFailures(userId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('webhooks')
      .select(options.select || '*')
      .eq('is_active', false)
      .gte('failure_count', 5);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Webhook(d));
  }

  /**
   * Actualizar webhook
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.userId !== undefined) data.user_id = updateData.userId;
    if (updateData.name !== undefined) data.name = updateData.name;
    if (updateData.url !== undefined) data.url = updateData.url;
    if (updateData.secret !== undefined) data.secret = updateData.secret;
    if (updateData.events !== undefined) data.events = updateData.events;
    if (updateData.isActive !== undefined) data.is_active = updateData.isActive;
    if (updateData.lastTriggeredAt !== undefined) data.last_triggered_at = updateData.lastTriggeredAt;
    if (updateData.lastResponseStatus !== undefined) data.last_response_status = updateData.lastResponseStatus;
    if (updateData.lastResponseBody !== undefined) data.last_response_body = updateData.lastResponseBody;
    if (updateData.failureCount !== undefined) data.failure_count = updateData.failureCount;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Webhook(result) : null;
  }

  /**
   * Eliminar webhook
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Webhook(result) : null;
  }

  /**
   * Contar webhooks
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
      data: result.data.map(data => new Webhook(data))
    };
  }

  /**
   * Obtener estadísticas de webhooks de un usuario
   */
  async getStats(userId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, activeResult, inactiveResult, withFailuresResult] = await Promise.all([
      supabase.from('webhooks').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('webhooks').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
      supabase.from('webhooks').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', false),
      supabase.from('webhooks').select('*', { count: 'exact', head: true }).eq('user_id', userId).gt('failure_count', 0)
    ]);

    return {
      total: totalResult.count || 0,
      active: activeResult.count || 0,
      inactive: inactiveResult.count || 0,
      withFailures: withFailuresResult.count || 0
    };
  }

  /**
   * Generar secret aleatorio
   */
  generateSecret(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = '';
    for (let i = 0; i < length; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `whsec_${secret}`;
  }

  /**
   * Verificar firma de webhook
   */
  verifySignature(payload, signature, secret) {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload), 'utf8')
      .digest('hex');
    
    return signature === expectedSignature;
  }
}

module.exports = new WebhookModel();
module.exports.Webhook = Webhook;
module.exports.WebhookModel = WebhookModel;
