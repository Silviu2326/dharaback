const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const FormData = require('form-data');
const Mailgun = require('mailgun.js');

/**
 * Servicio de Email
 *
 * Soporta dos proveedores:
 * - SendGrid (recomendado para producción)
 * - Nodemailer con SMTP (desarrollo y alternativa)
 *
 * Funcionalidades:
 * - Enviar emails transaccionales
 * - Templates predefinidos
 * - Confirmaciones de cita
 * - Recordatorios
 * - Notificaciones
 */

class EmailService {
  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'sendgrid'; // 'sendgrid' o 'smtp'
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@dharadimensionhumana.es';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Dhara Dimensión Humana';

    this.initialize();
  }

  /**
   * Inicializar servicio de email
   */
  initialize() {
    if (this.provider === 'mailgun') {
      const apiKey = process.env.MAILGUN_API_KEY;
      if (apiKey) {
        const mailgun = new Mailgun(FormData);
        const url = process.env.MAILGUN_REGION === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
        this.mailgunClient = mailgun.client({ username: 'api', key: apiKey, url });
        this.mailgunDomain = process.env.MAILGUN_DOMAIN;
        console.log('✅ Mailgun email service initialized');
      } else {
        console.warn('⚠️  Mailgun API key not configured. Email features will be disabled.');
      }
    } else if (this.provider === 'resend') {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        this.resend = new Resend(apiKey);
        console.log('✅ Resend email service initialized');
      } else {
        console.warn('⚠️  Resend API key not configured. Email features will be disabled.');
      }
    } else if (this.provider === 'sendgrid') {
      const apiKey = process.env.SENDGRID_API_KEY;

      if (apiKey) {
        sgMail.setApiKey(apiKey);
        console.log('✅ SendGrid email service initialized');
      } else {
        console.warn('⚠️  SendGrid API key not configured. Email features will be disabled.');
      }
    } else if (this.provider === 'smtp') {
      this.transporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      console.log('✅ SMTP email service initialized');
    }
  }

  /**
   * Verificar si el servicio está configurado
   * @returns {boolean}
   */
  isConfigured() {
    if (this.provider === 'mailgun') {
      return !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN;
    } else if (this.provider === 'resend') {
      return !!process.env.RESEND_API_KEY;
    } else if (this.provider === 'sendgrid') {
      return process.env.SENDGRID_API_KEY !== undefined;
    } else if (this.provider === 'smtp') {
      return process.env.EMAIL_USER && process.env.EMAIL_PASS;
    }
    return false;
  }

  /**
   * Enviar email genérico
   * @param {Object} options - Opciones del email
   * @param {string} options.to - Destinatario (también soporta options.email para compatibilidad)
   * @param {string} options.subject - Asunto
   * @param {string} options.html - Contenido HTML
   * @param {string} options.text - Contenido texto plano (opcional, también soporta options.message)
   * @returns {Promise<Object>} Resultado del envío
   */
  async sendEmail(options) {
    if (!this.isConfigured()) {
      console.error('❌ Email service is not configured');
      return {
        success: false,
        error: 'Email service not configured'
      };
    }

    // Compatibilidad con formato anterior
    const to = options.to || options.email;
    const subject = options.subject;
    const html = options.html;
    const text = options.text || options.message;

    if (!to || !subject || (!html && !text)) {
      return {
        success: false,
        error: 'To, subject, and html/text are required'
      };
    }

    try {
      if (this.provider === 'mailgun') {
        return await this.sendWithMailgun({ to, subject, html, text });
      } else if (this.provider === 'resend') {
        return await this.sendWithResend({ to, subject, html, text });
      } else if (this.provider === 'sendgrid') {
        return await this.sendWithSendGrid({ to, subject, html, text });
      } else {
        return await this.sendWithSMTP({ to, subject, html, text });
      }
    } catch (error) {
      console.error('❌ Error sending email:', error);
      return {
        success: false,
        error: error.message || 'Error sending email'
      };
    }
  }

  /**
   * Enviar con Mailgun
   */
  async sendWithMailgun({ to, subject, html, text }) {
    try {
      const msg = await this.mailgunClient.messages.create(this.mailgunDomain, {
        from: `${this.fromName} <noreply@${this.mailgunDomain}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: html || `<p>${text}</p>`,
        text: text || (html ? this.stripHtml(html) : '')
      });

      console.log('✅ Email sent via Mailgun:', msg.id);
      return { success: true, data: { messageId: msg.id } };
    } catch (error) {
      console.error('❌ Mailgun error:', error);
      throw error;
    }
  }

  /**
   * Enviar con Resend
   */
  async sendWithResend({ to, subject, html, text }) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to,
        subject,
        html: html || `<p>${text}</p>`
      });

      if (error) throw new Error(error.message);

      console.log('✅ Email sent via Resend:', data.id);
      return { success: true, data: { messageId: data.id } };
    } catch (error) {
      console.error('❌ Resend error:', error);
      throw error;
    }
  }

  /**
   * Enviar con SendGrid
   */
  async sendWithSendGrid(options) {
    const { to, subject, html, text } = options;

    const msg = {
      to,
      from: {
        email: this.fromEmail,
        name: this.fromName
      },
      subject,
      html: html || text,
      text: text || (html ? this.stripHtml(html) : '')
    };

    try {
      const response = await sgMail.send(msg);

      console.log('✅ Email sent via SendGrid:', response[0].statusCode);

      return {
        success: true,
        data: {
          messageId: response[0].headers['x-message-id'],
          statusCode: response[0].statusCode
        }
      };
    } catch (error) {
      console.error('❌ SendGrid error:', error);
      throw error;
    }
  }

  /**
   * Enviar con SMTP
   */
  async sendWithSMTP(options) {
    const { to, subject, html, text } = options;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to,
      subject,
      html: html || text,
      text: text || (html ? this.stripHtml(html) : '')
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);

      console.log('✅ Email sent via SMTP:', info.messageId);

      return {
        success: true,
        data: {
          messageId: info.messageId
        }
      };
    } catch (error) {
      console.error('❌ SMTP error:', error);
      throw error;
    }
  }

  /**
   * Enviar email de bienvenida
   */
  async sendWelcomeEmail(user) {
    const { email, name } = user;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #7BA888; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #7BA888; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>¡Bienvenido a Dhara Dimensión Humana!</h1>
            </div>
            <div class="content">
              <h2>Hola ${name},</h2>
              <p>Nos complace darte la bienvenida a nuestra plataforma.</p>
              <p>Ahora puedes gestionar tus citas, clientes y sesiones de forma sencilla y profesional.</p>
              <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Ir al Dashboard</a>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Dhara Dimensión Humana. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Bienvenido a Dhara Dimensión Humana',
      html
    });
  }

  /**
   * Enviar confirmación de cita
   */
  async sendAppointmentConfirmation(data) {
    const { to, clientName, therapistName, date, time, location } = data;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #7BA888; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background-color: white; border-left: 4px solid #7BA888; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Cita Confirmada</h1>
            </div>
            <div class="content">
              <h2>Hola ${clientName},</h2>
              <p>Tu cita ha sido confirmada exitosamente.</p>
              <div class="info-box">
                <p><strong>Terapeuta:</strong> ${therapistName}</p>
                <p><strong>Fecha:</strong> ${date}</p>
                <p><strong>Hora:</strong> ${time}</p>
                ${location ? `<p><strong>Ubicación:</strong> ${location}</p>` : ''}
              </div>
              <p>Si necesitas cancelar o reprogramar, por favor contacta con nosotros con al menos 24 horas de anticipación.</p>
              <p>¡Te esperamos!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Dhara Dimensión Humana.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to,
      subject: 'Confirmación de Cita - Dhara Dimensión Humana',
      html
    });
  }

  /**
   * Enviar recordatorio de cita
   */
  async sendAppointmentReminder(data) {
    const { to, clientName, therapistName, date, time, location } = data;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #F4A460; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background-color: white; border-left: 4px solid #F4A460; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Recordatorio de Cita</h1>
            </div>
            <div class="content">
              <h2>Hola ${clientName},</h2>
              <p>Te recordamos que tienes una cita próxima:</p>
              <div class="info-box">
                <p><strong>Terapeuta:</strong> ${therapistName}</p>
                <p><strong>Fecha:</strong> ${date}</p>
                <p><strong>Hora:</strong> ${time}</p>
                ${location ? `<p><strong>Ubicación:</strong> ${location}</p>` : ''}
              </div>
              <p>Por favor, llega con 5-10 minutos de anticipación.</p>
              <p>¡Nos vemos pronto!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Dhara Dimensión Humana.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to,
      subject: 'Recordatorio de Cita - Dhara Dimensión Humana',
      html
    });
  }

  /**
   * Enviar notificación de cancelación
   */
  async sendAppointmentCancellation(data) {
    const { to, clientName, therapistName, date, time, reason } = data;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #DC3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background-color: white; border-left: 4px solid #DC3545; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>❌ Cita Cancelada</h1>
            </div>
            <div class="content">
              <h2>Hola ${clientName},</h2>
              <p>Lamentamos informarte que tu cita ha sido cancelada:</p>
              <div class="info-box">
                <p><strong>Terapeuta:</strong> ${therapistName}</p>
                <p><strong>Fecha:</strong> ${date}</p>
                <p><strong>Hora:</strong> ${time}</p>
                ${reason ? `<p><strong>Razón:</strong> ${reason}</p>` : ''}
              </div>
              <p>Por favor, contacta con nosotros para reagendar tu cita.</p>
              <p>Disculpa las molestias.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Dhara Dimensión Humana.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to,
      subject: 'Cita Cancelada - Dhara Dimensión Humana',
      html
    });
  }

  /**
   * Enviar notificación de pago
   */
  async sendPaymentConfirmation(data) {
    const { to, clientName, amount, invoiceNumber, date } = data;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #28A745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background-color: white; border-left: 4px solid #28A745; padding: 15px; margin: 20px 0; }
            .amount { font-size: 24px; font-weight: bold; color: #28A745; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Pago Recibido</h1>
            </div>
            <div class="content">
              <h2>Hola ${clientName},</h2>
              <p>Hemos recibido tu pago exitosamente.</p>
              <div class="info-box">
                <p><strong>Monto:</strong> <span class="amount">€${amount}</span></p>
                <p><strong>Factura:</strong> ${invoiceNumber}</p>
                <p><strong>Fecha:</strong> ${date}</p>
              </div>
              <p>Recibirás tu factura en un email separado.</p>
              <p>¡Gracias por tu confianza!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Dhara Dimensión Humana.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to,
      subject: 'Confirmación de Pago - Dhara Dimensión Humana',
      html
    });
  }

  /**
   * Notificación al admin cuando se registra un nuevo terapeuta
   */
  async sendNewTherapistAdminNotification({ nombre, apellidos, email, telefono, plan, especialidades, ciudad }) {
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_USER;
    if (!adminEmail) return;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #8CA48F;">Nuevo terapeuta registrado</h2>
        <table style="width:100%; border-collapse: collapse;">
          <tr><td style="padding:8px; font-weight:bold;">Nombre</td><td style="padding:8px;">${nombre} ${apellidos}</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px; font-weight:bold;">Email</td><td style="padding:8px;">${email}</td></tr>
          <tr><td style="padding:8px; font-weight:bold;">Teléfono</td><td style="padding:8px;">${telefono || '—'}</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px; font-weight:bold;">Plan</td><td style="padding:8px;">${plan}</td></tr>
          <tr><td style="padding:8px; font-weight:bold;">Ciudad</td><td style="padding:8px;">${ciudad || '—'}</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px; font-weight:bold;">Especialidades</td><td style="padding:8px;">${Array.isArray(especialidades) ? especialidades.join(', ') : (especialidades || '—')}</td></tr>
          <tr><td style="padding:8px; font-weight:bold;">Fecha</td><td style="padding:8px;">${new Date().toLocaleString('es-ES')}</td></tr>
        </table>
      </div>
    `;

    return await this.sendEmail({
      to: adminEmail,
      subject: `Nuevo terapeuta registrado: ${nombre} ${apellidos}`,
      html
    });
  }

  /**
   * Remover tags HTML de un string
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

module.exports = new EmailService();
