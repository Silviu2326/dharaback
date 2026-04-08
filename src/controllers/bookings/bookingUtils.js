/**
 * Booking Utils
 * Funciones utilitarias compartidas para los controladores de bookings
 */

const emailService = require('../../services/emailService');

/**
 * Transforma los datos de booking de snake_case a camelCase
 * @param {Object} booking - Datos del booking en snake_case
 * @returns {Object} Datos transformados a camelCase
 */
const transformBookingToCamelCase = (booking) => ({
  id: booking.id,
  date: booking.date,
  startTime: booking.start_time,
  endTime: booking.end_time,
  clientId: booking.client_id,
  therapistId: booking.therapist_id,
  therapyType: booking.therapy_type,
  therapyDuration: booking.therapy_duration,
  status: booking.status,
  amount: booking.amount,
  currency: booking.currency,
  paymentStatus: booking.payment_status,
  paymentMethod: booking.client_payment_method === 'bizum' ? 'bizum' : booking.payment_method,
  location: booking.location,
  notes: booking.notes,
  meetingLink: booking.meeting_link,
  sessionDocument: booking.session_document,
  planId: booking.plan_id,
  reminderSent: booking.reminder_sent,
  cancellationReason: booking.cancellation_reason,
  cancelledBy: booking.cancelled_by,
  cancelledAt: booking.cancelled_at,
  lastStatusChange: booking.last_status_change,
  createdAt: booking.created_at,
  updatedAt: booking.updated_at,
  client: booking.client ? {
    id: booking.client.id,
    name: booking.client.name,
    email: booking.client.email,
    phone: booking.client.phone,
    avatar: booking.client.avatar
  } : null
});

/**
 * Mapeo de nombres de campos del frontend a nombres de columnas de base de datos
 */
const sortColumnMap = {
  'dateTime': 'date',
  'startTime': 'start_time',
  'endTime': 'end_time',
  'createdAt': 'created_at',
  'updatedAt': 'updated_at'
};

/**
 * Envía email de cancelación
 * @param {Object} params - Parámetros para el email
 * @param {Object} supabase - Cliente de Supabase
 */
const sendCancellationEmail = async ({ booking, client, therapist, reason }, supabase) => {
  try {
    if (!client) {
      // Intentar obtener el cliente si no se proporcionó
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', booking.client_id)
        .single();
      client = clientData;
    }

    if (client) {
      await emailService.sendAppointmentCancellation({
        to: client.email,
        clientName: client.name,
        therapistName: therapist?.name || 'Therapist',
        date: booking.date,
        time: booking.start_time || booking.startTime,
        reason: reason || booking.cancellation_reason || 'Cancelled'
      });
    }
  } catch (error) {
    console.error('Failed to send cancellation email:', error);
  }
};

/**
 * Verifica si una cita puede ser cancelada
 * @param {Object} booking - Datos de la cita
 * @returns {Object|null} Error o null si está OK
 */
const validateCancellation = (booking) => {
  if (booking.status === 'completed') {
    return { statusCode: 400, message: 'Cannot cancel completed bookings' };
  }
  if (booking.status === 'cancelled') {
    return { statusCode: 400, message: 'Booking is already cancelled' };
  }
  return null;
};

module.exports = {
  transformBookingToCamelCase,
  sortColumnMap,
  sendCancellationEmail,
  validateCancellation
};
