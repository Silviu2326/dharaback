/**
 * Modelo VerificationDocument migrado a Supabase
 * Reemplaza el modelo Mongoose de VerificationDocument
 * Mantiene compatibilidad con la API anterior
 */

const SupabaseService = require('../../services/supabaseService');

class VerificationDocument {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.type = data.type || 'other';
    this.documentNumber = data.document_number;
    this.issuingBody = data.issuing_body;
    this.issueDate = data.issue_date;
    this.expiryDate = data.expiry_date;
    this.status = data.status || 'pending';
    this.fileUrl = data.file_url;
    this.notes = data.notes;
    this.reviewedBy = data.reviewed_by;
    this.reviewedAt = data.reviewed_at;
    this.rejectionReason = data.rejection_reason;
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
   * Virtual: Días hasta expiración
   */
  get daysUntilExpiry() {
    if (!this.expiryDate) return null;
    const expiry = new Date(this.expiryDate);
    const now = new Date();
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Virtual: Está expirado
   */
  get isExpired() {
    if (!this.expiryDate) return false;
    return new Date(this.expiryDate) < new Date();
  }

  /**
   * Virtual: Expira pronto (en menos de 30 días)
   */
  get isExpiringSoon() {
    const days = this.daysUntilExpiry;
    return days !== null && days >= 0 && days <= 30;
  }

  /**
   * Virtual: Tamaño de archivo en formato humano
   */
  get humanFileSize() {
    const size = this._data?.file_size || 0;
    if (size === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('verification_documents');

    const data = {
      user_id: this.userId,
      type: this.type,
      document_number: this.documentNumber,
      issuing_body: this.issuingBody,
      issue_date: this.issueDate,
      expiry_date: this.expiryDate,
      status: this.status,
      file_url: this.fileUrl,
      notes: this.notes,
      reviewed_by: this.reviewedBy,
      reviewed_at: this.reviewedAt,
      rejection_reason: this.rejectionReason
    };

    if (this.id) {
      // Actualizar
      const result = await service.update(this.id, data);
      return new VerificationDocument(result);
    } else {
      // Crear
      const result = await service.create(data);
      return new VerificationDocument(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      type: this.type,
      documentNumber: this.documentNumber,
      issuingBody: this.issuingBody,
      issueDate: this.issueDate,
      expiryDate: this.expiryDate,
      status: this.status,
      fileUrl: this.fileUrl,
      notes: this.notes,
      reviewedBy: this.reviewedBy,
      reviewedAt: this.reviewedAt,
      rejectionReason: this.rejectionReason,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Incluir virtuals
      daysUntilExpiry: this.daysUntilExpiry,
      isExpired: this.isExpired,
      isExpiringSoon: this.isExpiringSoon,
      humanFileSize: this.humanFileSize
    };
  }

  /**
   * Enviar documento para revisión
   */
  async submitForReview() {
    this.status = 'pending';
    this.reviewedBy = null;
    this.reviewedAt = null;
    this.rejectionReason = null;
    return await this.save();
  }

  /**
   * Aprobar documento
   */
  async approve(reviewerId) {
    this.status = 'approved';
    this.reviewedBy = reviewerId;
    this.reviewedAt = new Date().toISOString();
    this.rejectionReason = null;
    return await this.save();
  }

  /**
   * Rechazar documento
   */
  async reject(reviewerId, reason) {
    this.status = 'rejected';
    this.reviewedBy = reviewerId;
    this.reviewedAt = new Date().toISOString();
    this.rejectionReason = reason;
    return await this.save();
  }

  /**
   * Solicitar cambios en el documento
   */
  async requestChanges(reviewerId, notes) {
    this.status = 'pending';
    this.reviewedBy = reviewerId;
    this.reviewedAt = new Date().toISOString();
    this.notes = notes;
    return await this.save();
  }

  /**
   * Registrar acceso al documento
   */
  async trackAccess(accessedBy) {
    const supabase = require('../../config/supabase').supabase;

    const { error } = await supabase
      .from('document_access_logs')
      .insert({
        document_id: this.id,
        user_id: this.userId,
        accessed_by: accessedBy,
        accessed_at: new Date().toISOString()
      });

    if (error) throw new Error(error.message);
    return this;
  }

  /**
   * Verificar si necesita renovación
   */
  needsRenewal(daysThreshold = 30) {
    if (!this.expiryDate) return false;
    const days = this.daysUntilExpiry;
    return days !== null && days <= daysThreshold;
  }
}

/**
 * Métodos estáticos
 */
class VerificationDocumentModel {
  constructor() {
    this.service = new SupabaseService('verification_documents');
    this.tableName = 'verification_documents';
  }

  /**
   * Crear nuevo documento de verificación
   */
  async create(data) {
    const documentData = {
      user_id: data.userId,
      type: data.type || 'other',
      document_number: data.documentNumber,
      issuing_body: data.issuingBody,
      issue_date: data.issueDate,
      expiry_date: data.expiryDate,
      status: data.status || 'pending',
      file_url: data.fileUrl,
      notes: data.notes,
      reviewed_by: data.reviewedBy,
      reviewed_at: data.reviewedAt,
      rejection_reason: data.rejectionReason
    };

    const result = await this.service.create(documentData);
    return new VerificationDocument(result);
  }

  /**
   * Buscar todos los documentos
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new VerificationDocument(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new VerificationDocument(result) : null;
  }

  /**
   * Buscar uno por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new VerificationDocument(result) : null;
  }

  /**
   * Actualizar documento
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    // Mapear campos de camelCase a snake_case
    if (updateData.userId) data.user_id = updateData.userId;
    if (updateData.type) data.type = updateData.type;
    if (updateData.documentNumber !== undefined) data.document_number = updateData.documentNumber;
    if (updateData.issuingBody !== undefined) data.issuing_body = updateData.issuingBody;
    if (updateData.issueDate) data.issue_date = updateData.issueDate;
    if (updateData.expiryDate !== undefined) data.expiry_date = updateData.expiryDate;
    if (updateData.status) data.status = updateData.status;
    if (updateData.fileUrl !== undefined) data.file_url = updateData.fileUrl;
    if (updateData.notes !== undefined) data.notes = updateData.notes;
    if (updateData.reviewedBy !== undefined) data.reviewed_by = updateData.reviewedBy;
    if (updateData.reviewedAt) data.reviewed_at = updateData.reviewedAt;
    if (updateData.rejectionReason !== undefined) data.rejection_reason = updateData.rejectionReason;

    const result = await this.service.update(id, data);
    return options.new !== false ? new VerificationDocument(result) : null;
  }

  /**
   * Eliminar documento
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new VerificationDocument(result) : null;
  }

  /**
   * Contar documentos
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
      data: result.data.map(data => new VerificationDocument(data))
    };
  }

  /**
   * Obtener documentos por estado
   */
  async getByStatus(status, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, status }
    });
  }

  /**
   * Obtener documentos que expiran pronto
   */
  async getExpiringDocuments(daysThreshold = 30, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    let query = supabase
      .from(this.tableName)
      .select(options.select || '*')
      .lte('expiry_date', thresholdDate.toISOString())
      .gte('expiry_date', new Date().toISOString());

    if (options.userId) {
      query = query.eq('user_id', options.userId);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new VerificationDocument(d));
  }

  /**
   * Obtener estadísticas de verificación
   */
  async getVerificationStats(userId = null) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from(this.tableName)
      .select('status', { count: 'exact' });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const statuses = ['pending', 'approved', 'rejected'];
    const stats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      byType: {}
    };

    // Contar por estado
    for (const status of statuses) {
      let statusQuery = supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('status', status);

      if (userId) {
        statusQuery = statusQuery.eq('user_id', userId);
      }

      const { count } = await statusQuery;
      stats[status] = count || 0;
      stats.total += count || 0;
    }

    // Contar por tipo
    const types = ['degree', 'license', 'certification', 'insurance', 'id', 'other'];
    for (const type of types) {
      let typeQuery = supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('type', type);

      if (userId) {
        typeQuery = typeQuery.eq('user_id', userId);
      }

      const { count } = await typeQuery;
      if (count > 0) {
        stats.byType[type] = count;
      }
    }

    return stats;
  }

  /**
   * Buscar documentos por usuario
   */
  async findByUser(userId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, user_id: userId }
    });
  }

  /**
   * Buscar documentos por tipo
   */
  async findByType(type, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, type }
    });
  }
}

// Exportar instancia singleton
module.exports = new VerificationDocumentModel();
module.exports.VerificationDocument = VerificationDocument;
module.exports.VerificationDocumentModel = VerificationDocumentModel;
