const asyncHandler = require('../middleware/asyncHandler');
const stripeService = require('../services/stripeService');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const VerificationDocument = require('../models/VerificationDocument');
const fs = require('fs').promises;
const path = require('path');

/**
 * @desc    Crear sesión de checkout para registro de terapeuta con trial
 * @route   POST /api/terapeutas/suscribir
 * @access  Public
 */
const createTherapistSubscription = asyncHandler(async (req, res) => {
  const { email, nombre, userId, trialDays = 90 } = req.body;

  // Validaciones
  if (!email || !nombre) {
    return res.status(400).json({
      success: false,
      message: 'Email y nombre son requeridos'
    });
  }

  // Validar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Email inválido'
    });
  }

  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://dharadimensionhumana.es';
    
    // ID del precio del Plan Avanzado (38,99€/mes)
    const priceId = process.env.STRIPE_PLAN_AVANZADO_PRICE_ID || 'price_1T1BngECp38q24a3IczRTdHW';

    // Crear sesión de checkout con trial
    const session = await stripeService.createSubscriptionCheckout({
      priceId,
      email,
      name: nombre,
      trialDays,
      successUrl: `${frontendUrl}/registro-exitoso?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/registro-terapeuta?cancelled=true`,
      metadata: {
        userId: userId || '',
        email,
        nombre,
        tipo: 'registro_terapeuta',
        trialDays: trialDays.toString()
      }
    });

    console.log('✅ Therapist subscription checkout created:', {
      sessionId: session.id,
      email,
      trialDays
    });

    res.status(200).json({
      success: true,
      message: 'Sesión de checkout creada correctamente',
      data: {
        url: session.url,
        sessionId: session.id,
        customerId: session.customerId
      }
    });

  } catch (error) {
    console.error('❌ Error creating therapist subscription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al crear la suscripción'
    });
  }
});

/**
 * @desc    Verificar estado de registro después del checkout
 * @route   GET /api/terapeutas/verificar-registro
 * @access  Public
 */
const verifyRegistration = asyncHandler(async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({
      success: false,
      message: 'Session ID es requerido'
    });
  }

  try {
    const session = await stripeService.getCheckoutSession(session_id);

    // Si el pago fue exitoso, guardar la suscripción en la base de datos
    if (session.paymentStatus === 'paid' && session.subscriptionId) {
      // Buscar usuario por email o userId
      const user = await User.findOne({
        $or: [
          { email: session.metadata?.email },
          { _id: session.metadata?.userId }
        ]
      });

      if (user) {
        // Actualizar usuario con datos de Stripe
        user.stripeCustomerId = session.customerId;
        user.stripeSubscriptionId = session.subscriptionId;
        user.subscriptionStatus = 'trial';
        await user.save();

        // Verificar si ya existe una suscripción
        const existingSubscription = await Subscription.findOne({
          therapistId: user._id
        });

        const trialDays = parseInt(session.metadata?.trialDays) || 90;
        const now = new Date();
        const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

        if (existingSubscription) {
          // Actualizar suscripción existente
          existingSubscription.status = 'trial';
          existingSubscription.trial.isTrialUsed = true;
          existingSubscription.trial.trialStartDate = now;
          existingSubscription.trial.trialEndDate = trialEndDate;
          existingSubscription.startDate = now;
          existingSubscription.endDate = trialEndDate;
          existingSubscription.renewalDate = trialEndDate;
          await existingSubscription.save();
        } else {
          // Crear nueva suscripción
          await Subscription.create({
            therapistId: user._id,
            plan: 'professional', // Usamos 'professional' que es equivalente a 'avanzado'
            status: 'trial',
            startDate: now,
            endDate: trialEndDate,
            renewalDate: trialEndDate,
            amount: 38.99,
            currency: 'EUR',
            paymentMethod: 'stripe',
            trial: {
              isTrialUsed: true,
              trialDays: trialDays,
              trialStartDate: now,
              trialEndDate: trialEndDate
            }
          });
        }

        console.log('✅ Subscription saved for user:', user.email);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        status: session.status,
        paymentStatus: session.paymentStatus,
        subscriptionId: session.subscriptionId
      }
    });

  } catch (error) {
    console.error('❌ Error verifying registration:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al verificar el registro'
    });
  }
});

/**
 * @desc    Manejar webhook de Stripe para suscripciones
 * @param {Object} event - Evento de Stripe
 */
const handleSubscriptionWebhook = async (event) => {
  const { type, data } = event;

  try {
    switch (type) {
      case 'checkout.session.completed': {
        const session = data.object;
        
        // Solo procesar si es registro de terapeuta
        if (session.metadata?.tipo === 'registro_terapeuta') {
          console.log('✅ Checkout completed for therapist:', session.customer_details?.email);
          
          // Buscar usuario
          const user = await User.findOne({ email: session.metadata?.email });
          
          if (user && session.subscription) {
            // Obtener detalles de la suscripción de Stripe
            const subscriptionDetails = await stripeService.getSubscription(session.subscription);
            
            const trialDays = parseInt(session.metadata?.trialDays) || 90;
            const now = new Date();
            const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

            // Actualizar usuario
            user.stripeCustomerId = session.customer;
            user.stripeSubscriptionId = session.subscription;
            user.subscriptionStatus = 'trial';
            await user.save();
            
            // Crear o actualizar suscripción
            await Subscription.findOneAndUpdate(
              { therapistId: user._id },
              {
                plan: 'professional',
                status: 'trial',
                startDate: now,
                endDate: trialEndDate,
                renewalDate: trialEndDate,
                amount: 38.99,
                currency: 'EUR',
                paymentMethod: 'stripe',
                trial: {
                  isTrialUsed: true,
                  trialDays: trialDays,
                  trialStartDate: now,
                  trialEndDate: trialEndDate
                }
              },
              { upsert: true, new: true }
            );

            console.log('✅ Subscription webhook processed for:', user.email);
          }
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = data.object;
        
        if (invoice.subscription) {
          // Buscar usuario por stripeCustomerId
          const user = await User.findOne({ stripeCustomerId: invoice.customer });
          
          if (user) {
            await Subscription.findOneAndUpdate(
              { therapistId: user._id },
              {
                status: 'active',
                $push: {
                  paymentHistory: {
                    amount: invoice.amount_paid / 100,
                    currency: invoice.currency.toUpperCase(),
                    method: 'stripe',
                    transactionId: invoice.id,
                    status: 'completed',
                    date: new Date()
                  }
                }
              }
            );
            
            user.subscriptionStatus = 'active';
            await user.save();
            
            console.log('✅ Invoice paid for subscription:', invoice.subscription);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = data.object;
        
        if (invoice.subscription) {
          const user = await User.findOne({ stripeCustomerId: invoice.customer });
          
          if (user) {
            await Subscription.findOneAndUpdate(
              { therapistId: user._id },
              {
                status: 'past_due'
              }
            );
            
            user.subscriptionStatus = 'past_due';
            await user.save();
            
            console.log('❌ Invoice payment failed:', invoice.subscription);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = data.object;
        
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        
        if (user) {
          await Subscription.findOneAndUpdate(
            { therapistId: user._id },
            {
              status: 'cancelled',
              'management.cancellationDate': new Date()
            }
          );
          
          user.subscriptionStatus = 'canceled';
          await user.save();
          
          console.log('🗑️ Subscription canceled:', subscription.id);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = data.object;
        
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        
        if (user) {
          const statusMap = {
            'active': 'active',
            'canceled': 'cancelled',
            'incomplete': 'pending',
            'incomplete_expired': 'expired',
            'past_due': 'past_due',
            'paused': 'suspended',
            'trialing': 'trial',
            'unpaid': 'unpaid'
          };

          await Subscription.findOneAndUpdate(
            { therapistId: user._id },
            {
              status: statusMap[subscription.status] || subscription.status,
              renewalDate: new Date(subscription.current_period_end * 1000)
            }
          );
          
          user.subscriptionStatus = statusMap[subscription.status] || subscription.status;
          await user.save();
          
          console.log('📝 Subscription updated:', subscription.id, 'Status:', subscription.status);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled webhook event: ${type}`);
    }
  } catch (error) {
    console.error('❌ Error handling subscription webhook:', error);
    throw error;
  }
};

/**
 * @desc    Procesar documentos de titulación temporales al completar registro
 * @route   POST /api/terapeutas/procesar-documentos
 * @access  Public
 */
const processDegreeDocuments = asyncHandler(async (req, res) => {
  const { tempIds, userId, email } = req.body;

  if (!tempIds || !Array.isArray(tempIds) || tempIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Se requieren IDs de documentos temporales'
    });
  }

  try {
    // Buscar usuario
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const processedDocs = [];
    const tempDir = path.join(__dirname, '../../uploads/temp');
    const verificationDir = path.join(__dirname, '../../uploads/verification');

    // Asegurar que el directorio de verificación existe
    await fs.mkdir(verificationDir, { recursive: true });

    for (const tempId of tempIds) {
      const tempPath = path.join(tempDir, tempId);
      
      try {
        // Verificar que el archivo existe
        await fs.access(tempPath);

        // Generar nuevo nombre único
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const newFilename = 'degree-' + uniqueSuffix + path.extname(tempId);
        const newPath = path.join(verificationDir, newFilename);

        // Mover archivo
        await fs.rename(tempPath, newPath);

        // Leer metadatos si existen
        const stats = await fs.stat(newPath);
        
        // Crear registro en VerificationDocument
        const doc = new VerificationDocument({
          therapistId: user._id,
          type: 'diploma',
          name: 'Titulación - ' + user.name,
          filename: newFilename,
          originalName: tempId,
          url: `/uploads/verification/${newFilename}`,
          mimeType: 'image/' + path.extname(tempId).slice(1),
          fileSize: stats.size,
          status: 'pending',
          priority: 'high',
          verificationLevel: 'enhanced',
          metadata: {
            uploadedFrom: 'web',
            sessionId: 'registration'
          },
          reviewHistory: [{
            action: 'submitted',
            date: new Date(),
            comment: 'Documento subido durante registro de terapeuta'
          }]
        });

        await doc.save();
        processedDocs.push(doc);

      } catch (fileError) {
        console.error(`❌ Error procesando documento temporal ${tempId}:`, fileError);
      }
    }

    console.log(`✅ ${processedDocs.length} documentos procesados para ${email}`);

    res.status(200).json({
      success: true,
      message: `${processedDocs.length} documentos procesados correctamente`,
      data: {
        processedCount: processedDocs.length,
        documents: processedDocs.map(d => ({
          id: d._id,
          status: d.status,
          url: d.url
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error procesando documentos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar documentos',
      error: error.message
    });
  }
});

module.exports = {
  createTherapistSubscription,
  verifyRegistration,
  handleSubscriptionWebhook,
  processDegreeDocuments
};
