/**
 * Modelo ProfessionalProfile migrado a Supabase
 * Reemplaza el modelo Mongoose de ProfessionalProfile
 */

const SupabaseService = require('../../services/supabaseService');

class ProfessionalProfile {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.about = data.about;
    this.therapies = data.therapies || [];
    this.isAvailable = data.is_available !== false;
    this.videoPresentation = data.video_presentation || {};
    this.stats = data.stats || {
      totalSessions: 0,
      activeClients: 0,
      averageRating: 0,
      totalClients: 0,
      responseTime: 24,
      completionRate: 0,
      satisfactionRate: 0
    };
    this.specializations = data.specializations || [];
    this.languages = data.languages || [];
    this.education = data.education || [];
    this.experience = data.experience || [];
    this.rates = data.rates || {};
    this.workLocations = data.work_locations || [];
    this.socialMedia = data.social_media || {};
    this.externalLinks = data.external_links || [];
    this.pricingPackages = data.pricing_packages || {};
    this.preferences = data.preferences || {};
    this.legalInfo = data.legal_info || {};
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Calcular años totales de experiencia
   */
  get totalExperience() {
    if (!this.experience || this.experience.length === 0) return 0;

    const totalMonths = this.experience.reduce((total, exp) => {
      const startDate = new Date(exp.startDate);
      const endDate = exp.endDate ? new Date(exp.endDate) : new Date();
      const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                     (endDate.getMonth() - startDate.getMonth());
      return total + Math.max(0, months);
    }, 0);

    return Math.round(totalMonths / 12 * 10) / 10;
  }

  /**
   * Obtener porcentaje de completitud del perfil
   */
  getCompletenessPercentage() {
    let completed = 0;
    const total = 10;

    if (this.about && this.about.length > 50) completed++;
    if (this.therapies && this.therapies.length > 0) completed++;
    if (this.specializations && this.specializations.length > 0) completed++;
    if (this.languages && this.languages.length > 0) completed++;
    if (this.education && this.education.length > 0) completed++;
    if (this.experience && this.experience.length > 0) completed++;
    if (this.workLocations && this.workLocations.length > 0) completed++;
    if (this.rates && this.rates.sessionPrice > 0) completed++;
    if (this.videoPresentation && this.videoPresentation.url) completed++;
    if (this.socialMedia && this.socialMedia.website) completed++;

    return Math.round((completed / total) * 100);
  }

  /**
   * Actualizar estadísticas del perfil
   */
  async updateStats() {
    const supabase = require('../../config/supabase').supabase;

    const [activeClientsResult, totalClientsResult, completedSessionsResult, averageRatingResult] = await Promise.all([
      supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('therapist_id', this.userId)
        .eq('status', 'active'),
      
      supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('therapist_id', this.userId),
      
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('therapist_id', this.userId)
        .eq('status', 'completed'),
      
      supabase
        .from('reviews')
        .select('rating')
        .eq('therapist_id', this.userId)
    ]);

    const ratings = averageRatingResult.data?.map(r => r.rating) || [];
    const averageRating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : 0;

    this.stats = {
      totalSessions: completedSessionsResult.count || 0,
      activeClients: activeClientsResult.count || 0,
      averageRating: Math.round(averageRating * 10) / 10,
      totalClients: totalClientsResult.count || 0,
      responseTime: this.stats.responseTime || 24,
      completionRate: this.stats.completionRate || 0,
      satisfactionRate: this.stats.satisfactionRate || 0
    };

    const service = new SupabaseService('professional_profiles');
    await service.update(this.id, { stats: this.stats });

    return this.stats;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('professional_profiles');

    const data = {
      user_id: this.userId,
      about: this.about,
      therapies: this.therapies,
      is_available: this.isAvailable,
      video_presentation: this.videoPresentation,
      stats: this.stats,
      specializations: this.specializations,
      languages: this.languages,
      education: this.education,
      experience: this.experience,
      rates: this.rates,
      work_locations: this.workLocations,
      social_media: this.socialMedia,
      external_links: this.externalLinks,
      pricing_packages: this.pricingPackages,
      preferences: this.preferences,
      legal_info: this.legalInfo
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new ProfessionalProfile(result);
    } else {
      const result = await service.create(data);
      return new ProfessionalProfile(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      about: this.about,
      therapies: this.therapies,
      isAvailable: this.isAvailable,
      videoPresentation: this.videoPresentation,
      stats: this.stats,
      specializations: this.specializations,
      languages: this.languages,
      education: this.education,
      experience: this.experience,
      rates: this.rates,
      workLocations: this.workLocations,
      socialMedia: this.socialMedia,
      externalLinks: this.externalLinks,
      pricingPackages: this.pricingPackages,
      preferences: this.preferences,
      legalInfo: this.legalInfo,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      totalExperience: this.totalExperience,
      completenessPercentage: this.getCompletenessPercentage()
    };
  }
}

/**
 * Métodos estáticos
 */
class ProfessionalProfileModel {
  constructor() {
    this.service = new SupabaseService('professional_profiles');
  }

  /**
   * Crear nuevo perfil
   */
  async create(data) {
    const profileData = {
      user_id: data.userId,
      about: data.about,
      therapies: data.therapies || [],
      is_available: data.isAvailable !== false,
      video_presentation: data.videoPresentation || {},
      stats: data.stats || {
        totalSessions: 0,
        activeClients: 0,
        averageRating: 0,
        totalClients: 0,
        responseTime: 24,
        completionRate: 0,
        satisfactionRate: 0
      },
      specializations: data.specializations || [],
      languages: data.languages || [],
      education: data.education || [],
      experience: data.experience || [],
      rates: data.rates || {},
      work_locations: data.workLocations || [],
      social_media: data.socialMedia || {},
      external_links: data.externalLinks || [],
      pricing_packages: data.pricingPackages || {},
      preferences: data.preferences || {},
      legal_info: data.legalInfo || {}
    };

    const result = await this.service.create(profileData);
    return new ProfessionalProfile(result);
  }

  /**
   * Buscar todos
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new ProfessionalProfile(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new ProfessionalProfile(result) : null;
  }

  /**
   * Buscar uno
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new ProfessionalProfile(result) : null;
  }

  /**
   * Buscar por userId
   */
  async findByUserId(userId) {
    return await this.findOne({ user_id: userId });
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.about !== undefined) data.about = updateData.about;
    if (updateData.therapies) data.therapies = updateData.therapies;
    if (updateData.isAvailable !== undefined) data.is_available = updateData.isAvailable;
    if (updateData.videoPresentation) data.video_presentation = updateData.videoPresentation;
    if (updateData.stats) data.stats = updateData.stats;
    if (updateData.specializations) data.specializations = updateData.specializations;
    if (updateData.languages) data.languages = updateData.languages;
    if (updateData.education) data.education = updateData.education;
    if (updateData.experience) data.experience = updateData.experience;
    if (updateData.rates) data.rates = updateData.rates;
    if (updateData.workLocations) data.work_locations = updateData.workLocations;
    if (updateData.socialMedia) data.social_media = updateData.socialMedia;
    if (updateData.externalLinks) data.external_links = updateData.externalLinks;
    if (updateData.pricingPackages) data.pricing_packages = updateData.pricingPackages;
    if (updateData.preferences) data.preferences = updateData.preferences;
    if (updateData.legalInfo) data.legal_info = updateData.legalInfo;

    const result = await this.service.update(id, data);
    return options.new !== false ? new ProfessionalProfile(result) : null;
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new ProfessionalProfile(result) : null;
  }

  /**
   * Buscar disponibles
   */
  async findAvailable(options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, is_available: true }
    });
  }

  /**
   * Buscar por terapia
   */
  async findByTherapy(therapy, options = {}) {
    const supabase = require('../../config/supabase').supabase;
    
    let query = supabase
      .from('professional_profiles')
      .select(options.select || '*')
      .contains('therapies', [therapy]);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).map(d => new ProfessionalProfile(d));
  }

  /**
   * Buscar por especialización
   */
  async findBySpecialization(specialization, options = {}) {
    const supabase = require('../../config/supabase').supabase;
    
    let query = supabase
      .from('professional_profiles')
      .select(options.select || '*');

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    const filtered = (data || []).filter(profile => 
      profile.specializations?.some(spec => 
        spec.name?.toLowerCase().includes(specialization.toLowerCase())
      )
    );
    
    return filtered.map(d => new ProfessionalProfile(d));
  }
}

module.exports = new ProfessionalProfileModel();
module.exports.ProfessionalProfile = ProfessionalProfile;
module.exports.ProfessionalProfileModel = ProfessionalProfileModel;
