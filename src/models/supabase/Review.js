/**
 * Modelo Review migrado a Supabase
 * Reemplaza el modelo Mongoose de Review
 * Gestiona reseñas y valoraciones de clientes a terapeutas
 */

const SupabaseService = require('../../services/supabaseService');

class Review {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapistId;
    this.clientId = data.client_id;
    this.bookingId = data.booking_id;
    this.rating = data.rating || 0;
    this.title = data.title;
    this.comment = data.comment;
    this.isVerified = data.is_verified || false;
    this.isPublic = data.is_public !== false;
    this.therapistResponse = data.therapist_response;
    this.respondedAt = data.responded_at;
    this.helpfulCount = data.helpful_count || 0;
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
   * Virtual: ¿Es una reseña positiva (4-5 estrellas)?
   */
  get isPositive() {
    return this.rating >= 4;
  }

  /**
   * Virtual: ¿Es una reseña negativa (1-2 estrellas)?
   */
  get isNegative() {
    return this.rating <= 2;
  }

  /**
   * Virtual: ¿Es una reseña neutral (3 estrellas)?
   */
  get isNeutral() {
    return this.rating === 3;
  }

  /**
   * Virtual: ¿Tiene respuesta del terapeuta?
   */
  get hasResponse() {
    return !!this.therapistResponse;
  }

  /**
   * Virtual: ¿Es verificada?
   */
  get verified() {
    return this.isVerified;
  }

  /**
   * Virtual: Representación en estrellas
   */
  get stars() {
    return '★'.repeat(this.rating) + '☆'.repeat(5 - this.rating);
  }

  /**
   * Virtual: Longitud del comentario
   */
  get commentLength() {
    return this.comment ? this.comment.length : 0;
  }

  /**
   * Virtual: ¿Tiene comentario detallado?
   */
  get hasDetailedComment() {
    return this.commentLength > 50;
  }

  /**
   * Virtual: Tiempo transcurrido desde la creación
   */
  get timeAgo() {
    if (!this.createdAt) return null;
    const created = new Date(this.createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return created.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
  }

  /**
   * Responder a la reseña
   */
  async respond(response) {
    const service = new SupabaseService('reviews');
    
    const result = await service.update(this.id, {
      therapist_response: response,
      responded_at: new Date().toISOString()
    });

    this.therapistResponse = result.therapist_response;
    this.respondedAt = result.responded_at;
    return this;
  }

  /**
   * Editar respuesta
   */
  async editResponse(newResponse) {
    if (!this.hasResponse) {
      throw new Error('No hay respuesta para editar');
    }

    const service = new SupabaseService('reviews');
    
    const result = await service.update(this.id, {
      therapist_response: newResponse,
      responded_at: new Date().toISOString()
    });

    this.therapistResponse = result.therapist_response;
    this.respondedAt = result.responded_at;
    return this;
  }

  /**
   * Eliminar respuesta
   */
  async deleteResponse() {
    const service = new SupabaseService('reviews');
    
    const result = await service.update(this.id, {
      therapist_response: null,
      responded_at: null
    });

    this.therapistResponse = null;
    this.respondedAt = null;
    return this;
  }

  /**
   * Marcar como verificada
   */
  async verify() {
    if (this.isVerified) return this;

    const service = new SupabaseService('reviews');
    
    const result = await service.update(this.id, {
      is_verified: true
    });

    this.isVerified = true;
    return this;
  }

  /**
   * Cambiar visibilidad
   */
  async setVisibility(isPublic) {
    const service = new SupabaseService('reviews');
    
    const result = await service.update(this.id, {
      is_public: isPublic
    });

    this.isPublic = result.is_public;
    return this;
  }

  /**
   * Incrementar contador de útil
   */
  async markAsHelpful() {
    const service = new SupabaseService('reviews');
    
    const result = await service.update(this.id, {
      helpful_count: this.helpfulCount + 1
    });

    this.helpfulCount = result.helpful_count;
    return this;
  }

  /**
   * Obtener resumen de la reseña
   */
  getSummary(maxLength = 100) {
    if (!this.comment) return '';
    if (this.comment.length <= maxLength) return this.comment;
    return this.comment.substring(0, maxLength) + '...';
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('reviews');

    const data = {
      therapistId: this.therapistId,
      client_id: this.clientId,
      booking_id: this.bookingId,
      rating: this.rating,
      title: this.title,
      comment: this.comment,
      is_verified: this.isVerified,
      is_public: this.isPublic,
      therapist_response: this.therapistResponse,
      responded_at: this.respondedAt,
      helpful_count: this.helpfulCount
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Review(result);
    } else {
      const result = await service.create(data);
      return new Review(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      clientId: this.clientId,
      bookingId: this.bookingId,
      rating: this.rating,
      stars: this.stars,
      title: this.title,
      comment: this.comment,
      summary: this.getSummary(),
      commentLength: this.commentLength,
      hasDetailedComment: this.hasDetailedComment,
      isVerified: this.isVerified,
      verified: this.verified,
      isPublic: this.isPublic,
      isPositive: this.isPositive,
      isNegative: this.isNegative,
      isNeutral: this.isNeutral,
      hasResponse: this.hasResponse,
      therapistResponse: this.therapistResponse,
      respondedAt: this.respondedAt,
      helpfulCount: this.helpfulCount,
      timeAgo: this.timeAgo,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class ReviewModel {
  constructor() {
    this.service = new SupabaseService('reviews');
    this.tableName = 'reviews';
  }

  /**
   * Crear nueva reseña
   */
  async create(data) {
    const reviewData = {
      therapist_id: data.therapistId,
      client_id: data.clientId,
      booking_id: data.bookingId || null,
      rating: data.rating,
      title: data.title,
      comment: data.comment,
      is_verified: data.isVerified || false,
      is_public: data.isPublic !== false,
      therapist_response: data.therapistResponse,
      responded_at: data.respondedAt,
      helpful_count: data.helpfulCount || 0
    };

    const result = await this.service.create(reviewData);
    return new Review(result);
  }

  /**
   * Buscar todas las reseñas
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Review(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Review(result) : null;
  }

  /**
   * Buscar una reseña por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Review(result) : null;
  }

  /**
   * Buscar reseñas por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('reviews')
      .select(options.select || '*')
      .eq('therapist_id', therapistId)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (options.rating) {
      query = query.eq('rating', options.rating);
    }

    if (options.verifiedOnly) {
      query = query.eq('is_verified', true);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Review(d));
  }

  /**
   * Buscar reseñas por cliente
   */
  async findByClient(clientId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, client_id: clientId }
    });
  }

  /**
   * Buscar reseña por reserva
   */
  async findByBooking(bookingId) {
    return await this.findOne({ booking_id: bookingId });
  }

  /**
   * Buscar reseñas por rating
   */
  async findByRating(rating, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, rating }
    });
  }

  /**
   * Buscar reseñas positivas
   */
  async findPositive(therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('reviews')
      .select(options.select || '*')
      .gte('rating', 4)
      .eq('is_public', true);

    if (therapistId) {
      query = query.eq('therapist_id', therapistId);
    }

    query = query.order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Review(d));
  }

  /**
   * Buscar reseñas negativas
   */
  async findNegative(therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('reviews')
      .select(options.select || '*')
      .lte('rating', 2)
      .eq('is_public', true);

    if (therapistId) {
      query = query.eq('therapist_id', therapistId);
    }

    query = query.order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Review(d));
  }

  /**
   * Buscar reseñas sin respuesta
   */
  async findUnresponded(therapistId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('reviews')
      .select(options.select || '*')
      .eq('therapist_id', therapistId)
      .is('therapist_response', null);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Review(d));
  }

  /**
   * Buscar reseñas verificadas
   */
  async findVerified(therapistId = null, options = {}) {
    const filters = { is_verified: true, is_public: true };
    if (therapistId) filters.therapistId = therapistId;

    return await this.find({
      ...options,
      filters: { ...options.filters, ...filters }
    });
  }

  /**
   * Actualizar reseña
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.therapistId !== undefined) data.therapistId = updateData.therapistId;
    if (updateData.clientId !== undefined) data.client_id = updateData.clientId;
    if (updateData.bookingId !== undefined) data.booking_id = updateData.bookingId;
    if (updateData.rating !== undefined) data.rating = updateData.rating;
    if (updateData.title !== undefined) data.title = updateData.title;
    if (updateData.comment !== undefined) data.comment = updateData.comment;
    if (updateData.isVerified !== undefined) data.is_verified = updateData.isVerified;
    if (updateData.isPublic !== undefined) data.is_public = updateData.isPublic;
    if (updateData.therapistResponse !== undefined) data.therapist_response = updateData.therapistResponse;
    if (updateData.respondedAt !== undefined) data.responded_at = updateData.respondedAt;
    if (updateData.helpfulCount !== undefined) data.helpful_count = updateData.helpfulCount;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Review(result) : null;
  }

  /**
   * Eliminar reseña
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Review(result) : null;
  }

  /**
   * Contar reseñas
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
      data: result.data.map(data => new Review(data))
    };
  }

  /**
   * Obtener estadísticas de reseñas de un terapeuta
   */
  async getStats(therapistId) {
    const supabase = require('../../config/supabase').supabase;

    const { data, error } = await supabase
      .from('reviews')
      .select('rating')
      .eq('therapist_id', therapistId)
      .eq('is_public', true);

    if (error) throw new Error(error.message);

    const reviews = data || [];
    const total = reviews.length;

    if (total === 0) {
      return {
        total: 0,
        average: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      };
    }

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => distribution[r.rating]++);

    return {
      total,
      average: Math.round((sum / total) * 10) / 10,
      distribution
    };
  }

  /**
   * Verificar si un cliente ya ha reseñado una reserva
   */
  async existsForBooking(clientId, bookingId) {
    const count = await this.count({
      client_id: clientId,
      booking_id: bookingId
    });
    return count > 0;
  }
}

module.exports = new ReviewModel();
module.exports.Review = Review;
module.exports.ReviewModel = ReviewModel;
