/**
 * Modelo Client migrado a Supabase
 * Reemplaza el modelo Mongoose de Client
 */

const bcrypt = require('bcryptjs');
const SupabaseService = require('../../services/supabaseService');

// Helper function to generate random password
function generateRandomPassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

class Client {
  constructor(data = {}) {
    this.id = data.id;
    this.name = data.name;
    this.email = data.email;
    this.password = data.password;
    this.phone = data.phone;
    this.avatar = data.avatar;
    this.status = data.status || 'active';
    this.age = data.age;
    this.address = data.address;
    this.emergencyContact = data.emergency_contact || {};
    this.notes = data.notes;
    this.tags = data.tags || [];
    this.therapistId = data.therapistId;
    this.lastSession = data.last_session;
    this.sessionsCount = data.sessions_count || 0;
    this.rating = data.rating;
    this.paymentsCount = data.payments_count || 0;
    this.documentsCount = data.documents_count || 0;
    this.messagesCount = data.messages_count || 0;
    this.preferences = data.preferences || {};
    this.gdprConsent = data.gdpr_consent || {};
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    // Virtuals
    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Comparar contraseña
   */
  async comparePassword(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
  }

  /**
   * Actualizar estadísticas de sesiones
   */
  async updateSessionStats() {
    const supabase = require('../../config/supabase').supabase;

    const { data: lastBooking } = await supabase
      .from('bookings')
      .select('date')
      .eq('client_id', this.id)
      .eq('status', 'completed')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    const { count: sessionCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', this.id)
      .eq('status', 'completed');

    this.lastSession = lastBooking?.date || null;
    this.sessionsCount = sessionCount || 0;

    const service = new SupabaseService('clients');
    await service.update(this.id, {
      last_session: this.lastSession,
      sessions_count: this.sessionsCount
    });

    return this;
  }

  /**
   * Actualizar rating promedio
   */
  async updateRating() {
    const supabase = require('../../config/supabase').supabase;

    const { data: reviews } = await supabase
      .from('reviews')
      .select('rating')
      .eq('client_id', this.id);

    const ratings = reviews?.map(r => r.rating) || [];
    this.rating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : null;

    const service = new SupabaseService('clients');
    await service.update(this.id, { rating: this.rating });

    return this;
  }

  /**
   * Obtener resumen del cliente
   */
  async getSummary() {
    const supabase = require('../../config/supabase').supabase;

    const [{ data: bookings }, { data: assignedPlans }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .eq('client_id', this.id)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(5),
      
      supabase
        .from('plan_assignments')
        .select('*, plan:plan_id(*)')
        .eq('client_id', this.id)
        .eq('status', 'active')
    ]);

    return {
      id: this.id,
      name: this.name,
      email: this.email,
      status: this.status,
      sessionsCount: this.sessionsCount,
      lastSession: this.lastSession,
      rating: this.rating,
      recentBookings: bookings || [],
      activePlans: assignedPlans || []
    };
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('clients');

    // Hashear password si fue modificado
    if (this.password && !this.password.startsWith('$2')) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }

    const data = {
      name: this.name,
      email: this.email,
      password: this.password,
      phone: this.phone,
      avatar: this.avatar,
      status: this.status,
      age: this.age,
      address: this.address,
      emergency_contact: this.emergencyContact,
      notes: this.notes,
      tags: this.tags,
      therapistId: this.therapistId,
      last_session: this.lastSession,
      sessions_count: this.sessionsCount,
      rating: this.rating,
      payments_count: this.paymentsCount,
      documents_count: this.documentsCount,
      messages_count: this.messagesCount,
      preferences: this.preferences,
      gdpr_consent: this.gdprConsent
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Client(result);
    } else {
      const result = await service.create(data);
      return new Client(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      phone: this.phone,
      avatar: this.avatar,
      status: this.status,
      age: this.age,
      address: this.address,
      emergencyContact: this.emergencyContact,
      notes: this.notes,
      tags: this.tags,
      therapistId: this.therapistId,
      lastSession: this.lastSession,
      sessionsCount: this.sessionsCount,
      rating: this.rating,
      preferences: this.preferences,
      gdprConsent: this.gdprConsent,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class ClientModel {
  constructor() {
    this.service = new SupabaseService('clients');
  }

  /**
   * Crear nuevo cliente
   */
  async create(data) {
    // Generate password if not provided
    if (!data.password) {
      const randomPassword = generateRandomPassword(12);
      const salt = await bcrypt.genSalt(12);
      data.password = await bcrypt.hash(randomPassword, salt);
    } else {
      // Hash provided password
      const salt = await bcrypt.genSalt(12);
      data.password = await bcrypt.hash(data.password, salt);
    }

    const clientData = {
      name: data.name,
      email: data.email,
      password: data.password,
      phone: data.phone,
      avatar: data.avatar,
      status: data.status || 'active',
      age: data.age,
      address: data.address,
      emergency_contact: data.emergencyContact,
      notes: data.notes,
      tags: data.tags || [],
      therapistId: data.therapistId,
      preferences: data.preferences || {
        preferredTime: 'any',
        preferredLocation: 'both',
        reminderEnabled: true,
        reminderTime: 24
      },
      gdpr_consent: data.gdprConsent || { given: false }
    };

    const result = await this.service.create(clientData);
    return new Client(result);
  }

  /**
   * Buscar todos
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Client(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Client(result) : null;
  }

  /**
   * Buscar uno
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Client(result) : null;
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
   * Buscar por email y terapeuta
   */
  async findByEmailAndTherapist(email, therapistId) {
    return await this.findOne({ email, therapistId: therapistId });
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};
    
    if (updateData.name) data.name = updateData.name;
    if (updateData.email) data.email = updateData.email;
    if (updateData.password) data.password = updateData.password;
    if (updateData.phone) data.phone = updateData.phone;
    if (updateData.avatar !== undefined) data.avatar = updateData.avatar;
    if (updateData.status) data.status = updateData.status;
    if (updateData.age) data.age = updateData.age;
    if (updateData.address !== undefined) data.address = updateData.address;
    if (updateData.emergencyContact) data.emergency_contact = updateData.emergencyContact;
    if (updateData.notes !== undefined) data.notes = updateData.notes;
    if (updateData.tags) data.tags = updateData.tags;
    if (updateData.lastSession) data.last_session = updateData.lastSession;
    if (updateData.sessionsCount !== undefined) data.sessions_count = updateData.sessionsCount;
    if (updateData.rating !== undefined) data.rating = updateData.rating;
    if (updateData.paymentsCount !== undefined) data.payments_count = updateData.paymentsCount;
    if (updateData.documentsCount !== undefined) data.documents_count = updateData.documentsCount;
    if (updateData.messagesCount !== undefined) data.messages_count = updateData.messagesCount;
    if (updateData.preferences) data.preferences = updateData.preferences;
    if (updateData.gdprConsent) data.gdpr_consent = updateData.gdprConsent;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Client(result) : null;
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Client(result) : null;
  }

  /**
   * Contar
   */
  async count(filters = {}) {
    return await this.service.count(filters);
  }

  /**
   * Contar por terapeuta
   */
  async countByTherapist(therapistId, status = null) {
    const filters = { therapistId: therapistId };
    if (status) filters.status = status;
    return await this.count(filters);
  }

  /**
   * Buscar con paginación
   */
  async paginate(options = {}) {
    const result = await this.service.paginate(options);
    return {
      ...result,
      data: result.data.map(data => new Client(data))
    };
  }

  /**
   * Buscar por tags
   */
  async findByTags(tags, therapistId, options = {}) {
    const supabase = require('../../config/supabase').supabase;
    
    let query = supabase
      .from('clients')
      .select(options.select || '*')
      .eq('therapist_id', therapistId)
      .overlaps('tags', tags);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).map(d => new Client(d));
  }

  /**
   * Verificar si existe
   */
  async exists(email, therapistId) {
    const count = await this.service.count({ email, therapistId: therapistId });
    return count > 0;
  }
}

module.exports = new ClientModel();
module.exports.Client = Client;
module.exports.ClientModel = ClientModel;
