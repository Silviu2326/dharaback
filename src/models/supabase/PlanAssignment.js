/**
 * Modelo PlanAssignment migrado a Supabase
 * Reemplaza el modelo Mongoose de PlanAssignment
 * Gestiona asignaciones de planes/paquetes a clientes
 */

const SupabaseService = require('../../services/supabaseService');

class PlanAssignment {
  constructor(data = {}) {
    this.id = data.id;
    this.clientId = data.client_id;
    this.therapistId = data.therapistId;
    this.planId = data.plan_id;
    this.totalSessions = data.total_sessions || 0;
    this.usedSessions = data.used_sessions || 0;
    this.status = data.status || 'active';
    this.startDate = data.start_date;
    this.endDate = data.end_date;
    this.paymentId = data.payment_id;
    this.notes = data.notes;
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
   * Virtual: Sesiones restantes
   */
  get remainingSessions() {
    return Math.max(0, this.totalSessions - this.usedSessions);
  }

  /**
   * Virtual: Porcentaje de uso
   */
  get usagePercentage() {
    if (this.totalSessions === 0) return 0;
    return Math.round((this.usedSessions / this.totalSessions) * 100);
  }

  /**
   * Virtual: ¿El plan está activo?
   */
  get isActive() {
    return this.status === 'active';
  }

  /**
   * Virtual: ¿El plan está completado?
   */
  get isCompleted() {
    return this.status === 'completed';
  }

  /**
   * Virtual: ¿El plan está cancelado?
   */
  get isCancelled() {
    return this.status === 'cancelled';
  }

  /**
   * Virtual: ¿El plan ha expirado?
   */
  get isExpired() {
    if (this.status === 'expired') return true;
    if (!this.endDate) return false;
    return new Date(this.endDate) < new Date();
  }

  /**
   * Virtual: ¿Tiene sesiones disponibles?
   */
  get hasAvailableSessions() {
    return this.remainingSessions > 0 && this.isActive && !this.isExpired;
  }

  /**
   * Virtual: ¿Está casi agotado (menos del 20% restante)?
   */
  get isRunningLow() {
    return this.hasAvailableSessions && this.remainingSessions <= Math.ceil(this.totalSessions * 0.2);
  }

  /**
   * Virtual: Días restantes hasta expiración
   */
  get daysUntilExpiry() {
    if (!this.endDate) return null;
    const end = new Date(this.endDate);
    const now = new Date();
    const diffMs = end - now;
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  /**
   * Virtual: ¿Está por expirar (menos de 7 días)?
   */
  get isAboutToExpire() {
    const days = this.daysUntilExpiry;
    return days !== null && days > 0 && days <= 7;
  }

  /**
   * Usar una sesión
   */
  async useSession() {
    if (!this.hasAvailableSessions) {
      throw new Error('No hay sesiones disponibles en este plan');
    }

    const service = new SupabaseService('plan_assignments');
    
    const newUsedSessions = this.usedSessions + 1;
    const newStatus = newUsedSessions >= this.totalSessions ? 'completed' : this.status;

    const result = await service.update(this.id, {
      used_sessions: newUsedSessions,
      status: newStatus
    });

    this.usedSessions = result.used_sessions;
    this.status = result.status;
    return this;
  }

  /**
   * Agregar sesiones (extensión del plan)
   */
  async addSessions(count) {
    const service = new SupabaseService('plan_assignments');
    
    const result = await service.update(this.id, {
      total_sessions: this.totalSessions + count
    });

    this.totalSessions = result.total_sessions;
    return this;
  }

  /**
   * Completar plan manualmente
   */
  async complete() {
    const service = new SupabaseService('plan_assignments');
    
    const result = await service.update(this.id, {
      status: 'completed'
    });

    this.status = 'completed';
    return this;
  }

  /**
   * Cancelar plan
   */
  async cancel(reason = null) {
    const service = new SupabaseService('plan_assignments');
    
    const data = { status: 'cancelled' };
    if (reason) {
      data.notes = this.notes 
        ? `${this.notes}\nCancelado: ${reason}`
        : `Cancelado: ${reason}`;
    }

    const result = await service.update(this.id, data);

    this.status = 'cancelled';
    if (reason) this.notes = result.notes;
    return this;
  }

  /**
   * Extender fecha de expiración
   */
  async extendExpiry(days) {
    const service = new SupabaseService('plan_assignments');
    
    const currentEnd = this.endDate ? new Date(this.endDate) : new Date();
    currentEnd.setDate(currentEnd.getDate() + days);

    const result = await service.update(this.id, {
      end_date: currentEnd.toISOString().split('T')[0]
    });

    this.endDate = result.end_date;
    return this;
  }

  /**
   * Reactivar plan expirado o cancelado
   */
  async reactivate(newEndDate = null) {
    if (this.isActive) {
      throw new Error('El plan ya está activo');
    }

    const service = new SupabaseService('plan_assignments');
    
    const data = { status: 'active' };
    if (newEndDate) {
      data.end_date = newEndDate;
    }

    const result = await service.update(this.id, data);

    this.status = 'active';
    if (newEndDate) this.endDate = result.end_date;
    return this;
  }

  /**
   * Agregar nota
   */
  async addNote(note) {
    const service = new SupabaseService('plan_assignments');
    
    const newNotes = this.notes 
      ? `${this.notes}\n${new Date().toLocaleDateString()}: ${note}`
      : `${new Date().toLocaleDateString()}: ${note}`;

    const result = await service.update(this.id, {
      notes: newNotes
    });

    this.notes = result.notes;
    return this;
  }

  /**
   * Verificar si se puede usar una sesión para una fecha específica
   */
  canUseSessionForDate(date = new Date()) {
    if (!this.hasAvailableSessions) return false;
    
    // Verificar que esté dentro del período válido
    const checkDate = new Date(date);
    
    if (this.startDate) {
      const start = new Date(this.startDate);
      if (checkDate < start) return false;
    }
    
    if (this.endDate) {
      const end = new Date(this.endDate);
      end.setHours(23, 59, 59); // Final del día
      if (checkDate > end) return false;
    }
    
    return true;
  }

  /**
   * Obtener información del paquete asociado
   */
  async getPackage() {
    if (!this.planId) return null;
    
    const PricingPackage = require('./PricingPackage');
    return await PricingPackage.findById(this.planId);
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('plan_assignments');

    const data = {
      client_id: this.clientId,
      therapistId: this.therapistId,
      plan_id: this.planId,
      total_sessions: this.totalSessions,
      used_sessions: this.usedSessions,
      status: this.status,
      start_date: this.startDate,
      end_date: this.endDate,
      payment_id: this.paymentId,
      notes: this.notes
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new PlanAssignment(result);
    } else {
      const result = await service.create(data);
      return new PlanAssignment(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      clientId: this.clientId,
      therapistId: this.therapistId,
      planId: this.planId,
      totalSessions: this.totalSessions,
      usedSessions: this.usedSessions,
      remainingSessions: this.remainingSessions,
      usagePercentage: this.usagePercentage,
      status: this.status,
      isActive: this.isActive,
      isCompleted: this.isCompleted,
      isCancelled: this.isCancelled,
      isExpired: this.isExpired,
      hasAvailableSessions: this.hasAvailableSessions,
      isRunningLow: this.isRunningLow,
      isAboutToExpire: this.isAboutToExpire,
      startDate: this.startDate,
      endDate: this.endDate,
      daysUntilExpiry: this.daysUntilExpiry,
      paymentId: this.paymentId,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class PlanAssignmentModel {
  constructor() {
    this.service = new SupabaseService('plan_assignments');
    this.tableName = 'plan_assignments';
  }

  /**
   * Crear nueva asignación de plan
   */
  async create(data) {
    // Calcular fecha de fin si no se proporciona y hay validez en días
    let endDate = data.endDate;
    if (!endDate && data.validityDays) {
      const start = data.startDate ? new Date(data.startDate) : new Date();
      endDate = new Date(start);
      endDate.setDate(endDate.getDate() + data.validityDays);
      endDate = endDate.toISOString().split('T')[0];
    }

    const assignmentData = {
      client_id: data.clientId,
      therapistId: data.therapistId,
      plan_id: data.planId,
      total_sessions: data.totalSessions,
      used_sessions: data.usedSessions || 0,
      status: data.status || 'active',
      start_date: data.startDate || new Date().toISOString().split('T')[0],
      end_date: endDate,
      payment_id: data.paymentId,
      notes: data.notes
    };

    const result = await this.service.create(assignmentData);
    return new PlanAssignment(result);
  }

  /**
   * Buscar todas las asignaciones
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new PlanAssignment(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new PlanAssignment(result) : null;
  }

  /**
   * Buscar una asignación por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new PlanAssignment(result) : null;
  }

  /**
   * Buscar asignaciones por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Buscar asignaciones por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapist_id: therapistId }
    });
  }

  /**
   * Buscar asignaciones activas de un cliente
   */
  async findActiveByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        client_id: clientId,
        status: 'active'
      }
    });
  }

  /**
   * Buscar asignaciones activas de un terapeuta
   */
  async findActiveByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapist_id: therapistId,
        status: 'active'
      }
    });
  }

  /**
   * Buscar asignaciones por plan
   */
  async findByPlan(planId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, plan_id: planId }
    });
  }

  /**
   * Buscar asignaciones por pago
   */
  async findByPayment(paymentId) {
    return await this.findOne({ payment_id: paymentId });
  }

  /**
   * Buscar asignaciones que expiran pronto
   */
  async findExpiringSoon(days = 7, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    let query = supabase
      .from('plan_assignments')
      .select(options.select || '*')
      .lte('end_date', futureDate.toISOString().split('T')[0])
      .gte('end_date', new Date().toISOString().split('T')[0])
      .eq('status', 'active');

    if (options.therapistId) {
      query = query.eq('therapist_id', options.therapistId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new PlanAssignment(d));
  }

  /**
   * Buscar asignaciones agotadas (sin sesiones restantes)
   */
  async findExhausted(options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('plan_assignments')
      .select(options.select || '*')
      .eq('status', 'active')
      .filter('used_sessions', 'gte', 'total_sessions');

    if (options.therapistId) {
      query = query.eq('therapist_id', options.therapistId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new PlanAssignment(d));
  }

  /**
   * Actualizar asignación
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.clientId !== undefined) data.client_id = updateData.clientId;
    if (updateData.therapistId !== undefined) data.therapist_id = updateData.therapistId;
    if (updateData.planId !== undefined) data.plan_id = updateData.planId;
    if (updateData.totalSessions !== undefined) data.total_sessions = updateData.totalSessions;
    if (updateData.usedSessions !== undefined) data.used_sessions = updateData.usedSessions;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.startDate !== undefined) data.start_date = updateData.startDate;
    if (updateData.endDate !== undefined) data.end_date = updateData.endDate;
    if (updateData.paymentId !== undefined) data.payment_id = updateData.paymentId;
    if (updateData.notes !== undefined) data.notes = updateData.notes;

    const result = await this.service.update(id, data);
    return options.new !== false ? new PlanAssignment(result) : null;
  }

  /**
   * Eliminar asignación
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new PlanAssignment(result) : null;
  }

  /**
   * Contar asignaciones
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
      data: result.data.map(data => new PlanAssignment(data))
    };
  }

  /**
   * Obtener estadísticas de asignaciones de un terapeuta
   */
  async getStats(therapistId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, activeResult, completedResult, cancelledResult] = await Promise.all([
      supabase.from('plan_assignments').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId),
      supabase.from('plan_assignments').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('status', 'active'),
      supabase.from('plan_assignments').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('status', 'completed'),
      supabase.from('plan_assignments').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('status', 'cancelled')
    ]);

    // Calcular sesiones totales
    const { data: sessionsData } = await supabase
      .from('plan_assignments')
      .select('total_sessions, used_sessions')
      .eq('therapist_id', therapistId);

    const totalSessions = (sessionsData || []).reduce((sum, a) => sum + (a.total_sessions || 0), 0);
    const usedSessions = (sessionsData || []).reduce((sum, a) => sum + (a.used_sessions || 0), 0);

    return {
      total: totalResult.count || 0,
      active: activeResult.count || 0,
      completed: completedResult.count || 0,
      cancelled: cancelledResult.count || 0,
      totalSessions,
      usedSessions,
      remainingSessions: totalSessions - usedSessions,
      usageRate: totalSessions > 0 ? Math.round((usedSessions / totalSessions) * 100) : 0
    };
  }

  /**
   * Verificar si un cliente tiene un plan activo con sesiones disponibles
   */
  async hasActivePlan(clientId, therapistId = null) {
    const filters = { 
      client_id: clientId, 
      status: 'active' 
    };
    if (therapistId) filters.therapist_id = therapistId;

    const supabase = require('../../config/supabase').supabase;

    const { data, error } = await supabase
      .from('plan_assignments')
      .select('*')
      .match(filters)
      .gt('used_sessions', 0); // Sesiones usadas menores que totales

    if (error) throw new Error(error.message);

    return (data || []).length > 0;
  }
}

module.exports = new PlanAssignmentModel();
module.exports.PlanAssignment = PlanAssignment;
module.exports.PlanAssignmentModel = PlanAssignmentModel;
