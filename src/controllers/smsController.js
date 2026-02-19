const asyncHandler = require('../middleware/asyncHandler');
const twilioService = require('../services/twilioService');
const Client = require('../models/Client');
const Booking = require('../models/Booking');

/**
 * @desc    Enviar SMS
 * @route   POST /api/sms/send
 * @access  Private
 */
const sendSMS = asyncHandler(async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      message: 'Phone number and message are required'
    });
  }

  try {
    // Formatear número si es español
    const formattedPhone = twilioService.formatSpanishPhoneNumber(to);

    // Validar número
    const validation = twilioService.validatePhoneNumber(formattedPhone);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }

    // Enviar SMS
    const result = await twilioService.sendSMS({
      to: formattedPhone,
      body: message
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'SMS sent successfully',
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Error sending SMS'
      });
    }
  } catch (error) {
    console.error('❌ Error in sendSMS controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error sending SMS'
    });
  }
});

/**
 * @desc    Enviar recordatorio de cita
 * @route   POST /api/sms/appointment-reminder
 * @access  Private
 */
const sendAppointmentReminder = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user._id;

  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID is required'
    });
  }

  try {
    // Obtener reserva
    const booking = await Booking.findById(bookingId)
      .populate('clientId')
      .populate('therapistId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verificar que el terapeuta sea el dueño
    if (booking.therapistId._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send reminder for this booking'
      });
    }

    // Verificar que el cliente tenga teléfono
    if (!booking.clientId.phone) {
      return res.status(400).json({
        success: false,
        message: 'Client does not have a phone number'
      });
    }

    // Formatear teléfono
    const formattedPhone = twilioService.formatSpanishPhoneNumber(booking.clientId.phone);

    // Formatear hora
    const appointmentTime = new Date(booking.startTime).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Enviar recordatorio
    const result = await twilioService.sendAppointmentReminder({
      to: formattedPhone,
      clientName: booking.clientId.firstName,
      therapistName: booking.therapistId.name,
      appointmentDate: booking.date,
      appointmentTime
    });

    if (result.success) {
      // Actualizar booking con información de SMS enviado
      booking.reminderSent = true;
      booking.reminderSentAt = new Date();
      await booking.save();

      res.status(200).json({
        success: true,
        message: 'Appointment reminder sent successfully',
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Error sending appointment reminder'
      });
    }
  } catch (error) {
    console.error('❌ Error sending appointment reminder:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error sending appointment reminder'
    });
  }
});

/**
 * @desc    Enviar confirmación de cita
 * @route   POST /api/sms/appointment-confirmation
 * @access  Private
 */
const sendAppointmentConfirmation = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user._id;

  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID is required'
    });
  }

  try {
    // Obtener reserva
    const booking = await Booking.findById(bookingId)
      .populate('clientId')
      .populate('therapistId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verificar autorización
    if (booking.therapistId._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Verificar teléfono
    if (!booking.clientId.phone) {
      return res.status(400).json({
        success: false,
        message: 'Client does not have a phone number'
      });
    }

    // Formatear datos
    const formattedPhone = twilioService.formatSpanishPhoneNumber(booking.clientId.phone);
    const appointmentTime = new Date(booking.startTime).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Enviar confirmación
    const result = await twilioService.sendAppointmentConfirmation({
      to: formattedPhone,
      clientName: booking.clientId.firstName,
      therapistName: booking.therapistId.name,
      appointmentDate: booking.date,
      appointmentTime
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Appointment confirmation sent successfully',
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Error sending confirmation'
      });
    }
  } catch (error) {
    console.error('❌ Error sending confirmation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error sending confirmation'
    });
  }
});

/**
 * @desc    Obtener estado de un mensaje
 * @route   GET /api/sms/status/:messageSid
 * @access  Private
 */
const getMessageStatus = asyncHandler(async (req, res) => {
  const { messageSid } = req.params;

  if (!messageSid) {
    return res.status(400).json({
      success: false,
      message: 'Message SID is required'
    });
  }

  try {
    const result = await twilioService.getMessageStatus(messageSid);

    if (result.success) {
      res.status(200).json({
        success: true,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Error fetching message status'
      });
    }
  } catch (error) {
    console.error('❌ Error fetching message status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching message status'
    });
  }
});

module.exports = {
  sendSMS,
  sendAppointmentReminder,
  sendAppointmentConfirmation,
  getMessageStatus
};
