/**
 * Modelo AvailabilitySlot migrado a Supabase
 * Reemplaza el modelo Mongoose de AvailabilitySlot
 */

const SupabaseService = require('../../services/supabaseService');

class AvailabilitySlot {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapistId;
    this.dayOfWeek = data.day_of_week;
    this.startTime = data.start_time;
    this.endTime = data.end_time;
    this.isAvailable = data.is_available !== false;
    this.location = data.location;
    this.locationType = data.location_type || 'office';
    this.slotDuration = data.slot_duration || 60;
    this.bufferTime = data.buffer_time || 0;
    this.maxBookingsPerSlot = data.max_bookings_per_slot || 1;
    this.validFrom = data.valid_from;
    this.validUntil = data.valid_until;
    this.exceptions = data.exceptions || [];
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Calcular duración en minutos
   */
  get durationMinutes() {
    const [startHour, startMin] = this.startTime.split(':').map(Number);
    const [endHour, endMin] = this.endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return endMinutes - startMinutes;
  }

  /**
   * Verificar si hay conflictos con bookings existentes
   */
  async hasConflictingBookings(date) {
    const supabase = require('../../config/supabase').supabase;

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('therapistId', this.therapistId)
      .eq('date', date)
      .in('status', ['upcoming', 'pending']);

    if (error) throw new Error(error.message);

    return bookings.some(booking => {
      return (
        booking.start_time < this.endTime &&
        booking.end_time > this.startTime
      );
    });
  }

  /**
   * Verificar si la fecha está en excepciones
   */
  isExceptionDate(date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return this.exceptions.some(exc => exc.date === dateStr);
  }

  /**
   * Verificar si el slot es válido para una fecha
   */
  isValidForDate(date) {
    const checkDate = new Date(date);
    
    // Verificar rango de validez
    if (this.validFrom) {
      const fromDate = new Date(this.validFrom);
      if (checkDate < fromDate) return false;
    }
    
    if (this.validUntil) {
      const untilDate = new Date(this.validUntil);
      if (checkDate > untilDate) return false;
    }

    // Verificar si es excepción
    if (this.isExceptionDate(date)) return false;

    return true;
  }

  /**
   * Generar slots disponibles para una fecha
   */
  generateSlotsForDate(date) {
    if (!this.isValidForDate(date)) return [];

    const slots = [];
    const [startHour, startMin] = this.startTime.split(':').map(Number);
    const [endHour, endMin] = this.endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const slotDuration = this.slotDuration;
    const bufferTime = this.bufferTime;

    for (let time = startMinutes; time + slotDuration <= endMinutes; time += slotDuration + bufferTime) {
      const slotStartHour = Math.floor(time / 60);
      const slotStartMin = time % 60;
      const slotEndHour = Math.floor((time + slotDuration) / 60);
      const slotEndMin = (time + slotDuration) % 60;

      slots.push({
        startTime: `${slotStartHour.toString().padStart(2, '0')}:${slotStartMin.toString().padStart(2, '0')}`,
        endTime: `${slotEndHour.toString().padStart(2, '0')}:${slotEndMin.toString().padStart(2, '0')}`,
        duration: slotDuration,
        location: this.location,
        locationType: this.locationType
      });
    }

    return slots;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('availability_slots');

    const data = {
      therapistId: this.therapistId,
      day_of_week: this.dayOfWeek,
      start_time: this.startTime,
      end_time: this.endTime,
      is_available: this.isAvailable,
      location: this.location,
      location_type: this.locationType,
      slot_duration: this.slotDuration,
      buffer_time: this.bufferTime,
      max_bookings_per_slot: this.maxBookingsPerSlot,
      valid_from: this.validFrom,
      valid_until: this.validUntil,
      exceptions: this.exceptions
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new AvailabilitySlot(result);
    } else {
      const result = await service.create(data);
      return new AvailabilitySlot(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      dayOfWeek: this.dayOfWeek,
      startTime: this.startTime,
      endTime: this.endTime,
      isAvailable: this.isAvailable,
      location: this.location,
      locationType: this.locationType,
      slotDuration: this.slotDuration,
      bufferTime: this.bufferTime,
      maxBookingsPerSlot: this.maxBookingsPerSlot,
      validFrom: this.validFrom,
      validUntil: this.validUntil,
      exceptions: this.exceptions,
      durationMinutes: this.durationMinutes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class AvailabilitySlotModel {
  constructor() {
    this.service = new SupabaseService('availability_slots');
  }

  /**
   * Crear nuevo slot
   */
  async create(data) {
    const slotData = {
      therapistId: data.therapistId,
      day_of_week: data.dayOfWeek,
      start_time: data.startTime,
      end_time: data.endTime,
      is_available: data.isAvailable !== false,
      location: data.location,
      location_type: data.locationType || 'office',
      slot_duration: data.slotDuration || 60,
      buffer_time: data.bufferTime || 0,
      max_bookings_per_slot: data.maxBookingsPerSlot || 1,
      valid_from: data.validFrom,
      valid_until: data.validUntil,
      exceptions: data.exceptions || []
    };

    const result = await this.service.create(slotData);
    return new AvailabilitySlot(result);
  }

  /**
   * Buscar todos
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new AvailabilitySlot(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new AvailabilitySlot(result) : null;
  }

  /**
   * Buscar uno
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new AvailabilitySlot(result) : null;
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
   * Buscar por terapeuta y día de la semana
   */
  async findByTherapistAndDay(therapistId, dayOfWeek, options = {}) {
    return await this.find({
      ...options,
      filters: { therapistId: therapistId, day_of_week: dayOfWeek, is_available: true }
    });
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.dayOfWeek !== undefined) data.day_of_week = updateData.dayOfWeek;
    if (updateData.startTime) data.start_time = updateData.startTime;
    if (updateData.endTime) data.end_time = updateData.endTime;
    if (updateData.isAvailable !== undefined) data.is_available = updateData.isAvailable;
    if (updateData.location !== undefined) data.location = updateData.location;
    if (updateData.locationType) data.location_type = updateData.locationType;
    if (updateData.slotDuration !== undefined) data.slot_duration = updateData.slotDuration;
    if (updateData.bufferTime !== undefined) data.buffer_time = updateData.bufferTime;
    if (updateData.maxBookingsPerSlot !== undefined) data.max_bookings_per_slot = updateData.maxBookingsPerSlot;
    if (updateData.validFrom !== undefined) data.valid_from = updateData.validFrom;
    if (updateData.validUntil !== undefined) data.valid_until = updateData.validUntil;
    if (updateData.exceptions) data.exceptions = updateData.exceptions;

    const result = await this.service.update(id, data);
    return options.new !== false ? new AvailabilitySlot(result) : null;
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new AvailabilitySlot(result) : null;
  }

  /**
   * Eliminar múltiples por terapeuta
   */
  async deleteByTherapist(therapistId) {
    const result = await this.service.deleteMany({ therapistId: therapistId });
    return result;
  }

  /**
   * Buscar conflictos
   */
  async findConflicts(therapistId, dayOfWeek, startTime, endTime, excludeId = null) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('availability_slots')
      .select('*')
      .eq('therapistId', therapistId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new AvailabilitySlot(d));
  }

  /**
   * Obtener disponibilidad completa de un terapeuta
   */
  async getTherapistAvailability(therapistId) {
    const slots = await this.findByTherapist(therapistId, {
      filters: { is_available: true },
      order: { column: 'day_of_week', ascending: true }
    });

    // Agrupar por día de la semana
    const availability = {
      0: [], // Sunday
      1: [], // Monday
      2: [], // Tuesday
      3: [], // Wednesday
      4: [], // Thursday
      5: [], // Friday
      6: []  // Saturday
    };

    slots.forEach(slot => {
      availability[slot.dayOfWeek].push(slot);
    });

    return availability;
  }

  /**
   * Generar slots para una fecha específica
   */
  async getSlotsForDate(therapistId, date) {
    const dayOfWeek = new Date(date).getDay();
    const slots = await this.findByTherapistAndDay(therapistId, dayOfWeek);

    const allSlots = [];
    slots.forEach(slot => {
      if (slot.isValidForDate(date)) {
        allSlots.push(...slot.generateSlotsForDate(date));
      }
    });

    return allSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
}

module.exports = new AvailabilitySlotModel();
module.exports.AvailabilitySlot = AvailabilitySlot;
module.exports.AvailabilitySlotModel = AvailabilitySlotModel;
