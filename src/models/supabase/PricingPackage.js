/**
 * Modelo PricingPackage migrado a Supabase
 * Reemplaza el modelo Mongoose de PricingPackage
 * Gestiona paquetes de precios que ofrecen los terapeutas a sus clientes
 */

const SupabaseService = require('../../services/supabaseService');

class PricingPackage {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapist_id;
    this.name = data.name;
    this.description = data.description;
    this.sessions = data.sessions || 1;
    this.sessionType = data.session_type || 'individual';
    this.price = parseFloat(data.price) || 0;
    this.originalPrice = data.original_price ? parseFloat(data.original_price) : null;
    this.validityDays = data.validity_days || 90;
    this.isActive = data.is_active !== false;
    this.features = data.features || [];
    this.terms = data.terms;
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
   * Virtual: ¿El paquete está activo?
   */
  get active() {
    return this.isActive;
  }

  /**
   * Virtual: Precio por sesión
   */
  get pricePerSession() {
    if (!this.sessions || this.sessions === 0) return 0;
    return this.price / this.sessions;
  }

  /**
   * Virtual: Descuento aplicado
   */
  get discount() {
    if (!this.originalPrice || this.originalPrice <= 0) return 0;
    return Math.max(0, this.originalPrice - this.price);
  }

  /**
   * Virtual: Porcentaje de descuento
   */
  get discountPercentage() {
    if (!this.originalPrice || this.originalPrice <= 0) return 0;
    return Math.round((this.discount / this.originalPrice) * 100);
  }

  /**
   * Virtual: ¿Tiene descuento?
   */
  get hasDiscount() {
    return this.discount > 0;
  }

  /**
   * Virtual: Precio formateado con moneda
   */
  get formattedPrice() {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(this.price);
  }

  /**
   * Virtual: Precio original formateado
   */
  get formattedOriginalPrice() {
    if (!this.originalPrice) return null;
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(this.originalPrice);
  }

  /**
   * Virtual: Precio por sesión formateado
   */
  get formattedPricePerSession() {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(this.pricePerSession);
  }

  /**
   * Virtual: Validez en meses (aproximado)
   */
  get validityMonths() {
    return Math.round(this.validityDays / 30);
  }

  /**
   * Virtual: ¿Es un paquete de una sola sesión?
   */
  get isSingleSession() {
    return this.sessions === 1;
  }

  /**
   * Virtual: ¿Es un paquete de múltiples sesiones?
   */
  get isMultiSession() {
    return this.sessions > 1;
  }

  /**
   * Activar paquete
   */
  async activate() {
    if (this.isActive) return this;

    const service = new SupabaseService('pricing_packages');
    
    const result = await service.update(this.id, {
      is_active: true
    });

    this.isActive = true;
    return this;
  }

  /**
   * Desactivar paquete
   */
  async deactivate() {
    if (!this.isActive) return this;

    const service = new SupabaseService('pricing_packages');
    
    const result = await service.update(this.id, {
      is_active: false
    });

    this.isActive = false;
    return this;
  }

  /**
   * Agregar característica
   */
  async addFeature(feature) {
    const newFeatures = [...(this.features || []), feature];

    const service = new SupabaseService('pricing_packages');
    
    const result = await service.update(this.id, {
      features: newFeatures
    });

    this.features = result.features;
    return this;
  }

  /**
   * Eliminar característica
   */
  async removeFeature(feature) {
    const newFeatures = (this.features || []).filter(f => f !== feature);

    const service = new SupabaseService('pricing_packages');
    
    const result = await service.update(this.id, {
      features: newFeatures
    });

    this.features = result.features;
    return this;
  }

  /**
   * Calcular ahorro comparado con precio individual
   */
  calculateSavings(individualSessionPrice) {
    if (!individualSessionPrice || individualSessionPrice <= 0) return 0;
    const regularPrice = individualSessionPrice * this.sessions;
    return Math.max(0, regularPrice - this.price);
  }

  /**
   * Verificar si un cliente puede comprar este paquete
   */
  canBePurchasedBy(clientId, existingAssignments = []) {
    // Verificar si el paquete está activo
    if (!this.isActive) return false;

    // Verificar si el cliente ya tiene un paquete activo del mismo tipo
    const hasActivePackage = existingAssignments.some(
      assignment => 
        assignment.clientId === clientId &&
        assignment.planId === this.id &&
        assignment.status === 'active'
    );

    return !hasActivePackage;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('pricing_packages');

    const data = {
      therapist_id: this.therapistId,
      name: this.name,
      description: this.description,
      sessions: this.sessions,
      session_type: this.sessionType,
      price: this.price,
      original_price: this.originalPrice,
      validity_days: this.validityDays,
      is_active: this.isActive,
      features: this.features,
      terms: this.terms
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new PricingPackage(result);
    } else {
      const result = await service.create(data);
      return new PricingPackage(result);
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
      sessions: this.sessions,
      sessionType: this.sessionType,
      price: this.price,
      formattedPrice: this.formattedPrice,
      originalPrice: this.originalPrice,
      formattedOriginalPrice: this.formattedOriginalPrice,
      hasDiscount: this.hasDiscount,
      discount: this.discount,
      discountPercentage: this.discountPercentage,
      pricePerSession: this.pricePerSession,
      formattedPricePerSession: this.formattedPricePerSession,
      validityDays: this.validityDays,
      validityMonths: this.validityMonths,
      isActive: this.isActive,
      active: this.active,
      features: this.features,
      terms: this.terms,
      isSingleSession: this.isSingleSession,
      isMultiSession: this.isMultiSession,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class PricingPackageModel {
  constructor() {
    this.service = new SupabaseService('pricing_packages');
    this.tableName = 'pricing_packages';
  }

  /**
   * Crear nuevo paquete de precios
   */
  async create(data) {
    const packageData = {
      therapist_id: data.therapistId,
      name: data.name,
      description: data.description,
      sessions: data.sessions || 1,
      session_type: data.sessionType || 'individual',
      price: data.price,
      original_price: data.originalPrice,
      validity_days: data.validityDays || 90,
      is_active: data.isActive !== false,
      features: data.features || [],
      terms: data.terms
    };

    const result = await this.service.create(packageData);
    return new PricingPackage(result);
  }

  /**
   * Buscar todos los paquetes
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new PricingPackage(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new PricingPackage(result) : null;
  }

  /**
   * Buscar un paquete por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new PricingPackage(result) : null;
  }

  /**
   * Buscar paquetes por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapist_id: therapistId }
    });
  }

  /**
   * Buscar paquetes activos de un terapeuta
   */
  async findActiveByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { 
        ...options.filters, 
        therapist_id: therapistId,
        is_active: true
      }
    });
  }

  /**
   * Buscar paquetes por tipo de sesión
   */
  async findBySessionType(sessionType, therapistId = null, options = {}) {
    const filters = { session_type: sessionType };
    if (therapistId) filters.therapist_id = therapistId;
    if (options.activeOnly !== false) filters.is_active = true;

    return await this.find({
      ...options,
      filters
    });
  }

  /**
   * Buscar paquetes por rango de precio
   */
  async findByPriceRange(minPrice, maxPrice, therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('pricing_packages')
      .select(options.select || '*')
      .gte('price', minPrice)
      .lte('price', maxPrice);

    if (therapistId) {
      query = query.eq('therapist_id', therapistId);
    }

    if (options.activeOnly !== false) {
      query = query.eq('is_active', true);
    }

    query = query.order('price', { ascending: true });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new PricingPackage(d));
  }

  /**
   * Buscar paquetes con descuento
   */
  async findWithDiscount(therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('pricing_packages')
      .select(options.select || '*')
      .not('original_price', 'is', null)
      .gt('original_price', 0);

    if (therapistId) {
      query = query.eq('therapist_id', therapistId);
    }

    query = query.eq('is_active', true);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new PricingPackage(d));
  }

  /**
   * Buscar paquetes de múltiples sesiones
   */
  async findMultiSession(therapistId = null, options = {}) {
    const filters = { sessions: { gt: 1 } };
    if (therapistId) filters.therapist_id = therapistId;

    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('pricing_packages')
      .select(options.select || '*')
      .gt('sessions', 1)
      .eq('is_active', true);

    if (therapistId) {
      query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new PricingPackage(d));
  }

  /**
   * Actualizar paquete
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.therapistId !== undefined) data.therapist_id = updateData.therapistId;
    if (updateData.name !== undefined) data.name = updateData.name;
    if (updateData.description !== undefined) data.description = updateData.description;
    if (updateData.sessions !== undefined) data.sessions = updateData.sessions;
    if (updateData.sessionType !== undefined) data.session_type = updateData.sessionType;
    if (updateData.price !== undefined) data.price = updateData.price;
    if (updateData.originalPrice !== undefined) data.original_price = updateData.originalPrice;
    if (updateData.validityDays !== undefined) data.validity_days = updateData.validityDays;
    if (updateData.isActive !== undefined) data.is_active = updateData.isActive;
    if (updateData.features !== undefined) data.features = updateData.features;
    if (updateData.terms !== undefined) data.terms = updateData.terms;

    const result = await this.service.update(id, data);
    return options.new !== false ? new PricingPackage(result) : null;
  }

  /**
   * Eliminar paquete
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new PricingPackage(result) : null;
  }

  /**
   * Contar paquetes
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
      data: result.data.map(data => new PricingPackage(data))
    };
  }

  /**
   * Obtener estadísticas de paquetes de un terapeuta
   */
  async getStats(therapistId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, activeResult, inactiveResult] = await Promise.all([
      supabase.from('pricing_packages').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId),
      supabase.from('pricing_packages').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('is_active', true),
      supabase.from('pricing_packages').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('is_active', false)
    ]);

    // Obtener precios promedio
    const { data: prices } = await supabase
      .from('pricing_packages')
      .select('price')
      .eq('therapist_id', therapistId);

    const priceValues = (prices || []).map(p => parseFloat(p.price));
    const averagePrice = priceValues.length > 0 
      ? priceValues.reduce((a, b) => a + b, 0) / priceValues.length 
      : 0;

    return {
      total: totalResult.count || 0,
      active: activeResult.count || 0,
      inactive: inactiveResult.count || 0,
      averagePrice: Math.round(averagePrice * 100) / 100,
      formattedAveragePrice: new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR'
      }).format(averagePrice)
    };
  }
}

module.exports = new PricingPackageModel();
module.exports.PricingPackage = PricingPackage;
module.exports.PricingPackageModel = PricingPackageModel;
