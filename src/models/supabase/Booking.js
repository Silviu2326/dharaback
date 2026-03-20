/**
 * Modelo Booking migrado a Supabase
 * Reemplaza el modelo Mongoose de Booking
 */

const SupabaseService = require('../../services/supabaseService');

class Booking {
  constructor(data = {}) {
    this.id = data.id;
    this.date = data.date;
    this.startTime = data.start_time;
    this.endTime = data.end_time;
    this.clientId = data.client_id;
    this.therapistId = data.therapist_id || data.therapistId;
    this.therapyType = data.therapy_type;
    this.therapyDuration = data.therapy_duration || 60;
    this.status = data.status || 'upcoming';
    this.amount = data.amount;
    this.currency = data.currency || 'EUR';
    this.paymentStatus = data.payment_status || 'unpaid';
    this.paymentMethod = data.payment_method;
    this.location = data.location;
    this.notes = data.notes;
    this.meetingLink = data.meeting_link;
    this.sessionDocument = data.session_document;
    this.planId = data.plan_id;
    this.reminderSent = data.reminder_sent || false;
    this.cancellationReason = data.cancellation_reason;
    this.cancelledBy = data.cancelled_by;
    this.cancelledAt = data.cancelled_at;
    this.lastStatusChange = data.last_status_change;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    // Relaciones populadas
    this.client = data.client;
    this.therapist = data.therapist;
    this.sessionNotes = data.session_notes;
    this.payment = data.payment;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Obtener duración en minutos
   */
  getDurationMinutes() {
    const [startHour, startMin] = this.startTime.split(':').map(Number);
    const [endHour, endMin] = this.endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return endMinutes - startMinutes;
  }

  /**
   * Verificar si se puede cancelar
   */
  canBeCancelled() {
    const now = new Date();
    const bookingDateTime = new Date(`${this.date}T${this.startTime}`);
    const hoursDifference = (bookingDateTime - now) / (1000 * 60 * 60);

    return ['upcoming', 'pending'].includes(this.status) && hoursDifference > 24;
  }

  /**
   * Verificar si se puede reprogramar
   */
  canBeRescheduled() {
    const now = new Date();
    const bookingDateTime = new Date(`${this.date}T${this.startTime}`);
    const hoursDifference = (bookingDateTime - now) / (1000 * 60 * 60);

    return ['upcoming', 'pending'].includes(this.status) && hoursDifference > 48;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('bookings');

    // Actualizar lastStatusChange si el status cambió
    const data = {
      date: this.date,
      start_time: this.startTime,
      end_time: this.endTime,
      client_id: this.clientId,
      therapist_id: this.therapistId,
      therapy_type: this.therapyType,
      therapy_duration: this.therapyDuration,
      status: this.status,
      amount: this.amount,
      currency: this.currency,
      payment_status: this.paymentStatus,
      payment_method: this.paymentMethod,
      location: this.location,
      notes: this.notes,
      meeting_link: this.meetingLink,
      session_document: this.sessionDocument,
      plan_id: this.planId,
      reminder_sent: this.reminderSent,
      cancellation_reason: this.cancellationReason,
      cancelled_by: this.cancelledBy,
      cancelled_at: this.cancelledAt,
      last_status_change: new Date()
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Booking(result);
    } else {
      const result = await service.create(data);
      return new Booking(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      date: this.date,
      startTime: this.startTime,
      endTime: this.endTime,
      clientId: this.clientId,
      therapist_id: this.therapistId,
      therapyType: this.therapyType,
      therapyDuration: this.therapyDuration,
      status: this.status,
      amount: this.amount,
      currency: this.currency,
      paymentStatus: this.paymentStatus,
      paymentMethod: this.paymentMethod,
      location: this.location,
      notes: this.notes,
      meetingLink: this.meetingLink,
      sessionDocument: this.sessionDocument,
      planId: this.planId,
      reminderSent: this.reminderSent,
      cancellationReason: this.cancellationReason,
      cancelledBy: this.cancelledBy,
      cancelledAt: this.cancelledAt,
      lastStatusChange: this.lastStatusChange,
      client: this.client,
      therapist: this.therapist,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class BookingModel {
  constructor() {
    this.service = new SupabaseService('bookings');
  }

  /**
   * Crear nueva booking
   */
  async create(data) {
    const bookingData = {
      date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      client_id: data.clientId,
      therapist_id: data.therapistId,
      therapy_type: data.therapyType,
      therapy_duration: data.therapyDuration || 60,
      status: data.status || 'upcoming',
      amount: data.amount,
      currency: data.currency || 'EUR',
      payment_status: data.paymentStatus || 'unpaid',
      payment_method: data.paymentMethod,
      location: data.location,
      notes: data.notes,
      meeting_link: data.meetingLink,
      session_document: data.sessionDocument,
      plan_id: data.planId,
      reminder_sent: data.reminderSent || false,
      cancellation_reason: data.cancellationReason,
      cancelled_by: data.cancelledBy,
      cancelled_at: data.cancelledAt,
      last_status_change: new Date()
    };

    const result = await this.service.create(bookingData);
    return new Booking(result);
  }

  /**
   * Buscar todos
   */
  async find(options = {}) {
    // Translate property names to database column names in filters
    let translatedOptions = { ...options };
    if (options.filters) {
      const columnFilters = {};
      const f = options.filters;
      if (f.id) columnFilters.id = f.id;
      if (f.clientId || f.client_id) columnFilters.client_id = f.clientId || f.client_id;
      if (f.therapistId || f.therapist_id) columnFilters.therapist_id = f.therapistId || f.therapist_id;
      if (f.date) columnFilters.date = f.date;
      if (f.status) columnFilters.status = f.status;
      if (f.therapyType || f.therapy_type) columnFilters.therapy_type = f.therapyType || f.therapy_type;
      if (f.isAvailable !== undefined) columnFilters.is_available = f.isAvailable;
      translatedOptions.filters = columnFilters;
    }
    
    const results = await this.service.findAll(translatedOptions);
    return results.map(data => new Booking(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Booking(result) : null;
  }

  /**
   * Buscar uno
   */
  async findOne(filters, options = {}) {
    // Translate property names to database column names
    const columnFilters = {};
    if (filters.id) columnFilters.id = filters.id;
    if (filters.clientId) columnFilters.client_id = filters.clientId;
    if (filters.therapistId) columnFilters.therapist_id = filters.therapistId;
    if (filters.date) columnFilters.date = filters.date;
    if (filters.status) columnFilters.status = filters.status;
    if (filters.therapyType) columnFilters.therapy_type = filters.therapyType;
    
    const result = await this.service.findOne(columnFilters, options);
    return result ? new Booking(result) : null;
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {
      last_status_change: new Date()
    };

    if (updateData.date) data.date = updateData.date;
    if (updateData.startTime) data.start_time = updateData.startTime;
    if (updateData.endTime) data.end_time = updateData.endTime;
    if (updateData.clientId) data.client_id = updateData.clientId;
    if (updateData.therapistId) data.therapist_id = updateData.therapistId;
    if (updateData.therapist_id) data.therapist_id = updateData.therapist_id;
    if (updateData.therapyType) data.therapy_type = updateData.therapyType;
    if (updateData.therapyDuration) data.therapy_duration = updateData.therapyDuration;
    if (updateData.status) data.status = updateData.status;
    if (updateData.amount !== undefined) data.amount = updateData.amount;
    if (updateData.currency) data.currency = updateData.currency;
    if (updateData.paymentStatus) data.payment_status = updateData.paymentStatus;
    if (updateData.paymentMethod !== undefined) data.payment_method = updateData.paymentMethod;
    if (updateData.location) data.location = updateData.location;
    if (updateData.notes !== undefined) data.notes = updateData.notes;
    if (updateData.meetingLink !== undefined) data.meeting_link = updateData.meetingLink;
    if (updateData.sessionDocument !== undefined) data.session_document = updateData.sessionDocument;
    if (updateData.planId !== undefined) data.plan_id = updateData.planId;
    if (updateData.reminderSent !== undefined) data.reminder_sent = updateData.reminderSent;
    if (updateData.cancellationReason) data.cancellation_reason = updateData.cancellationReason;
    if (updateData.cancelledBy) data.cancelled_by = updateData.cancelledBy;
    if (updateData.cancelledAt) data.cancelled_at = updateData.cancelledAt;

    // Si se cancela, agregar timestamp
    if (updateData.status === 'cancelled' && !data.cancelled_at) {
      data.cancelled_at = new Date();
    }

    const result = await this.service.update(id, data);
    return options.new !== false ? new Booking(result) : null;
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Booking(result) : null;
  }

  /**
   * Buscar por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapist_id: therapistId }
    });
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
   * Buscar por rango de fechas
   */
  async findByDateRange(therapistId, startDate, endDate, options = {}) {
    const supabase = require('../../config/supabase').supabase;
    
    let query = supabase
      .from('bookings')
      .select(options.select || '*')
      .eq('therapist_id', therapistId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending });
    } else {
      query = query.order('date', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).map(d => new Booking(d));
  }

  /**
   * Buscar citas conflictivas
   */
  async findConflicts(therapistId, date, startTime, endTime, excludeId = null) {
    const supabase = require('../../config/supabase').supabase;
    
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('therapist_id', therapistId)
      .eq('date', date)
      .in('status', ['upcoming', 'pending', 'completed'])
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).map(d => new Booking(d));
  }

  /**
   * Buscar próximas citas
   */
  async findUpcoming(therapistId, limit = 10) {
    const today = new Date().toISOString().split('T')[0];
    
    const supabase = require('../../config/supabase').supabase;
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('therapist_id', therapistId)
      .gte('date', today)
      .in('status', ['upcoming', 'pending'])
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);
    
    return (data || []).map(d => new Booking(d));
  }

  /**
   * Obtener estadísticas
   */
  async getStats(therapistId, startDate, endDate) {
    const supabase = require('../../config/supabase').supabase;

    const { data, error } = await supabase
      .from('bookings')
      .select('status, amount')
      .eq('therapist_id', therapistId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw new Error(error.message);

    const stats = {};
    data?.forEach(booking => {
      if (!stats[booking.status]) {
        stats[booking.status] = { count: 0, totalAmount: 0 };
      }
      stats[booking.status].count++;
      stats[booking.status].totalAmount += booking.amount || 0;
    });

    return stats;
  }

  /**
   * Contar
   */
  async count(filters = {}) {
    // Translate camelCase filters to snake_case column names
    const columnFilters = {};
    if (filters.clientId) columnFilters.client_id = filters.clientId;
    if (filters.therapistId) columnFilters.therapist_id = filters.therapistId;
    if (filters.status) columnFilters.status = filters.status;
    if (filters.date) columnFilters.date = filters.date;
    if (filters.therapyType) columnFilters.therapy_type = filters.therapyType;
    
    return await this.service.count(columnFilters);
  }

  /**
   * Paginación
   */
  async paginate(options = {}) {
    const result = await this.service.paginate(options);
    return {
      ...result,
      data: result.data.map(data => new Booking(data))
    };
  }

  // Métodos estáticos para compatibilidad con controladores
  static async findById(id, options = {}) {
    const instance = new BookingModel();
    const result = await instance.service.findById(id, options);
    return result ? new Booking(result) : null;
  }

  static async findOne(filters, options = {}) {
    const instance = new BookingModel();
    const result = await instance.service.findOne(filters, options);
    return result ? new Booking(result) : null;
  }

  static async find(filters, options = {}) {
    const instance = new BookingModel();
    const results = await instance.service.findAll(filters, options);
    return results.map(data => new Booking(data));
  }

  static async create(data) {
    const instance = new BookingModel();
    return await instance.create(data);
  }
}

module.exports = new BookingModel();
module.exports.Booking = Booking;
module.exports.BookingModel = BookingModel;
