const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabase');

/**
 * @desc    Get payment method for a specific client
 * @route   GET /api/clients/:clientId/payment-method
 * @access  Private (Therapist only)
 */
const getClientPaymentMethod = asyncHandler(async (req, res, next) => {
  const { clientId } = req.params;
  const therapistId = req.user.id;

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

  // Get client's payment preferences
  const { data: preferences, error: prefError } = await supabase
    .from('client_payment_preferences')
    .select('payment_method, is_exempt_from_payment, exemption_reason, updated_at')
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .single();

  if (prefError && prefError.code !== 'PGRST116') {
    console.error('Error fetching payment preferences:', prefError);
    return next(new AppError('Error al obtener método de pago', 500));
  }

  // Default to manual if no preferences set
  const paymentMethod = preferences?.payment_method || 'manual';

  res.status(200).json({
    success: true,
    data: {
      paymentMethod,
      isExempt: preferences?.is_exempt_from_payment || false,
      exemptionReason: preferences?.exemption_reason || null,
      updatedAt: preferences?.updated_at,
      therapistPlan: therapistSettings?.subscription_plan || 'basico',
      canUseStripe: isProPlan && therapistSettings?.can_accept_online_payments
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
  if (!['stripe', 'manual'].includes(paymentMethod)) {
    return next(new AppError('Método de pago inválido. Debe ser "stripe" o "manual"', 400));
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

  // Upsert payment preferences (insert if not exists, update if exists)
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
    return next(new AppError('Error al actualizar método de pago', 500));
  }

  res.status(200).json({
    success: true,
    data: {
      paymentMethod: preferences.payment_method,
      isExempt: preferences.is_exempt_from_payment,
      exemptionReason: preferences.exemption_reason,
      updatedAt: preferences.updated_at,
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

  const { data: settings, error } = await supabase
    .from('therapist_payment_settings')
    .select('subscription_plan, can_accept_online_payments, stripe_connect_account_id, connect_account_status')
    .eq('therapist_id', therapistId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching therapist subscription:', error);
    return next(new AppError('Error al obtener información de suscripción', 500));
  }

  // If no settings found, return defaults
  if (!settings) {
    return res.status(200).json({
      success: true,
      data: {
        plan: 'basico',
        isPro: false,
        canAcceptOnlinePayments: false,
        stripeConnectAccountId: null,
        connectAccountStatus: null
      }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      plan: settings.subscription_plan,
      isPro: settings.subscription_plan === 'avanzado-pro',
      canAcceptOnlinePayments: settings.can_accept_online_payments,
      stripeConnectAccountId: settings.stripe_connect_account_id,
      connectAccountStatus: settings.connect_account_status
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