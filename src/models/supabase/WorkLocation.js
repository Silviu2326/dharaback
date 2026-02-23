/**
 * Modelo WorkLocation migrado a Supabase
 * Reemplaza el modelo Mongoose de WorkLocation
 */

const SupabaseService = require('../../services/supabaseService');

class WorkLocation {
  constructor(data = {}) {
    this.id = data.id;
    this.therapistId = data.therapistId;
    this.name = data.name;
    this.address = data.address;
    this.city = data.city;
    this.postalCode = data.postal_code;
    this.country = data.country || 'Spain';
    this.phone = data.phone;
    this.email = data.email;
    this.isPrimary = data.is_primary || false;
    this.offersOnline = data.offers_online || false;
    this.coordinates = data.coordinates || {};
    this.accessibilityInfo = data.accessibility_info || {};
    this.parkingInfo = data.parking_info || {};
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    this._data = data;
  }

  // Getter para compatibilidad con Mongoose
  get _id() {
    return this.id;
  }

  /**
   * Dirección completa formateada
   */
  get fullAddress() {
    let address = this.address;
    address += `, ${this.city}`;
    address += ` ${this.postalCode}`;
    if (this.country && this.country !== 'Spain' && this.country !== 'España') {
      address += `, ${this.country}`;
    }
    return address;
  }

  /**
   * Calcular distancia a coordenadas (fórmula Haversine)
   */
  distanceTo(latitude, longitude) {
    if (!this.coordinates?.latitude || !this.coordinates?.longitude) return null;

    const R = 6371; // Radio de la Tierra en kilómetros
    const dLat = this.degreesToRadians(latitude - this.coordinates.latitude);
    const dLon = this.degreesToRadians(longitude - this.coordinates.longitude);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreesToRadians(this.coordinates.latitude)) *
      Math.cos(this.degreesToRadians(latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Establecer como ubicación primaria
   */
  async setPrimary() {
    const supabase = require('../../config/supabase').supabase;

    // Quitar flag primario de otras ubicaciones
    await supabase
      .from('work_locations')
      .update({ is_primary: false })
      .eq('therapist_id', this.therapistId)
      .neq('id', this.id);

    this.isPrimary = true;
    
    const service = new SupabaseService('work_locations');
    const result = await service.update(this.id, { is_primary: true });
    
    return new WorkLocation(result);
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('work_locations');

    const data = {
      therapistId: this.therapistId,
      name: this.name,
      address: this.address,
      city: this.city,
      postal_code: this.postalCode,
      country: this.country,
      phone: this.phone,
      email: this.email,
      is_primary: this.isPrimary,
      offers_online: this.offersOnline,
      coordinates: this.coordinates,
      accessibility_info: this.accessibilityInfo,
      parking_info: this.parkingInfo
    };

    if (this.id) {
      const result = await service.update(this.id, data);
      return new WorkLocation(result);
    } else {
      // Si es la primera ubicación, hacerla primaria
      if (!this.isPrimary) {
        const existingCount = await service.count({ therapistId: this.therapistId });
        if (existingCount === 0) {
          data.is_primary = true;
          this.isPrimary = true;
        }
      }

      const result = await service.create(data);
      return new WorkLocation(result);
    }
  }

  /**
   * Convertir a JSON
   */
  toJSON() {
    return {
      id: this.id,
      therapistId: this.therapistId,
      name: this.name,
      address: this.address,
      city: this.city,
      postalCode: this.postalCode,
      country: this.country,
      phone: this.phone,
      email: this.email,
      isPrimary: this.isPrimary,
      offersOnline: this.offersOnline,
      coordinates: this.coordinates,
      accessibilityInfo: this.accessibilityInfo,
      parkingInfo: this.parkingInfo,
      fullAddress: this.fullAddress,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Métodos estáticos
 */
class WorkLocationModel {
  constructor() {
    this.service = new SupabaseService('work_locations');
  }

  /**
   * Crear nueva ubicación
   */
  async create(data) {
    const locationData = {
      therapistId: data.therapistId,
      name: data.name,
      address: data.address,
      city: data.city,
      postal_code: data.postalCode,
      country: data.country || 'Spain',
      phone: data.phone,
      email: data.email,
      is_primary: data.isPrimary || false,
      offers_online: data.offersOnline || false,
      coordinates: data.coordinates || {},
      accessibility_info: data.accessibilityInfo || {},
      parking_info: data.parkingInfo || {}
    };

    // Si es la primera ubicación, hacerla primaria
    if (!locationData.is_primary) {
      const existingCount = await this.service.count({ therapistId: data.therapistId });
      if (existingCount === 0) {
        locationData.is_primary = true;
      }
    }

    const result = await this.service.create(locationData);
    return new WorkLocation(result);
  }

  /**
   * Buscar todas
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new WorkLocation(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new WorkLocation(result) : null;
  }

  /**
   * Buscar una
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new WorkLocation(result) : null;
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
   * Buscar ubicación primaria
   */
  async findPrimary(therapistId) {
    return await this.findOne({ 
      therapist_id: therapistId, 
      is_primary: true 
    });
  }

  /**
   * Actualizar
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};

    if (updateData.name) data.name = updateData.name;
    if (updateData.address !== undefined) data.address = updateData.address;
    if (updateData.city) data.city = updateData.city;
    if (updateData.postalCode) data.postal_code = updateData.postalCode;
    if (updateData.country) data.country = updateData.country;
    if (updateData.phone !== undefined) data.phone = updateData.phone;
    if (updateData.email !== undefined) data.email = updateData.email;
    if (updateData.isPrimary !== undefined) data.is_primary = updateData.isPrimary;
    if (updateData.offersOnline !== undefined) data.offers_online = updateData.offersOnline;
    if (updateData.coordinates) data.coordinates = updateData.coordinates;
    if (updateData.accessibilityInfo) data.accessibility_info = updateData.accessibilityInfo;
    if (updateData.parkingInfo) data.parking_info = updateData.parkingInfo;

    const result = await this.service.update(id, data);
    return options.new !== false ? new WorkLocation(result) : null;
  }

  /**
   * Eliminar
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new WorkLocation(result) : null;
  }

  /**
   * Eliminar por terapeuta
   */
  async deleteByTherapist(therapistId) {
    const result = await this.service.deleteMany({ therapist_id: therapistId });
    return result;
  }

  /**
   * Buscar ubicaciones cercanas (requiere PostGIS o cálculo manual)
   */
  async findNearby(latitude, longitude, maxDistance = 50, options = {}) {
    // Como el esquema SQL no tiene índice geoespacial, hacemos cálculo manual
    const locations = await this.find({
      ...options,
      filters: { ...options.filters }
    });

    return locations
      .map(loc => ({
        location: loc,
        distance: loc.distanceTo(latitude, longitude)
      }))
      .filter(item => item.distance !== null && item.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .map(item => item.location);
  }

  /**
   * Contar por terapeuta
   */
  async countByTherapist(therapistId) {
    return await this.service.count({ therapist_id: therapistId });
  }

  /**
   * Establecer ubicación como primaria
   */
  async setAsPrimary(id, therapistId) {
    const supabase = require('../../config/supabase').supabase;

    // Quitar flag primario de otras ubicaciones
    await supabase
      .from('work_locations')
      .update({ is_primary: false })
      .eq('therapist_id', therapistId);

    // Establecer nueva primaria
    const result = await this.service.update(id, { is_primary: true });
    return new WorkLocation(result);
  }
}

module.exports = new WorkLocationModel();
module.exports.WorkLocation = WorkLocation;
module.exports.WorkLocationModel = WorkLocationModel;
