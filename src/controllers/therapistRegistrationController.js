const asyncHandler = require('../middleware/asyncHandler');
const stripeService = require('../services/stripeService');
const fs = require('fs').promises;
const path = require('path');

/**
 * @desc    Crear sesión de checkout para registro de terapeuta con trial
 * @route   POST /api/terapeutas/suscribir
 * @access  Public
 */
const createTherapistSubscription = asyncHandler(async (req, res) => {
  const { email, nombre, userId, plan = 'avanzado', trialDays } = req.body;

  if (!email || !nombre) {
    return res.status(400).json({
      success: false,
      message: 'Email y nombre son requeridos'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Email inválido'
    });
  }

  // Configuración de planes
  const planConfig = {
    'basico': {
      priceId: process.env.STRIPE_PLAN_BASICO_PRICE_ID || 'price_basico_placeholder',
      defaultTrialDays: 90,
      nombre: 'Básico'
    },
    'avanzado': {
      priceId: process.env.STRIPE_PLAN_AVANZADO_PRICE_ID || 'price_1T1BngECp38q24a3IczRTdHW',
      defaultTrialDays: 90,
      nombre: 'Avanzado'
    },
    'avanzado-pro': {
      priceId: process.env.STRIPE_PLAN_AVANZADO_PRO_PRICE_ID || 'price_avanzado_pro_placeholder',
      defaultTrialDays: 0,
      nombre: 'Avanzado Pro'
    }
  };

  const selectedPlan = planConfig[plan] || planConfig['avanzado'];
  const finalTrialDays = trialDays !== undefined ? trialDays : selectedPlan.defaultTrialDays;

  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://dhara-peach.vercel.app';

    const session = await stripeService.createSubscriptionCheckout({
      priceId: selectedPlan.priceId,
      email,
      name: nombre,
      trialDays: finalTrialDays,
      successUrl: `${frontendUrl}/registro-exitoso?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/registro-terapeuta?cancelled=true`,
      metadata: {
        userId: userId || '',
        email,
        nombre,
        plan: plan,
        tipo: 'registro_terapeuta',
        trialDays: finalTrialDays.toString()
      }
    });

    console.log('✅ Therapist subscription checkout created:', {
      sessionId: session.id,
      email,
      plan: plan,
      trialDays: finalTrialDays
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

    console.log('✅ Session verified:', {
      sessionId: session.id,
      paymentStatus: session.paymentStatus,
      subscriptionId: session.subscriptionId
    });

    res.status(200).json({
      success: true,
      data: {
        status: session.status,
        paymentStatus: session.paymentStatus,
        subscriptionId: session.subscriptionId,
        customerId: session.customerId,
        email: session.customerEmail,
        nombre: session.customerName
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
    const processedDocs = [];
    const tempDir = path.join(__dirname, '../../uploads/temp');
    const verificationDir = path.join(__dirname, '../../uploads/verification');

    await fs.mkdir(verificationDir, { recursive: true });

    for (const tempId of tempIds) {
      const tempPath = path.join(tempDir, tempId);
      
      try {
        await fs.access(tempPath);

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const newFilename = 'degree-' + uniqueSuffix + path.extname(tempId);
        const newPath = path.join(verificationDir, newFilename);

        await fs.rename(tempPath, newPath);
        const stats = await fs.stat(newPath);

        processedDocs.push({
          id: uniqueSuffix,
          status: 'pending',
          url: `/uploads/verification/${newFilename}`,
          originalName: tempId,
          fileSize: stats.size
        });

        console.log('✅ Documento procesado:', newFilename);

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
        documents: processedDocs
      }
    });

  } catch (error) {
    console.error('❌ Error procesando documentos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al procesar documentos'
    });
  }
});

module.exports = {
  createTherapistSubscription,
  verifyRegistration,
  processDegreeDocuments
};
