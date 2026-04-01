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
   * Email de bienvenida específico para terapeutas recién registrados
   */
  async sendTherapistWelcomeEmail({ email, nombre, apellidos, plan }) {
    const name = `${nombre} ${apellidos}`;

    const gdprFooter = `
      <div style="margin-top:32px; padding:16px; background:#f5f5f5; border-radius:6px; font-size:11px; color:#777; line-height:1.6;">
        <strong>Información básica sobre Protección de Datos (RGPD y LOPDGDD):</strong><br/>
        <strong>Responsable:</strong> Isabel Miralles Rubert (DNI: 24399337V) – App Dhara.<br/>
        <strong>Finalidad:</strong> Gestión de la relación con el usuario/profesional, envío de comunicaciones sobre el estado de la plataforma y novedades de la comunidad.<br/>
        <strong>Legitimación:</strong> Ejecución de contrato y consentimiento del interesado.<br/>
        <strong>Destinatarios:</strong> No se cederán datos a terceros salvo obligación legal o proveedores técnicos necesarios para la prestación del servicio (Stripe, Supabase).<br/>
        <strong>Derechos:</strong> Tienes derecho a acceder, rectificar y suprimir tus datos, así como otros derechos detallados en nuestra Política de Privacidad, enviando un correo a <a href="mailto:info@dharadimensionhumana.es" style="color:#8CA48F;">info@dharadimensionhumana.es</a>.<br/>
        <strong>Baja:</strong> En Dhara respetamos tu espacio. Si sientes que este ya no es tu lugar, puedes responder a este correo con la palabra "Baja".
      </div>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8"/>
          <style>
            body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.8; color: #333; margin: 0; padding: 0; background-color: #f9f7f4; }
            .container { max-width: 600px; margin: 0 auto; padding: 32px 20px; }
            .header { background-color: #8CA48F; color: white; padding: 32px 28px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 22px; font-weight: normal; letter-spacing: 0.5px; }
            .header p { margin: 8px 0 0; opacity: 0.85; font-size: 14px; }
            .content { background-color: #ffffff; padding: 36px 32px; border-radius: 0 0 10px 10px; border: 1px solid #e8e4df; border-top: none; }
            .content p { margin: 0 0 18px; font-size: 15px; }
            .highlight { background-color: #f9f7f4; border-left: 3px solid #8CA48F; padding: 16px 20px; margin: 24px 0; border-radius: 0 6px 6px 0; font-size: 14px; }
            .steps { list-style: none; padding: 0; margin: 0 0 18px; }
            .steps li { padding: 6px 0 6px 28px; position: relative; font-size: 15px; }
            .steps li::before { content: "·"; position: absolute; left: 8px; color: #8CA48F; font-size: 20px; line-height: 1.3; }
            .button { display: inline-block; background-color: #8CA48F; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 8px 0 24px; font-size: 14px; letter-spacing: 0.3px; }
            .signature { margin-top: 32px; font-size: 14px; color: #555; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Te damos la bienvenida a Dhara</h1>
              <p>¡Ya estás dentro!</p>
            </div>
            <div class="content">
              <p>Hola, <strong>${nombre}</strong>:</p>

              <p>Hoy no recibes un correo más. Recibes un espacio que también es tuyo.</p>

              <p>Gracias por registrarte en Dhara. Gracias por estar aquí, en este momento en el que la plataforma ya no es solo una visión… sino un lugar vivo que empezamos a habitar en comunidad.</p>

              <p>Sabemos que dedicarte a las terapias naturales no es casualidad. Es una elección profunda y a veces solitaria. Muy valiente y muy honesta. Y Dhara va a estar contigo, para que no tengas que sostener ese camino en soledad.</p>

              <p>Desde este momento ya puedes acceder a tu espacio dentro de la plataforma. Te invitamos a entrar con calma, sin prisa, y empezar por lo esencial:</p>

              <ul class="steps">
                <li>Completar tu perfil desde un lugar auténtico (no perfecto)</li>
                <li>Explorar tus herramientas sin presión</li>
                <li>Sentir si este espacio también te sostiene a ti</li>
              </ul>

              <p>No necesitas hacerlo todo hoy. Aquí no venimos a correr. Venimos a hacer las cosas bien.</p>

              <div class="highlight">
                Además, como parte de este momento fundacional, mantienes tus <strong>3 meses de acceso al plan avanzado</strong>, para que puedas explorar Dhara con libertad y sin presión.
              </div>

              <p>Si en algún momento algo no se siente claro, o simplemente necesitas compartir cómo estás viviendo la experiencia, puedes escribirnos. Estamos aquí.</p>

              <p>También seguimos compartiendo el camino en <a href="https://www.instagram.com/dhara.dimensionhumana/" style="color:#8CA48F;">Instagram</a>, por si te apetece acompañarnos más de cerca.</p>

              <a href="${process.env.FRONTEND_URL || 'https://appdhara.com'}/dashboard" class="button">Acceder a mi espacio</a>

              <p>Gracias por elegir formar parte de esto. Gracias por cuidar.</p>
              <p>Nuestra más cálida bienvenida a Dhara. Y al que esperamos sea un espacio que te aporte valor.</p>

              <div class="signature">
                Isabel Miralles y Raquel García<br/>
                <em>Equipo Dhara</em>
              </div>

              ${gdprFooter}
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Te damos la bienvenida a Dhara. ¡Ya estás dentro!',
      html
    });
  }

  /**
   * Email de bienvenida específico para clientes recién registrados
   */
  async sendClientWelcomeEmail({ email, nombre }) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://appdhara.com';

    const gdprFooter = `
      <div style="margin-top:32px; padding:16px; background:#f5f5f5; border-radius:6px; font-size:11px; color:#777; line-height:1.6;">
        <strong>Información básica sobre Protección de Datos (RGPD y LOPDGDD):</strong><br/>
        <strong>Responsable:</strong> Isabel Miralles Rubert (DNI: 24399337V) – App Dhara.<br/>
        <strong>Finalidad:</strong> Gestión de la relación con el usuario/profesional, envío de comunicaciones sobre el estado de la plataforma y novedades de la comunidad.<br/>
        <strong>Legitimación:</strong> Ejecución de contrato y consentimiento del interesado.<br/>
        <strong>Destinatarios:</strong> No se cederán datos a terceros salvo obligación legal o proveedores técnicos necesarios para la prestación del servicio (Stripe, Supabase).<br/>
        <strong>Derechos:</strong> Tienes derecho a acceder, rectificar y suprimir tus datos, así como otros derechos detallados en nuestra Política de Privacidad, enviando un correo a <a href="mailto:info@dharadimensionhumana.es" style="color:#8CA48F;">info@dharadimensionhumana.es</a>.<br/>
        <strong>Baja:</strong> En Dhara respetamos tu espacio. Si sientes que este ya no es tu lugar, puedes responder a este correo con la palabra "Baja".
      </div>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8"/>
          <style>
            body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.8; color: #333; margin: 0; padding: 0; background-color: #f9f7f4; }
            .container { max-width: 600px; margin: 0 auto; padding: 32px 20px; }
            .header { background-color: #8CA48F; color: white; padding: 32px 28px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 22px; font-weight: normal; letter-spacing: 0.5px; }
            .content { background-color: #ffffff; padding: 36px 32px; border-radius: 0 0 10px 10px; border: 1px solid #e8e4df; border-top: none; }
            .content p { margin: 0 0 18px; font-size: 15px; }
            .features { list-style: none; padding: 0; margin: 0 0 24px; }
            .features li { padding: 6px 0 6px 28px; position: relative; font-size: 15px; }
            .features li::before { content: "·"; position: absolute; left: 8px; color: #8CA48F; font-size: 20px; line-height: 1.3; }
            .cta-block { background-color: #f9f7f4; border-radius: 8px; padding: 20px 24px; margin: 24px 0; }
            .cta-block p { margin: 0 0 10px; font-size: 14px; font-weight: bold; color: #555; }
            .cta-link { display: inline-block; margin: 4px 0; color: #8CA48F; font-size: 14px; text-decoration: underline; }
            .button { display: inline-block; background-color: #8CA48F; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 8px 0 24px; font-size: 14px; }
            .signature { margin-top: 32px; font-size: 14px; color: #555; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Te damos la bienvenida a Dhara</h1>
            </div>
            <div class="content">
              <p>Hola, <strong>${nombre}</strong>:</p>

              <p>Hemos creado este espacio para que puedas descubrir, con calma y confianza, diferentes terapias naturales y profesionales que pueden acompañarte en tu proceso.</p>

              <p>En Dhara puedes:</p>
              <ul class="features">
                <li>Encontrar terapeutas según lo que necesitas o cerca de ti</li>
                <li>Descubrir qué terapia puede encajar contigo</li>
                <li>Reservar sesiones de forma sencilla</li>
                <li>Guardar y gestionar tu experiencia en un solo lugar</li>
              </ul>

              <p>Cada persona es diferente, y aquí tienes la libertad de explorar hasta encontrar lo que realmente resuene contigo.</p>

              <div class="cta-block">
                <p>Si lo deseas, puedes empezar por aquí:</p>
                <a href="${frontendUrl}/terapias" class="cta-link">→ Explorar terapias en el diccionario</a><br/>
                <a href="${frontendUrl}/terapeutas" class="cta-link">→ Buscar profesionales</a><br/>
                <a href="${frontendUrl}/favoritos" class="cta-link">→ Guardar aquellos que te resuenen en favoritos</a>
              </div>

              <p>Estamos aquí para acompañarte en este camino, a tu ritmo.</p>

              <p>Gracias por formar parte de Dhara. Puedes seguirnos en <a href="https://www.instagram.com/dhara.dimensionhumana/" style="color:#8CA48F;">Instagram</a>.</p>

              <a href="${frontendUrl}" class="button">Empezar a explorar</a>

              <div class="signature">
                Gracias por elegirte.<br/>
                Con cariño,<br/>
                <strong>El equipo de Dhara</strong>
              </div>

              ${gdprFooter}
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Te damos la bienvenida a Dhara',
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
   * Enviar email de recuperación de contraseña
   */
  async sendPasswordResetEmail({ email, name, resetUrl }) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #8CA48F; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 22px; }
            .content { background-color: #f9f7f4; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #8CA48F; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; font-size: 15px; }
            .warning { background-color: #fff8e1; border-left: 4px solid #f4a460; padding: 12px 16px; margin: 20px 0; border-radius: 0 6px 6px 0; font-size: 13px; color: #7a6a3a; }
            .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #999; }
            .url-box { background-color: #f0f0f0; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; color: #555; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Recuperar contraseña</h1>
              <p style="margin:8px 0 0; opacity:0.9;">Dhara Dimensión Humana</p>
            </div>
            <div class="content">
              <h2>Hola${name ? ` ${name}` : ''},</h2>
              <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>
              <p>Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace es válido durante <strong>10 minutos</strong>.</p>

              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Restablecer contraseña</a>
              </div>

              <div class="warning">
                <strong>¿No has solicitado esto?</strong> Ignora este email y tu contraseña no cambiará.
              </div>

              <p style="font-size: 13px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
              <div class="url-box">${resetUrl}</div>
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
      subject: 'Restablecer contraseña - Dhara Dimensión Humana',
      html
    });
  }

  /**
   * Email con código de invitación para clientes
   */
  async sendInvitationCodeEmail({ email, clientName, code, therapistName }) {
    const firstName = (clientName || '').split(' ')[0] || clientName;
    const appUrl = process.env.FRONTEND_URL || 'https://appdhara.com';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8"/>
          <style>
            body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.8; color: #333; margin: 0; padding: 0; background-color: #f9f7f4; }
            .container { max-width: 600px; margin: 0 auto; padding: 32px 20px; }
            .header { background-color: #8CA48F; color: white; padding: 32px 28px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 22px; font-weight: normal; letter-spacing: 0.5px; }
            .content { background-color: #ffffff; padding: 36px 32px; border-radius: 0 0 10px 10px; border: 1px solid #e8e4df; border-top: none; }
            .content p { margin: 0 0 18px; font-size: 15px; }
            .code-box { background-color: #f9f7f4; border: 2px dashed #8CA48F; border-radius: 10px; padding: 24px; text-align: center; margin: 28px 0; }
            .code-box .label { font-size: 13px; color: #888; margin-bottom: 8px; }
            .code-box .code { font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #3a5a3d; }
            .button { display: inline-block; background-color: #8CA48F; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 8px 0 24px; font-size: 14px; }
            .steps { list-style: none; padding: 0; margin: 0 0 24px; }
            .steps li { padding: 6px 0 6px 28px; position: relative; font-size: 14px; color: #555; }
            .steps li::before { content: counter(step-counter); counter-increment: step-counter; position: absolute; left: 0; top: 6px; background-color: #8CA48F; color: white; width: 18px; height: 18px; border-radius: 50%; font-size: 11px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 18px; }
            .steps { counter-reset: step-counter; }
            .signature { margin-top: 32px; font-size: 14px; color: #555; }
            .gdpr { margin-top: 32px; padding: 16px; background:#f5f5f5; border-radius:6px; font-size:11px; color:#777; line-height:1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Has sido invitado/a a Dhara</h1>
            </div>
            <div class="content">
              <p>Hola, <strong>${firstName}</strong>:</p>

              <p>Tu profesional de referencia en las terapias naturales${therapistName ? `, <strong>${therapistName}</strong>,` : ''} te ha invitado a unirte a Dhara.</p>

              <p>En Dhara podrás acceder a tus sesiones, documentos y comunicarte directamente con tu terapeuta, todo en un solo lugar.</p>

              <div class="code-box">
                <div class="label">Tu código de invitación</div>
                <div class="code">${code}</div>
              </div>

              <p>Para comenzar, sigue estos pasos:</p>
              <ol class="steps">
                <li>Entra en <a href="${appUrl}/registro-cliente" style="color:#8CA48F;">${appUrl}/registro-cliente</a></li>
                <li>Rellena tus datos de registro</li>
                <li>Introduce el código de invitación cuando te lo solicite</li>
                <li>¡Listo! Tú y tu terapeuta ya estaréis conectados</li>
              </ol>

              <a href="${appUrl}/registro-cliente" class="button">Crear mi cuenta</a>

              <p style="font-size:13px; color:#888;">Este código es personal e intransferible. Caduca en 30 días.</p>

              <div class="signature">
                Con cariño,<br/>
                <strong>El equipo de Dhara</strong>
              </div>

              <div class="gdpr">
                <strong>Información básica sobre Protección de Datos (RGPD y LOPDGDD):</strong><br/>
                <strong>Responsable:</strong> Isabel Miralles Rubert (DNI: 24399337V) – App Dhara.<br/>
                <strong>Finalidad:</strong> Gestión de la relación con el usuario/profesional, envío de comunicaciones sobre el estado de la plataforma y novedades de la comunidad.<br/>
                <strong>Legitimación:</strong> Ejecución de contrato y consentimiento del interesado.<br/>
                <strong>Destinatarios:</strong> No se cederán datos a terceros salvo obligación legal o proveedores técnicos necesarios para la prestación del servicio (Stripe, Supabase).<br/>
                <strong>Derechos:</strong> Tienes derecho a acceder, rectificar y suprimir tus datos, así como otros derechos detallados en nuestra Política de Privacidad, enviando un correo a <a href="mailto:info@dharadimensionhumana.es" style="color:#8CA48F;">info@dharadimensionhumana.es</a>.<br/>
                <strong>Baja:</strong> En Dhara respetamos tu espacio. Si sientes que este ya no es tu lugar, puedes responder a este correo con la palabra "Baja".
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Tu invitación a Dhara – código de acceso',
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
