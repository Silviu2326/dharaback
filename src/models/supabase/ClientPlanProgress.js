/**
 * Modelo ClientPlanProgress migrado a Supabase
 * Reemplaza el modelo Mongoose de ClientPlanProgress
 * Gestiona el progreso de los clientes en planes de terapia
 */

const SupabaseService = require('../../services/supabaseService');

class ClientPlanProgress {
  constructor(data = {}) {
    this.id = data.id;
    this.clientId = data.client_id;
    this.therapistId = data.therapistId;
    this.planId = data.plan_id;
    this.startDate = data.start_date;
    this.expectedEndDate = data.expected_end_date;
    this.actualEndDate = data.actual_end_date;
    this.status = data.status || 'active';
    this.progressPercentage = data.progress_percentage || 0;
    this.objectivesProgress = data.objectives_progress || [];
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
   * Virtual: ¿El progreso está activo?
   */
  get isActive() {
    return this.status === 'active';
  }

  /**
   * Virtual: ¿El progreso está completado?
   */
  get isCompleted() {
    return this.status === 'completed';
  }

  /**
   * Virtual: ¿El progreso está cancelado?
   */
  get isCancelled() {
    return this.status === 'cancelled';
  }

  /**
   * Virtual: ¿El progreso está en pausa?
   */
  get isOnHold() {
    return this.status === 'on_hold';
  }

  /**
   * Virtual: ¿Está retrasado respecto a la fecha esperada?
   */
  get isDelayed() {
    if (!this.expectedEndDate || this.isCompleted) return false;
    return new Date() > new Date(this.expectedEndDate) && !this.actualEndDate;
  }

  /**
   * Virtual: Días transcurridos desde el inicio
   */
  get daysSinceStart() {
    if (!this.startDate) return 0;
    const start = new Date(this.startDate);
    const now = new Date();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  }

  /**
   * Virtual: Días restantes hasta la fecha esperada
   */
  get daysRemaining() {
    if (!this.expectedEndDate || this.isCompleted) return 0;
    const end = new Date(this.expectedEndDate);
    const now = new Date();
    return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }

  /**
   * Virtual: Duración total del plan (días)
   */
  get totalDuration() {
    if (!this.startDate || !this.expectedEndDate) return 0;
    const start = new Date(this.startDate);
    const end = new Date(this.expectedEndDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }

  /**
   * Virtual: Porcentaje de tiempo transcurrido
   */
  get timeProgress() {
    if (!this.totalDuration) return 0;
    return Math.min(100, Math.round((this.daysSinceStart / this.totalDuration) * 100));
  }

  /**
   * Virtual: Diferencia entre progreso de tiempo y progreso real
   */
  get progressVariance() {
    return this.progressPercentage - this.timeProgress;
  }

  /**
   * Virtual: ¿Va por encima del cronograma?
   */
  get isAhead() {
    return this.progressVariance > 10;
  }

  /**
   * Virtual: ¿Va por debajo del cronograma?
   */
  get isBehind() {
    return this.progressVariance < -10;
  }

  /**
   * Virtual: Número de objetivos completados
   */
  get completedObjectivesCount() {
    return (this.objectivesProgress || []).filter(obj => obj.completed).length;
  }

  /**
   * Virtual: Número total de objetivos
   */
  get totalObjectivesCount() {
    return (this.objectivesProgress || []).length;
  }

  /**
   * Virtual: Porcentaje de objetivos completados
   */
  get objectivesCompletionRate() {
    if (this.totalObjectivesCount === 0) return 0;
    return Math.round((this.completedObjectivesCount / this.totalObjectivesCount) * 100);
  }

  /**
   * Actualizar porcentaje de progreso
   */
  async updateProgress(percentage) {
    const clampedPercentage = Math.max(0, Math.min(100, percentage));
    
    const service = new SupabaseService('client_plan_progress');
    
    const data = {
      progress_percentage: clampedPercentage
    };

    // Si alcanza 100%, marcar como completado automáticamente
    if (clampedPercentage === 100 && !this.isCompleted) {
      data.status = 'completed';
      data.actual_end_date = new Date().toISOString().split('T')[0];
    }

    const result = await service.update(this.id, data);

    this.progressPercentage = result.progress_percentage;
    this.status = result.status;
    this.actualEndDate = result.actual_end_date;
    return this;
  }

  /**
   * Marcar objetivo como completado
   */
  async completeObjective(objectiveIndex) {
    if (!this.objectivesProgress || !this.objectivesProgress[objectiveIndex]) {
      throw new Error('Objetivo no encontrado');
    }

    const newObjectivesProgress = [...this.objectivesProgress];
    newObjectivesProgress[objectiveIndex] = {
      ...newObjectivesProgress[objectiveIndex],
      completed: true,
      completedAt: new Date().toISOString()
    };

    const service = new SupabaseService('client_plan_progress');
    const result = await service.update(this.id, {
      objectives_progress: newObjectivesProgress
    });

    this.objectivesProgress = result.objectives_progress;
    
    // Actualizar porcentaje automáticamente basado en objetivos
    const completionRate = this.objectivesCompletionRate;
    await this.updateProgress(completionRate);
    
    return this;
  }

  /**
   * Marcar objetivo como pendiente
   */
  async uncompleteObjective(objectiveIndex) {
    if (!this.objectivesProgress || !this.objectivesProgress[objectiveIndex]) {
      throw new Error('Objetivo no encontrado');
    }

    const newObjectivesProgress = [...this.objectivesProgress];
    newObjectivesProgress[objectiveIndex] = {
      ...newObjectivesProgress[objectiveIndex],
      completed: false,
      completedAt: null
    };

    const service = new SupabaseService('client_plan_progress');
    const result = await service.update(this.id, {
      objectives_progress: newObjectivesProgress
    });

    this.objectivesProgress = result.objectives_progress;
    return this;
  }

  /**
   * Agregar nota
   */
  async addNote(note) {
    const service = new SupabaseService('client_plan_progress');
    
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
   * Poner en pausa
   */
  async hold() {
    if (!this.isActive) {
      throw new Error('Solo se pueden pausar progresos activos');
    }

    const service = new SupabaseService('client_plan_progress');
    
    const result = await service.update(this.id, {
      status: 'on_hold'
    });

    this.status = 'on_hold';
    return this;
  }

  /**
   * Reanudar
   */
  async resume() {
    if (!this.isOnHold) {
      throw new Error('Solo se pueden reanudar progresos en pausa');
    }

    const service = new SupabaseService('client_plan_progress');
    
    const result = await service.update(this.id, {
      status: 'active'
    });

    this.status = 'active';
    return this;
  }

  /**
   * Completar manualmente
   */
  async complete() {
    if (this.isCompleted) return this;

    const service = new SupabaseService('client_plan_progress');
    
    const result = await service.update(this.id, {
      status: 'completed',
      progress_percentage: 100,
      actual_end_date: new Date().toISOString().split('T')[0]
    });

    this.status = 'completed';
    this.progressPercentage = 100;
    this.actualEndDate = result.actual_end_date;
    return this;
  }

  /**
   * Cancelar
   */
  async cancel(reason = null) {
    if (this.isCompleted) {
      throw new Error('No se puede cancelar un progreso completado');
    }

    const service = new SupabaseService('client_plan_progress');
    
    const data = {
      status: 'cancelled'
    };

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
   * Extender fecha de fin esperada
   */
  async extendEndDate(days) {
    const service = new SupabaseService('client_plan_progress');
    
    const currentEnd = this.expectedEndDate 
      ? new Date(this.expectedEndDate) 
      : new Date();
    currentEnd.setDate(currentEnd.getDate() + days);

    const result = await service.update(this.id, {
      expected_end_date: currentEnd.toISOString().split('T')[0]
    });

    this.expectedEndDate = result.expected_end_date;
    return this;
  }

  /**
   * Obtener información del plan asociado
   */
  async getPlan() {
    if (!this.planId) return null;
    
    const TherapyPlan = require('./TherapyPlan');
    return await TherapyPlan.findById(this.planId);
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('client_plan_progress');

    const data = {
      client_id: this.clientId,
      therapistId: this.therapistId,
      plan_id: this.planId,
      start_date: this.startDate,
      expected_end_date: this.expectedEndDate,
      actual_end_date: this.actualEndDate,
      status: this.status,
      progress_percentage: this.progressPercentage,
      objectives_progress: this.objectivesProgress,
      notes: this.notes
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new ClientPlanProgress(result);
    } else {
      const result = await service.create(data);
      return new ClientPlanProgress(result);
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
      startDate: this.startDate,
      expectedEndDate: this.expectedEndDate,
      actualEndDate: this.actualEndDate,
      status: this.status,
      isActive: this.isActive,
      isCompleted: this.isCompleted,
      isCancelled: this.isCancelled,
      isOnHold: this.isOnHold,
      isDelayed: this.isDelayed,
      progressPercentage: this.progressPercentage,
      objectivesProgress: this.objectivesProgress,
      completedObjectivesCount: this.completedObjectivesCount,
      totalObjectivesCount: this.totalObjectivesCount,
      objectivesCompletionRate: this.objectivesCompletionRate,
      daysSinceStart: this.daysSinceStart,
      daysRemaining: this.daysRemaining,
      totalDuration: this.totalDuration,
      timeProgress: this.timeProgress,
      progressVariance: this.progressVariance,
      isAhead: this.isAhead,
      isBehind: this.isBehind,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class ClientPlanProgressModel {
  constructor() {
    this.service = new SupabaseService('client_plan_progress');
    this.tableName = 'client_plan_progress';
  }

  /**
   * Crear nuevo progreso de cliente
   */
  async create(data) {
    const progressData = {
      client_id: data.clientId,
      therapistId: data.therapistId,
      plan_id: data.planId,
      start_date: data.startDate || new Date().toISOString().split('T')[0],
      expected_end_date: data.expectedEndDate,
      actual_end_date: data.actualEndDate || null,
      status: data.status || 'active',
      progress_percentage: data.progressPercentage || 0,
      objectives_progress: data.objectivesProgress || [],
      notes: data.notes
    };

    const result = await this.service.create(progressData);
    return new ClientPlanProgress(result);
  }

  /**
   * Buscar todos los progresos
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new ClientPlanProgress(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new ClientPlanProgress(result) : null;
  }

  /**
   * Buscar un progreso por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new ClientPlanProgress(result) : null;
  }

  /**
   * Buscar progresos por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Buscar progresos por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapistId: therapistId }
    });
  }

  /**
   * Buscar progresos por plan
   */
  async findByPlan(planId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, plan_id: planId }
    });
  }

  /**
   * Buscar progresos activos de un cliente
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
   * Buscar progresos activos de un terapeuta
   */
  async findActiveByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapistId: therapistId,
        status: 'active'
      }
    });
  }

  /**
   * Buscar progresos por estado
   */
  async findByStatus(status, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, status }
    });
  }

  /**
   * Buscar progresos retrasados
   */
  async findDelayed(therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('client_plan_progress')
      .select(options.select || '*')
      .eq('status', 'active')
      .lt('expected_end_date', new Date().toISOString().split('T')[0]);

    if (therapistId) {
      query = query.eq('therapistId', therapistId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new ClientPlanProgress(d));
  }

  /**
   * Buscar progresos completados recientemente
   */
  async findRecentlyCompleted(days = 30, therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    const since = new Date();
    since.setDate(since.getDate() - days);

    let query = supabase
      .from('client_plan_progress')
      .select(options.select || '*')
      .eq('status', 'completed')
      .gte('actual_end_date', since.toISOString().split('T')[0]);

    if (therapistId) {
      query = query.eq('therapistId', therapistId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new ClientPlanProgress(d));
  }

  /**
   * Actualizar progreso
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.clientId !== undefined) data.client_id = updateData.clientId;
    if (updateData.therapistId !== undefined) data.therapistId = updateData.therapistId;
    if (updateData.planId !== undefined) data.plan_id = updateData.planId;
    if (updateData.startDate !== undefined) data.start_date = updateData.startDate;
    if (updateData.expectedEndDate !== undefined) data.expected_end_date = updateData.expectedEndDate;
    if (updateData.actualEndDate !== undefined) data.actual_end_date = updateData.actualEndDate;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.progressPercentage !== undefined) data.progress_percentage = updateData.progressPercentage;
    if (updateData.objectivesProgress !== undefined) data.objectives_progress = updateData.objectivesProgress;
    if (updateData.notes !== undefined) data.notes = updateData.notes;

    const result = await this.service.update(id, data);
    return options.new !== false ? new ClientPlanProgress(result) : null;
  }

  /**
   * Eliminar progreso
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new ClientPlanProgress(result) : null;
  }

  /**
   * Contar progresos
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
      data: result.data.map(data => new ClientPlanProgress(data))
    };
  }

  /**
   * Obtener estadísticas de progresos de un terapeuta
   */
  async getStats(therapistId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, activeResult, completedResult, cancelledResult, onHoldResult] = await Promise.all([
      supabase.from('client_plan_progress').select('*', { count: 'exact', head: true }).eq('therapistId', therapistId),
      supabase.from('client_plan_progress').select('*', { count: 'exact', head: true }).eq('therapistId', therapistId).eq('status', 'active'),
      supabase.from('client_plan_progress').select('*', { count: 'exact', head: true }).eq('therapistId', therapistId).eq('status', 'completed'),
      supabase.from('client_plan_progress').select('*', { count: 'exact', head: true }).eq('therapistId', therapistId).eq('status', 'cancelled'),
      supabase.from('client_plan_progress').select('*', { count: 'exact', head: true }).eq('therapistId', therapistId).eq('status', 'on_hold')
    ]);

    // Calcular progreso promedio
    const { data: progressData } = await supabase
      .from('client_plan_progress')
      .select('progress_percentage')
      .eq('therapistId', therapistId)
      .eq('status', 'active');

    const avgProgress = progressData && progressData.length > 0
      ? progressData.reduce((sum, p) => sum + p.progress_percentage, 0) / progressData.length
      : 0;

    return {
      total: totalResult.count || 0,
      active: activeResult.count || 0,
      completed: completedResult.count || 0,
      cancelled: cancelledResult.count || 0,
      onHold: onHoldResult.count || 0,
      averageProgress: Math.round(avgProgress * 10) / 10,
      completionRate: totalResult.count > 0 
        ? Math.round(((completedResult.count || 0) / totalResult.count) * 100) 
        : 0
    };
  }

  /**
   * Verificar si un cliente ya tiene un plan asignado
   */
  async exists(clientId, planId) {
    const count = await this.count({
      client_id: clientId,
      plan_id: planId
    });
    return count > 0;
  }
}

module.exports = new ClientPlanProgressModel();
module.exports.ClientPlanProgress = ClientPlanProgress;
module.exports.ClientPlanProgressModel = ClientPlanProgressModel;
