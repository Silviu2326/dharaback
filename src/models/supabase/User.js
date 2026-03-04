/**
 * Modelo User migrado a Supabase
 * Reemplaza el modelo Mongoose de User
 * Mantiene compatibilidad con la API anterior
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const SupabaseService = require('../../services/supabaseService');

class User {
  constructor(data = {}) {
    this.id = data.id;
    this.email = data.email;
    this.password = data.password;
    this.supabaseId = data.supabase_id;
    this.authProvider = data.auth_provider || 'local';
    this.emailVerified = data.email_verified || false;
    this.name = data.name;
    this.avatar = data.avatar;
    this.banner = data.banner;
    this.isVerified = data.is_verified || false;
    this.verificationStatus = data.verification_status || 'not_submitted';
    this.role = data.role || 'therapist';
    this.isActive = data.is_active !== false;
    this.lastLogin = data.last_login;
    this.resetPasswordToken = data.reset_password_token;
    this.resetPasswordExpire = data.reset_password_expire;
    this.emailVerificationToken = data.email_verification_token;
    this.emailVerificationExpire = data.email_verification_expire;
    this.preferences = data.preferences || {};
    this.videoPresentation = data.video_presentation || null;
    this.stripeCustomerId = data.stripe_customer_id;
    this.stripeSubscriptionId = data.stripe_subscription_id;
    this.subscriptionStatus = data.subscription_status || 'none';
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
   * Comparar contraseña
   */
  async comparePassword(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
  }

  /**
   * Generar token de reset de contraseña
   */
  getResetPasswordToken() {
    const resetToken = crypto.randomBytes(20).toString('hex');

    this.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    this.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    return resetToken;
  }

  /**
   * Obtener estadísticas del usuario
   */
  async getStats() {
    const service = new SupabaseService('');
    const supabase = require('../../config/supabase').supabase;

    const [clientsCount, bookingsCount, paymentsResult, reviewsResult] = await Promise.all([
      // Contar clientes activos
      supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('therapist_id', this.id)
        .eq('status', 'active'),
      
      // Contar bookings completados
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('therapist_id', this.id)
        .eq('status', 'completed'),
      
      // Sumar pagos completados
      supabase
        .from('payments')
        .select('amount')
        .eq('therapist_id', this.id)
        .eq('status', 'completed'),
      
      // Calcular rating promedio
      supabase
        .from('reviews')
        .select('rating')
        .eq('therapist_id', this.id)
    ]);

    const totalRevenue = paymentsResult.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const ratings = reviewsResult.data?.map(r => r.rating) || [];
    const averageRating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : 0;

    return {
      totalClients: clientsCount.count || 0,
      totalSessions: bookingsCount.count || 0,
      totalRevenue,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews: ratings.length
    };
  }

  /**
   * Convertir a objeto JSON
   */
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      avatar: this.avatar,
      banner: this.banner,
      isVerified: this.isVerified,
      verificationStatus: this.verificationStatus,
      role: this.role,
      isActive: this.isActive,
      lastLogin: this.lastLogin,
      preferences: this.preferences,
      videoPresentation: this.videoPresentation,
      stripeCustomerId: this.stripeCustomerId,
      subscriptionStatus: this.subscriptionStatus,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Guardar (crear o actualizar)
   */
  async save() {
    const service = new SupabaseService('users');
    const supabase = require('../../config/supabase').supabase;

    // Hashear password si es necesario
    if (this.password && this.authProvider === 'local') {
      // Verificar si el password ya está hasheado
      if (!this.password.startsWith('$2')) {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
      }
    }

    const data = {
      email: this.email,
      password: this.password,
      supabase_id: this.supabaseId,
      auth_provider: this.authProvider,
      email_verified: this.emailVerified,
      name: this.name,
      avatar: this.avatar,
      banner: this.banner,
      is_verified: this.isVerified,
      verification_status: this.verificationStatus,
      role: this.role,
      is_active: this.isActive,
      last_login: this.lastLogin,
      reset_password_token: this.resetPasswordToken,
      reset_password_expire: this.resetPasswordExpire,
      email_verification_token: this.emailVerificationToken,
      email_verification_expire: this.emailVerificationExpire,
      preferences: this.preferences,
      stripe_customer_id: this.stripeCustomerId,
      stripe_subscription_id: this.stripeSubscriptionId,
      subscription_status: this.subscriptionStatus
    };

    if (this.id) {
      // Actualizar
      const result = await service.update(this.id, data);
      return new User(result);
    } else {
      // Crear
      const result = await service.create(data);
      return new User(result);
    }
  }
}

/**
 * Métodos estáticos
 */
class UserModel {
  constructor() {
    this.service = new SupabaseService('users');
    this.tableName = 'users';
  }

  /**
   * Crear nuevo usuario
   */
  async create(userData) {
    // Hashear password si es local auth
    if (userData.password && userData.authProvider !== 'google' && userData.authProvider !== 'facebook') {
      const salt = await bcrypt.genSalt(12);
      userData.password = await bcrypt.hash(userData.password, salt);
    }

    const data = {
      email: userData.email,
      password: userData.password,
      supabase_id: userData.supabaseId,
      auth_provider: userData.authProvider || 'local',
      email_verified: userData.emailVerified || false,
      name: userData.name,
      avatar: userData.avatar,
      banner: userData.banner,
      is_verified: userData.isVerified || false,
      verification_status: userData.verificationStatus || 'not_submitted',
      role: userData.role || 'therapist',
      is_active: userData.isActive !== false,
      preferences: userData.preferences || {
        language: 'es',
        timezone: 'Europe/Madrid',
        notifications: { email: true, push: true, sms: false },
        privacy: { showProfile: true, allowMessages: true }
      },
      stripe_customer_id: userData.stripeCustomerId,
      subscription_status: userData.subscriptionStatus || 'none'
    };

    const result = await this.service.create(data);
    return new User(result);
  }

  /**
   * Buscar todos los usuarios
   */
  async find(options = {}) {
    const results = await this.service.findAll(options);
    return results.map(data => new User(data));
  }

  /**
   * Buscar por ID
   */
  async findById(id, options = {}) {
    const result = await this.service.findById(id, options);
    return result ? new User(result) : null;
  }

  /**
   * Buscar uno por filtros
   */
  async findOne(filters, options = {}) {
    const result = await this.service.findOne(filters, options);
    return result ? new User(result) : null;
  }

  /**
   * Buscar por email
   */
  async findByEmail(email) {
    return await this.findOne({ email });
  }

  /**
   * Buscar por supabaseId
   */
  async findBySupabaseId(supabaseId) {
    return await this.findOne({ supabase_id: supabaseId });
  }

  /**
   * Actualizar usuario
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const data = {};
    
    // Mapear campos de camelCase a snake_case
    if (updateData.email) data.email = updateData.email;
    if (updateData.password) data.password = updateData.password;
    if (updateData.supabaseId !== undefined) data.supabase_id = updateData.supabaseId;
    if (updateData.authProvider) data.auth_provider = updateData.authProvider;
    if (updateData.emailVerified !== undefined) data.email_verified = updateData.emailVerified;
    if (updateData.name) data.name = updateData.name;
    if (updateData.avatar !== undefined) data.avatar = updateData.avatar;
    if (updateData.banner !== undefined) data.banner = updateData.banner;
    if (updateData.isVerified !== undefined) data.is_verified = updateData.isVerified;
    if (updateData.verificationStatus) data.verification_status = updateData.verificationStatus;
    if (updateData.role) data.role = updateData.role;
    if (updateData.isActive !== undefined) data.is_active = updateData.isActive;
    if (updateData.lastLogin) data.last_login = updateData.lastLogin;
    if (updateData.preferences) data.preferences = updateData.preferences;
    if (updateData.videoPresentation !== undefined) data.video_presentation = updateData.videoPresentation;
    if (updateData.stripeCustomerId !== undefined) data.stripe_customer_id = updateData.stripeCustomerId;
    if (updateData.subscriptionStatus) data.subscription_status = updateData.subscriptionStatus;

    const result = await this.service.update(id, data);
    return options.new !== false ? new User(result) : null;
  }

  /**
   * Eliminar usuario
   */
  async findByIdAndDelete(id) {
    const result = await this.service.delete(id);
    return result ? new User(result) : null;
  }

  /**
   * Contar usuarios
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
      data: result.data.map(data => new User(data))
    };
  }

  /**
   * Buscar terapeutas verificados
   */
  async findVerified(options = {}) {
    return await this.find({
      ...options,
      filters: { ...options.filters, is_verified: true, is_active: true }
    });
  }

  /**
   * Actualizar último login
   */
  async updateLastLogin(id) {
    return await this.findByIdAndUpdate(id, { lastLogin: new Date() });
  }

  /**
   * Verificar si existe email
   */
  async exists(email) {
    const count = await this.service.count({ email });
    return count > 0;
  }

  // Métodos estáticos para compatibilidad con controladores
  static async findById(id, options = {}) {
    const instance = new UserModel();
    const result = await instance.service.findById(id, options);
    return result ? new User(result) : null;
  }

  static async findOne(filters, options = {}) {
    const instance = new UserModel();
    const result = await instance.service.findOne(filters, options);
    return result ? new User(result) : null;
  }

  static async find(filters, options = {}) {
    const instance = new UserModel();
    const results = await instance.service.findAll(filters, options);
    return results.map(data => new User(data));
  }

  static async create(data) {
    const instance = new UserModel();
    return await instance.create(data);
  }
}

// Exportar instancia singleton
module.exports = new UserModel();
module.exports.User = User;
module.exports.UserModel = UserModel;
