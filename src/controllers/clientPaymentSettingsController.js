const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabase');
const stripeService = require('../services/stripeService');

/**
 * @desc    Get payment method for a specific client
 * @route   GET /api/clients/:clientId/payment-method
 * @access  Private (Therapist only)
 */
const getClientPaymentMethod = asyncHandler(async (req, res, next) => {
  const { clientId } = req.params;
  const therapistId = req.user.id;

  console.log('[getClientPaymentMethod] Fetching for client:', clientId, 'therapist:', therapistId);

  // Check if therapist has Pro plan
  const { data: therapistSettings, error: settingsError } = await supabase
    .from('therapist_payment_settings')
    .select('subscription_plan, can_accept_online_payments')
    .eq('therapist_id', therapistId)
    .single();

  if (settingsError && settingsError.code !== 'PGRST116') {
    console.error('Error fetching therapist settings:', settingsError);
    return next(new AppError('Error al verificar configuración del terapeuta', 500));
  }

  const isProPlan = therapistSettings?.subscription_plan === 'avanzado-pro';

  // PRIMERO: Buscar en client_therapists (tabla principal)
  console.log('[getClientPaymentMethod] Querying client_therapists...');
  const { data: clientTherapist, error: ctError } = await supabase
    .from('client_therapists')
    .select('payment_method, status')
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .single();

  console.log('[getClientPaymentMethod] client_therapists result:', { clientTherapist, ctError });

  // SEGUNDO: Buscar en client_payment_preferences (fallback)
  console.log('[getClientPaymentMethod] Querying client_payment_preferences...');
  const { data: preferences, error: prefError } = await supabase
    .from('client_payment_preferences')
    .select('payment_method, is_exempt_from_payment, exemption_reason, updated_at')
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .single();

  console.log('[getClientPaymentMethod] client_payment_preferences result:', { preferences, prefError });

  // Usar el método de client_therapists si existe, sino el de preferences, sino 'cash'
  const paymentMethod = clientTherapist?.payment_method || preferences?.payment_method || 'cash';
  
  console.log('[getClientPaymentMethod] Final paymentMethod:', paymentMethod);

  res.status(200).json({
    success: true,
    data: {
      paymentMethod,
      isExempt: preferences?.is_exempt_from_payment || false,
      exemptionReason: preferences?.exemption_reason || null,
      updatedAt: clientTherapist?.updated_at || preferences?.updated_at,
      therapistPlan: therapistSettings?.subscription_plan || 'basico',
      canUseStripe: isProPlan && therapistSettings?.can_accept_online_payments,
      source: clientTherapist?.payment_method ? 'client_therapists' : (preferences?.payment_method ? 'client_payment_preferences' : 'default')
    }
  });
});

/**
 * @desc    Update payment method for a specific client
 * @route   PUT /api/clients/:clientId/payment-method
 * @access  Private (Therapist only, requires Pro plan)
 */
const updateClientPaymentMethod = asyncHandler(async (req, res, next) => {
  const { clientId } = req.params;
  const { paymentMethod, isExempt, exemptionReason } = req.body;
  const therapistId = req.user.id;

  // Validate payment method
  if (!['stripe', 'manual', 'cash', 'card', 'transfer', 'other'].includes(paymentMethod)) {
    return next(new AppError('Método de pago inválido', 400));
  }

  // Check if therapist has Pro plan
  const { data: therapistSettings, error: settingsError } = await supabase
    .from('therapist_payment_settings')
    .select('subscription_plan, can_accept_online_payments')
    .eq('therapist_id', therapistId)
    .single();

  if (settingsError && settingsError.code !== 'PGRST116') {
    console.error('Error fetching therapist settings:', settingsError);
    return next(new AppError('Error al verificar configuración del terapeuta', 500));
  }

  const isProPlan = therapistSettings?.subscription_plan === 'avanzado-pro';

  // Only allow Stripe if therapist has Pro plan
  if (paymentMethod === 'stripe' && !isProPlan) {
    return next(new AppError('Se requiere Plan Avanzado Pro para configurar pagos online', 403));
  }

  // Check if Stripe Connect account is active (only if setting to stripe)
  if (paymentMethod === 'stripe' && therapistSettings?.can_accept_online_payments !== true) {
    return next(new AppError('Cuenta Stripe Connect no activa', 403));
  }

  // PRIMERO: Actualizar client_therapists (tabla principal)
  const { data: updatedRelation, error: relationError } = await supabase
    .from('client_therapists')
    .update({
      payment_method: paymentMethod,
      updated_at: new Date().toISOString()
    })
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (relationError) {
    console.error('Error updating client_therapists:', relationError);
    return next(new AppError('Error al actualizar método de pago en relación cliente-terapeuta', 500));
  }

  // SEGUNDO: También actualizar client_payment_preferences (para backward compatibility)
  const { data: preferences, error: upsertError } = await supabase
    .from('client_payment_preferences')
    .upsert({
      therapist_id: therapistId,
      client_id: clientId,
      payment_method: paymentMethod,
      is_exempt_from_payment: isExempt || false,
      exemption_reason: exemptionReason || null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'therapist_id,client_id'
    })
    .select()
    .single();

  if (upsertError) {
    console.error('Error updating payment preferences:', upsertError);
    // No fallamos aquí porque ya actualizamos client_therapists
  }

  res.status(200).json({
    success: true,
    data: {
      paymentMethod: updatedRelation.payment_method,
      isExempt: preferences?.is_exempt_from_payment || false,
      exemptionReason: preferences?.exemption_reason || null,
      updatedAt: updatedRelation.updated_at,
      message: 'Método de pago actualizado correctamente'
    }
  });
});

/**
 * @desc    Get therapist subscription info
 * @route   GET /api/therapists/me/subscription
 * @access  Private (Therapist only)
 */
const getTherapistSubscription = asyncHandler(async (req, res, next) => {
  const therapistId = req.user.id;
  const fs = require('fs');
  const path = require('path');
  const debugFilePath = path.join(__dirname, '..', '..', 'debug_subscription.json');

  // Obtener el estado de Stripe Connect y suscripción desde la tabla users
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_status, subscription_status, stripe_subscription_id')
    .eq('id', therapistId)
    .single();

  const stripeConnectAccountId = userData?.stripe_connect_account_id || null;
  const stripeConnectStatus = userData?.stripe_connect_status || null;
  let subscriptionStatus = userData?.subscription_status || 'active';

  // Si el estado en BD es 'active', verificar en Stripe si cancel_at_period_end está activado
  if (subscriptionStatus === 'active' && userData?.stripe_subscription_id) {
    try {
      const stripeSub = await stripeService.getSubscription(userData.stripe_subscription_id);
      if (stripeSub?.cancel_at_period_end) {
        subscriptionStatus = 'cancelling';
      }
    } catch (stripeError) {
      console.warn('⚠️ [getTherapistSubscription] Could not verify Stripe cancel_at_period_end:', stripeError.message);
    }
  }

  const { data: settings, error } = await supabase
    .from('therapist_payment_settings')
    .select('subscription_plan, can_accept_online_payments')
    .eq('therapist_id', therapistId)
    .single();

  // Determinar si puede aceptar pagos online
  const hasActiveStripe = stripeConnectStatus === 'active' && stripeConnectAccountId;
  let canAcceptOnlinePayments = settings?.can_accept_online_payments || false;

  // Si tiene Stripe activo pero can_accept_online_payments es false, actualizarlo
  let updatedSettings = false;
  if (hasActiveStripe && !canAcceptOnlinePayments) {
    if (settings) {
      await supabase
        .from('therapist_payment_settings')
        .update({ can_accept_online_payments: true, updated_at: new Date().toISOString() })
        .eq('therapist_id', therapistId);
    } else {
      await supabase
        .from('therapist_payment_settings')
        .insert({
          therapist_id: therapistId,
          can_accept_online_payments: true,
          subscription_plan: 'basico',
          platform_fee_percent: 10.00,
          default_payment_method: 'manual'
        });
    }
    canAcceptOnlinePayments = true;
    updatedSettings = true;
  }

  // Crear archivo debug (solo una vez)
  if (!fs.existsSync(debugFilePath)) {
    const debugData = {
      timestamp: new Date().toISOString(),
      therapistId,
      usersTable: {
        stripe_connect_account_id: stripeConnectAccountId,
        stripe_connect_status: stripeConnectStatus
      },
      therapistPaymentSettingsTable: {
        subscription_plan: settings?.subscription_plan || null,
        can_accept_online_payments: settings?.can_accept_online_payments || null
      },
      calculatedValues: {
        hasActiveStripe,
        canAcceptOnlinePayments
      },
      actions: {
        updatedSettings
      },
      response: {
        plan: settings?.subscription_plan || 'basico',
        isPro: (settings?.subscription_plan === 'avanzado-pro'),
        canAcceptOnlinePayments,
        stripeConnectAccountId,
        connectAccountStatus: stripeConnectStatus
      }
    };
    
    fs.writeFileSync(debugFilePath, JSON.stringify(debugData, null, 2));
    console.log('📄 Debug file creado:', debugFilePath);
  }

  // If no settings found, return defaults
  if (!settings) {
    return res.status(200).json({
      success: true,
      data: {
        plan: 'basico',
        isPro: false,
        subscriptionStatus,
        canAcceptOnlinePayments: canAcceptOnlinePayments,
        stripeConnectAccountId: stripeConnectAccountId,
        connectAccountStatus: stripeConnectStatus
      }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      plan: settings.subscription_plan,
      isPro: settings.subscription_plan === 'avanzado-pro',
      subscriptionStatus,
      canAcceptOnlinePayments: canAcceptOnlinePayments,
      stripeConnectAccountId: stripeConnectAccountId,
      connectAccountStatus: stripeConnectStatus
    }
  });
});

/**
 * @desc    Initialize therapist payment settings
 * @route   POST /api/therapists/me/payment-settings/init
 * @access  Private (Therapist only)
 */
const initTherapistPaymentSettings = asyncHandler(async (req, res, next) => {
  const therapistId = req.user.id;
  const { plan = 'basico' } = req.body;

  // Check if settings already exist
  const { data: existing, error: checkError } = await supabase
    .from('therapist_payment_settings')
    .select('id')
    .eq('therapist_id', therapistId)
    .single();

  if (existing) {
    return res.status(200).json({
      success: true,
      data: {
        message: 'Configuración ya existe',
        initialized: false
      }
    });
  }

  // Create default settings
  const { data: settings, error: insertError } = await supabase
    .from('therapist_payment_settings')
    .insert({
      therapist_id: therapistId,
      subscription_plan: plan,
      can_accept_online_payments: false,
      platform_fee_percent: 10.00,
      default_payment_method: 'manual'
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating payment settings:', insertError);
    return next(new AppError('Error al inicializar configuración de pagos', 500));
  }

  res.status(201).json({
    success: true,
    data: {
      settings,
      initialized: true,
      message: 'Configuración de pagos inicializada correctamente'
    }
  });
});

module.exports = {
  getClientPaymentMethod,
  updateClientPaymentMethod,
  getTherapistSubscription,
  initTherapistPaymentSettings
};