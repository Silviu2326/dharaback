/**
 * Modelo SessionNote migrado a Supabase
 * Reemplaza el modelo Mongoose de SessionNote
 */

const SupabaseService = require('../../services/supabaseService');

class SessionNote {
  constructor(data = {}) {
    this.id = data.id;
    this.bookingId = data.booking_id;
    this.therapistId = data.therapistId;
    this.clientId = data.client_id;
    this.notes = data.notes;
    this.objectives = data.objectives || [];
    this.homework = data.homework || [];
    this.nextSteps = data.next_steps;
    this.mood = data.mood;
    this.progress = data.progress;
    this.isConfidential = data.is_confidential !== false;
    this.sessionType = data.session_type || 'follow_up';
    this.treatmentPlan = data.treatment_plan || {};
    this.riskAssessment = data.risk_assessment || { level: 'none', flagged: false };
    this.clinicalMeasures = data.clinical_measures || {};
    this.sessionDuration = data.session_duration;
    this.tags = data.tags || [];
    this.lastEditedBy = data.last_edited_by;
    this.editHistory = data.edit_history || [];
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Calcular wellness score (0-100)
   */
  get wellnessScore() {
    const moodValues = {
      'very_poor': 1,
      'poor': 2,
      'fair': 3,
      'good': 4,
      'excellent': 5
    };

    const progressValues = {
      'no_progress': 1,
      'minimal': 2,
      'moderate': 3,
      'significant': 4,
      'excellent': 5
    };

    const moodScore = moodValues[this.mood] || 3;
    const progressScore = progressValues[this.progress] || 3;

    let clinicalScore = 3;
    if (this.clinicalMeasures) {
      const measures = [
        this.clinicalMeasures.anxiety,
        this.clinicalMeasures.depression,
        this.clinicalMeasures.stress,
        this.clinicalMeasures.functioning
      ].filter(m => m !== null && m !== undefined);

      if (measures.length > 0) {
        const avg = measures.reduce((sum, val) => sum + val, 0) / measures.length;
        clinicalScore = Math.round((10 - avg) / 2) + 1;
      }
    }

    return Math.round((moodScore + progressScore + clinicalScore) / 3 * 20);
  }

  /**
   * Obtener resumen de la sesión
   */
  get sessionSummary() {
    return {
      mood: this.mood,
      progress: this.progress,
      wellnessScore: this.wellnessScore,
      riskLevel: this.riskAssessment?.level,
      objectivesCount: this.objectives?.length || 0,
      homeworkCount: this.homework?.length || 0,
      duration: this.sessionDuration
    };
  }

  /**
   * Agregar historial de edición
   */
  async addEditHistory(editedBy, changes, ipAddress = null) {
    const service = new SupabaseService('session_notes');

    this.editHistory.push({
      edited_by: editedBy,
      edited_at: new Date().toISOString(),
      changes,
      ip_address: ipAddress
    });

    this.lastEditedBy = editedBy;

    const result = await service.update(this.id, {
      edit_history: this.editHistory,
      last_edited_by: editedBy
    });

    return new SessionNote(result);
  }

  /**
   * Marcar riesgo
   */
  async flagRisk(level, notes, flaggedBy) {
    this.riskAssessment.level = level;
    this.riskAssessment.notes = notes;
    this.riskAssessment.flagged = ['high', 'critical'].includes(level);

    const service = new SupabaseService('session_notes');

    const result = await service.update(this.id, {
      risk_assessment: this.riskAssessment
    });

    if (this.riskAssessment.flagged) {
      await this.addEditHistory(flaggedBy, `Risk flagged as ${level}: ${notes}`);
    }

    return new SessionNote(result);
  }

  /**
   * Obtener tendencia de progreso
   */
  async getProgressTrend(sessionCount = 5) {
    const supabase = require('../../config/supabase').supabase;

    const { data: recentSessions, error } = await supabase
      .from('session_notes')
      .select('*')
      .eq('client_id', this.clientId)
      .eq('therapist_id', this.therapistId)
      .lte('created_at', this.createdAt)
      .order('created_at', { ascending: false })
      .limit(sessionCount);

    if (error) throw new Error(error.message);

    const sessions = (recentSessions || []).map(s => new SessionNote(s));

    if (sessions.length < 2) {
      return { trend: 'insufficient_data', sessions };
    }

    sessions.reverse();
    const scores = sessions.map(s => s.wellnessScore);
    const trend = scores[scores.length - 1] > scores[0] ? 'improving' :
                  scores[scores.length - 1] < scores[0] ? 'declining' : 'stable';

    return { trend, scores, sessions };
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('session_notes');

    const data = {
      booking_id: this.bookingId,
      therapistId: this.therapistId,
      client_id: this.clientId,
      notes: this.notes,
      objectives: this.objectives,
      homework: this.homework,
      next_steps: this.nextSteps,
      mood: this.mood,
      progress: this.progress,
      is_confidential: this.isConfidential,
      session_type: this.sessionType,
      treatment_plan: this.treatmentPlan,
      risk_assessment: this.riskAssessment,
      clinical_measures: this.clinicalMeasures,
      session_duration: this.sessionDuration,
      tags: this.tags,
      last_edited_by: this.lastEditedBy,
      edit_history: this.editHistory
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new SessionNote(result);
    } else {
      const result = await service.create(data);
      return new SessionNote(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      bookingId: this.bookingId,
      therapistId: this.therapistId,
      clientId: this.clientId,
      notes: this.notes,
      objectives: this.objectives,
      homework: this.homework,
      nextSteps: this.nextSteps,
      mood: this.mood,
      progress: this.progress,
      isConfidential: this.isConfidential,
      sessionType: this.sessionType,
      treatmentPlan: this.treatmentPlan,
      riskAssessment: this.riskAssessment,
      clinicalMeasures: this.clinicalMeasures,
      sessionDuration: this.sessionDuration,
      tags: this.tags,
      lastEditedBy: this.lastEditedBy,
      editHistory: this.editHistory,
      wellnessScore: this.wellnessScore,
      sessionSummary: this.sessionSummary,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class SessionNoteModel {
  constructor() {
    this.service = new SupabaseService('session_notes');
  }

  /**
   * Crear nueva nota de sesión
   */
  async create(data) {
    const noteData = {
      booking_id: data.bookingId,
      therapistId: data.therapistId,
      client_id: data.clientId,
      notes: data.notes,
      objectives: data.objectives || [],
      homework: data.homework || [],
      next_steps: data.nextSteps,
      mood: data.mood,
      progress: data.progress,
      is_confidential: data.isConfidential !== false,
      session_type: data.sessionType || 'follow_up',
      treatment_plan: data.treatmentPlan || {},
      risk_assessment: data.riskAssessment || { level: 'none', flagged: false },
      clinical_measures: data.clinicalMeasures || {},
      session_duration: data.sessionDuration,
      tags: data.tags || [],
      last_edited_by: data.lastEditedBy,
      edit_history: data.editHistory || []
    };

    const result = await this.service.create(noteData);
    return new SessionNote(result);
  }

  /**
   * Buscar todas
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new SessionNote(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new SessionNote(result) : null;
  }

  /**
   * Buscar una
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new SessionNote(result) : null;
  }

  /**
   * Buscar por booking
   */
  async findByBooking(bookingId) {
    return await this.findOne({ booking_id: bookingId });
  }

  /**
   * Buscar por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Buscar por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapistId: therapistId }
    });
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.notes) data.notes = updateData.notes;
    if (updateData.objectives) data.objectives = updateData.objectives;
    if (updateData.homework) data.homework = updateData.homework;
    if (updateData.nextSteps !== undefined) data.next_steps = updateData.nextSteps;
    if (updateData.mood) data.mood = updateData.mood;
    if (updateData.progress) data.progress = updateData.progress;
    if (updateData.isConfidential !== undefined) data.is_confidential = updateData.isConfidential;
    if (updateData.sessionType) data.session_type = updateData.sessionType;
    if (updateData.treatmentPlan) data.treatment_plan = updateData.treatmentPlan;
    if (updateData.riskAssessment) data.risk_assessment = updateData.riskAssessment;
    if (updateData.clinicalMeasures) data.clinical_measures = updateData.clinicalMeasures;
    if (updateData.sessionDuration !== undefined) data.session_duration = updateData.sessionDuration;
    if (updateData.tags) data.tags = updateData.tags;
    if (updateData.lastEditedBy) data.last_edited_by = updateData.lastEditedBy;
    if (updateData.editHistory) data.edit_history = updateData.editHistory;

    const result = await this.service.update(id, data);
    return options.new !== false ? new SessionNote(result) : null;
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new SessionNote(result) : null;
  }

  /**
   * Obtener estadísticas del terapeuta
   */
  async getTherapistStats(therapistId, startDate = null, endDate = null) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('session_notes')
      .select('*')
      .eq('therapist_id', therapistId);

    if (startDate && endDate) {
      query = query
        .gte('created_at', startDate)
        .lte('created_at', endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const notes = (data || []).map(d => new SessionNote(d));

    const stats = {
      totalSessions: notes.length,
      avgWellnessScore: 0,
      uniqueClients: new Set(notes.map(n => n.clientId)).size,
      riskCases: notes.filter(n => n.riskAssessment?.flagged).length,
      moodDistribution: {},
      progressDistribution: {}
    };

    if (notes.length > 0) {
      const totalScore = notes.reduce((sum, n) => sum + n.wellnessScore, 0);
      stats.avgWellnessScore = Math.round((totalScore / notes.length) * 100) / 100;
    }

    notes.forEach(note => {
      stats.moodDistribution[note.mood] = (stats.moodDistribution[note.mood] || 0) + 1;
      stats.progressDistribution[note.progress] = (stats.progressDistribution[note.progress] || 0) + 1;
    });

    return stats;
  }

  /**
   * Obtener resumen de progreso del cliente
   */
  async getClientProgressSummary(clientId, therapistId = null) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('session_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (therapistId) {
      query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const notes = (data || []).map(d => new SessionNote(d));

    if (notes.length === 0) {
      return null;
    }

    const firstNote = notes[0];
    const lastNote = notes[notes.length - 1];

    const totalScore = notes.reduce((sum, n) => sum + n.wellnessScore, 0);

    return {
      totalSessions: notes.length,
      firstSession: firstNote,
      lastSession: lastNote,
      avgWellnessScore: Math.round((totalScore / notes.length) * 100) / 100,
      wellnessProgression: notes.map(n => ({ date: n.createdAt, score: n.wellnessScore })),
      objectives: notes.flatMap(n => n.objectives || []),
      homework: notes.flatMap(n => n.homework || []),
      riskFlags: notes.filter(n => n.riskAssessment?.flagged).length
    };
  }

  /**
   * Buscar notas
   */
  async searchNotes(therapistId, searchQuery, filters = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('session_notes')
      .select('*, client:client_id(name, email), booking:booking_id(date, start_time, end_time)')
      .eq('therapist_id', therapistId);

    // Aplicar filtros
    if (filters.clientId) query = query.eq('client_id', filters.clientId);
    if (filters.mood) query = query.eq('mood', filters.mood);
    if (filters.progress) query = query.eq('progress', filters.progress);
    if (filters.sessionType) query = query.eq('session_type', filters.sessionType);
    if (filters.flagged !== undefined) {
      if (filters.flagged) {
        query = query.eq('risk_assessment->>flagged', 'true');
      }
    }
    if (filters.startDate && filters.endDate) {
      query = query
        .gte('created_at', filters.startDate)
        .lte('created_at', filters.endDate);
    }

    // Búsqueda de texto
    if (searchQuery) {
      query = query.or(`notes.ilike.%${searchQuery}%,next_steps.ilike.%${searchQuery}%`);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new SessionNote(d));
  }
}

module.exports = new SessionNoteModel();
module.exports.SessionNote = SessionNote;
module.exports.SessionNoteModel = SessionNoteModel;
