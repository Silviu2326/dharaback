const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Servicio de Stripe para procesamiento de pagos
 *
 * Funcionalidades:
 * - Crear Payment Intents
 * - Confirmar pagos
 * - Crear clientes en Stripe
 * - Manejar reembolsos
 * - Crear sesiones de checkout
 */

class StripeService {
  /**
   * Crear un Payment Intent
   * @param {Object} data - Datos del pago
   * @param {number} data.amount - Monto en centavos
   * @param {string} data.currency - Moneda (eur, usd, etc)
   * @param {string} data.customerId - ID del cliente en Stripe (opcional)
   * @param {Object} data.metadata - Metadata adicional
   * @returns {Promise<Object>} Payment Intent creado
   */
  async createPaymentIntent(data) {
    try {
      const { amount, currency = 'eur', customerId, metadata = {} } = data;

      if (!amount || amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      const paymentIntentData = {
        amount: Math.round(amount), // Asegurar que sea entero
        currency: currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          ...metadata,
          platform: 'dharaterapeutas'
        }
      };

      // Asociar cliente si existe
      if (customerId) {
        paymentIntentData.customer = customerId;
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

      console.log('✅ Payment Intent created:', paymentIntent.id);

      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      };
    } catch (error) {
      console.error('❌ Error creating Payment Intent:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Confirmar un pago
   * @param {string} paymentIntentId - ID del Payment Intent
   * @returns {Promise<Object>} Payment Intent confirmado
   */
  async confirmPayment(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      console.log('✅ Payment confirmed:', paymentIntent.id, 'Status:', paymentIntent.status);

      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        metadata: paymentIntent.metadata
      };
    } catch (error) {
      console.error('❌ Error confirming payment:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Crear un cliente en Stripe
   * @param {Object} data - Datos del cliente
   * @param {string} data.email - Email del cliente
   * @param {string} data.name - Nombre del cliente
   * @param {Object} data.metadata - Metadata adicional
   * @returns {Promise<Object>} Cliente creado
   */
  async createCustomer(data) {
    try {
      const { email, name, metadata = {} } = data;

      if (!email) {
        throw new Error('Email is required');
      }

      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          ...metadata,
          platform: 'dharaterapeutas'
        }
      });

      console.log('✅ Customer created:', customer.id);

      return {
        id: customer.id,
        email: customer.email,
        name: customer.name
      };
    } catch (error) {
      console.error('❌ Error creating customer:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Obtener un cliente por email
   * @param {string} email - Email del cliente
   * @returns {Promise<Object|null>} Cliente encontrado o null
   */
  async getCustomerByEmail(email) {
    try {
      const customers = await stripe.customers.list({
        email,
        limit: 1
      });

      if (customers.data.length > 0) {
        return {
          id: customers.data[0].id,
          email: customers.data[0].email,
          name: customers.data[0].name
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error getting customer:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Crear o obtener un cliente
   * @param {Object} data - Datos del cliente
   * @returns {Promise<Object>} Cliente
   */
  async getOrCreateCustomer(data) {
    try {
      // Intentar obtener cliente existente
      const existingCustomer = await this.getCustomerByEmail(data.email);

      if (existingCustomer) {
        console.log('✅ Customer already exists:', existingCustomer.id);
        return existingCustomer;
      }

      // Crear nuevo cliente
      return await this.createCustomer(data);
    } catch (error) {
      console.error('❌ Error in getOrCreateCustomer:', error);
      throw error;
    }
  }

  /**
   * Crear un reembolso
   * @param {string} paymentIntentId - ID del Payment Intent a reembolsar
   * @param {number} amount - Monto a reembolsar (opcional, reembolsa todo si no se especifica)
   * @param {string} reason - Razón del reembolso
   * @returns {Promise<Object>} Reembolso creado
   */
  async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
    try {
      const refundData = {
        payment_intent: paymentIntentId,
        reason
      };

      if (amount) {
        refundData.amount = Math.round(amount);
      }

      const refund = await stripe.refunds.create(refundData);

      console.log('✅ Refund created:', refund.id);

      return {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason
      };
    } catch (error) {
      console.error('❌ Error creating refund:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Crear sesión de Checkout
   * @param {Object} data - Datos de la sesión
   * @param {Array} data.lineItems - Items a pagar
   * @param {string} data.successUrl - URL de éxito
   * @param {string} data.cancelUrl - URL de cancelación
   * @param {string} data.customerId - ID del cliente (opcional)
   * @param {Object} data.metadata - Metadata adicional
   * @returns {Promise<Object>} Sesión de checkout
   */
  async createCheckoutSession(data) {
    try {
      const { lineItems, successUrl, cancelUrl, customerId, metadata = {} } = data;

      if (!lineItems || lineItems.length === 0) {
        throw new Error('Line items are required');
      }

      if (!successUrl || !cancelUrl) {
        throw new Error('Success and cancel URLs are required');
      }

      const sessionData = {
        mode: 'payment',
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          ...metadata,
          platform: 'dharaterapeutas'
        }
      };

      if (customerId) {
        sessionData.customer = customerId;
      }

      const session = await stripe.checkout.sessions.create(sessionData);

      console.log('✅ Checkout session created:', session.id);

      return {
        id: session.id,
        url: session.url,
        status: session.status
      };
    } catch (error) {
      console.error('❌ Error creating checkout session:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Construir evento de webhook
   * @param {string} payload - Payload del webhook
   * @param {string} signature - Firma del webhook
   * @returns {Object} Evento de Stripe
   */
  constructWebhookEvent(payload, signature) {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );

      return event;
    } catch (error) {
      console.error('❌ Error constructing webhook event:', error);
      throw new Error(`Webhook error: ${error.message}`);
    }
  }

  /**
   * Obtener información de un pago
   * @param {string} paymentIntentId - ID del Payment Intent
   * @returns {Promise<Object>} Información del pago
   */
  async getPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        metadata: paymentIntent.metadata,
        created: paymentIntent.created,
        customer: paymentIntent.customer
      };
    } catch (error) {
      console.error('❌ Error getting payment intent:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Cancelar un Payment Intent
   * @param {string} paymentIntentId - ID del Payment Intent
   * @returns {Promise<Object>} Payment Intent cancelado
   */
  async cancelPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);

      console.log('✅ Payment Intent canceled:', paymentIntent.id);

      return {
        id: paymentIntent.id,
        status: paymentIntent.status
      };
    } catch (error) {
      console.error('❌ Error canceling payment intent:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Crear sesión de Checkout para suscripción con trial
   * @param {Object} data - Datos de la suscripción
   * @param {string} data.priceId - ID del precio de Stripe
   * @param {string} data.customerId - ID del cliente (opcional)
   * @param {string} data.email - Email del cliente
   * @param {string} data.name - Nombre del cliente
   * @param {number} data.trialDays - Días de prueba (default: 90)
   * @param {string} data.successUrl - URL de éxito
   * @param {string} data.cancelUrl - URL de cancelación
   * @param {Object} data.metadata - Metadata adicional
   * @returns {Promise<Object>} Sesión de checkout
   */
  async createSubscriptionCheckout(data) {
    try {
      const { 
        priceId, 
        customerId, 
        email, 
        name, 
        trialDays = 90, 
        successUrl, 
        cancelUrl, 
        metadata = {} 
      } = data;

      if (!priceId) {
        throw new Error('Price ID is required');
      }

      if (!successUrl || !cancelUrl) {
        throw new Error('Success and cancel URLs are required');
      }

      let stripeCustomerId = customerId;

      // Si no hay customerId, crear nuevo cliente
      if (!stripeCustomerId && email) {
        const customer = await this.createCustomer({
          email,
          name,
          metadata: {
            userId: metadata.userId,
            tipo: 'terapeuta'
          }
        });
        stripeCustomerId = customer.id;
      }

      const sessionData = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        subscription_data: {
          trial_period_days: trialDays,
          metadata: {
            ...metadata,
            platform: 'dharaterapeutas'
          }
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          ...metadata,
          platform: 'dharaterapeutas',
          tipo: 'registro_terapeuta'
        }
      };

      if (stripeCustomerId) {
        sessionData.customer = stripeCustomerId;
      }

      const session = await stripe.checkout.sessions.create(sessionData);

      console.log('✅ Subscription checkout session created:', session.id, 'Trial:', trialDays, 'days');

      return {
        id: session.id,
        url: session.url,
        status: session.status,
        customerId: stripeCustomerId
      };
    } catch (error) {
      console.error('❌ Error creating subscription checkout:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Recuperar sesión de checkout
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Object>} Sesión de checkout
   */
  async getCheckoutSession(sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer']
      });

      return {
        id: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        customerId: session.customer?.id,
        subscriptionId: session.subscription?.id,
        metadata: session.metadata
      };
    } catch (error) {
      console.error('❌ Error retrieving checkout session:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Obtener suscripción de Stripe
   * @param {string} subscriptionId - ID de la suscripción
   * @returns {Promise<Object>} Suscripción
   */
  async getSubscription(subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      return {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        trial_start: subscription.trial_start,
        trial_end: subscription.trial_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        customer: subscription.customer
      };
    } catch (error) {
      console.error('❌ Error getting subscription:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }
}

module.exports = new StripeService();
