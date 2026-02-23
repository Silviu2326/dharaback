/**
 * Modelo Absence migrado a Supabase
 * Reemplaza el modelo Mongoose de Absence
 */

const SupabaseService = require('../../services/supabaseService');

class Absence {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapistId;
    this.startDate = data.start_date;
    this.endDate = data.end_date;
    this.type = data.type;
    this.reason = data.reason;
    this.isRecurring = data.is_recurring || false;
    this.recurrencePattern = data.recurrence_pattern || {};
    this.status = data.status || 'approved';
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Calcular duración en días
   */
  get durationDays() {
    const startDate = new Date(this.startDate);
    const endDate = new Date(this.endDate);
    const diffTime = Math.abs(endDate - startDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  /**
   * Obtener rango de fechas formateado
   */
  get dateRange() {
    const start = new Date(this.startDate).toLocaleDateString('es-ES');
    const end = new Date(this.endDate).toLocaleDateString('es-ES');

    if (start === end) {
      return start;
    }
    return `${start} - ${end}`;
  }

  /**
   * Buscar bookings en conflicto
   */
  async getConflictingBookings() {
    const supabase = require('../../config/supabase').supabase;

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*, client:client_id(name, email, phone)')
      .eq('therapist_id', this.therapistId)
      .gte('date', this.startDate)
      .lte('date', this.endDate)
      .in('status', ['upcoming', 'pending']);

    if (error) throw new Error(error.message);

    return bookings || [];
  }

  /**
   * Manejar bookings afectados
   */
  async handleAffectedBookings(action = 'cancel') {
    const conflictingBookings = await this.getConflictingBookings();
    const supabase = require('../../config/supabase').supabase;

    for (const booking of conflictingBookings) {
      switch (action) {
        case 'cancel':
          await supabase
            .from('bookings')
            .update({
              status: 'cancelled',
              cancellation_reason: `Ausencia del terapeuta: ${this.reason || this.type}`,
              cancelled_by: 'therapist',
              updated_at: new Date()
            })
            .eq('id', booking.id);
          break;
        case 'reschedule':
          await supabase
            .from('bookings')
            .update({
              notes: `${booking.notes || ''}\n[REQUIERE REPROGRAMACIÓN - Ausencia: ${this.reason || this.type}]`,
              updated_at: new Date()
            })
            .eq('id', booking.id);
          break;
        default:
          // No hacer nada
          break;
      }
    }

    return conflictingBookings;
  }

  /**
   * Generar instancias recurrentes
   */
  generateRecurringInstances() {
    if (!this.isRecurring || !this.recurrencePattern.frequency) return [];

    const instances = [];
    const pattern = this.recurrencePattern;
    let currentStartDate = new Date(this.startDate);
    let currentEndDate = new Date(this.endDate);
    const endRecurrence = pattern.endRecurrence || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    let count = 0;
    const maxInstances = 50;

    while (currentStartDate <= endRecurrence && count < maxInstances) {
      switch (pattern.frequency) {
        case 'weekly':
          currentStartDate.setDate(currentStartDate.getDate() + (7 * (pattern.interval || 1)));
          currentEndDate.setDate(currentEndDate.getDate() + (7 * (pattern.interval || 1)));
          break;
        case 'monthly':
          currentStartDate.setMonth(currentStartDate.getMonth() + (pattern.interval || 1));
          currentEndDate.setMonth(currentEndDate.getMonth() + (pattern.interval || 1));
          break;
        case 'yearly':
          currentStartDate.setFullYear(currentStartDate.getFullYear() + (pattern.interval || 1));
          currentEndDate.setFullYear(currentEndDate.getFullYear() + (pattern.interval || 1));
          break;
        default:
          return [];
      }

      if (currentStartDate > new Date(this.endDate) && currentStartDate <= endRecurrence) {
        instances.push({
          therapistId: this.therapistId,
          start_date: currentStartDate.toISOString().split('T')[0],
          end_date: currentEndDate.toISOString().split('T')[0],
          type: this.type,
          reason: this.reason,
          is_recurring: false,
          status: this.status
        });
        count++;
      }
    }

    return instances;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('absences');

    const data = {
      therapistId: this.therapistId,
      start_date: this.startDate,
      end_date: this.endDate,
      type: this.type,
      reason: this.reason,
      is_recurring: this.isRecurring,
      recurrence_pattern: this.recurrencePattern,
      status: this.status
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Absence(result);
    } else {
      const result = await service.create(data);
      
      // Si es recurrente, crear instancias
      if (this.isRecurring) {
        const instances = this.generateRecurringInstances();
        if (instances.length > 0) {
          await service.createMany(instances);
        }
      }
      
      return new Absence(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      startDate: this.startDate,
      endDate: this.endDate,
      type: this.type,
      reason: this.reason,
      isRecurring: this.isRecurring,
      recurrencePattern: this.recurrencePattern,
      status: this.status,
      durationDays: this.durationDays,
      dateRange: this.dateRange,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class AbsenceModel {
  constructor() {
    this.service = new SupabaseService('absences');
  }

  /**
   * Crear nueva ausencia
   */
  async create(data) {
    const absenceData = {
      therapistId: data.therapistId,
      start_date: data.startDate,
      end_date: data.endDate,
      type: data.type || 'other',
      reason: data.reason,
      is_recurring: data.isRecurring || false,
      recurrence_pattern: data.recurrencePattern || {},
      status: data.status || 'approved'
    };

    const result = await this.service.create(absenceData);
    const absence = new Absence(result);

    // Si es recurrente, crear instancias
    if (absence.isRecurring) {
      const instances = absence.generateRecurringInstances();
      if (instances.length > 0) {
        await this.service.createMany(instances);
      }
    }

    return absence;
  }

  /**
   * Buscar todas
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Absence(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Absence(result) : null;
  }

  /**
   * Buscar una
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Absence(result) : null;
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

    if (updateData.startDate) data.start_date = updateData.startDate;
    if (updateData.endDate) data.end_date = updateData.endDate;
    if (updateData.type) data.type = updateData.type;
    if (updateData.reason !== undefined) data.reason = updateData.reason;
    if (updateData.isRecurring !== undefined) data.is_recurring = updateData.isRecurring;
    if (updateData.recurrencePattern) data.recurrence_pattern = updateData.recurrencePattern;
    if (updateData.status) data.status = updateData.status;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Absence(result) : null;
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Absence(result) : null;
  }

  /**
   * Buscar conflictos
   */
  async findConflicts(therapistId, startDate, endDate, excludeId = null) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('absences')
      .select('*')
      .eq('therapist_id', therapistId)
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Absence(d));
  }

  /**
   * Obtener ausencias de un terapeuta en un rango de fechas
   */
  async getTherapistAbsences(therapistId, startDate, endDate) {
    const supabase = require('../../config/supabase').supabase;

    const { data, error } = await supabase
      .from('absences')
      .select('*')
      .eq('therapist_id', therapistId)
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .order('start_date', { ascending: true });

    if (error) throw new Error(error.message);

    return (data || []).map(d => new Absence(d));
  }

  /**
   * Verificar si hay ausencias en una fecha
   */
  async hasAbsenceOnDate(therapistId, date) {
    const supabase = require('../../config/supabase').supabase;

    const { data, error } = await supabase
      .from('absences')
      .select('*', { count: 'exact', head: true })
      .eq('therapist_id', therapistId)
      .eq('status', 'approved')
      .lte('start_date', date)
      .gte('end_date', date);

    if (error) throw new Error(error.message);

    return data > 0;
  }

  /**
   * Obtener estadísticas de ausencias
   */
  async getAbsenceStats(therapistId, year = new Date().getFullYear()) {
    const supabase = require('../../config/supabase').supabase;

    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    const { data, error } = await supabase
      .from('absences')
      .select('*')
      .eq('therapist_id', therapistId)
      .eq('status', 'approved')
      .gte('start_date', startOfYear)
      .lte('end_date', endOfYear);

    if (error) throw new Error(error.message);

    const absences = (data || []).map(d => new Absence(d));
    
    const stats = {
      total: absences.length,
      totalDays: absences.reduce((sum, a) => sum + a.durationDays, 0),
      byType: {}
    };

    absences.forEach(absence => {
      if (!stats.byType[absence.type]) {
        stats.byType[absence.type] = { count: 0, days: 0 };
      }
      stats.byType[absence.type].count++;
      stats.byType[absence.type].days += absence.durationDays;
    });

    return stats;
  }
}

module.exports = new AbsenceModel();
module.exports.Absence = Absence;
module.exports.AbsenceModel = AbsenceModel;
