const asyncHandler = require('../middleware/asyncHandler');
const stripeService = require('../services/stripeService');
const { Payment, Booking } = require('../models');
const { supabase } = require('../config/supabase');

/**
 * @desc    Crear Payment Intent para procesar pago
 * @route   POST /api/payments/stripe/create-intent
 * @access  Private
 */
const createPaymentIntent = asyncHandler(async (req, res) => {
  const { amount, currency = 'eur', bookingId, description, metadata = {} } = req.body;
  const userId = req.user.id;

  // Validar monto
  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid amount'
    });
  }

  try {
    // Obtener o crear cliente en Stripe
    const customer = await stripeService.getOrCreateCustomer({
      email: req.user.email,
      name: req.user.name,
      metadata: { userId }
    });

    // Crear Payment Intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: Math.round(amount * 100), // Convertir a centavos
      currency,
      customerId: customer.id,
      metadata: {
        userId,
        bookingId: bookingId || '',
        description: description || '',
        ...metadata
      }
    });

    // Crear registro de pago en base de datos
    const payment = await Payment.create({
      therapistId: userId,
      clientId: req.body.clientId,
      bookingId: bookingId || null,
      amount,
      currency: currency.toUpperCase(),
      method: 'stripe',
      status: 'pending',
      stripePaymentIntentId: paymentIntent.id,
      description: description || `Payment for booking ${bookingId || 'N/A'}`,
      metadata: {
        stripeCustomerId: customer.id,
        ...metadata
      }
    });

    console.log('✅ Payment Intent created and saved:', payment.id);

    res.status(200).json({
      success: true,
      message: 'Payment Intent created successfully',
      data: {
        paymentId: payment.id,
        clientSecret: paymentIntent.clientSecret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency
      }
    });
  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating payment intent'
    });
  }
});

/**
 * @desc    Confirmar pago después de procesar con Stripe
 * @route   POST /api/payments/stripe/confirm
 * @access  Private
 */
const confirmPayment = asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({
      success: false,
      message: 'Payment Intent ID is required'
    });
  }

  try {
    // Obtener información del pago de Stripe
    const stripePayment = await stripeService.confirmPayment(paymentIntentId);

    // Actualizar registro en base de datos
    const payment = await Payment.findByStripePaymentIntent(paymentIntentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Actualizar estado según respuesta de Stripe
    const newStatus = stripePayment.status === 'succeeded' ? 'completed' : stripePayment.status;
    const updateData = { status: newStatus };
    if (stripePayment.status === 'succeeded') {
      updateData.paidAt = new Date().toISOString();
    }

    await Payment.findByIdAndUpdate(payment.id, updateData);

    // Si el pago está relacionado con una reserva, actualizar estado
    if (payment.bookingId && stripePayment.status === 'succeeded') {
      await Booking.findByIdAndUpdate(payment.bookingId, {
        paymentStatus: 'paid'
      });
    }

    console.log('✅ Payment confirmed:', payment.id, 'Status:', newStatus);

    res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully',
      data: {
        paymentId: payment.id,
        status: newStatus,
        amount: payment.amount,
        currency: payment.currency
      }
    });
  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error confirming payment'
    });
  }
});

/**
 * @desc    Webhook de Stripe para eventos de pago
 * @route   POST /api/payments/stripe/webhook
 * @access  Public (con validación de firma)
 */
const handleWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const payload = req.body;

  try {
    // Construir evento con firma
    const event = stripeService.constructWebhookEvent(payload, signature);

    console.log('📥 Webhook received:', event.type);

    // Manejar diferentes tipos de eventos
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object);
        break;

      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;

      default:
        console.log(`⚠️  Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(400).json({
      success: false,
      message: `Webhook Error: ${error.message}`
    });
  }
});

/**
 * Manejar pago exitoso
 */
async function handlePaymentSuccess(paymentIntent) {
  try {
    const payment = await Payment.findByStripePaymentIntent(paymentIntent.id);

    if (payment) {
      await Payment.findByIdAndUpdate(payment.id, {
        status: 'completed',
        paidAt: new Date().toISOString()
      });

      // Actualizar reserva si existe
      if (payment.bookingId) {
        await Booking.findByIdAndUpdate(payment.bookingId, {
          paymentStatus: 'paid',
          status: 'confirmed'
        });
      }

      console.log('✅ Payment marked as completed:', payment.id);
    }
  } catch (error) {
    console.error('❌ Error handling payment success:', error);
  }
}

/**
 * Manejar pago fallido
 */
async function handlePaymentFailed(paymentIntent) {
  try {
    const payment = await Payment.findByStripePaymentIntent(paymentIntent.id);

    if (payment) {
      await Payment.findByIdAndUpdate(payment.id, {
        status: 'failed',
        metadata: {
          ...payment.metadata,
          failureReason: paymentIntent.last_payment_error?.message || 'Unknown error'
        }
      });

      console.log('❌ Payment marked as failed:', payment.id);
    }
  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
  }
}

/**
 * Manejar pago cancelado
 */
async function handlePaymentCanceled(paymentIntent) {
  try {
    const payment = await Payment.findByStripePaymentIntent(paymentIntent.id);

    if (payment) {
      await Payment.findByIdAndUpdate(payment.id, {
        status: 'canceled'
      });

      console.log('⚠️  Payment marked as canceled:', payment.id);
    }
  } catch (error) {
    console.error('❌ Error handling payment cancellation:', error);
  }
}

/**
 * Manejar reembolso
 */
async function handleRefund(charge) {
  try {
    const payment = await Payment.findByStripePaymentIntent(charge.payment_intent);

    if (payment) {
      const newRefundedAmount = payment.refundedAmount + (charge.amount_refunded / 100);
      const newStatus = newRefundedAmount >= payment.amount ? 'refunded' : 'partial_refund';

      await Payment.findByIdAndUpdate(payment.id, {
        status: newStatus,
        refundedAmount: newRefundedAmount
      });

      // Actualizar reserva si existe
      if (payment.bookingId) {
        await Booking.findByIdAndUpdate(payment.bookingId, {
          paymentStatus: 'refunded'
        });
      }

      console.log('💰 Payment marked as refunded:', payment.id);
    }
  } catch (error) {
    console.error('❌ Error handling refund:', error);
  }
}

/**
 * @desc    Crear reembolso
 * @route   POST /api/payments/stripe/refund
 * @access  Private
 */
const createRefund = asyncHandler(async (req, res) => {
  const { paymentId, amount, reason } = req.body;
  const userId = req.user.id;

  if (!paymentId) {
    return res.status(400).json({
      success: false,
      message: 'Payment ID is required'
    });
  }

  try {
    // Obtener pago
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Verificar que el terapeuta sea el dueño del pago
    if (payment.therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to refund this payment'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only refund completed payments'
      });
    }

    // Crear reembolso en Stripe
    const refund = await stripeService.createRefund(
      payment.stripePaymentIntentId,
      amount ? Math.round(amount * 100) : null,
      reason || 'requested_by_customer'
    );

    // Actualizar pago
    const newRefundedAmount = payment.refundedAmount + (refund.amount / 100);
    const newStatus = newRefundedAmount >= payment.amount ? 'refunded' : 'partial_refund';

    await Payment.findByIdAndUpdate(paymentId, {
      status: newStatus,
      refundedAmount: newRefundedAmount,
      refundReason: reason
    });

    // Actualizar reserva si existe
    if (payment.bookingId) {
      await Booking.findByIdAndUpdate(payment.bookingId, {
        paymentStatus: 'refunded'
      });
    }

    console.log('✅ Refund created:', refund.id);

    res.status(200).json({
      success: true,
      message: 'Refund created successfully',
      data: {
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status
      }
    });
  } catch (error) {
    console.error('❌ Error creating refund:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating refund'
    });
  }
});

module.exports = {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
  createRefund
};
