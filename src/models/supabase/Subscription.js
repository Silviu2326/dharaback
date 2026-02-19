/**
 * Modelo Subscription migrado a Supabase
 * Reemplaza el modelo Mongoose de Subscription
 * Gestiona suscripciones de terapeutas a la plataforma
 */

const SupabaseService = require('../../services/supabaseService');

class Subscription {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapist_id;
    this.stripeSubscriptionId = data.stripe_subscription_id;
    this.stripeCustomerId = data.stripe_customer_id;
    this.planType = data.plan_type;
    this.status = data.status || 'active';
    this.currentPeriodStart = data.current_period_start;
    this.currentPeriodEnd = data.current_period_end;
    this.cancelAtPeriodEnd = data.cancel_at_period_end || false;
    this.canceledAt = data.canceled_at;
    this.amount = parseFloat(data.amount) || 0;
    this.currency = data.currency || 'EUR';
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
   * Virtual: ¿La suscripción está activa?
   */
  get isActive() {
    return this.status === 'active';
  }

  /**
   * Virtual: ¿La suscripción está en período de prueba?
   */
  get isTrialing() {
    return this.status === 'trialing';
  }

  /**
   * Virtual: ¿La suscripción está cancelada?
   */
  get isCanceled() {
    return this.status === 'canceled' || this.canceledAt !== null;
  }

  /**
   * Virtual: ¿La suscripción tiene pago vencido?
   */
  get isPastDue() {
    return this.status === 'past_due';
  }

  /**
   * Virtual: ¿La suscripción está configurada para cancelarse al final del período?
   */
  get willCancelAtPeriodEnd() {
    return this.cancelAtPeriodEnd === true;
  }

  /**
   * Virtual: ¿El período actual ha terminado?
   */
  get isPeriodEnded() {
    if (!this.currentPeriodEnd) return false;
    return new Date(this.currentPeriodEnd) < new Date();
  }

  /**
   * Virtual: Días restantes en el período actual
   */
  get daysRemaining() {
    if (!this.currentPeriodEnd) return 0;
    const end = new Date(this.currentPeriodEnd);
    const now = new Date();
    const diffMs = end - now;
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  /**
   * Virtual: ¿El período actual está por terminar (menos de 7 días)?
   */
  get isAboutToExpire() {
    return this.daysRemaining > 0 && this.daysRemaining <= 7;
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
   * Virtual: Duración del período en días
   */
  get periodDurationDays() {
    if (!this.currentPeriodStart || !this.currentPeriodEnd) return 0;
    const start = new Date(this.currentPeriodStart);
    const end = new Date(this.currentPeriodEnd);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }

  /**
   * Activar suscripción
   */
  async activate() {
    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      status: 'active',
      cancel_at_period_end: false
    });

    this.status = 'active';
    this.cancelAtPeriodEnd = false;
    return this;
  }

  /**
   * Cancelar suscripción inmediatamente
   */
  async cancelImmediately() {
    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      cancel_at_period_end: false
    });

    this.status = 'canceled';
    this.canceledAt = result.canceled_at;
    this.cancelAtPeriodEnd = false;
    return this;
  }

  /**
   * Configurar cancelación al final del período
   */
  async cancelAtPeriodEnd() {
    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString()
    });

    this.cancelAtPeriodEnd = true;
    this.canceledAt = result.canceled_at;
    return this;
  }

  /**
   * Reactivar suscripción que estaba programada para cancelarse
   */
  async reactivate() {
    if (!this.willCancelAtPeriodEnd) {
      throw new Error('La suscripción no está programada para cancelarse');
    }

    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      cancel_at_period_end: false,
      canceled_at: null
    });

    this.cancelAtPeriodEnd = false;
    this.canceledAt = null;
    return this;
  }

  /**
   * Actualizar período actual
   */
  async updatePeriod(startDate, endDate) {
    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      current_period_start: startDate,
      current_period_end: endDate
    });

    this.currentPeriodStart = result.current_period_start;
    this.currentPeriodEnd = result.current_period_end;
    return this;
  }

  /**
   * Marcar como pago vencido
   */
  async markAsPastDue() {
    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      status: 'past_due'
    });

    this.status = 'past_due';
    return this;
  }

  /**
   * Marcar como no pagada
   */
  async markAsUnpaid() {
    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      status: 'unpaid'
    });

    this.status = 'unpaid';
    return this;
  }

  /**
   * Iniciar período de prueba
   */
  async startTrial(days = 14) {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      status: 'trialing',
      current_period_start: startDate.toISOString(),
      current_period_end: endDate.toISOString()
    });

    this.status = 'trialing';
    this.currentPeriodStart = result.current_period_start;
    this.currentPeriodEnd = result.current_period_end;
    return this;
  }

  /**
   * Cambiar plan
   */
  async changePlan(newPlanType, newAmount) {
    const service = new SupabaseService('subscriptions');
    
    const result = await service.update(this.id, {
      plan_type: newPlanType,
      amount: newAmount
    });

    this.planType = result.plan_type;
    this.amount = parseFloat(result.amount);
    return this;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('subscriptions');

    const data = {
      therapist_id: this.therapistId,
      stripe_subscription_id: this.stripeSubscriptionId,
      stripe_customer_id: this.stripeCustomerId,
      plan_type: this.planType,
      status: this.status,
      current_period_start: this.currentPeriodStart,
      current_period_end: this.currentPeriodEnd,
      cancel_at_period_end: this.cancelAtPeriodEnd,
      canceled_at: this.canceledAt,
      amount: this.amount,
      currency: this.currency,
      metadata: this.metadata
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Subscription(result);
    } else {
      const result = await service.create(data);
      return new Subscription(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      stripeSubscriptionId: this.stripeSubscriptionId,
      stripeCustomerId: this.stripeCustomerId,
      planType: this.planType,
      status: this.status,
      isActive: this.isActive,
      isTrialing: this.isTrialing,
      isCanceled: this.isCanceled,
      isPastDue: this.isPastDue,
      willCancelAtPeriodEnd: this.willCancelAtPeriodEnd,
      isPeriodEnded: this.isPeriodEnded,
      isAboutToExpire: this.isAboutToExpire,
      currentPeriodStart: this.currentPeriodStart,
      currentPeriodEnd: this.currentPeriodEnd,
      daysRemaining: this.daysRemaining,
      periodDurationDays: this.periodDurationDays,
      cancelAtPeriodEnd: this.cancelAtPeriodEnd,
      canceledAt: this.canceledAt,
      amount: this.amount,
      formattedAmount: this.formattedAmount,
      currency: this.currency,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class SubscriptionModel {
  constructor() {
    this.service = new SupabaseService('subscriptions');
    this.tableName = 'subscriptions';
  }

  /**
   * Crear nueva suscripción
   */
  async create(data) {
    const subscriptionData = {
      therapist_id: data.therapistId,
      stripe_subscription_id: data.stripeSubscriptionId,
      stripe_customer_id: data.stripeCustomerId,
      plan_type: data.planType,
      status: data.status || 'active',
      current_period_start: data.currentPeriodStart,
      current_period_end: data.currentPeriodEnd,
      cancel_at_period_end: data.cancelAtPeriodEnd || false,
      canceled_at: data.canceledAt || null,
      amount: data.amount,
      currency: data.currency || 'EUR',
      metadata: data.metadata || {}
    };

    const result = await this.service.create(subscriptionData);
    return new Subscription(result);
  }

  /**
   * Buscar todas las suscripciones
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Subscription(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Subscription(result) : null;
  }

  /**
   * Buscar una suscripción por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Subscription(result) : null;
  }

  /**
   * Buscar suscripción por ID de Stripe
   */
  async findByStripeSubscriptionId(stripeSubscriptionId) {
    return await this.findOne({
      stripe_subscription_id: stripeSubscriptionId
    });
  }

  /**
   * Buscar suscripción por terapeuta
   */
  async findByTherapist(therapistId) {
    return await this.findOne({ therapist_id: therapistId });
  }

  /**
   * Buscar suscripciones activas
   */
  async findActive(options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, status: 'active' }
    });
  }

  /**
   * Buscar suscripciones en prueba
   */
  async findTrialing(options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, status: 'trialing' }
    });
  }

  /**
   * Buscar suscripciones con pago vencido
   */
  async findPastDue(options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, status: 'past_due' }
    });
  }

  /**
   * Buscar suscripciones programadas para cancelarse
   */
  async findCancelingAtPeriodEnd(options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, cancel_at_period_end: true }
    });
  }

  /**
   * Buscar suscripciones que expiran pronto (menos de X días)
   */
  async findExpiringSoon(days = 7, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    let query = supabase
      .from('subscriptions')
      .select(options.select || '*')
      .lte('current_period_end', futureDate.toISOString())
      .gte('current_period_end', new Date().toISOString())
      .eq('cancel_at_period_end', false);

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Subscription(d));
  }

  /**
   * Buscar suscripciones por tipo de plan
   */
  async findByPlanType(planType, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, plan_type: planType }
    });
  }

  /**
   * Actualizar suscripción
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.therapistId !== undefined) data.therapist_id = updateData.therapistId;
    if (updateData.stripeSubscriptionId !== undefined) data.stripe_subscription_id = updateData.stripeSubscriptionId;
    if (updateData.stripeCustomerId !== undefined) data.stripe_customer_id = updateData.stripeCustomerId;
    if (updateData.planType !== undefined) data.plan_type = updateData.planType;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.currentPeriodStart !== undefined) data.current_period_start = updateData.currentPeriodStart;
    if (updateData.currentPeriodEnd !== undefined) data.current_period_end = updateData.currentPeriodEnd;
    if (updateData.cancelAtPeriodEnd !== undefined) data.cancel_at_period_end = updateData.cancelAtPeriodEnd;
    if (updateData.canceledAt !== undefined) data.canceled_at = updateData.canceledAt;
    if (updateData.amount !== undefined) data.amount = updateData.amount;
    if (updateData.currency !== undefined) data.currency = updateData.currency;
    if (updateData.metadata !== undefined) data.metadata = updateData.metadata;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Subscription(result) : null;
  }

  /**
   * Eliminar suscripción
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Subscription(result) : null;
  }

  /**
   * Contar suscripciones
   */
  async count(filters = {}) {
    return await this.service.count(filters);
  }

  /**
   * Contar suscripciones por estado
   */
  async countByStatus() {
    const supabase = require('../../config/supabase').supabase;

    const statuses = ['active', 'canceled', 'past_due', 'unpaid', 'trialing'];
    const counts = {};

    await Promise.all(
      statuses.map(async (status) => {
        const { count } = await supabase
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('status', status);
        counts[status] = count || 0;
      })
    );

    return counts;
  }

  /**
   * Buscar con paginación
   */
  async paginate(options = {}) {
    const result = await this.service.paginate(options);
    return {
      ...result,
      data: result.data.map(data => new Subscription(data))
    };
  }

  /**
   * Obtener estadísticas de suscripciones
   */
  async getStats() {
    const supabase = require('../../config/supabase').supabase;

    const [activeResult, trialingResult, canceledResult, pastDueResult, expiringResult] = await Promise.all([
      supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'trialing'),
      supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'canceled'),
      supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'past_due'),
      this.findExpiringSoon(7)
    ]);

    // Calcular MRR (Monthly Recurring Revenue)
    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('amount, currency')
      .eq('status', 'active');

    const mrr = (activeSubs || []).reduce((sum, sub) => sum + parseFloat(sub.amount), 0);

    return {
      total: (activeResult.count || 0) + (trialingResult.count || 0) + (canceledResult.count || 0),
      active: activeResult.count || 0,
      trialing: trialingResult.count || 0,
      canceled: canceledResult.count || 0,
      pastDue: pastDueResult.count || 0,
      expiringSoon: expiringResult.length,
      mrr,
      formattedMrr: new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR'
      }).format(mrr)
    };
  }
}

module.exports = new SubscriptionModel();
module.exports.Subscription = Subscription;
module.exports.SubscriptionModel = SubscriptionModel;
