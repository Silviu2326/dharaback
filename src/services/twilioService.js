const twilio = require('twilio');

/**
 * Servicio de Twilio para envío de SMS
 *
 * Funcionalidades:
 * - Enviar SMS
 * - Enviar recordatorios de citas
 * - Verificar números de teléfono
 * - Obtener historial de mensajes
 */

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;

    // Inicializar cliente solo si las credenciales están configuradas
    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
      console.log('✅ Twilio service initialized');
    } else {
      console.warn('⚠️  Twilio not configured. SMS features will be disabled.');
      this.client = null;
    }
  }

  /**
   * Verificar si Twilio está configurado
   * @returns {boolean}
   */
  isConfigured() {
    return this.client !== null;
  }

  /**
   * Enviar SMS
   * @param {Object} data - Datos del SMS
   * @param {string} data.to - Número de teléfono destino (formato E.164: +34...)
   * @param {string} data.body - Contenido del mensaje
   * @param {string} data.from - Número de origen (opcional, usa el configurado por defecto)
   * @returns {Promise<Object>} Resultado del envío
   */
  async sendSMS(data) {
    if (!this.isConfigured()) {
      console.error('❌ Twilio is not configured');
      return {
        success: false,
        error: 'SMS service not configured'
      };
    }

    const { to, body, from = this.phoneNumber } = data;

    if (!to || !body) {
      return {
        success: false,
        error: 'Phone number and message body are required'
      };
    }

    try {
      // Validar formato de número de teléfono
      if (!to.startsWith('+')) {
        throw new Error('Phone number must be in E.164 format (e.g., +34612345678)');
      }

      const message = await this.client.messages.create({
        body,
        from,
        to
      });

      console.log('✅ SMS sent successfully:', message.sid);

      return {
        success: true,
        data: {
          sid: message.sid,
          status: message.status,
          to: message.to,
          from: message.from,
          body: message.body,
          dateSent: message.dateCreated
        }
      };
    } catch (error) {
      console.error('❌ Error sending SMS:', error);
      return {
        success: false,
        error: error.message || 'Error sending SMS'
      };
    }
  }

  /**
   * Enviar recordatorio de cita
   * @param {Object} data - Datos del recordatorio
   * @param {string} data.to - Número del cliente
   * @param {string} data.clientName - Nombre del cliente
   * @param {string} data.therapistName - Nombre del terapeuta
   * @param {Date} data.appointmentDate - Fecha de la cita
   * @param {string} data.appointmentTime - Hora de la cita
   * @returns {Promise<Object>} Resultado del envío
   */
  async sendAppointmentReminder(data) {
    const { to, clientName, therapistName, appointmentDate, appointmentTime } = data;

    if (!to || !clientName || !therapistName || !appointmentDate || !appointmentTime) {
      return {
        success: false,
        error: 'Missing required fields for appointment reminder'
      };
    }

    // Formatear fecha
    const date = new Date(appointmentDate);
    const formattedDate = date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const message = `Hola ${clientName}, te recordamos tu cita con ${therapistName} el ${formattedDate} a las ${appointmentTime}. ¡Te esperamos!`;

    return await this.sendSMS({
      to,
      body: message
    });
  }

  /**
   * Enviar confirmación de cita
   * @param {Object} data - Datos de la confirmación
   * @param {string} data.to - Número del cliente
   * @param {string} data.clientName - Nombre del cliente
   * @param {string} data.therapistName - Nombre del terapeuta
   * @param {Date} data.appointmentDate - Fecha de la cita
   * @param {string} data.appointmentTime - Hora de la cita
   * @returns {Promise<Object>} Resultado del envío
   */
  async sendAppointmentConfirmation(data) {
    const { to, clientName, therapistName, appointmentDate, appointmentTime } = data;

    if (!to || !clientName || !therapistName || !appointmentDate || !appointmentTime) {
      return {
        success: false,
        error: 'Missing required fields for appointment confirmation'
      };
    }

    // Formatear fecha
    const date = new Date(appointmentDate);
    const formattedDate = date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const message = `Hola ${clientName}, tu cita con ${therapistName} ha sido confirmada para el ${formattedDate} a las ${appointmentTime}. ¡Nos vemos pronto!`;

    return await this.sendSMS({
      to,
      body: message
    });
  }

  /**
   * Enviar notificación de cancelación
   * @param {Object} data - Datos de la cancelación
   * @param {string} data.to - Número del cliente
   * @param {string} data.clientName - Nombre del cliente
   * @param {string} data.therapistName - Nombre del terapeuta
   * @param {Date} data.appointmentDate - Fecha de la cita
   * @param {string} data.appointmentTime - Hora de la cita
   * @param {string} data.reason - Razón de cancelación (opcional)
   * @returns {Promise<Object>} Resultado del envío
   */
  async sendAppointmentCancellation(data) {
    const { to, clientName, therapistName, appointmentDate, appointmentTime, reason } = data;

    if (!to || !clientName || !therapistName || !appointmentDate || !appointmentTime) {
      return {
        success: false,
        error: 'Missing required fields for appointment cancellation'
      };
    }

    // Formatear fecha
    const date = new Date(appointmentDate);
    const formattedDate = date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let message = `Hola ${clientName}, lamentamos informarte que tu cita con ${therapistName} del ${formattedDate} a las ${appointmentTime} ha sido cancelada.`;

    if (reason) {
      message += ` Razón: ${reason}.`;
    }

    message += ' Por favor, contacta con nosotros para reagendar.';

    return await this.sendSMS({
      to,
      body: message
    });
  }

  /**
   * Validar formato de número de teléfono
   * @param {string} phoneNumber - Número a validar
   * @returns {Object} Resultado de validación
   */
  validatePhoneNumber(phoneNumber) {
    // Formato E.164: +[código país][número]
    const e164Regex = /^\+[1-9]\d{1,14}$/;

    if (!phoneNumber) {
      return {
        valid: false,
        error: 'Phone number is required'
      };
    }

    if (!e164Regex.test(phoneNumber)) {
      return {
        valid: false,
        error: 'Phone number must be in E.164 format (e.g., +34612345678)'
      };
    }

    return {
      valid: true,
      formatted: phoneNumber
    };
  }

  /**
   * Obtener estado de un mensaje
   * @param {string} messageSid - SID del mensaje
   * @returns {Promise<Object>} Estado del mensaje
   */
  async getMessageStatus(messageSid) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SMS service not configured'
      };
    }

    try {
      const message = await this.client.messages(messageSid).fetch();

      return {
        success: true,
        data: {
          sid: message.sid,
          status: message.status,
          errorCode: message.errorCode,
          errorMessage: message.errorMessage,
          to: message.to,
          from: message.from,
          dateSent: message.dateSent,
          dateCreated: message.dateCreated
        }
      };
    } catch (error) {
      console.error('❌ Error fetching message status:', error);
      return {
        success: false,
        error: error.message || 'Error fetching message status'
      };
    }
  }

  /**
   * Formatear número de teléfono español a formato E.164
   * @param {string} phoneNumber - Número de teléfono
   * @returns {string} Número formateado
   */
  formatSpanishPhoneNumber(phoneNumber) {
    // Remover espacios y caracteres no numéricos
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Si empieza con 34, agregar +
    if (cleaned.startsWith('34')) {
      return '+' + cleaned;
    }

    // Si empieza con 0, quitar el 0 y agregar +34
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    // Si no tiene código de país, agregar +34 (España)
    if (cleaned.length === 9) {
      return '+34' + cleaned;
    }

    // Si ya tiene +, retornar como está
    if (phoneNumber.startsWith('+')) {
      return phoneNumber;
    }

    return '+' + cleaned;
  }
}

module.exports = new TwilioService();
