const stripe = require('../config/stripe');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabase');
const { ClientTherapist, Conversation } = require('../models');

/**
 * @desc    Create booking with payment
 * @route   POST /api/bookings/create-with-payment
 * @access  Private (Client only)
 */
const createBookingWithPayment = asyncHandler(async (req, res, next) => {
  console.log('\n🚀 [createBookingWithPayment] INICIANDO PROCESO DE RESERVA CON PAGO');
  console.log('═══════════════════════════════════════════════════════════');
  
  const {
    therapistId,
    serviceId,
    appointments, // Array de {date, time}
    couponCode,
    paymentMethod
  } = req.body;
  
  const clientId = req.user.id;
  
  console.log('📋 Datos recibidos:');
  console.log('  - therapistId:', therapistId);
  console.log('  - serviceId:', serviceId);
  console.log('  - clientId:', clientId);
  console.log('  - appointments:', appointments?.length || 0, 'citas');
  console.log('  - paymentMethod (recibido):', paymentMethod);
  console.log('  - couponCode:', couponCode || 'Ninguno');
  
  // Validaciones básicas
  if (!therapistId || !serviceId || !appointments || !Array.isArray(appointments)) {
    console.log('❌ Validación fallida: Datos incompletos');
    return next(new AppError('Datos incompletos para la reserva', 400));
  }
  
  // 1. Verificar permisos del terapeuta
  console.log('\n🔍 [Paso 1] Verificando configuración del terapeuta...');
  const { data: therapistSettings, error: therapistError } = await supabase
    .from('therapist_payment_settings')
    .select('subscription_plan, can_accept_online_payments, stripe_connect_account_id, platform_fee_percent')
    .eq('therapist_id', therapistId)
    .single();
  
  if (therapistError && therapistError.code !== 'PGRST116') {
    console.error('❌ Error fetching therapist settings:', therapistError);
    return next(new AppError('Error al verificar configuración del terapeuta', 500));
  }
  
  const isProPlan = therapistSettings?.subscription_plan === 'avanzado-pro';
  
  console.log('✅ Configuración del terapeuta:');
  console.log('  - Plan:', therapistSettings?.subscription_plan || 'No configurado');
  console.log('  - isProPlan:', isProPlan);
  console.log('  - can_accept_online_payments:', therapistSettings?.can_accept_online_payments);
  console.log('  - stripe_connect_account_id:', therapistSettings?.stripe_connect_account_id ? 'Configurado' : 'No configurado');
  console.log('  - platform_fee_percent:', therapistSettings?.platform_fee_percent);
  
  // 2. Verificar preferencias del cliente
  console.log('\n🔍 [Paso 2] Verificando preferencias del cliente...');
  const { data: clientPrefs, error: prefsError } = await supabase
    .from('client_payment_preferences')
    .select('payment_method, is_exempt_from_payment')
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .single();
  
  // Si el cliente NO existe en las preferencias (es nuevo), es un cliente nuevo
  const isNewClient = !clientPrefs && prefsError?.code === 'PGRST116';
  
  console.log('✅ Preferencias del cliente:');
  console.log('  - ¿Existe en BD?:', clientPrefs ? 'Sí' : 'No');
  console.log('  - isNewClient:', isNewClient);
  if (prefsError) console.log('  - Error/Code:', prefsError.code);
  console.log('  - clientPaymentMethod:', clientPrefs?.payment_method || 'manual (default)');
  console.log('  - isExempt:', clientPrefs?.is_exempt_from_payment || false);
  
  const clientPaymentMethod = clientPrefs?.payment_method || 'manual';
  const isExempt = clientPrefs?.is_exempt_from_payment || false;
  
  // 3. Determinar método de pago final
  console.log('\n🔍 [Paso 3] Determinando método de pago final...');
  console.log('  - paymentMethod recibido:', paymentMethod);
  console.log('  - clientPaymentMethod:', clientPaymentMethod);
  
  let finalPaymentMethod = paymentMethod || clientPaymentMethod;
  console.log('  - Método inicial:', finalPaymentMethod);
  
  // REGLA IMPORTANTE: Si es cliente nuevo y terapeuta tiene Pro, FORZAR Stripe
  if (isNewClient && isProPlan) {
    console.log('  ⚠️ REGLA APLICADA: Cliente nuevo + Terapeuta Pro = FORZAR Stripe');
    finalPaymentMethod = 'stripe';
  }
  
  // Si terapeuta no es Pro, forzar método manual
  if (!isProPlan && finalPaymentMethod === 'stripe') {
    console.log('  ⚠️ REGLA APLICADA: Terapeuta no es Pro = Forzar Manual');
    finalPaymentMethod = 'manual';
  }
  
  // Si cliente está exento, no requiere pago
  if (isExempt) {
    console.log('  ⚠️ REGLA APLICADA: Cliente exento = Sin pago');
    finalPaymentMethod = 'exempt';
  }
  
  console.log('  ✅ Método final determinado:', finalPaymentMethod);
  
  // 4. Obtener información del servicio
  console.log('\n🔍 [Paso 4] Obteniendo información del servicio...');
  let service;
  const { data: serviceData, error: serviceError } = await supabase
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .single();
    
  if (serviceError) {
    // Si no existe tabla services, usar datos del body
    console.log('  ⚠️ No se encontró en tabla services, usando datos del body');
    service = req.body.service;
    if (!service) {
      console.log('  ❌ Error: Servicio no proporcionado en el body');
      return next(new AppError('Servicio no encontrado', 404));
    }
    console.log('  ✅ Servicio obtenido del body');
  } else {
    service = serviceData;
    console.log('  ✅ Servicio encontrado en BD');
  }
  
  console.log('  - Nombre:', service?.name);
  console.log('  - Precio:', service?.price);
  console.log('  - Duración:', service?.duration);
  
  // 5. Calcular monto total
  console.log('\n🔍 [Paso 5] Calculando montos...');
  const sessionPrice = parseFloat(service.price) || 0;
  const totalSessions = appointments.length;
  let totalAmount = sessionPrice * totalSessions;
  
  console.log('  - sessionPrice:', sessionPrice);
  console.log('  - totalSessions:', totalSessions);
  console.log('  - totalAmount (sin descuento):', totalAmount);
  
  // 6. Aplicar cupón si existe
  console.log('\n🔍 [Paso 6] Aplicando cupón si existe...');
  let discountAmount = 0;
  let appliedCoupon = null;
  
  if (couponCode) {
    console.log('  - Buscando cupón:', couponCode);
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode)
      .eq('therapist_id', therapistId)
      .single();
    
    if (!couponError && coupon) {
      console.log('  ✅ Cupón encontrado:', coupon.code);
      // Validar cupón
      const now = new Date();
      const expiresAt = coupon.expires_at ? new Date(coupon.expires_at) : null;
      
      if ((!expiresAt || expiresAt > now) && 
          (!coupon.usage_limit || coupon.usage_count < coupon.usage_limit)) {
        
        console.log('  ✅ Cupón válido');
        // Calcular descuento
        if (coupon.type === 'percentage') {
          discountAmount = totalAmount * (coupon.value / 100);
          console.log('  - Descuento porcentaje:', coupon.value, '% =', discountAmount);
          if (coupon.maximum_discount && discountAmount > coupon.maximum_discount) {
            discountAmount = parseFloat(coupon.maximum_discount);
            console.log('  - Limitado a máximo:', discountAmount);
          }
        } else {
          discountAmount = parseFloat(coupon.value);
          console.log('  - Descuento fijo:', discountAmount);
        }
        
        // No permitir descuento mayor al total
        if (discountAmount > totalAmount) {
          discountAmount = totalAmount;
          console.log('  - Ajustado al total:', discountAmount);
        }
        
        appliedCoupon = coupon;
      } else {
        console.log('  ❌ Cupón inválido o expirado');
      }
    } else {
      console.log('  ❌ Cupón no encontrado o error:', couponError?.message);
    }
  } else {
    console.log('  - No se proporcionó cupón');
  }
  
  const finalAmount = totalAmount - discountAmount;
  console.log('  - discountAmount:', discountAmount);
  console.log('  - finalAmount:', finalAmount);
  
  // 6.5. Crear o verificar relación cliente-terapeuta
  console.log('\n🔍 [Paso 6.5] Verificando/Creando relación cliente-terapeuta...');
  console.log('  - clientId:', clientId);
  console.log('  - therapistId:', therapistId);
  
  try {
    const existingRelation = await ClientTherapist.findByClientAndTherapist(clientId, therapistId);
    console.log('  - Relación existente:', existingRelation);
    
    if (!existingRelation) {
      console.log('  → Creando nueva relación client-therapist...');
      await ClientTherapist.create(clientId, therapistId, 'active');
      console.log('  ✅ Nueva relación creada');
    } else if (existingRelation.status !== 'active') {
      console.log('  → Reactivando relación archivada...');
      await ClientTherapist.reactivate(clientId, therapistId);
      console.log('  ✅ Relación reactivada');
    } else {
      console.log('  ✅ Relación ya existe y está activa');
    }
  } catch (error) {
    console.error('  ⚠️ Error al gestionar relación client-therapist:', error.message);
    // No bloqueamos la reserva si falla esto
  }
  
  // 7. Crear bookings en estado pendiente
  console.log('\n🔍 [Paso 7] Creando bookings...');
  const createdBookings = [];
  
  for (let i = 0; i < appointments.length; i++) {
    const appointment = appointments[i];
    console.log(`\n  📅 Creando booking ${i + 1}/${appointments.length}:`);
    console.log('    - Fecha:', appointment.date);
    console.log('    - Hora:', appointment.time);
    
    // Calcular hora de fin
    const [hours, minutes] = appointment.time.split(':');
    const startDateTime = new Date(`${appointment.date}T${appointment.time}`);
    const duration = service.duration || 60;
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
    const endTime = `${String(endDateTime.getHours()).padStart(2, '0')}:${String(endDateTime.getMinutes()).padStart(2, '0')}`;
    
    console.log('    - Hora fin calculada:', endTime);
    console.log('    - Status:', finalPaymentMethod === 'stripe' ? 'pending_payment' : 'pending');
    console.log('    - Payment Status:', finalPaymentMethod === 'stripe' ? 'pending' : (finalPaymentMethod === 'manual' ? 'manual' : 'exempt'));
    
    // Build insert object
    const insertData = {
      therapist_id: therapistId,
      client_id: clientId,
      therapy_type: service.name || 'Sesión individual',
      therapy_duration: service.duration || 60,
      date: appointment.date,
      start_time: appointment.time,
      end_time: endTime,
      status: finalPaymentMethod === 'stripe' ? 'pending_payment' : 'pending',
      payment_status: finalPaymentMethod === 'stripe' ? 'pending' : 'unpaid',
      amount: finalAmount / totalSessions,
      currency: 'EUR',
      payment_method: finalPaymentMethod === 'stripe' ? 'online' : 'cash',
      location: 'No especificado',
      original_amount: sessionPrice,
      discount_amount: appliedCoupon ? (discountAmount / totalSessions) : 0,
      final_amount: finalAmount / totalSessions,
      coupon_code: appliedCoupon?.code || null,
      requires_online_payment: finalPaymentMethod === 'stripe',
      session_number: i + 1,
      total_sessions: totalSessions,
      notes: `Servicio: ${service.name}${appliedCoupon ? ` (Cupón: ${appliedCoupon.code})` : ''}${finalPaymentMethod === 'manual' ? ' (Pago manual)' : ''}`
    };

    // Only add service_id if it's a valid UUID (not a timestamp-based ID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (serviceId && uuidRegex.test(serviceId)) {
      insertData.service_id = serviceId;
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert(insertData)
      .select()
      .single();
    
    if (bookingError) {
      console.error('❌ Error creating booking:', bookingError);
      return next(new AppError('Error al crear la reserva', 500));
    }
    
    console.log('    ✅ Booking creado con ID:', booking.id);
    createdBookings.push(booking);
  }
  
  console.log('\n✅ Total bookings creados:', createdBookings.length);
  console.log('   IDs:', createdBookings.map(b => b.id));
  
  // 8. Si es pago manual o exento, retornar bookings creados
  console.log('\n🔍 [Paso 8] Verificando método de pago final...');
  console.log('   - finalPaymentMethod:', finalPaymentMethod);
  
  if (finalPaymentMethod !== 'stripe') {
    // Crear o verificar conversación entre cliente y terapeuta
    console.log('\n🔍 [Paso 8.5] Creando/verificando conversación entre cliente y terapeuta...');
    let conversation = null;
    try {
      const bookingIds = createdBookings.map(b => b.id);
      
      // Buscar si ya existe una conversación
      conversation = await Conversation.findBetweenUsers(clientId, therapistId);
      
      if (!conversation) {
        // Crear nueva conversación
        console.log('   → Creando nueva conversación...');
        conversation = await Conversation.create({
          clientId: clientId,
          therapistId: therapistId,
          type: 'therapy_session',
          title: `Chat de terapia - ${service.name || 'Sesión'}`,
          metadata: {
            bookingIds: bookingIds,
            serviceName: service.name,
            createdFromBooking: true
          }
        });
        console.log('   ✅ Conversación creada con ID:', conversation.id);
      } else {
        // Actualizar la conversación existente con los nuevos bookings
        console.log('   → Conversación existente encontrada, actualizando metadata...');
        const existingMetadata = conversation.metadata || {};
        const existingBookingIds = existingMetadata.bookingIds || [];
        conversation.metadata = {
          ...existingMetadata,
          bookingIds: [...new Set([...existingBookingIds, ...bookingIds])],
          lastBookingAt: new Date().toISOString()
        };
        await Conversation.findByIdAndUpdate(conversation.id, {
          metadata: conversation.metadata,
          last_message_at: new Date().toISOString()
        });
        console.log('   ✅ Conversación actualizada con nuevos bookings');
      }
    } catch (convError) {
      console.error('   ⚠️ Error al crear/actualizar conversación:', convError.message);
      // No bloqueamos el flujo si falla la conversación
    }

    console.log('   ✅ Método no-Stripe, retornando bookings creados');
    return res.status(201).json({
      success: true,
      data: {
        bookings: createdBookings,
        conversationId: conversation?.id || null,
        paymentMethod: finalPaymentMethod,
        message: finalPaymentMethod === 'manual' 
          ? 'Reserva creada. El terapeuta te contactará para el pago.'
          : 'Reserva creada (cliente exento de pago).',
        amount: finalAmount,
        discount: discountAmount
      }
    });
  }
  
  // 9. Verificar Stripe Connect account
  console.log('\n🔍 [Paso 9] Verificando cuenta Stripe Connect...');
  console.log('   - stripe_connect_account_id:', therapistSettings?.stripe_connect_account_id || 'NO CONFIGURADO');
  
  if (!therapistSettings?.stripe_connect_account_id) {
    console.log('   ❌ Error: Terapeuta no tiene cuenta Stripe Connect');
    return next(new AppError('El terapeuta no tiene configurada la cuenta de Stripe', 400));
  }
  
  console.log('   ✅ Cuenta Stripe Connect configurada');
  
  // 10. Crear PaymentIntent en Stripe
  console.log('\n🔍 [Paso 10] Creando PaymentIntent en Stripe...');
  const platformFeePercent = therapistSettings?.platform_fee_percent || 10;
  const platformFee = Math.round(finalAmount * 100 * (platformFeePercent / 100));
  const amountInCents = Math.round(finalAmount * 100);
  
  console.log('   - Monto (céntimos):', amountInCents);
  console.log('   - Moneda: eur');
  console.log('   - Platform Fee (céntimos):', platformFee, `(${platformFeePercent}%)`);
  console.log('   - Cuenta destino (Connect):', therapistSettings.stripe_connect_account_id);
  console.log('   - Metadata:', {
    booking_ids: createdBookings.map(b => b.id),
    therapist_id: therapistId,
    client_id: clientId,
    service_name: service.name,
    appointments_count: totalSessions,
    final_amount: finalAmount
  });
  
  try {
    console.log('   🚀 Llamando a stripe.paymentIntents.create()...');
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      application_fee_amount: platformFee,
      transfer_data: {
        destination: therapistSettings.stripe_connect_account_id,
      },
      metadata: {
        booking_ids: JSON.stringify(createdBookings.map(b => b.id)),
        therapist_id: therapistId,
        client_id: clientId,
        service_name: service.name,
        appointments_count: totalSessions,
        coupon_code: appliedCoupon?.code || '',
        discount_amount: discountAmount.toFixed(2),
        platform_fee_percent: platformFeePercent,
        original_amount: totalAmount.toFixed(2),
        final_amount: finalAmount.toFixed(2)
      },
      capture_method: 'automatic'
    });
    
    console.log('   ✅ PaymentIntent creado exitosamente:');
    console.log('      - ID:', paymentIntent.id);
    console.log('      - Status:', paymentIntent.status);
    console.log('      - Client Secret:', paymentIntent.client_secret?.substring(0, 20) + '...');
    console.log('      - Amount:', paymentIntent.amount);
    console.log('      - Application Fee:', paymentIntent.application_fee_amount);
    
    // 11. Actualizar bookings con payment_intent_id
    console.log('\n🔍 [Paso 11] Actualizando bookings con payment_intent_id...');
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        payment_intent_id: paymentIntent.id,
        updated_at: new Date().toISOString()
      })
      .in('id', createdBookings.map(b => b.id));
    
    if (updateError) {
      console.log('   ❌ Error actualizando bookings:', updateError);
    } else {
      console.log('   ✅ Bookings actualizados con payment_intent_id');
    }
    
    // 12. Crear o verificar conversación entre cliente y terapeuta
    console.log('\n🔍 [Paso 12] Creando/verificando conversación entre cliente y terapeuta...');
    let conversation = null;
    try {
      const bookingIds = createdBookings.map(b => b.id);
      
      // Buscar si ya existe una conversación
      conversation = await Conversation.findBetweenUsers(clientId, therapistId);
      
      if (!conversation) {
        // Crear nueva conversación
        console.log('   → Creando nueva conversación...');
        conversation = await Conversation.create({
          clientId: clientId,
          therapistId: therapistId,
          type: 'therapy_session',
          title: `Chat de terapia - ${service.name || 'Sesión'}`,
          metadata: {
            bookingIds: bookingIds,
            serviceName: service.name,
            paymentIntentId: paymentIntent.id,
            createdFromBooking: true
          }
        });
        console.log('   ✅ Conversación creada con ID:', conversation.id);
      } else {
        // Actualizar la conversación existente con los nuevos bookings
        console.log('   → Conversación existente encontrada, actualizando metadata...');
        const existingMetadata = conversation.metadata || {};
        const existingBookingIds = existingMetadata.bookingIds || [];
        conversation.metadata = {
          ...existingMetadata,
          bookingIds: [...new Set([...existingBookingIds, ...bookingIds])],
          lastBookingAt: new Date().toISOString()
        };
        await Conversation.findByIdAndUpdate(conversation.id, {
          metadata: conversation.metadata,
          last_message_at: new Date().toISOString()
        });
        console.log('   ✅ Conversación actualizada con nuevos bookings');
      }
    } catch (convError) {
      console.error('   ⚠️ Error al crear/actualizar conversación:', convError.message);
      // No bloqueamos el flujo si falla la conversación
    }
    
    console.log('\n🎉 PROCESO COMPLETADO EXITOSAMENTE');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    res.status(201).json({
      success: true,
      data: {
        bookings: createdBookings,
        conversationId: conversation?.id || null,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: finalAmount,
        discount: discountAmount,
        paymentMethod: 'stripe'
      }
    });
    
  } catch (stripeError) {
    console.error('\n❌❌❌ STRIPE ERROR ❌❌❌');
    console.error('Error:', stripeError.message);
    console.error('Stripe Error Code:', stripeError.code);
    console.error('Stripe Error Type:', stripeError.type);
    if (stripeError.raw) {
      console.error('Raw Error:', stripeError.raw);
    }
    
    // Rollback: eliminar bookings creados
    console.log('\n🔄 Rollback: Eliminando bookings creados...');
    console.log('   IDs a eliminar:', createdBookings.map(b => b.id));
    
    const { error: deleteError } = await supabase
      .from('bookings')
      .delete()
      .in('id', createdBookings.map(b => b.id));
    
    if (deleteError) {
      console.error('   ❌ Error en rollback:', deleteError);
    } else {
      console.log('   ✅ Rollback completado');
    }
    
    console.log('═══════════════════════════════════════════════════════════\n');
    
    return next(new AppError('Error al procesar el pago: ' + stripeError.message, 500));
  }
});

/**
 * @desc    Handle Stripe webhook
 * @route   POST /api/payments/webhook
 * @access  Public (Stripe)
 */
const handleStripeWebhook = asyncHandler(async (req, res) => {
  console.log('\n📡 WEBHOOK RECIBIDO');
  console.log('═══════════════════════════════════════════════════════════');
  
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  console.log('Headers recibidos:');
  console.log('  - stripe-signature:', sig ? 'Presente' : 'Ausente');
  console.log('  - content-type:', req.headers['content-type']);
  
  let event;
  
  try {
    console.log('\n🔐 Verificando firma del webhook...');
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Firma verificada correctamente');
  } catch (err) {
    console.error('\n❌ ERROR: Webhook signature verification failed');
    console.error('   Error:', err.message);
    console.log('═══════════════════════════════════════════════════════════\n');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  console.log('\n📨 Evento recibido:', event.type);
  console.log('   Event ID:', event.id);
  console.log('   Created:', new Date(event.created * 1000).toISOString());
  
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('   → Procesando pago exitoso...');
      await handlePaymentSuccess(event.data.object);
      break;
      
    case 'payment_intent.payment_failed':
      console.log('   → Procesando pago fallido...');
      await handlePaymentFailure(event.data.object);
      break;
      
    case 'charge.refunded':
      console.log('   → Procesando reembolso...');
      await handleRefund(event.data.object);
      break;
      
    default:
      console.log(`   ⚠️ Evento no manejado: ${event.type}`);
  }
  
  console.log('\n✅ Webhook procesado exitosamente');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  res.json({ received: true });
});

// Helper functions
async function handlePaymentSuccess(paymentIntent) {
  console.log('\n💰 PROCESANDO PAGO EXITOSO');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PaymentIntent ID:', paymentIntent.id);
  console.log('Amount:', paymentIntent.amount);
  console.log('Currency:', paymentIntent.currency);
  console.log('Status:', paymentIntent.status);
  console.log('Metadata:', paymentIntent.metadata);
  
  const bookingIds = JSON.parse(paymentIntent.metadata.booking_ids || '[]');
  
  console.log('Booking IDs a confirmar:', bookingIds);
  
  if (bookingIds.length === 0) {
    console.error('❌ ERROR: No booking IDs en metadata');
    return;
  }
  
  // Actualizar bookings a confirmado
  console.log('📝 Actualizando bookings a CONFIRMADO...');
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('id', bookingIds);
  
  if (error) {
    console.error('❌ Error actualizando bookings:', error);
    return;
  }
  
  console.log('✅ Bookings confirmados:', bookingIds);
  
  // Incrementar uso del cupón si aplica
  if (paymentIntent.metadata.coupon_code) {
    console.log('🎟️ Incrementando uso del cupón:', paymentIntent.metadata.coupon_code);
    const { error: couponError } = await supabase.rpc('increment_coupon_usage', {
      coupon_code: paymentIntent.metadata.coupon_code
    });
    if (couponError) {
      console.error('❌ Error incrementando cupón:', couponError);
    } else {
      console.log('✅ Cupón actualizado');
    }
  }
  
  // Notificar a terapeuta y cliente (implementar según tu sistema de notificaciones)
  console.log('📧 Notificaciones: Terapeuta y cliente');
  console.log('═══════════════════════════════════════════════════════════\n');
}

async function handlePaymentFailure(paymentIntent) {
  console.log('\n❌ PROCESANDO PAGO FALLIDO');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PaymentIntent ID:', paymentIntent.id);
  console.log('Error:', paymentIntent.last_payment_error?.message);
  console.log('Error Code:', paymentIntent.last_payment_error?.code);
  console.log('Error Type:', paymentIntent.last_payment_error?.type);
  
  const bookingIds = JSON.parse(paymentIntent.metadata.booking_ids || '[]');
  
  console.log('Booking IDs a marcar como fallidos:', bookingIds);
  
  // Actualizar bookings a fallido
  console.log('📝 Actualizando bookings a FALLIDO...');
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'payment_failed',
      payment_status: 'failed',
      failure_reason: paymentIntent.last_payment_error?.message,
      updated_at: new Date().toISOString()
    })
    .in('id', bookingIds);
  
  if (error) {
    console.error('❌ Error actualizando bookings:', error);
  } else {
    console.log('✅ Bookings marcados como fallidos');
  }
  
  // Opcional: Liberar slots de disponibilidad
  console.log('🔄 Liberar slots de disponibilidad (opcional)');
  console.log('═══════════════════════════════════════════════════════════\n');
}

async function handleRefund(charge) {
  console.log('\n💸 PROCESANDO REEMBOLSO');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Charge ID:', charge.id);
  console.log('Amount Refunded:', charge.amount_refunded);
  console.log('Fully Refunded:', charge.refunded);
  console.log('PaymentIntent ID:', charge.payment_intent);
  
  // Buscar bookings por payment_intent_id
  console.log('🔍 Buscando bookings asociados...');
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('payment_intent_id', charge.payment_intent);
  
  if (bookings && bookings.length > 0) {
    console.log('✅ Bookings encontrados:', bookings.length);
    console.log('📝 Actualizando estado de reembolso...');
    
    const { error } = await supabase
      .from('bookings')
      .update({
        payment_status: charge.refunded ? 'refunded' : 'partially_refunded',
        refund_amount: (charge.amount_refunded / 100).toFixed(2),
        updated_at: new Date().toISOString()
      })
      .eq('payment_intent_id', charge.payment_intent);
    
    console.log('Bookings updated with refund status');
  }
}

/**
 * @desc    Get payment permissions for booking
 * @route   GET /api/bookings/payment-permissions/:therapistId
 * @access  Private
 */
const getPaymentPermissions = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;
  const clientId = req.user.id;
  
  // Verificar configuración del terapeuta
  const { data: therapistSettings, error } = await supabase
    .from('therapist_payment_settings')
    .select('subscription_plan, can_accept_online_payments, connect_account_status')
    .eq('therapist_id', therapistId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    return next(new AppError('Error al verificar permisos', 500));
  }
  
  const isPro = therapistSettings?.subscription_plan === 'avanzado-pro';
  const canUseStripe = isPro && 
                       therapistSettings?.can_accept_online_payments &&
                       therapistSettings?.connect_account_status === 'active';
  
  // Verificar preferencias del cliente
  const { data: clientPrefs, error: prefsError } = await supabase
    .from('client_payment_preferences')
    .select('payment_method, is_exempt_from_payment')
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .single();
  
  // Detectar si es cliente nuevo (no tiene preferencias configuradas)
  const isNewClient = !clientPrefs && prefsError?.code === 'PGRST116';
  
  // Si es cliente nuevo y terapeuta tiene Pro, FORZAR Stripe
  let availableMethods = ['manual'];
  let defaultMethod = 'manual';
  
  if (isNewClient && canUseStripe) {
    // Cliente nuevo con terapeuta Pro = Solo Stripe
    availableMethods = ['stripe'];
    defaultMethod = 'stripe';
  } else if (canUseStripe) {
    // Cliente existente con terapeuta Pro = Stripe y Manual
    availableMethods = ['stripe', 'manual'];
    defaultMethod = clientPrefs?.payment_method || 'manual';
  }
  
  // Si está exento, solo método exento
  if (clientPrefs?.is_exempt_from_payment) {
    availableMethods = ['exempt'];
    defaultMethod = 'exempt';
  }
  
  res.json({
    success: true,
    data: {
      canUseStripe,
      isPro,
      isNewClient,
      clientPaymentMethod: clientPrefs?.payment_method || 'manual',
      isClientExempt: clientPrefs?.is_exempt_from_payment || false,
      availableMethods,
      defaultMethod
    }
  });
});

module.exports = {
  createBookingWithPayment,
  handleStripeWebhook,
  getPaymentPermissions
};