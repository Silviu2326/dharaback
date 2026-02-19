/**
 * Modelo AuditLog migrado a Supabase
 * Reemplaza el modelo Mongoose de AuditLog
 * Gestiona logs de auditoría para trazabilidad de acciones
 */

const SupabaseService = require('../../services/supabaseService');

class AuditLog {
  constructor(data = {}) {
    this.id = data.id;
    this.action = data.action;
    this.entityType = data.entity_type;
    this.entityId = data.entity_id;
    this.userId = data.user_id;
    this.details = data.details || {};
    this.ipAddress = data.ip_address;
    this.userAgent = data.user_agent;
    this.createdAt = data.created_at;

    // Campos raw de la base de datos
    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Virtual: ¿Tiene detalles adicionales?
   */
  get hasDetails() {
    return this.details && Object.keys(this.details).length > 0;
  }

  /**
   * Virtual: ¿Está asociado a un usuario?
   */
  get hasUser() {
    return !!this.userId;
  }

  /**
   * Virtual: ¿Tiene información de IP?
   */
  get hasIpAddress() {
    return !!this.ipAddress;
  }

  /**
   * Virtual: Descripción legible de la acción
   */
  get actionDescription() {
    const descriptions = {
      'create': 'Creación',
      'update': 'Actualización',
      'delete': 'Eliminación',
      'view': 'Visualización',
      'login': 'Inicio de sesión',
      'logout': 'Cierre de sesión',
      'export': 'Exportación',
      'import': 'Importación',
      'download': 'Descarga',
      'share': 'Compartir',
      'assign': 'Asignación',
      'complete': 'Completado',
      'cancel': 'Cancelación',
      'approve': 'Aprobación',
      'reject': 'Rechazo',
      'verify': 'Verificación',
      'archive': 'Archivado',
      'restore': 'Restauración'
    };
    return descriptions[this.action] || this.action;
  }

  /**
   * Virtual: Nombre legible del tipo de entidad
   */
  get entityTypeName() {
    const names = {
      'user': 'Usuario',
      'client': 'Cliente',
      'booking': 'Cita',
      'payment': 'Pago',
      'document': 'Documento',
      'note': 'Nota',
      'review': 'Reseña',
      'message': 'Mensaje',
      'conversation': 'Conversación',
      'subscription': 'Suscripción',
      'plan': 'Plan',
      'report': 'Reporte',
      'setting': 'Configuración'
    };
    return names[this.entityType] || this.entityType;
  }

  /**
   * Virtual: Formato de fecha
   */
  get formattedDate() {
    if (!this.createdAt) return null;
    return new Date(this.createdAt).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Obtener información del usuario
   */
  async getUser() {
    if (!this.userId) return null;
    
    const User = require('./User');
    return await User.findById(this.userId);
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      action: this.action,
      actionDescription: this.actionDescription,
      entityType: this.entityType,
      entityTypeName: this.entityTypeName,
      entityId: this.entityId,
      userId: this.userId,
      hasUser: this.hasUser,
      details: this.details,
      hasDetails: this.hasDetails,
      ipAddress: this.ipAddress,
      hasIpAddress: this.hasIpAddress,
      userAgent: this.userAgent,
      createdAt: this.createdAt,
      formattedDate: this.formattedDate
    };
  }
}

/**
 * Métodos estáticos
 */
class AuditLogModel {
  constructor() {
    this.service = new SupabaseService('audit_logs');
    this.tableName = 'audit_logs';
  }

  /**
   * Crear nuevo log de auditoría
   */
  async create(data) {
    const logData = {
      action: data.action,
      entity_type: data.entityType,
      entity_id: data.entityId,
      user_id: data.userId || null,
      details: data.details || {},
      ip_address: data.ipAddress || null,
      user_agent: data.userAgent || null
    };

    const result = await this.service.create(logData);
    return new AuditLog(result);
  }

  /**
   * Buscar todos los logs
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new AuditLog(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new AuditLog(result) : null;
  }

  /**
   * Buscar un log por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new AuditLog(result) : null;
  }

  /**
   * Buscar logs por usuario
   */
  async findByUser(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId }
    });
  }

  /**
   * Buscar logs por acción
   */
  async findByAction(action, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, action }
    });
  }

  /**
   * Buscar logs por tipo de entidad
   */
  async findByEntityType(entityType, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, entity_type: entityType }
    });
  }

  /**
   * Buscar logs por entidad específica
   */
  async findByEntity(entityType, entityId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        entity_type: entityType,
        entity_id: entityId
      }
    });
  }

  /**
   * Buscar logs por rango de fechas
   */
  async findByDateRange(startDate, endDate, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('audit_logs')
      .select(options.select || '*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (options.userId) {
      query = query.eq('user_id', options.userId);
    }

    if (options.action) {
      query = query.eq('action', options.action);
    }

    query = query.order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new AuditLog(d));
  }

  /**
   * Buscar logs recientes
   */
  async findRecent(limit = 50, options = {}) {
    return await this.find({
      ...options,
      limit,
      orderBy: 'created_at',
      ascending: false
    });
  }

  /**
   * Buscar logs de creación
   */
  async findCreations(options = {}) {
    return await this.findByAction('create', options);
  }

  /**
   * Buscar logs de actualización
   */
  async findUpdates(options = {}) {
    return await this.findByAction('update', options);
  }

  /**
   * Buscar logs de eliminación
   */
  async findDeletions(options = {}) {
    return await this.findByAction('delete', options);
  }

  /**
   * Buscar logs de autenticación
   */
  async findAuthLogs(userId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('audit_logs')
      .select(options.select || '*')
      .in('action', ['login', 'logout', 'password_change', 'password_reset']);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    query = query.order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new AuditLog(d));
  }

  /**
   * Contar logs
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
      data: result.data.map(data => new AuditLog(data))
    };
  }

  /**
   * Obtener estadísticas de logs
   */
  async getStats(startDate = null, endDate = null) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase.from('audit_logs').select('*');

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const logs = data || [];

    // Contar por acción
    const byAction = {};
    logs.forEach(log => {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
    });

    // Contar por tipo de entidad
    const byEntityType = {};
    logs.forEach(log => {
      byEntityType[log.entity_type] = (byEntityType[log.entity_type] || 0) + 1;
    });

    return {
      total: logs.length,
      byAction,
      byEntityType
    };
  }

  /**
   * Eliminar logs antiguos
   */
  async deleteOld(days = 90) {
    const supabase = require('../../config/supabase').supabase;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('audit_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) throw new Error(error.message);
    return data?.length || 0;
  }

  // ==================== Factory Methods ====================

  /**
   * Log de creación
   */
  async logCreate(entityType, entityId, userId, details = null, ipAddress = null, userAgent = null) {
    return await this.create({
      action: 'create',
      entityType,
      entityId,
      userId,
      details,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log de actualización
   */
  async logUpdate(entityType, entityId, userId, changes = null, ipAddress = null, userAgent = null) {
    return await this.create({
      action: 'update',
      entityType,
      entityId,
      userId,
      details: { changes },
      ipAddress,
      userAgent
    });
  }

  /**
   * Log de eliminación
   */
  async logDelete(entityType, entityId, userId, details = null, ipAddress = null, userAgent = null) {
    return await this.create({
      action: 'delete',
      entityType,
      entityId,
      userId,
      details,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log de login
   */
  async logLogin(userId, success = true, ipAddress = null, userAgent = null) {
    return await this.create({
      action: 'login',
      entityType: 'user',
      entityId: userId,
      userId,
      details: { success },
      ipAddress,
      userAgent
    });
  }

  /**
   * Log de logout
   */
  async logLogout(userId, ipAddress = null, userAgent = null) {
    return await this.create({
      action: 'logout',
      entityType: 'user',
      entityId: userId,
      userId,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log de visualización
   */
  async logView(entityType, entityId, userId, ipAddress = null, userAgent = null) {
    return await this.create({
      action: 'view',
      entityType,
      entityId,
      userId,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log de exportación
   */
  async logExport(entityType, userId, format, recordCount, ipAddress = null, userAgent = null) {
    return await this.create({
      action: 'export',
      entityType,
      entityId: null,
      userId,
      details: { format, recordCount },
      ipAddress,
      userAgent
    });
  }
}

module.exports = new AuditLogModel();
module.exports.AuditLog = AuditLog;
module.exports.AuditLogModel = AuditLogModel;
