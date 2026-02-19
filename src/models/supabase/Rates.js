/**
 * Modelo Rates migrado a Supabase
 * Reemplaza el modelo Mongoose de Rates
 */

const SupabaseService = require('../../services/supabaseService');

class Rates {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapist_id;
    this.sessionPrice = data.session_price || 60;
    this.followUpPrice = data.follow_up_price || 50;
    this.packagePrice = data.package_price || 200;
    this.coupleSessionPrice = data.couple_session_price || 80;
    this.currency = data.currency || 'EUR';
    this.customRates = data.custom_rates || {};
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Calcular precio por minuto
   */
  get pricePerMinute() {
    return Math.round((this.sessionPrice / 60) * 100) / 100;
  }

  /**
   * Verificar si tiene tarifas personalizadas
   */
  get hasCustomRates() {
    return this.customRates && 
           (this.customRates.sessions?.length > 0 || this.customRates.packages?.length > 0);
  }

  /**
   * Calcular precio para tipo de sesión
   */
  calculatePrice(sessionType, duration = 60, discountCode = null) {
    // Buscar tarifa personalizada
    const customSession = this.customRates.sessions?.find(s => s.type === sessionType);
    
    let basePrice;
    if (customSession) {
      basePrice = (customSession.price / customSession.duration) * duration;
    } else {
      // Usar precios legacy
      const baseAmount = {
        individual: this.sessionPrice,
        followup: this.followUpPrice,
        couple: this.coupleSessionPrice
      }[sessionType] || this.sessionPrice;
      
      basePrice = (baseAmount / 60) * duration;
    }

    // Aplicar descuento si existe
    if (discountCode && this.customRates.discounts) {
      const discount = this.customRates.discounts.find(d => 
        d.code === discountCode && 
        d.isActive !== false &&
        (!d.validFrom || new Date(d.validFrom) <= new Date()) &&
        (!d.validUntil || new Date(d.validUntil) >= new Date())
      );

      if (discount) {
        if (discount.type === 'percentage') {
          basePrice = basePrice * (1 - discount.value / 100);
        } else {
          basePrice = Math.max(0, basePrice - discount.value);
        }
      }
    }

    return Math.round(basePrice * 100) / 100;
  }

  /**
   * Calcular precio de paquete
   */
  calculatePackagePrice(packageId) {
    const pkg = this.customRates.packages?.find(p => p.id === packageId);
    if (!pkg) return null;

    return {
      total: pkg.price,
      perSession: pkg.sessions > 0 ? Math.round((pkg.price / pkg.sessions) * 100) / 100 : 0,
      savings: pkg.originalPrice ? pkg.originalPrice - pkg.price : 0
    };
  }

  /**
   * Obtener lista de precios formateada
   */
  getPriceList() {
    const prices = [
      {
        type: 'individual',
        name: 'Sesión Individual',
        duration: 60,
        price: this.sessionPrice
      },
      {
        type: 'followup',
        name: 'Sesión de Seguimiento',
        duration: 60,
        price: this.followUpPrice
      },
      {
        type: 'couple',
        name: 'Sesión de Pareja',
        duration: 60,
        price: this.coupleSessionPrice
      }
    ];

    // Agregar tarifas personalizadas
    if (this.customRates.sessions) {
      this.customRates.sessions.forEach(session => {
        const existingIndex = prices.findIndex(p => p.type === session.type);
        if (existingIndex >= 0) {
          prices[existingIndex] = {
            type: session.type,
            name: session.name,
            duration: session.duration,
            price: session.price,
            description: session.description
          };
        } else {
          prices.push({
            type: session.type,
            name: session.name,
            duration: session.duration,
            price: session.price,
            description: session.description
          });
        }
      });
    }

    return prices;
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('rates');

    const data = {
      therapist_id: this.therapistId,
      session_price: this.sessionPrice,
      follow_up_price: this.followUpPrice,
      package_price: this.packagePrice,
      couple_session_price: this.coupleSessionPrice,
      currency: this.currency,
      custom_rates: this.customRates
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new Rates(result);
    } else {
      const result = await service.create(data);
      return new Rates(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      sessionPrice: this.sessionPrice,
      followUpPrice: this.followUpPrice,
      packagePrice: this.packagePrice,
      coupleSessionPrice: this.coupleSessionPrice,
      currency: this.currency,
      customRates: this.customRates,
      pricePerMinute: this.pricePerMinute,
      hasCustomRates: this.hasCustomRates,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class RatesModel {
  constructor() {
    this.service = new SupabaseService('rates');
  }

  /**
   * Crear nuevas tarifas
   */
  async create(data) {
    const ratesData = {
      therapist_id: data.therapistId,
      session_price: data.sessionPrice || 60,
      follow_up_price: data.followUpPrice || 50,
      package_price: data.packagePrice || 200,
      couple_session_price: data.coupleSessionPrice || 80,
      currency: data.currency || 'EUR',
      custom_rates: data.customRates || {
        sessions: [],
        packages: [],
        discounts: []
      }
    };

    const result = await this.service.create(ratesData);
    return new Rates(result);
  }

  /**
   * Buscar todas
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new Rates(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new Rates(result) : null;
  }

  /**
   * Buscar una
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new Rates(result) : null;
  }

  /**
   * Buscar por terapeuta
   */
  async findByTherapist(therapistId) {
    return await this.findOne({ therapist_id: therapistId });
  }

  /**
   * Obtener o crear tarifas
   */
  async getOrCreate(therapistId, defaultData = {}) {
    let rates = await this.findByTherapist(therapistId);
    if (!rates) {
      rates = await this.create({ 
        therapistId,
        ...defaultData
      });
    }
    return rates;
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.sessionPrice !== undefined) data.session_price = updateData.sessionPrice;
    if (updateData.followUpPrice !== undefined) data.follow_up_price = updateData.followUpPrice;
    if (updateData.packagePrice !== undefined) data.package_price = updateData.packagePrice;
    if (updateData.coupleSessionPrice !== undefined) data.couple_session_price = updateData.coupleSessionPrice;
    if (updateData.currency) data.currency = updateData.currency;
    if (updateData.customRates) data.custom_rates = updateData.customRates;

    const result = await this.service.update(id, data);
    return options.new !== false ? new Rates(result) : null;
  }

  /**
   * Actualizar por terapeuta
   */
  async updateByTherapist(therapistId, updateData) {
    const rates = await this.findByTherapist(therapistId);
    if (!rates) {
      // Crear nuevas tarifas si no existen
      return await this.create({ therapistId, ...updateData });
    }
    return await this.findByIdAndUpdate(rates.id, updateData);
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new Rates(result) : null;
  }

  /**
   * Eliminar por terapeuta
   */
  async deleteByTherapist(therapistId) {
    const rates = await this.findByTherapist(therapistId);
    if (rates) {
      await this.service.delete(rates.id);
    }
    return rates;
  }

  /**
   * Obtener estadísticas de precios
   */
  async getPricingStats() {
    const rates = await this.find();
    
    const stats = {
      byCurrency: {},
      averageSessionPrice: 0,
      minSessionPrice: Infinity,
      maxSessionPrice: 0,
      total: rates.length
    };

    let totalSessionPrice = 0;

    rates.forEach(rate => {
      // Estadísticas por moneda
      if (!stats.byCurrency[rate.currency]) {
        stats.byCurrency[rate.currency] = {
          count: 0,
          avgPrice: 0,
          totalPrice: 0
        };
      }
      
      stats.byCurrency[rate.currency].count++;
      stats.byCurrency[rate.currency].totalPrice += rate.sessionPrice;
      
      // Precios globales
      totalSessionPrice += rate.sessionPrice;
      stats.minSessionPrice = Math.min(stats.minSessionPrice, rate.sessionPrice);
      stats.maxSessionPrice = Math.max(stats.maxSessionPrice, rate.sessionPrice);
    });

    // Calcular promedios
    if (rates.length > 0) {
      stats.averageSessionPrice = Math.round((totalSessionPrice / rates.length) * 100) / 100;
    }

    Object.keys(stats.byCurrency).forEach(currency => {
      const curr = stats.byCurrency[currency];
      curr.avgPrice = Math.round((curr.totalPrice / curr.count) * 100) / 100;
    });

    if (stats.minSessionPrice === Infinity) {
      stats.minSessionPrice = 0;
    }

    return stats;
  }
}

module.exports = new RatesModel();
module.exports.Rates = Rates;
module.exports.RatesModel = RatesModel;
