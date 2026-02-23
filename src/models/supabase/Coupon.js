/**
 * Modelo Coupon migrado a Supabase
 * Reemplaza el modelo Mongoose de Coupon
 * Gestiona cupones de descuento para terapeutas
 */

const SupabaseService = require('../../services/supabaseService');

class Coupon {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapistId;
    this.code = data.code;
    this.description = data.description;
    this.discountType = data.discount_type;
    this.discountValue = parseFloat(data.discount_value) || 0;
    this.minAmount = parseFloat(data.min_amount) || 0;
    this.maxUses = data.max_uses;
    this.usedCount = data.used_count || 0;
    this.validFrom = data.valid_from;
    this.validUntil = data.valid_until;
    this.isActive = data.is_active !== false;
    this.applicableServices = data.applicable_services || [];
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
   * Virtual: ¿Es descuento porcentual?
   */
  get isPercentage() {
    return this.discountType === 'percentage';
  }

  /**
   * Virtual: ¿Es descuento fijo?
   */
  get isFixed() {
    return this.discountType === 'fixed';
  }

  /**
   * Virtual: ¿Está activo?
   */
  get active() {
    return this.isActive;
  }

  /**
   * Virtual: ¿Ha expirado?
   */
  get isExpired() {
    if (!this.validUntil) return false;
    return new Date(this.validUntil) < new Date();
  }

  /**
   * Virtual: ¿Está vigente (dentro del período válido)?
   */
  get isValid() {
    if (!this.isActive) return false;
    if (this.isExpired) return false;
    if (this.validFrom && new Date(this.validFrom) > new Date()) return false;
    if (this.maxUses !== null && this.usedCount >= this.maxUses) return false;
    return true;
  }

  /**
   * Virtual: ¿Ha alcanzado el límite de usos?
   */
  get isExhausted() {
    if (this.maxUses === null) return false;
    return this.usedCount >= this.maxUses;
  }

  /**
   * Virtual: Usos restantes
   */
  get remainingUses() {
    if (this.maxUses === null) return null;
    return Math.max(0, this.maxUses - this.usedCount);
  }

  /**
   * Virtual: Porcentaje de usos consumidos
   */
  get usagePercentage() {
    if (this.maxUses === null || this.maxUses === 0) return 0;
    return Math.round((this.usedCount / this.maxUses) * 100);
  }

  /**
   * Virtual: ¿Aplica a todos los servicios?
   */
  get appliesToAllServices() {
    return !this.applicableServices || this.applicableServices.length === 0;
  }

  /**
   * Virtual: Días hasta expiración
   */
  get daysUntilExpiry() {
    if (!this.validUntil) return null;
    const days = Math.ceil((new Date(this.validUntil) - new Date()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }

  /**
   * Virtual: ¿Está por expirar (menos de 7 días)?
   */
  get isAboutToExpire() {
    const days = this.daysUntilExpiry;
    return days !== null && days > 0 && days <= 7;
  }

  /**
   * Calcular descuento para un monto
   */
  calculateDiscount(amount) {
    if (!this.isValid) return 0;
    if (amount < this.minAmount) return 0;

    if (this.isPercentage) {
      return (amount * this.discountValue) / 100;
    } else {
      return Math.min(this.discountValue, amount);
    }
  }

  /**
   * Verificar si aplica a un servicio
   */
  appliesToService(serviceType) {
    if (this.appliesToAllServices) return true;
    return this.applicableServices.includes(serviceType);
  }

  /**
   * Usar cupón
   */
  async use() {
    if (!this.isValid) {
      throw new Error('El cupón no es válido');
    }

    const service = new SupabaseService('coupons');
    
    const result = await service.update(this.id, {
      used_count: this.usedCount + 1
    });

    this.usedCount = result.used_count;
    return this;
  }

  /**
   * Desactivar cupón
   */
  async deactivate() {
    if (!this.isActive) return this;

    const service = new SupabaseService('coupons');
    
    const result = await service.update(this.id, {
      is_active: false
    });

    this.isActive = false;
    return this;
  }

  /**
   * Activar cupón
   */
  async activate() {
    if (this.isActive) return this;

    const service = new SupabaseService('coupons');
    
    const result = await service.update(this.id, {
      is_active: true
    });

    this.isActive = true;
    return this;
  }

  /**
   * Extender validez
   */
  async extendValidity(days) {
    const service = new SupabaseService('coupons');
    
    const currentEnd = this.validUntil 
      ? new Date(this.validUntil) 
      : new Date();
    currentEnd.setDate(currentEnd.getDate() + days);

    const result = await service.update(this.id, {
      valid_until: currentEnd.toISOString().split('T')[0]
    });

    this.validUntil = result.valid_until;
    return this;
  }

  /**
   * Agregar servicio aplicable
   */
  async addApplicableService(serviceType) {
    if (this.applicableServices.includes(serviceType)) {
      return this;
    }

    const service = new SupabaseService('coupons');
    
    const result = await service.update(this.id, {
      applicable_services: [...this.applicableServices, serviceType]
    });

    this.applicableServices = result.applicable_services;
    return this;
  }

  /**
   * Remover servicio aplicable
   */
  async removeApplicableService(serviceType) {
    if (!this.applicableServices.includes(serviceType)) {
      return this;
    }

    const service = new SupabaseService('coupons');
    
    const result = await service.update(this.id, {
      applicable_services: this.applicableServices.filter(s => s !== serviceType)
    });

    this.applicableServices = result.applicable_services;
    return this;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('coupons');

    const data = {
      therapistId: this.therapistId,
      code: this.code,
      description: this.description,
      discount_type: this.discountType,
      discount_value: this.discountValue,
      min_amount: this.minAmount,
      max_uses: this.maxUses,
      used_count: this.usedCount,
      valid_from: this.validFrom,
      valid_until: this.validUntil,
      is_active: this.isActive,
      applicable_services: this.applicableServices
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Coupon(result);
    } else {
      const result = await service.create(data);
      return new Coupon(result);
    }
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      code: this.code,
      description: this.description,
      discountType: this.discountType,
      isPercentage: this.isPercentage,
      isFixed: this.isFixed,
      discountValue: this.discountValue,
      minAmount: this.minAmount,
      maxUses: this.maxUses,
      usedCount: this.usedCount,
      remainingUses: this.remainingUses,
      usagePercentage: this.usagePercentage,
      isExhausted: this.isExhausted,
      validFrom: this.validFrom,
      validUntil: this.validUntil,
      isActive: this.isActive,
      active: this.active,
      isValid: this.isValid,
      isExpired: this.isExpired,
      isAboutToExpire: this.isAboutToExpire,
      daysUntilExpiry: this.daysUntilExpiry,
      applicableServices: this.applicableServices,
      appliesToAllServices: this.appliesToAllServices,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class CouponModel {
  constructor() {
    this.service = new SupabaseService('coupons');
    this.tableName = 'coupons';
  }

  /**
   * Crear nuevo cupón
   */
  async create(data) {
    // Verificar si ya existe un cupón con el mismo código para este terapeuta
    const existing = await this.findByCode(data.code, data.therapistId);
    if (existing) {
      throw new Error('Ya existe un cupón con este código');
    }

    const couponData = {
      therapistId: data.therapistId,
      code: data.code.toUpperCase(),
      description: data.description,
      discount_type: data.discountType,
      discount_value: data.discountValue,
      min_amount: data.minAmount || 0,
      max_uses: data.maxUses || null,
      used_count: 0,
      valid_from: data.validFrom || new Date().toISOString().split('T')[0],
      valid_until: data.validUntil,
      is_active: data.isActive !== false,
      applicable_services: data.applicableServices || []
    };

    const result = await this.service.create(couponData);
    return new Coupon(result);
  }

  /**
   * Buscar todos los cupones
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Coupon(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Coupon(result) : null;
  }

  /**
   * Buscar un cupón por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Coupon(result) : null;
  }

  /**
   * Buscar cupón por código
   */
  async findByCode(code, therapistId = null) {
    const filters = { code: code.toUpperCase() };
    if (therapistId) filters.therapistId = therapistId;
    return await this.findOne(filters);
  }

  /**
   * Buscar cupones por terapeuta
   */
  async findByTherapist(therapistId, options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, therapistId: therapistId }
    });
  }

  /**
   * Buscar cupones activos de un terapeuta
   */
  async findActiveByTherapist(therapistId, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('coupons')
      .select(options.select || '*')
      .eq('therapist_id', therapistId)
      .eq('is_active', true);

    // Filtrar los que no han expirado
    query = query.or(`valid_until.is.null,valid_until.gte.${new Date().toISOString().split('T')[0]}`);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Coupon(d));
  }

  /**
   * Buscar cupones válidos para un servicio
   */
  async findValidForService(therapistId, serviceType, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('coupons')
      .select(options.select || '*')
      .eq('therapist_id', therapistId)
      .eq('is_active', true)
      .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString().split('T')[0]}`)
      .or(`applicable_services.cs.{${serviceType}},applicable_services.eq.{}`);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Coupon(d)).filter(c => c.isValid);
  }

  /**
   * Validar y aplicar cupón
   */
  async validateAndApply(code, therapistId, serviceType, amount) {
    const coupon = await this.findByCode(code, therapistId);

    if (!coupon) {
      return { valid: false, error: 'Cupón no encontrado' };
    }

    if (!coupon.isValid) {
      if (!coupon.isActive) {
        return { valid: false, error: 'El cupón está desactivado' };
      }
      if (coupon.isExpired) {
        return { valid: false, error: 'El cupón ha expirado' };
      }
      if (coupon.isExhausted) {
        return { valid: false, error: 'El cupón ha alcanzado el límite de usos' };
      }
      return { valid: false, error: 'El cupón no es válido' };
    }

    if (!coupon.appliesToService(serviceType)) {
      return { valid: false, error: 'El cupón no aplica para este servicio' };
    }

    if (amount < coupon.minAmount) {
      return { 
        valid: false, 
        error: `El monto mínimo para usar este cupón es ${coupon.minAmount}` 
      };
    }

    const discount = coupon.calculateDiscount(amount);
    const finalAmount = amount - discount;

    return {
      valid: true,
      coupon: coupon.toJSON(),
      originalAmount: amount,
      discount,
      finalAmount
    };
  }

  /**
   * Buscar cupones expirados
   */
  async findExpired(therapistId = null, options = {}) {
    const supabase = require('../../config/supabase').supabase;

    let query = supabase
      .from('coupons')
      .select(options.select || '*')
      .lt('valid_until', new Date().toISOString().split('T')[0]);

    if (therapistId) {
      query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map(d => new Coupon(d));
  }

  /**
   * Actualizar cupón
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.therapistId !== undefined) data.therapistId = updateData.therapistId;
    if (updateData.code !== undefined) data.code = updateData.code.toUpperCase();
    if (updateData.description !== undefined) data.description = updateData.description;
    if (updateData.discountType !== undefined) data.discount_type = updateData.discountType;
    if (updateData.discountValue !== undefined) data.discount_value = updateData.discountValue;
    if (updateData.minAmount !== undefined) data.min_amount = updateData.minAmount;
    if (updateData.maxUses !== undefined) data.max_uses = updateData.maxUses;
    if (updateData.usedCount !== undefined) data.used_count = updateData.usedCount;
    if (updateData.validFrom !== undefined) data.valid_from = updateData.validFrom;
    if (updateData.validUntil !== undefined) data.valid_until = updateData.validUntil;
    if (updateData.isActive !== undefined) data.is_active = updateData.isActive;
    if (updateData.applicableServices !== undefined) data.applicable_services = updateData.applicableServices;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Coupon(result) : null;
  }

  /**
   * Eliminar cupón
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Coupon(result) : null;
  }

  /**
   * Contar cupones
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
      data: result.data.map(data => new Coupon(data))
    };
  }

  /**
   * Obtener estadísticas de cupones de un terapeuta
   */
  async getStats(therapistId) {
    const supabase = require('../../config/supabase').supabase;

    const [totalResult, activeResult, percentageResult, fixedResult] = await Promise.all([
      supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId),
      supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('is_active', true),
      supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('discount_type', 'percentage'),
      supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('discount_type', 'fixed')
    ]);

    // Usos totales
    const { data: usageData } = await supabase
      .from('coupons')
      .select('used_count')
      .eq('therapist_id', therapistId);

    const totalUses = (usageData || []).reduce((sum, c) => sum + (c.used_count || 0), 0);

    return {
      total: totalResult.count || 0,
      active: activeResult.count || 0,
      percentage: percentageResult.count || 0,
      fixed: fixedResult.count || 0,
      totalUses
    };
  }

  /**
   * Generar código aleatorio
   */
  generateCode(prefix = 'DHARA', length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix;
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

module.exports = new CouponModel();
module.exports.Coupon = Coupon;
module.exports.CouponModel = CouponModel;
