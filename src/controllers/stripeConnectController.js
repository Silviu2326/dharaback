const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/authMiddleware');
const { supabase } = require('../config/supabase');
const stripeService = require('../services/stripeService');

/**
 * @desc    Crear una cuenta de conexión con Stripe Connect
 * @route   POST /api/payments/stripe/connect/create-account
 * @access  Private
 */
const createConnectAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { email, firstName, lastName, country = 'ES' } = req.body;

  try {
    console.log(`🚀 [createConnectAccount] Creando cuenta Stripe Connect para usuario: ${userId}`);

    // Obtener información del usuario
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error(`❌ [createConnectAccount] Usuario no encontrado: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Verificar si ya tiene cuenta de Stripe Connect
    if (user.stripe_connect_account_id) {
      console.log(`ℹ️ [createConnectAccount] Usuario ya tiene cuenta: ${user.stripe_connect_account_id}`);
      
      // Obtener el enlace de onboarding existente
      const onboardingUrl = await stripeService.getConnectOnboardingUrl(
        user.stripe_connect_account_id,
        process.env.FRONTEND_URL || 'http://localhost:5173'
      );

      return res.status(200).json({
        success: true,
        message: 'Ya tienes una cuenta de Stripe Connect',
        data: {
          url: onboardingUrl,
          accountId: user.stripe_connect_account_id
        }
      });
    }

    // Crear nueva cuenta de Stripe Connect
    const accountData = {
      type: 'express',
      country: country,
      email: email || user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_type: 'individual',
      individual: {
        email: email || user.email,
        first_name: firstName || user.first_name,
        last_name: lastName || user.last_name
      },
      metadata: {
        userId: userId,
        platform: 'dharaterapeutas'
      }
    };

    const account = await stripeService.createConnectAccount(accountData);
    console.log(`✅ [createConnectAccount] Cuenta creada: ${account.id}`);

    // Guardar el ID de la cuenta en el usuario
    const { error: updateError } = await supabase
      .from('users')
      .update({
        stripe_connect_account_id: account.id,
        stripe_connect_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error(`❌ [createConnectAccount] Error guardando cuenta:`, updateError);
      throw new Error('Error guardando cuenta de Stripe Connect');
    }

    // Crear enlace de onboarding
    const onboardingUrl = await stripeService.getConnectOnboardingUrl(
      account.id,
      process.env.FRONTEND_URL || 'http://localhost:5173'
    );

    console.log(`✅ [createConnectAccount] Enlace de onboarding creado`);

    res.status(200).json({
      success: true,
      message: 'Cuenta de Stripe Connect creada exitosamente',
      data: {
        url: onboardingUrl,
        accountId: account.id
      }
    });

  } catch (error) {
    console.error(`❌ [createConnectAccount] Error:`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creando cuenta de Stripe Connect'
    });
  }
});

/**
 * @desc    Obtener el estado de la cuenta de Stripe Connect
 * @route   GET /api/payments/stripe/connect/status
 * @access  Private
 */
const getConnectStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    console.log(`🔍 [getConnectStatus] Obteniendo estado para usuario: ${userId}`);
    console.log(`🔍 [getConnectStatus] req.user completo:`, JSON.stringify(req.user, null, 2));

    // Obtener información del usuario
    console.log(`🔍 [getConnectStatus] Consultando Supabase tabla 'users'...`);
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_connect_account_id, stripe_connect_status')
      .eq('id', userId)
      .single();

    console.log(`🔍 [getConnectStatus] Resultado consulta:`, { user, error: userError });

    if (userError) {
      console.error(`❌ [getConnectStatus] Error de Supabase:`, userError);
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
        error: userError.message
      });
    }

    if (!user) {
      console.error(`❌ [getConnectStatus] Usuario no encontrado en la base de datos`);
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    console.log(`✅ [getConnectStatus] Usuario encontrado:`, user);

    // Si no tiene cuenta conectada
    if (!user.stripe_connect_account_id) {
      return res.status(200).json({
        success: true,
        data: {
          connected: false,
          accountId: null,
          dashboardUrl: null,
          requirements: null
        }
      });
    }

    // Obtener información de la cuenta desde Stripe
    const account = await stripeService.getConnectAccount(user.stripe_connect_account_id);
    
    // Determinar si está completamente configurada
    const isFullyOnboarded = account.charges_enabled && account.payouts_enabled;
    const hasPendingRequirements = account.requirements?.currently_due?.length > 0;
    
    // Actualizar estado en la base de datos si ha cambiado
    const newStatus = isFullyOnboarded ? 'active' : 'pending';
    if (user.stripe_connect_status !== newStatus) {
      await supabase
        .from('users')
        .update({
          stripe_connect_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
    }

    // Obtener URL del dashboard si está activa
    let dashboardUrl = null;
    if (isFullyOnboarded) {
      try {
        dashboardUrl = await stripeService.getConnectDashboardUrl(user.stripe_connect_account_id);
      } catch (dashboardError) {
        console.error('Error getting dashboard URL:', dashboardError);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        connected: isFullyOnboarded,
        accountId: user.stripe_connect_account_id,
        dashboardUrl: dashboardUrl,
        requirements: {
          currentlyDue: account.requirements?.currently_due || [],
          eventuallyDue: account.requirements?.eventually_due || [],
          pastDue: account.requirements?.past_due || [],
          pendingVerification: account.requirements?.pending_verification || []
        },
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled
      }
    });

  } catch (error) {
    console.error(`❌ [getConnectStatus] Error:`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error obteniendo estado de Stripe Connect'
    });
  }
});

/**
 * @desc    Obtener URL del dashboard de Stripe Express
 * @route   GET /api/payments/stripe/connect/dashboard-url
 * @access  Private
 */
const getDashboardUrl = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    console.log(`🔍 [getDashboardUrl] Obteniendo URL para usuario: ${userId}`);

    // Obtener información del usuario
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_connect_account_id, stripe_connect_status')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.stripe_connect_account_id) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta de Stripe Connect no encontrada'
      });
    }

    // Obtener URL del dashboard
    const dashboardUrl = await stripeService.getConnectDashboardUrl(user.stripe_connect_account_id);

    res.status(200).json({
      success: true,
      data: {
        url: dashboardUrl
      }
    });

  } catch (error) {
    console.error(`❌ [getDashboardUrl] Error:`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error obteniendo URL del dashboard'
    });
  }
});

/**
 * @desc    Desconectar cuenta de Stripe Connect
 * @route   DELETE /api/payments/stripe/connect/disconnect
 * @access  Private
 */
const disconnectAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    console.log(`🚀 [disconnectAccount] Desconectando cuenta para usuario: ${userId}`);

    // Obtener información del usuario
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_connect_account_id')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.stripe_connect_account_id) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta de Stripe Connect no encontrada'
      });
    }

    // Revocar la cuenta en Stripe (opcional)
    try {
      await stripeService.revokeConnectAccount(user.stripe_connect_account_id);
      console.log(`✅ [disconnectAccount] Cuenta revocada en Stripe: ${user.stripe_connect_account_id}`);
    } catch (stripeError) {
      console.error('Error revocando cuenta en Stripe:', stripeError);
      // Continuar de todos modos para limpiar la base de datos
    }

    // Limpiar datos de Stripe Connect del usuario
    const { error: updateError } = await supabase
      .from('users')
      .update({
        stripe_connect_account_id: null,
        stripe_connect_status: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      throw new Error('Error desconectando cuenta');
    }

    res.status(200).json({
      success: true,
      message: 'Cuenta de Stripe Connect desconectada exitosamente'
    });

  } catch (error) {
    console.error(`❌ [disconnectAccount] Error:`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error desconectando cuenta de Stripe Connect'
    });
  }
});

/**
 * @desc    Webhook para eventos de Stripe Connect
 * @route   POST /api/payments/stripe/connect/webhook
 * @access  Public (con validación de firma)
 */
const handleConnectWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const payload = req.body;

  try {
    const event = stripeService.constructWebhookEvent(payload, signature);
    console.log(`📥 [Connect Webhook] Evento recibido: ${event.type}`);

    switch (event.type) {
      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;

      case 'account.application.deauthorized':
        await handleAccountDeauthorized(event.data.object);
        break;

      case 'capability.updated':
        await handleCapabilityUpdated(event.data.object);
        break;

      default:
        console.log(`⚠️ [Connect Webhook] Evento no manejado: ${event.type}`);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error(`❌ [Connect Webhook] Error:`, error);
    res.status(400).json({
      success: false,
      message: `Webhook Error: ${error.message}`
    });
  }
});

/**
 * Manejar actualización de cuenta
 */
async function handleAccountUpdated(account) {
  try {
    const accountId = account.id;
    
    // Buscar usuario por account ID
    const { data: user, error } = await supabase
      .from('users')
      .select('id, stripe_connect_status')
      .eq('stripe_connect_account_id', accountId)
      .single();

    if (error || !user) {
      console.log(`⚠️ No se encontró usuario para cuenta: ${accountId}`);
      return;
    }

    const isFullyOnboarded = account.charges_enabled && account.payouts_enabled;
    const newStatus = isFullyOnboarded ? 'active' : 'pending';

    if (user.stripe_connect_status !== newStatus) {
      await supabase
        .from('users')
        .update({
          stripe_connect_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      console.log(`✅ Estado actualizado para usuario ${user.id}: ${newStatus}`);
    }

  } catch (error) {
    console.error('Error manejando account.updated:', error);
  }
}

/**
 * Manejar desautorización de aplicación
 */
async function handleAccountDeauthorized(account) {
  try {
    const accountId = account.id;
    
    // Buscar y actualizar usuario
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_connect_account_id', accountId)
      .single();

    if (user) {
      await supabase
        .from('users')
        .update({
          stripe_connect_account_id: null,
          stripe_connect_status: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      console.log(`✅ Cuenta desconectada para usuario: ${user.id}`);
    }

  } catch (error) {
    console.error('Error manejando account.application.deauthorized:', error);
  }
}

/**
 * Manejar actualización de capability
 */
async function handleCapabilityUpdated(capability) {
  try {
    console.log(`📊 Capability actualizado: ${capability.id} - ${capability.status}`);
    // El manejo principal está en account.updated
  } catch (error) {
    console.error('Error manejando capability.updated:', error);
  }
}

module.exports = {
  createConnectAccount,
  getConnectStatus,
  getDashboardUrl,
  disconnectAccount,
  handleConnectWebhook
};
