/**
 * Modelo Document migrado a Supabase
 * Reemplaza el modelo Mongoose de Document
 * Gestiona documentos y archivos de terapeutas
 */

const SupabaseService = require('../../services/supabaseService');

class Document {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.clientId = data.client_id;
    this.filename = data.filename;
    this.originalName = data.original_name;
    this.mimeType = data.mime_type;
    this.size = data.size || 0;
    this.path = data.path;
    this.supabaseUrl = data.supabase_url;
    this.isPublic = data.is_public || false;
    this.category = data.category || 'general';
    this.description = data.description;
    this.metadata = data.metadata || {};
    this.accessLog = data.access_log || [];
    this.expiresAt = data.expires_at;
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
   * Virtual: Extensión del archivo
   */
  get extension() {
    if (!this.filename) return null;
    const parts = this.filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : null;
  }

  /**
   * Virtual: Tamaño legible para humanos
   */
  get humanFileSize() {
    const bytes = this.size || 0;
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Virtual: Antigüedad del documento
   */
  get documentAge() {
    if (!this.createdAt) return null;
    
    const created = new Date(this.createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSecs < 60) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
    if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    if (diffDays < 30) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
    if (diffMonths < 12) return `Hace ${diffMonths} mes${diffMonths > 1 ? 'es' : ''}`;
    return `Hace ${diffYears} año${diffYears > 1 ? 's' : ''}`;
  }

  /**
   * Virtual: ¿El documento ha expirado?
   */
  get isExpired() {
    if (!this.expiresAt) return false;
    return new Date(this.expiresAt) < new Date();
  }

  /**
   * Registrar acceso al documento
   */
  async trackAccess(userId, action = 'view') {
    const supabase = require('../../config/supabase').supabase;
    
    const accessEntry = {
      userId,
      action,
      timestamp: new Date().toISOString(),
      ip: null // Se puede agregar si está disponible en el contexto
    };

    const updatedLog = [...(this.accessLog || []), accessEntry];
    
    const { data, error } = await supabase
      .from('documents')
      .update({ access_log: updatedLog })
      .eq('id', this.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    this.accessLog = updatedLog;
    return this;
  }

  /**
   * Compartir documento con otro usuario
   */
  async shareWith(userId, permissions = { read: true, write: false }) {
    const supabase = require('../../config/supabase').supabase;
    
    const currentShares = this.metadata?.sharedWith || [];
    
    // Verificar si ya está compartido
    const existingIndex = currentShares.findIndex(s => s.userId === userId);
    
    const shareData = {
      userId,
      permissions,
      sharedAt: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      currentShares[existingIndex] = shareData;
    } else {
      currentShares.push(shareData);
    }

    const updatedMetadata = {
      ...this.metadata,
      sharedWith: currentShares
    };

    const { data, error } = await supabase
      .from('documents')
      .update({ metadata: updatedMetadata })
      .eq('id', this.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    this.metadata = updatedMetadata;
    return this;
  }

  /**
   * Revocar acceso a un usuario
   */
  async revokeAccess(userId) {
    const supabase = require('../../config/supabase').supabase;
    
    const currentShares = this.metadata?.sharedWith || [];
    const filteredShares = currentShares.filter(s => s.userId !== userId);

    const updatedMetadata = {
      ...this.metadata,
      sharedWith: filteredShares
    };

    const { data, error } = await supabase
      .from('documents')
      .update({ metadata: updatedMetadata })
      .eq('id', this.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    this.metadata = updatedMetadata;
    return this;
  }

  /**
   * Verificar permisos de un usuario sobre el documento
   */
  checkPermission(userId, requiredPermission = 'read') {
    // El propietario tiene todos los permisos
    if (this.userId === userId) {
      return true;
    }

    // Si es público y solo requiere lectura
    if (this.isPublic && requiredPermission === 'read') {
      return true;
    }

    // Verificar en lista de compartidos
    const shares = this.metadata?.sharedWith || [];
    const userShare = shares.find(s => s.userId === userId);

    if (!userShare) {
      return false;
    }

    if (requiredPermission === 'write') {
      return userShare.permissions?.write === true;
    }

    return userShare.permissions?.read === true;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('documents');

    // Preparar metadata con supabase_url
    let metadata = this.metadata || {};
    if (this.supabaseUrl) {
      metadata.supabaseUrl = this.supabaseUrl;
      metadata.storageType = 'supabase';
    }

    const data = {
      user_id: this.userId,
      client_id: this.clientId,
      filename: this.filename,
      original_name: this.originalName,
      mime_type: this.mimeType,
      size: this.size,
      path: this.path,
      is_public: this.isPublic,
      category: this.category,
      description: this.description,
      metadata: metadata,
      access_log: this.accessLog,
      expires_at: this.expiresAt
    };

    // Intentar agregar supabase_url si la columna existe
    try {
      data.supabase_url = this.supabaseUrl;
      
      if (this.id) {
        // Actualizar
        const result = await service.update(this.id, data);
        return new Document(result);
      } else {
        // Crear
        const result = await service.create(data);
        return new Document(result);
      }
    } catch (error) {
      // Si falla por columna inexistente, intentar sin supabase_url
      if (error.message && error.message.includes('supabase_url')) {
        delete data.supabase_url;
        
        if (this.id) {
          const result = await service.update(this.id, data);
          return new Document(result);
        } else {
          const result = await service.create(data);
          return new Document(result);
        }
      }
      throw error;
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
      filename: this.filename,
      originalName: this.originalName,
      mimeType: this.mimeType,
      size: this.size,
      humanFileSize: this.humanFileSize,
      extension: this.extension,
      path: this.path,
      supabaseUrl: this.supabaseUrl || this.metadata?.supabaseUrl,
      isPublic: this.isPublic,
      isExpired: this.isExpired,
      category: this.category,
      title: this.description,
      description: this.description,
      metadata: this.metadata,
      accessLog: this.accessLog,
      documentAge: this.documentAge,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class DocumentModel {
  constructor() {
    this.service = new SupabaseService('documents');
    this.tableName = 'documents';
  }

  /**
   * Crear nuevo documento
   */
  async create(data) {
    // Preparar metadata con supabase_url si existe
    let metadata = data.metadata || {};
    if (data.supabaseUrl) {
      metadata.supabaseUrl = data.supabaseUrl;
      metadata.storageType = 'supabase';
    }

    const documentData = {
      user_id: data.userId,
      client_id: data.clientId || null,
      filename: data.filename,
      original_name: data.originalName,
      mime_type: data.mimeType,
      size: data.size || 0,
      path: data.path,
      is_public: data.isPublic || false,
      category: data.category || 'general',
      description: data.description,
      metadata: metadata,
      access_log: data.accessLog || [],
      expires_at: data.expiresAt
    };

    // Intentar agregar supabase_url si la columna existe
    try {
      documentData.supabase_url = data.supabaseUrl;
      const result = await this.service.create(documentData);
      return new Document(result);
    } catch (error) {
      // Si falla por columna inexistente, intentar sin supabase_url
      if (error.message && error.message.includes('supabase_url')) {
        delete documentData.supabase_url;
        const result = await this.service.create(documentData);
        return new Document(result);
      }
      throw error;
    }
  }

  /**
   * Buscar todos los documentos
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Document(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Document(result) : null;
  }

  /**
   * Buscar uno por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Document(result) : null;
  }

  /**
   * Buscar documentos por usuario (terapeuta)
   */
  async findByUser(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId }
    });
  }

  /**
   * Buscar documentos por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Buscar documentos por usuario y cliente
   */
  async findByUserAndClient(userId, clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId, client_id: clientId }
    });
  }

  /**
   * Obtener documentos por categoría
   */
  async getByCategory(userId, category, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId, category }
    });
  }

  /**
   * Buscar documentos (por nombre o descripción)
   */
  async searchDocuments(userId, searchTerm, options = {}) {
    const supabase = require('../../config/supabase').supabase;
    
    let query = supabase
      .from('documents')
      .select(options.select || '*')
      .eq('user_id', userId)
      .or(`filename.ilike.%${searchTerm}%,original_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    if (options.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending !== false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).map(d => new Document(d));
  }

  /**
   * Actualizar documento
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};
    
    // Mapear campos de camelCase a snake_case
    if (updateData.userId !== undefined) data.user_id = updateData.userId;
    if (updateData.clientId !== undefined) data.client_id = updateData.clientId;
    if (updateData.filename !== undefined) data.filename = updateData.filename;
    if (updateData.originalName !== undefined) data.original_name = updateData.originalName;
    if (updateData.mimeType !== undefined) data.mime_type = updateData.mimeType;
    if (updateData.size !== undefined) data.size = updateData.size;
    if (updateData.path !== undefined) data.path = updateData.path;
    if (updateData.isPublic !== undefined) data.is_public = updateData.isPublic;
    if (updateData.category !== undefined) data.category = updateData.category;
    if (updateData.description !== undefined) data.description = updateData.description;
    if (updateData.metadata !== undefined) data.metadata = updateData.metadata;
    if (updateData.accessLog !== undefined) data.access_log = updateData.accessLog;
    if (updateData.expiresAt !== undefined) data.expires_at = updateData.expiresAt;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Document(result) : null;
  }

  /**
   * Eliminar documento
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Document(result) : null;
  }

  /**
   * Contar documentos
   */
  async count(filters = {}) {
    return await this.service.count(filters);
  }

  /**
   * Contar documentos por usuario
   */
  async countByUser(userId) {
    return await this.count({ user_id: userId });
  }

  /**
   * Contar documentos por cliente
   */
  async countByClient(clientId) {
    return await this.count({ client_id: clientId });
  }

  /**
   * Buscar con paginación
   */
  async paginate(options = {}) {
    const result = await this.service.paginate(options);
    return {
      ...result,
      data: result.data.map(data => new Document(data))
    };
  }

  /**
   * Obtener estadísticas de almacenamiento
   */
  async getStorageStats(userId) {
    const supabase = require('../../config/supabase').supabase;

    // Total de documentos
    const { count: totalDocuments } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Tamaño total usado
    const { data: sizeData } = await supabase
      .from('documents')
      .select('size')
      .eq('user_id', userId);

    const totalSize = sizeData?.reduce((sum, doc) => sum + (doc.size || 0), 0) || 0;

    // Documentos por categoría
    const { data: categoryData } = await supabase
      .from('documents')
      .select('category,size')
      .eq('user_id', userId);

    const byCategory = {};
    categoryData?.forEach(doc => {
      if (!byCategory[doc.category]) {
        byCategory[doc.category] = { count: 0, size: 0 };
      }
      byCategory[doc.category].count++;
      byCategory[doc.category].size += doc.size || 0;
    });

    // Documentos recientes (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { count: recentDocuments } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    // Documentos públicos
    const { count: publicDocuments } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_public', true);

    return {
      totalDocuments: totalDocuments || 0,
      totalSize,
      humanTotalSize: this._formatBytes(totalSize),
      byCategory,
      recentDocuments: recentDocuments || 0,
      publicDocuments: publicDocuments || 0
    };
  }

  /**
   * Formatear bytes a legible
   * @private
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Verificar si existe documento
   */
  async exists(filename, userId) {
    const count = await this.service.count({ filename, user_id: userId });
    return count > 0;
  }
}

// Exportar instancia singleton
module.exports = new DocumentModel();
module.exports.Document = Document;
module.exports.DocumentModel = DocumentModel;
