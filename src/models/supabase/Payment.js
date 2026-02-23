/**
 * Modelo Payment migrado a Supabase
 * Reemplaza el modelo Mongoose de Payment
 * Gestiona pagos de clientes a terapeutas
 */

const SupabaseService = require('../../services/supabaseService');

class Payment {
  constructor(data = {}) {
    this.id = data.id;
    this.bookingId = data.booking_id;
    this.clientId = data.client_id;
    this.therapistId = data.therapistId;
    this.amount = parseFloat(data.amount) || 0;
    this.currency = data.currency || 'EUR';
    this.status = data.status || 'pending';
    this.method = data.method;
    this.stripePaymentIntentId = data.stripe_payment_intent_id;
    this.stripeChargeId = data.stripe_charge_id;
    this.description = data.description;
    this.metadata = data.metadata || {};
    this.refundedAmount = parseFloat(data.refunded_amount) || 0;
    this.refundReason = data.refund_reason;
    this.netAmount = parseFloat(data.net_amount) || 0;
    this.platformFee = parseFloat(data.platform_fee) || 0;
    this.paidAt = data.paid_at;
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
   * Virtual: ¿El pago está pendiente?
   */
  get isPending() {
    return this.status === 'pending';
  }

  /**
   * Virtual: ¿El pago está completado?
   */
  get isCompleted() {
    return this.status === 'completed';
  }

  /**
   * Virtual: ¿El pago falló?
   */
  get isFailed() {
    return this.status === 'failed';
  }

  /**
   * Virtual: ¿El pago fue reembolsado totalmente?
   */
  get isFullyRefunded() {
    return this.status === 'refunded';
  }

  /**
   * Virtual: ¿El pago fue reembolsado parcialmente?
   */
  get isPartiallyRefunded() {
    return this.status === 'partial_refund';
  }

  /**
   * Virtual: ¿El pago tiene algún reembolso?
   */
  get hasRefund() {
    return this.refundedAmount > 0;
  }

  /**
   * Virtual: Monto disponible para reembolso
   */
  get refundableAmount() {
    return Math.max(0, this.amount - this.refundedAmount);
  }

  /**
   * Virtual: Monto que recibe el terapeuta
   */
  get therapistAmount() {
    return this.netAmount || (this.amount - this.platformFee);
  }

  /**
   * Virtual: ¿El pago fue procesado por Stripe?
   */
  get isStripePayment() {
    return !!this.stripePaymentIntentId;
  }

  /**
   * Virtual: Formato del monto con moneda
   */
  get formattedAmount() {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: this.currency
    }).format(this.amount);
  }

  /**
   * Marcar pago como completado
   */
  async markAsCompleted() {
    const service = new SupabaseService('payments');
    
    const result = await service.update(this.id, {
      status: 'completed',
      paid_at: new Date().toISOString()
    });

    this.status = 'completed';
    this.paidAt = result.paid_at;
    return this;
  }

  /**
   * Marcar pago como fallido
   */
  async markAsFailed(reason = null) {
    const service = new SupabaseService('payments');
    
    const data = { status: 'failed' };
    if (reason) {
      data.metadata = {
        ...this.metadata,
        failureReason: reason
      };
    }

    const result = await service.update(this.id, data);
    this.status = 'failed';
    if (reason) this.metadata = result.metadata;
    return this;
  }

  /**
   * Procesar reembolso
   */
  async refund(amount = null, reason = null) {
    const refundAmount = amount || this.amount;
    
    if (refundAmount > this.refundableAmount) {
      throw new Error('El monto a reembolsar excede el monto disponible');
    }

    const service = new SupabaseService('payments');
    
    const newRefundedAmount = this.refundedAmount + refundAmount;
    const newStatus = newRefundedAmount >= this.amount ? 'refunded' : 'partial_refund';

    const data = {
      status: newStatus,
      refunded_amount: newRefundedAmount
    };

    if (reason) {
      data.refund_reason = reason;
    }

    // Agregar al historial de reembolsos en metadata
    const refundHistory = this.metadata?.refundHistory || [];
    refundHistory.push({
      amount: refundAmount,
      reason,
      date: new Date().toISOString()
    });
    data.metadata = {
      ...this.metadata,
      refundHistory
    };

    const result = await service.update(this.id, data);
    
    this.status = result.status;
    this.refundedAmount = parseFloat(result.refunded_amount);
    this.refundReason = result.refund_reason;
    this.metadata = result.metadata;
    
    return this;
  }

  /**
   * Calcular y establecer la comisión de la plataforma
   */
  async calculatePlatformFee(percentage = 10) {
    const fee = (this.amount * percentage) / 100;
    const netAmount = this.amount - fee;

    const service = new SupabaseService('payments');
    
    const result = await service.update(this.id, {
      platform_fee: fee,
      net_amount: netAmount
    });

    this.platformFee = parseFloat(result.platform_fee);
    this.netAmount = parseFloat(result.net_amount);
    return this;
  }

  /**
   * Agregar metadata de Stripe
   */
  async setStripeData(paymentIntentId, chargeId = null) {
    const service = new SupabaseService('payments');
    
    const data = {
      stripe_payment_intent_id: paymentIntentId
    };
    if (chargeId) {
      data.stripe_charge_id = chargeId;
    }

    const result = await service.update(this.id, data);
    
    this.stripePaymentIntentId = result.stripe_payment_intent_id;
    this.stripeChargeId = result.stripe_charge_id;
    return this;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('payments');

    const data = {
      booking_id: this.bookingId,
      client_id: this.clientId,
      therapistId: this.therapistId,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      method: this.method,
      stripe_payment_intent_id: this.stripePaymentIntentId,
      stripe_charge_id: this.stripeChargeId,
      description: this.description,
      metadata: this.metadata,
      refunded_amount: this.refundedAmount,
      refund_reason: this.refundReason,
      net_amount: this.netAmount,
      platform_fee: this.platformFee,
      paid_at: this.paidAt
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Payment(result);
    } else {
      const result = await service.create(data);
      return new Payment(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      bookingId: this.bookingId,
      clientId: this.clientId,
      therapistId: this.therapistId,
      amount: this.amount,
      formattedAmount: this.formattedAmount,
      currency: this.currency,
      status: this.status,
      isPending: this.isPending,
      isCompleted: this.isCompleted,
      isFailed: this.isFailed,
      isFullyRefunded: this.isFullyRefunded,
      isPartiallyRefunded: this.isPartiallyRefunded,
      hasRefund: this.hasRefund,
      refundableAmount: this.refundableAmount,
      method: this.method,
      stripePaymentIntentId: this.stripePaymentIntentId,
      stripeChargeId: this.stripeChargeId,
      description: this.description,
      metadata: this.metadata,
      refundedAmount: this.refundedAmount,
      refundReason: this.refundReason,
      netAmount: this.netAmount,
      platformFee: this.platformFee,
      therapistAmount: this.therapistAmount,
      isStripePayment: this.isStripePayment,
      paidAt: this.paidAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class PaymentModel {
  constructor() {
    this.service = new SupabaseService('payments');
    this.tableName = 'payments';
  }

  /**
   * Crear nuevo pago
   */
  async create(data) {
    const paymentData = {
      booking_id: data.bookingId || null,
      client_id: data.clientId,
      therapistId: data.therapistId,
      amount: data.amount,
      currency: data.currency || 'EUR',
      status: data.status || 'pending',
      method: data.method,
      stripe_payment_intent_id: data.stripePaymentIntentId,
      stripe_charge_id: data.stripeChargeId,
      description: data.description,
      metadata: data.metadata || {},
      refunded_amount: data.refundedAmount || 0,
      refund_reason: data.refundReason,
      net_amount: data.netAmount,
      platform_fee: data.platformFee || 0,
      paid_at: data.paidAt || null
    };

    const result = await this.service.create(paymentData);
    return new Payment(result);
  }

  /**
   * Buscar todos los pagos
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Payment(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Payment(result) : null;
  }

  /**
   * Buscar un pago por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Payment(result) : null;
  }

  /**
   * Buscar pago por Payment Intent de Stripe
   */
  async findByStripePaymentIntent(paymentIntentId) {
    return await this.findOne({
      stripe_payment_intent_id: paymentIntentId
    });
  }

  /**
   * Buscar pagos por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapistId: therapistId }
    });
  }

  /**
   * Buscar pagos por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Buscar pagos por reserva
   */
  async findByBooking(bookingId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, booking_id: bookingId }
    });
  }

  /**
   * Buscar pagos por estado
   */
  async findByStatus(status, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, status }
    });
  }

  /**
   * Buscar pagos completados de un terapeuta
   */
  async findCompletedByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapistId: therapistId,
        status: 'completed'
      }
    });
  }

  /**
   * Buscar pagos pendientes
   */
  async findPending(options = {}) {
    return await this.findByStatus('pending', options);
  }

  /**
   * Buscar pagos con reembolsos
   */
  async findWithRefunds(therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('payments')
      .select(options.select || '*')
      .gt('refunded_amount', 0);

    if (therapistId) {
      query = query.eq('therapistId', therapistId);
    }

    query = query.order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Payment(d));
  }

  /**
   * Buscar pagos por rango de fechas
   */
  async findByDateRange(startDate, endDate, therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('payments')
      .select(options.select || '*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (therapistId) {
      query = query.eq('therapistId', therapistId);
    }

    if (options.status) {
      query = query.eq('status', options.status);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Payment(d));
  }

  /**
   * Actualizar pago
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.bookingId !== undefined) data.booking_id = updateData.bookingId;
    if (updateData.clientId !== undefined) data.client_id = updateData.clientId;
    if (updateData.therapistId !== undefined) data.therapistId = updateData.therapistId;
    if (updateData.amount !== undefined) data.amount = updateData.amount;
    if (updateData.currency !== undefined) data.currency = updateData.currency;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.method !== undefined) data.method = updateData.method;
    if (updateData.stripePaymentIntentId !== undefined) data.stripe_payment_intent_id = updateData.stripePaymentIntentId;
    if (updateData.stripeChargeId !== undefined) data.stripe_charge_id = updateData.stripeChargeId;
    if (updateData.description !== undefined) data.description = updateData.description;
    if (updateData.metadata !== undefined) data.metadata = updateData.metadata;
    if (updateData.refundedAmount !== undefined) data.refunded_amount = updateData.refundedAmount;
    if (updateData.refundReason !== undefined) data.refund_reason = updateData.refundReason;
    if (updateData.netAmount !== undefined) data.net_amount = updateData.netAmount;
    if (updateData.platformFee !== undefined) data.platform_fee = updateData.platformFee;
    if (updateData.paidAt !== undefined) data.paid_at = updateData.paidAt;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Payment(result) : null;
  }

  /**
   * Eliminar pago
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Payment(result) : null;
  }

  /**
   * Contar pagos
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
      data: result.data.map(data => new Payment(data))
    };
  }

  /**
   * Obtener estadísticas de pagos de un terapeuta
   */
  async getStats(therapistId, startDate = null, endDate = null) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('payments')
      .select('*')
      .eq('therapistId', therapistId);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const payments = (data || []).map(d => new Payment(d));

    const completed = payments.filter(p => p.isCompleted);
    const pending = payments.filter(p => p.isPending);
    const failed = payments.filter(p => p.isFailed);
    const refunded = payments.filter(p => p.hasRefund);

    const totalAmount = completed.reduce((sum, p) => sum + p.amount, 0);
    const totalRefunded = payments.reduce((sum, p) => sum + p.refundedAmount, 0);
    const totalPlatformFees = completed.reduce((sum, p) => sum + p.platformFee, 0);
    const totalNetAmount = completed.reduce((sum, p) => sum + (p.netAmount || p.amount - p.platformFee), 0);

    return {
      total: payments.length,
      completed: completed.length,
      pending: pending.length,
      failed: failed.length,
      refunded: refunded.length,
      totalAmount,
      totalRefunded,
      totalPlatformFees,
      totalNetAmount,
      averageAmount: completed.length > 0 ? totalAmount / completed.length : 0
    };
  }

  /**
   * Obtener ingresos por mes
   */
  async getMonthlyRevenue(therapistId, months = 12) {
    const supabase = require('../../config/supabase').supabase;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data, error } = await supabase
      .from('payments')
      .select('amount, net_amount, platform_fee, created_at, status')
      .eq('therapistId', therapistId)
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString());

    if (error) throw new Error(error.message);

    // Agrupar por mes
    const monthly = {};
    
    (data || []).forEach(payment => {
      const date = new Date(payment.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthly[key]) {
        monthly[key] = {
          total: 0,
          net: 0,
          fees: 0,
          count: 0
        };
      }
      
      monthly[key].total += parseFloat(payment.amount);
      monthly[key].net += parseFloat(payment.net_amount || payment.amount - payment.platform_fee);
      monthly[key].fees += parseFloat(payment.platform_fee || 0);
      monthly[key].count += 1;
    });

    return Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({
        month,
        ...stats
      }));
  }
}

module.exports = new PaymentModel();
module.exports.Payment = Payment;
module.exports.PaymentModel = PaymentModel;
