/**
 * Modelo TherapyPlan migrado a Supabase
 * Reemplaza el modelo Mongoose de TherapyPlan
 * Gestiona planes de terapia y plantillas para terapeutas
 */

const SupabaseService = require('../../services/supabaseService');

class TherapyPlan {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapistId;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type;
    this.durationWeeks = data.duration_weeks;
    this.estimatedSessions = data.estimated_sessions;
    this.objectives = data.objectives || [];
    this.interventions = data.interventions || [];
    this.assessments = data.assessments || [];
    this.resources = data.resources || [];
    this.isTemplate = data.is_template || false;
    this.templateCategory = data.template_category;
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
   * Virtual: ¿Es una plantilla?
   */
  get template() {
    return this.isTemplate;
  }

  /**
   * Virtual: Número total de objetivos
   */
  get objectivesCount() {
    return (this.objectives || []).length;
  }

  /**
   * Virtual: Número total de intervenciones
   */
  get interventionsCount() {
    return (this.interventions || []).length;
  }

  /**
   * Virtual: Número total de evaluaciones
   */
  get assessmentsCount() {
    return (this.assessments || []).length;
  }

  /**
   * Virtual: Número total de recursos
   */
  get resourcesCount() {
    return (this.resources || []).length;
  }

  /**
   * Virtual: Duración promedio por sesión (si aplica)
   */
  get averageSessionDuration() {
    if (!this.durationWeeks || !this.estimatedSessions) return null;
    return Math.round((this.durationWeeks * 7) / this.estimatedSessions);
  }

  /**
   * Agregar objetivo
   */
  async addObjective(objective) {
    const newObjectives = [...(this.objectives || []), objective];

    const service = new SupabaseService('therapy_plans');
    const result = await service.update(this.id, {
      objectives: newObjectives
    });

    this.objectives = result.objectives;
    return this;
  }

  /**
   * Eliminar objetivo
   */
  async removeObjective(index) {
    const newObjectives = [...(this.objectives || [])];
    newObjectives.splice(index, 1);

    const service = new SupabaseService('therapy_plans');
    const result = await service.update(this.id, {
      objectives: newObjectives
    });

    this.objectives = result.objectives;
    return this;
  }

  /**
   * Agregar intervención
   */
  async addIntervention(intervention) {
    const newInterventions = [...(this.interventions || []), intervention];

    const service = new SupabaseService('therapy_plans');
    const result = await service.update(this.id, {
      interventions: newInterventions
    });

    this.interventions = result.interventions;
    return this;
  }

  /**
   * Agregar evaluación
   */
  async addAssessment(assessment) {
    const newAssessments = [...(this.assessments || []), {
      id: assessment.id || Date.now().toString(),
      name: assessment.name,
      type: assessment.type,
      description: assessment.description,
      frequency: assessment.frequency,
      createdAt: new Date().toISOString()
    }];

    const service = new SupabaseService('therapy_plans');
    const result = await service.update(this.id, {
      assessments: newAssessments
    });

    this.assessments = result.assessments;
    return this;
  }

  /**
   * Agregar recurso
   */
  async addResource(resource) {
    const newResources = [...(this.resources || []), {
      id: resource.id || Date.now().toString(),
      title: resource.title,
      type: resource.type,
      url: resource.url,
      description: resource.description,
      createdAt: new Date().toISOString()
    }];

    const service = new SupabaseService('therapy_plans');
    const result = await service.update(this.id, {
      resources: newResources
    });

    this.resources = result.resources;
    return this;
  }

  /**
   * Convertir a plantilla
   */
  async makeTemplate(category = null) {
    const service = new SupabaseService('therapy_plans');
    
    const data = {
      is_template: true
    };
    if (category) {
      data.template_category = category;
    }

    const result = await service.update(this.id, data);

    this.isTemplate = true;
    this.templateCategory = result.template_category;
    return this;
  }

  /**
   * Duplicar plan (crear copia)
   */
  async duplicate(newName = null) {
    const service = new SupabaseService('therapy_plans');

    const data = {
      therapistId: this.therapistId,
      name: newName || `${this.name} (Copia)`,
      description: this.description,
      type: this.type,
      duration_weeks: this.durationWeeks,
      estimated_sessions: this.estimatedSessions,
      objectives: this.objectives,
      interventions: this.interventions,
      assessments: this.assessments,
      resources: this.resources,
      is_template: false
    };

    const result = await service.create(data);
    return new TherapyPlan(result);
  }

  /**
   * Crear asignación para un cliente
   */
  async assignToClient(clientId, startDate = null, notes = null) {
    const ClientPlanProgress = require('./ClientPlanProgress');
    
    const start = startDate || new Date().toISOString().split('T')[0];
    const expectedEnd = this.durationWeeks 
      ? new Date(new Date(start).getTime() + this.durationWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : null;

    return await ClientPlanProgress.create({
      clientId,
      therapistId: this.therapistId,
      planId: this.id,
      startDate: start,
      expectedEndDate: expectedEnd,
      notes,
      objectivesProgress: (this.objectives || []).map(obj => ({
        objective: obj,
        completed: false,
        completedAt: null
      }))
    });
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('therapy_plans');

    const data = {
      therapistId: this.therapistId,
      name: this.name,
      description: this.description,
      type: this.type,
      duration_weeks: this.durationWeeks,
      estimated_sessions: this.estimatedSessions,
      objectives: this.objectives,
      interventions: this.interventions,
      assessments: this.assessments,
      resources: this.resources,
      is_template: this.isTemplate,
      template_category: this.templateCategory
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new TherapyPlan(result);
    } else {
      const result = await service.create(data);
      return new TherapyPlan(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      name: this.name,
      description: this.description,
      type: this.type,
      durationWeeks: this.durationWeeks,
      estimatedSessions: this.estimatedSessions,
      objectives: this.objectives,
      objectivesCount: this.objectivesCount,
      interventions: this.interventions,
      interventionsCount: this.interventionsCount,
      assessments: this.assessments,
      assessmentsCount: this.assessmentsCount,
      resources: this.resources,
      resourcesCount: this.resourcesCount,
      isTemplate: this.isTemplate,
      template: this.template,
      templateCategory: this.templateCategory,
      averageSessionDuration: this.averageSessionDuration,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class TherapyPlanModel {
  constructor() {
    this.service = new SupabaseService('therapy_plans');
    this.tableName = 'therapy_plans';
  }

  /**
   * Crear nuevo plan de terapia
   */
  async create(data) {
    const planData = {
      therapistId: data.therapistId,
      name: data.name,
      description: data.description,
      type: data.type,
      duration_weeks: data.durationWeeks,
      estimated_sessions: data.estimatedSessions,
      objectives: data.objectives || [],
      interventions: data.interventions || [],
      assessments: data.assessments || [],
      resources: data.resources || [],
      is_template: data.isTemplate || false,
      template_category: data.templateCategory
    };

    const result = await this.service.create(planData);
    return new TherapyPlan(result);
  }

  /**
   * Buscar todos los planes
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new TherapyPlan(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new TherapyPlan(result) : null;
  }

  /**
   * Buscar un plan por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new TherapyPlan(result) : null;
  }

  /**
   * Buscar planes por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapistId: therapistId }
    });
  }

  /**
   * Buscar plantillas
   */
  async findTemplates(category = null, options = {}) {
    const filters = { is_template: true };
    if (category) filters.template_category = category;

    return await this.find({
      ...options,
      filters: { ...options.filters, ...filters }
    });
  }

  /**
   * Buscar plantillas por terapeuta
   */
  async findTemplatesByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapistId: therapistId,
        is_template: true
      }
    });
  }

  /**
   * Buscar planes (no plantillas) por terapeuta
   */
  async findPlansByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapistId: therapistId,
        is_template: false
      }
    });
  }

  /**
   * Buscar planes por tipo
   */
  async findByType(type, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, type }
    });
  }

  /**
   * Buscar planes por categoría de plantilla
   */
  async findByTemplateCategory(category, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        template_category: category,
        is_template: true
      }
    });
  }

  /**
   * Actualizar plan
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.therapistId !== undefined) data.therapistId = updateData.therapistId;
    if (updateData.name !== undefined) data.name = updateData.name;
    if (updateData.description !== undefined) data.description = updateData.description;
    if (updateData.type !== undefined) data.type = updateData.type;
    if (updateData.durationWeeks !== undefined) data.duration_weeks = updateData.durationWeeks;
    if (updateData.estimatedSessions !== undefined) data.estimated_sessions = updateData.estimatedSessions;
    if (updateData.objectives !== undefined) data.objectives = updateData.objectives;
    if (updateData.interventions !== undefined) data.interventions = updateData.interventions;
    if (updateData.assessments !== undefined) data.assessments = updateData.assessments;
    if (updateData.resources !== undefined) data.resources = updateData.resources;
    if (updateData.isTemplate !== undefined) data.is_template = updateData.isTemplate;
    if (updateData.templateCategory !== undefined) data.template_category = updateData.templateCategory;

    const result = await this.service.update(id, data);
    return options.new !== false ? new TherapyPlan(result) : null;
  }

  /**
   * Eliminar plan
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new TherapyPlan(result) : null;
  }

  /**
   * Contar planes
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
      data: result.data.map(data => new TherapyPlan(data))
    };
  }

  /**
   * Obtener estadísticas de planes de un terapeuta
   */
  async getStats(therapistId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, templatesResult, plansResult] = await Promise.all([
      supabase.from('therapy_plans').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId),
      supabase.from('therapy_plans').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('is_template', true),
      supabase.from('therapy_plans').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('is_template', false)
    ]);

    return {
      total: totalResult.count || 0,
      templates: templatesResult.count || 0,
      plans: plansResult.count || 0
    };
  }
}

module.exports = new TherapyPlanModel();
module.exports.TherapyPlan = TherapyPlan;
module.exports.TherapyPlanModel = TherapyPlanModel;
