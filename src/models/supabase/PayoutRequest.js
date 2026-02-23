/**
 * Modelo PayoutRequest migrado a Supabase
 * Reemplaza el modelo Mongoose de PayoutRequest
 * Gestiona solicitudes de pago/retiro para terapeutas
 */

const SupabaseService = require('../../services/supabaseService');

class PayoutRequest {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapistId;
    this.amount = parseFloat(data.amount) || 0;
    this.currency = data.currency || 'EUR';
    this.status = data.status || 'pending';
    this.method = data.method;
    this.bankDetails = data.bank_details || {};
    this.processedAt = data.processed_at;
    this.processedBy = data.processed_by;
    this.notes = data.notes;
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
   * Virtual: ¿La solicitud está pendiente?
   */
  get isPending() {
    return this.status === 'pending';
  }

  /**
   * Virtual: ¿La solicitud está en proceso?
   */
  get isProcessing() {
    return this.status === 'processing';
  }

  /**
   * Virtual: ¿La solicitud está completada?
   */
  get isCompleted() {
    return this.status === 'completed';
  }

  /**
   * Virtual: ¿La solicitud fue rechazada?
   */
  get isRejected() {
    return this.status === 'rejected';
  }

  /**
   * Virtual: ¿La solicitud fue procesada (completada o rechazada)?
   */
  get isProcessed() {
    return this.isCompleted || this.isRejected;
  }

  /**
   * Virtual: Monto formateado con moneda
   */
  get formattedAmount() {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: this.currency
    }).format(this.amount);
  }

  /**
   * Virtual: Tiempo transcurrido desde la solicitud
   */
  get timeSinceRequest() {
    if (!this.createdAt) return null;

    const created = new Date(this.createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return created.toLocaleDateString('es-ES');
  }

  /**
   * Virtual: Tiempo de procesamiento
   */
  get processingTime() {
    if (!this.processedAt || !this.createdAt) return null;

    const created = new Date(this.createdAt);
    const processed = new Date(this.processedAt);
    const diffMs = processed - created;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 24) return `${diffHours} horas`;
    return `${diffDays} días`;
  }

  /**
   * Virtual: ¿Es transferencia bancaria?
   */
  get isBankTransfer() {
    return this.method === 'bank_transfer';
  }

  /**
   * Virtual: ¿Es PayPal?
   */
  get isPayPal() {
    return this.method === 'paypal';
  }

  /**
   * Virtual: ¿Es Stripe?
   */
  get isStripe() {
    return this.method === 'stripe';
  }

  /**
   * Marcar como en proceso
   */
  async markAsProcessing() {
    if (!this.isPending) {
      throw new Error('Solo las solicitudes pendientes pueden marcarse como en proceso');
    }

    const service = new SupabaseService('payout_requests');
    
    const result = await service.update(this.id, {
      status: 'processing'
    });

    this.status = 'processing';
    return this;
  }

  /**
   * Completar solicitud
   */
  async complete(processedBy = null) {
    if (!this.isPending && !this.isProcessing) {
      throw new Error('Solo las solicitudes pendientes o en proceso pueden completarse');
    }

    const service = new SupabaseService('payout_requests');
    
    const data = {
      status: 'completed',
      processed_at: new Date().toISOString()
    };
    if (processedBy) {
      data.processed_by = processedBy;
    }

    const result = await service.update(this.id, data);

    this.status = 'completed';
    this.processedAt = result.processed_at;
    if (processedBy) this.processedBy = result.processed_by;
    return this;
  }

  /**
   * Rechazar solicitud
   */
  async reject(reason, processedBy = null) {
    if (this.isCompleted) {
      throw new Error('No se puede rechazar una solicitud ya completada');
    }

    const service = new SupabaseService('payout_requests');
    
    const data = {
      status: 'rejected',
      rejection_reason: reason,
      processed_at: new Date().toISOString()
    };
    if (processedBy) {
      data.processed_by = processedBy;
    }

    const result = await service.update(this.id, data);

    this.status = 'rejected';
    this.rejectionReason = result.rejection_reason;
    this.processedAt = result.processed_at;
    if (processedBy) this.processedBy = result.processed_by;
    return this;
  }

  /**
   * Actualizar detalles bancarios
   */
  async updateBankDetails(details) {
    if (this.isProcessed) {
      throw new Error('No se pueden modificar los detalles de una solicitud procesada');
    }

    const service = new SupabaseService('payout_requests');
    
    const result = await service.update(this.id, {
      bank_details: { ...this.bankDetails, ...details }
    });

    this.bankDetails = result.bank_details;
    return this;
  }

  /**
   * Agregar nota
   */
  async addNote(note) {
    const service = new SupabaseService('payout_requests');
    
    const newNotes = this.notes 
      ? `${this.notes}\n${new Date().toLocaleString()}: ${note}`
      : `${new Date().toLocaleString()}: ${note}`;

    const result = await service.update(this.id, {
      notes: newNotes
    });

    this.notes = result.notes;
    return this;
  }

  /**
   * Cancelar solicitud (solo si está pendiente)
   */
  async cancel() {
    if (!this.isPending) {
      throw new Error('Solo las solicitudes pendientes pueden cancelarse');
    }

    const service = new SupabaseService('payout_requests');
    
    const result = await service.update(this.id, {
      status: 'rejected',
      rejection_reason: 'Cancelada por el terapeuta',
      processed_at: new Date().toISOString()
    });

    this.status = 'rejected';
    this.rejectionReason = result.rejection_reason;
    this.processedAt = result.processed_at;
    return this;
  }

  /**
   * Obtener información del terapeuta
   */
  async getTherapist() {
    const User = require('./User');
    return await User.findById(this.therapistId);
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('payout_requests');

    const data = {
      therapistId: this.therapistId,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      method: this.method,
      bank_details: this.bankDetails,
      processed_at: this.processedAt,
      processed_by: this.processedBy,
      notes: this.notes,
      rejection_reason: this.rejectionReason
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new PayoutRequest(result);
    } else {
      const result = await service.create(data);
      return new PayoutRequest(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      amount: this.amount,
      formattedAmount: this.formattedAmount,
      currency: this.currency,
      status: this.status,
      isPending: this.isPending,
      isProcessing: this.isProcessing,
      isCompleted: this.isCompleted,
      isRejected: this.isRejected,
      isProcessed: this.isProcessed,
      method: this.method,
      isBankTransfer: this.isBankTransfer,
      isPayPal: this.isPayPal,
      isStripe: this.isStripe,
      bankDetails: this.bankDetails,
      processedAt: this.processedAt,
      processedBy: this.processedBy,
      timeSinceRequest: this.timeSinceRequest,
      processingTime: this.processingTime,
      notes: this.notes,
      rejectionReason: this.rejectionReason,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class PayoutRequestModel {
  constructor() {
    this.service = new SupabaseService('payout_requests');
    this.tableName = 'payout_requests';
  }

  /**
   * Crear nueva solicitud de pago
   */
  async create(data) {
    // Validar que el monto sea positivo
    if (!data.amount || data.amount <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    const requestData = {
      therapistId: data.therapistId,
      amount: data.amount,
      currency: data.currency || 'EUR',
      status: 'pending',
      method: data.method,
      bank_details: data.bankDetails || {},
      notes: data.notes
    };

    const result = await this.service.create(requestData);
    return new PayoutRequest(result);
  }

  /**
   * Buscar todas las solicitudes
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new PayoutRequest(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new PayoutRequest(result) : null;
  }

  /**
   * Buscar una solicitud por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new PayoutRequest(result) : null;
  }

  /**
   * Buscar solicitudes por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapistId: therapistId }
    });
  }

  /**
   * Buscar solicitudes por estado
   */
  async findByStatus(status, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, status }
    });
  }

  /**
   * Buscar solicitudes pendientes
   */
  async findPending(options = {}) {
    return await this.findByStatus('pending', options);
  }

  /**
   * Buscar solicitudes en proceso
   */
  async findProcessing(options = {}) {
    return await this.findByStatus('processing', options);
  }

  /**
   * Buscar solicitudes completadas
   */
  async findCompleted(options = {}) {
    return await this.findByStatus('completed', options);
  }

  /**
   * Buscar solicitudes rechazadas
   */
  async findRejected(options = {}) {
    return await this.findByStatus('rejected', options);
  }

  /**
   * Buscar solicitudes pendientes de un terapeuta
   */
  async findPendingByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapistId: therapistId,
        status: 'pending'
      }
    });
  }

  /**
   * Buscar solicitudes por método de pago
   */
  async findByMethod(method, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, method }
    });
  }

  /**
   * Buscar solicitudes por rango de fechas
   */
  async findByDateRange(startDate, endDate, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('payout_requests')
      .select(options.select || '*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (options.therapistId) {
      query = query.eq('therapist_id', options.therapistId);
    }

    if (options.status) {
      query = query.eq('status', options.status);
    }

    query = query.order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new PayoutRequest(d));
  }

  /**
   * Actualizar solicitud
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.therapistId !== undefined) data.therapistId = updateData.therapistId;
    if (updateData.amount !== undefined) data.amount = updateData.amount;
    if (updateData.currency !== undefined) data.currency = updateData.currency;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.method !== undefined) data.method = updateData.method;
    if (updateData.bankDetails !== undefined) data.bank_details = updateData.bankDetails;
    if (updateData.processedAt !== undefined) data.processed_at = updateData.processedAt;
    if (updateData.processedBy !== undefined) data.processed_by = updateData.processedBy;
    if (updateData.notes !== undefined) data.notes = updateData.notes;
    if (updateData.rejectionReason !== undefined) data.rejection_reason = updateData.rejectionReason;

    const result = await this.service.update(id, data);
    return options.new !== false ? new PayoutRequest(result) : null;
  }

  /**
   * Eliminar solicitud
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new PayoutRequest(result) : null;
  }

  /**
   * Contar solicitudes
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
      data: result.data.map(data => new PayoutRequest(data))
    };
  }

  /**
   * Obtener estadísticas generales
   */
  async getStats() {
    const supabase = require('../../config/supabase').supabase;

    const [pendingResult, processingResult, completedResult, rejectedResult] = await Promise.all([
      supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('status', 'rejected')
    ]);

    // Montos totales
    const { data: completedAmounts } = await supabase
      .from('payout_requests')
      .select('amount')
      .eq('status', 'completed');

    const totalCompleted = (completedAmounts || []).reduce((sum, r) => sum + parseFloat(r.amount), 0);

    const { data: pendingAmounts } = await supabase
      .from('payout_requests')
      .select('amount')
      .eq('status', 'pending');

    const totalPending = (pendingAmounts || []).reduce((sum, r) => sum + parseFloat(r.amount), 0);

    return {
      total: (pendingResult.count || 0) + (processingResult.count || 0) + (completedResult.count || 0) + (rejectedResult.count || 0),
      pending: pendingResult.count || 0,
      processing: processingResult.count || 0,
      completed: completedResult.count || 0,
      rejected: rejectedResult.count || 0,
      totalCompleted,
      totalPending,
      formattedTotalCompleted: new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR'
      }).format(totalCompleted),
      formattedTotalPending: new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR'
      }).format(totalPending)
    };
  }

  /**
   * Obtener estadísticas de un terapeuta
   */
  async getStatsByTherapist(therapistId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, pendingResult, completedResult] = await Promise.all([
      supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId),
      supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('status', 'pending'),
      supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('status', 'completed')
    ]);

    // Monto total retirado
    const { data: amounts } = await supabase
      .from('payout_requests')
      .select('amount')
      .eq('therapist_id', therapistId)
      .eq('status', 'completed');

    const totalWithdrawn = (amounts || []).reduce((sum, r) => sum + parseFloat(r.amount), 0);

    return {
      total: totalResult.count || 0,
      pending: pendingResult.count || 0,
      completed: completedResult.count || 0,
      totalWithdrawn,
      formattedTotalWithdrawn: new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR'
      }).format(totalWithdrawn)
    };
  }

  /**
   * Verificar si un terapeuta tiene solicitudes pendientes
   */
  async hasPendingRequests(therapistId) {
    const count = await this.count({
      therapistId: therapistId,
      status: 'pending'
    });
    return count > 0;
  }
}

module.exports = new PayoutRequestModel();
module.exports.PayoutRequest = PayoutRequest;
module.exports.PayoutRequestModel = PayoutRequestModel;
