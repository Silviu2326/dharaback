/**
 * Pending Booking Model
 * Tabla temporal para reservas en proceso de pago
 */

const { supabase } = require('../../config/supabase');

class PendingBooking {
  /**
   * Crear un pending booking
   */
  static async create(data) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // Expira en 30 minutos
    
    const { data: pendingBooking, error } = await supabase
      .from('pending_bookings')
      .insert([{
        ...data,
        expires_at: expiresAt.toISOString(),
        status: 'awaiting_payment'
      }])
      .select()
      .single();
    
    if (error) throw error;
    return pendingBooking;
  }
  
  /**
   * Encontrar pending booking por ID de sesión de Stripe
   */
  static async findByStripeSessionId(sessionId) {
    const { data, error } = await supabase
      .from('pending_bookings')
      .select('*')
      .eq('stripe_session_id', sessionId)
      .single();
    
    if (error) return null;
    return data;
  }
  
  /**
   * Verificar si un slot está disponible (no hay pending booking activo)
   */
  static async isSlotAvailable(therapistId, date, startTime) {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('pending_bookings')
      .select('*')
      .eq('therapist_id', therapistId)
      .eq('date', date)
      .eq('start_time', startTime)
      .gt('expires_at', now)
      .eq('status', 'awaiting_payment');
    
    if (error) throw error;
    return data.length === 0;
  }
  
  /**
   * Actualizar pending booking tras pago exitoso
   */
  static async markAsPaid(id, paymentData) {
    const { data, error } = await supabase
      .from('pending_bookings')
      .update({
        status: 'paid',
        payment_intent_id: paymentData.paymentIntentId,
        paid_at: new Date().toISOString(),
        ...paymentData
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Eliminar pending booking
   */
  static async delete(id) {
    const { error } = await supabase
      .from('pending_bookings')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  }
  
  /**
   * Limpiar pending bookings expirados
   */
  static async cleanupExpired() {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('pending_bookings')
      .delete()
      .lt('expires_at', now)
      .eq('status', 'awaiting_payment')
      .select();
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Obtener pending bookings expirados (para limpieza manual)
   */
  static async getExpired() {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('pending_bookings')
      .select('*')
      .lt('expires_at', now)
      .eq('status', 'awaiting_payment');
    
    if (error) throw error;
    return data || [];
  }
}

module.exports = PendingBooking;
