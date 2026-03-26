/**
 * Get Payment Permissions
 * Check what payment methods are available for a booking
 * 
 * LOGIC:
 * 1. Check if client has active relation with therapist (client_therapists)
 * 2. If NO relation -> NEW CLIENT -> Force Stripe (if therapist has Pro + Connect)
 * 3. If HAS relation -> Use client's preferred payment_method from relation
 */

const { AppError } = require('../../middleware/errorHandler');
const { supabase } = require('../../config/supabase');

const getPaymentPermissions = async (req, res, next) => {
  const { therapistId } = req.params;
  const clientId = req.user?.id;

  if (!clientId) {
    return next(new AppError('No autenticado', 401));
  }
  
  console.log('\n🔍 [getPaymentPermissions] ===========================================');
  console.log('🔍 [getPaymentPermissions] Checking permissions for:');
  console.log('   - Therapist:', therapistId);
  console.log('   - Client:', clientId);
  console.log('🔍 [getPaymentPermissions] ===========================================\n');
  
  try {
    // ============================================================================
    // STEP 1: Check therapist configuration
    // ============================================================================
    console.log('📋 STEP 1: Checking therapist configuration...');
    
    const { data: therapistSettings, error: therapistError } = await supabase
      .from('therapist_payment_settings')
      .select('subscription_plan, can_accept_online_payments')
      .eq('therapist_id', therapistId)
      .single();
    
    if (therapistError && therapistError.code !== 'PGRST116') {
      console.error('❌ Error fetching therapist settings:', therapistError);
      return next(new AppError('Error al verificar configuración del terapeuta', 500));
    }
    
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('stripe_connect_status, stripe_connect_account_id')
      .eq('id', therapistId)
      .single();
    
    if (userError) {
      console.error('❌ Error fetching user data:', userError);
      return next(new AppError('Error al verificar datos del terapeuta', 500));
    }
    
    const isPro = therapistSettings?.subscription_plan === 'avanzado-pro';
    const hasActiveStripeConnect = userData?.stripe_connect_status === 'active' && userData?.stripe_connect_account_id;
    const canUseStripe = isPro && (therapistSettings?.can_accept_online_payments || hasActiveStripeConnect);
    
    console.log('✅ Therapist Configuration:');
    console.log('   - Plan:', therapistSettings?.subscription_plan || 'Not configured');
    console.log('   - isPro:', isPro);
    console.log('   - canUseStripe:', canUseStripe);
    console.log('   - Stripe Connect Status:', userData?.stripe_connect_status || 'Not configured');
    
    // ============================================================================
    // STEP 2: Check if client has active relation with therapist (client_therapists)
    // THIS IS THE KEY CHECK - Determines if client is new or existing
    // ============================================================================
    console.log('\n📋 STEP 2: Checking client-therapist relation...');
    console.log('   - Querying client_therapists table...');
    console.log('   - Filters: therapist_id =', therapistId, ', client_id =', clientId);
    
    const { data: clientTherapist, error: ctError } = await supabase
      .from('client_therapists')
      .select('id, status, payment_method, created_at')
      .eq('therapist_id', therapistId)
      .eq('client_id', clientId)
      .single();
    
    console.log('   - Supabase response:');
    console.log('     * clientTherapist:', clientTherapist ? 'FOUND' : 'NULL');
    console.log('     * ctError:', ctError ? ctError.code : 'none');
    if (clientTherapist) {
      console.log('     * Relation ID:', clientTherapist.id);
      console.log('     * Status:', clientTherapist.status);
      console.log('     * Payment Method:', clientTherapist.payment_method);
      console.log('     * Created At:', clientTherapist.created_at);
    }
    
    const hasRelation = clientTherapist && clientTherapist.status === 'active';
    const isNewClient = !hasRelation;
    
    console.log('\n✅ Client-Therapist Relation Analysis:');
    console.log('   - Raw data exists:', !!clientTherapist);
    console.log('   - Status check:', clientTherapist?.status);
    console.log('   - Has active relation:', hasRelation);
    console.log('   - Is New Client:', isNewClient);
    console.log('   - Decision:', isNewClient ? 'NEW CLIENT → Will check Stripe requirement' : 'EXISTING CLIENT → Will use saved payment method');
    
    // ============================================================================
    // STEP 3: Determine available payment methods
    // ============================================================================
    console.log('\n📋 STEP 3: Determining available payment methods...');
    console.log('   Initial values:');
    console.log('     - canUseStripe:', canUseStripe);
    console.log('     - isNewClient:', isNewClient);
    console.log('     - hasRelation:', hasRelation);
    
    let availableMethods = ['manual'];
    let defaultMethod = 'manual';
    let clientPaymentMethod = 'manual';
    let isClientExempt = false;
    
    console.log('   Default values set:');
    console.log('     - availableMethods:', availableMethods);
    console.log('     - defaultMethod:', defaultMethod);
    
    if (isNewClient) {
      console.log('\n   → Entering NEW CLIENT branch');
      // ==========================================================================
      // SCENARIO A: NEW CLIENT (no relation exists)
      // ==========================================================================
      console.log('\n🆕 SCENARIO A: NEW CLIENT');
      
      if (canUseStripe) {
        // New client + Therapist has Pro + Connect active = FORCE Stripe
        console.log('   ✅ Therapist has Pro + Stripe Connect active');
        console.log('   🔄 FORCING Stripe payment (required for new clients)');
        availableMethods = ['stripe'];
        defaultMethod = 'stripe';
      } else {
        // New client but therapist doesn't have Stripe = Manual only
        console.log('   ⚠️ Therapist does NOT have Stripe enabled');
        console.log('   💵 Using manual payment (cash/transfer)');
        availableMethods = ['manual'];
        defaultMethod = 'manual';
      }
    } else {
      // ==========================================================================
      // SCENARIO B: EXISTING CLIENT (has active relation)
      // ==========================================================================
      console.log('\n👤 SCENARIO B: EXISTING CLIENT');
      console.log('   - Using payment_method from relation:', clientTherapist.payment_method);
      
      clientPaymentMethod = clientTherapist.payment_method || 'cash';
      
      // Check if client is exempt (check client_payment_preferences table)
      const { data: clientPrefs, error: prefsError } = await supabase
        .from('client_payment_preferences')
        .select('is_exempt_from_payment')
        .eq('therapist_id', therapistId)
        .eq('client_id', clientId)
        .single();
      
      isClientExempt = clientPrefs?.is_exempt_from_payment || false;
      
      if (isClientExempt) {
        // Client is exempt from payment
        console.log('   🎁 Client is EXEMPT from payment');
        availableMethods = ['exempt'];
        defaultMethod = 'exempt';
      } else if (clientPaymentMethod === 'stripe') {
        // Client prefers Stripe
        if (canUseStripe) {
          console.log('   💳 Client prefers Stripe + Therapist has Stripe');
          availableMethods = ['stripe', 'manual']; // Allow both
          defaultMethod = 'stripe';
        } else {
          // Client prefers Stripe but therapist doesn't have it enabled
          console.log('   ⚠️ Client prefers Stripe but therapist does NOT have it enabled');
          console.log('   💵 Falling back to manual payment');
          availableMethods = ['manual'];
          defaultMethod = 'manual';
        }
      } else {
        // Client prefers cash/manual payment
        console.log('   💵 Client prefers manual payment (cash/transfer)');
        availableMethods = ['manual'];
        defaultMethod = 'manual';
      }
    }
    
    console.log('\n✅ FINAL DECISION:');
    console.log('   - Available Methods:', availableMethods);
    console.log('   - Default Method:', defaultMethod);
    console.log('   - Client Payment Method:', clientPaymentMethod);
    console.log('   - Is Client Exempt:', isClientExempt);
    console.log('   - canUseStripe:', canUseStripe);
    console.log('   - isPro:', isPro);
    console.log('   - isNewClient:', isNewClient);
    console.log('   - hasRelation:', hasRelation);
    
    // ============================================================================
    // STEP 4: Return response
    // ============================================================================
    const responseData = {
      success: true,
      data: {
        canUseStripe,
        isPro,
        isNewClient,
        hasRelation,
        clientPaymentMethod,
        isClientExempt,
        availableMethods,
        defaultMethod,
        // Additional info for debugging
        relationInfo: hasRelation ? {
          createdAt: clientTherapist.created_at,
          status: clientTherapist.status
        } : null
      }
    };
    
    console.log('\n📤 PREPARING RESPONSE:');
    console.log('   Response structure:', JSON.stringify(responseData, null, 2));
    
    // Send the response
    res.json(responseData);
    
    console.log('\n🔍 [getPaymentPermissions] ===========================================');
    console.log('🔍 [getPaymentPermissions] Response sent successfully');
    console.log('🔍 [getPaymentPermissions] ===========================================\n');
    
  } catch (error) {
    console.error('❌ [getPaymentPermissions] Error:', error);
    return next(new AppError('Error al verificar permisos de pago', 500));
  }
};

module.exports = { getPaymentPermissions };
