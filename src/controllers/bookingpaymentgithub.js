const stripe = require('../config/stripe');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabase');
const PendingBooking = require("../models/supabase/PendingBooking");
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
    returnUrl,
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
  console.log('  - returnUrl:', returnUrl || 'NO RECIBIDO');
  
  // Validaciones básicas
  if (!therapistId || !serviceId || !appointments || !Array.isArray(appointments)) {
    console.log('❌ Validación fallida: Datos incompletos');
    return next(new AppError('Datos incompletos para la reserva', 400));
  }
  
  // 1. Verificar permisos del terapeuta
  console.log('\n🔍 [Paso 1] Verificando configuración del terapeuta...');
  
  // Primero obtener stripe_connect_account_id de la tabla users
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_status')
    .eq('id', therapistId)
    .single();
  
  console.log('   - stripe_connect_account_id (desde users):', userData?.stripe_connect_account_id || 'No configurado');
  console.log('   - stripe_connect_status (desde users):', userData?.stripe_connect_status);
  
  const { data: therapistSettings, error: therapistError } = await supabase
    .from('therapist_payment_settings')
    .select('subscription_plan, can_accept_online_payments, platform_fee_percent')
    .eq('therapist_id', therapistId)
    .single();
  
  if (therapistError && therapistError.code !== 'PGRST116') {
    console.error('❌ Error fetching therapist settings:', therapistError);
    return next(new AppError('Error al verificar configuración del terapeuta', 500));
  }
  
  const isProPlan = therapistSettings?.subscription_plan === 'avanzado-pro';
  const stripeConnectAccountId = userData?.stripe_connect_account_id;
  
  console.log('✅ Configuración del terapeuta:');
  console.log('  - Plan:', therapistSettings?.subscription_plan || 'No configurado');
  console.log('  - isProPlan:', isProPlan);
  console.log('  - can_accept_online_payments:', therapistSettings?.can_accept_online_payments);
  console.log('  - stripe_connect_account_id:', stripeConnectAccountId || 'No configurado');
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
  
// NUEVO PASO 7 - Código corregido para insertar en backend/src/controllers/bookingPaymentController.js
// Reemplazar desde línea 246 hasta antes del "// 8. Si es pago manual"

// NUEVO PASO 7 - Código corregido para insertar en backend/src/controllers/bookingPaymentController.js
// Reemplazar desde línea 246 hasta antes del "// 8. Si es pago manual"

  // 7. Crear bookings o pending_bookings segun metodo de pago
  console.log('\n[Paso 7] Creando reservas...');
  const createdBookings = [];
  const createdPendingBookings = [];
  
  for (let i = 0; i < appointments.length; i++) {
    const appointment = appointments[i];
    console.log('\n  Procesando cita ' + (i + 1) + '/' + appointments.length + ':');
    console.log('    - Fecha:', appointment.date);
    console.log('    - Hora:', appointment.time);
    
    // Calcular hora de fin
    const [hours, minutes] = appointment.time.split(':');
    const startDateTime = new Date(appointment.date + 'T' + appointment.time);
    const duration = service.duration || 60;
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
    const endTime = String(endDateTime.getHours()).padStart(2, '0') + ':' + String(endDateTime.getMinutes()).padStart(2, '0');
    
    console.log('    - Hora fin calculada:', endTime);
    
    if (finalPaymentMethod === 'stripe') {
      // Crear pending_booking para Stripe
      console.log('    -> Creando pending_booking...');
      
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);
      
      const insertData = {
        therapist_id: therapistId,
        client_id: clientId,
        therapy_type: service.name || 'Sesion individual',
        therapy_duration: service.duration || 60,
        date: appointment.date,
        start_time: appointment.time,
        end_time: endTime,
        amount: finalAmount / totalSessions,
        currency: 'EUR',
        service_id: serviceId,
        service_name: service.name,
        status: 'awaiting_payment',
        expires_at: expiresAt.toISOString()
      };
      
      const { data: pendingBooking, error: pendingError } = await supabase
        .from('pending_bookings')
        .insert(insertData)
        .select()
        .single();
      
      if (pendingError) {
        console.error('Error creating pending booking:', pendingError);
        return next(new AppError('Error al reservar el slot temporalmente', 500));
      }
      
      console.log('    -> Pending booking creado:', pendingBooking.id);
      createdPendingBookings.push(pendingBooking);
    } else {
      // Crear booking directamente para manual/exempt
      console.log('    -> Creando booking directamente...');
      
      const insertData = {
        therapist_id: therapistId,
        client_id: clientId,
        therapy_type: service.name || 'Sesion individual',
        therapy_duration: service.duration || 60,
        date: appointment.date,
        start_time: appointment.time,
        end_time: endTime,
        status: 'pending',
        payment_status: finalPaymentMethod === 'manual' ? 'unpaid' : 'paid',
        amount: finalAmount / totalSessions,
        currency: 'EUR',
        payment_method: finalPaymentMethod === 'manual' ? 'cash' : 'exempt',
        location: 'No especificado',
        original_amount: sessionPrice,
        discount_amount: appliedCoupon ? (discountAmount / totalSessions) : 0,
        final_amount: finalAmount / totalSessions,
        coupon_code: appliedCoupon?.code || null,
        requires_online_payment: false,
        session_number: i + 1,
        total_sessions: totalSessions,
        notes: 'Servicio: ' + (service.name || 'Sesion') + (appliedCoupon ? ' (Cupon: ' + appliedCoupon.code + ')' : '') + (finalPaymentMethod === 'manual' ? ' (Pago manual)' : ' (Exento)')
      };

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
        console.error('Error creating booking:', bookingError);
        return next(new AppError('Error al crear la reserva', 500));
      }
      
      console.log('    -> Booking creado:', booking.id);
      createdBookings.push(booking);
    }
  }
  
  console.log('\nTotal procesados:', finalPaymentMethod === 'stripe' ? createdPendingBookings.length : createdBookings.length);
  if (finalPaymentMethod === 'stripe') {
    console.log('   Pending Booking IDs:', createdPendingBookings.map(b => b.id));
  } else {
    console.log('   Booking IDs:', createdBookings.map(b => b.id));
  }
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
  console.log('   - stripe_connect_account_id:', stripeConnectAccountId || 'NO CONFIGURADO');
  
  if (!stripeConnectAccountId) {
    console.log('   ❌ Error: Terapeuta no tiene cuenta Stripe Connect');
    return next(new AppError('El terapeuta no tiene configurada la cuenta de Stripe', 400));
  }
  
  console.log('   ✅ Cuenta Stripe Connect configurada');
  
  // 10. Crear Stripe Checkout Session (en vez de PaymentIntent directo)
  console.log('\n🔍 [Paso 10] Creando Stripe Checkout Session...');
  const platformFeePercent = therapistSettings?.platform_fee_percent || 10;
  const platformFee = Math.round(finalAmount * 100 * (platformFeePercent / 100));
  const amountInCents = Math.round(finalAmount * 100);
  
  console.log('   - Monto (céntimos):', amountInCents);
  console.log('   - Moneda: eur');
  console.log('   - Platform Fee (céntimos):', platformFee, `(${platformFeePercent}%)`);
  console.log('   - Cuenta destino (Connect):', stripeConnectAccountId);
  console.log('   - Metadata:', {
    booking_ids: createdBookings.map(b => b.id),
    therapist_id: therapistId,
    client_id: clientId,
    service_name: service.name,
    appointments_count: totalSessions,
    final_amount: finalAmount
  });

  try {
    console.log('   🚀 Llamando a stripe.checkout.sessions.create()...');
    
    // Obtener email del cliente si existe
    const { data: clientData } = await supabase
      .from('clients')
      .select('email, name')
      .eq('id', clientId)
      .single();
    
    const clientEmail = clientData?.email || null;
    const clientName = clientData?.name || null;
    
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Cita con ${therapistSettings?.therapistName || 'terapeuta'} - ${service.name}`,
              description: `${totalSessions} sesión(es) de ${service.duration || 50} minutos`
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: stripeConnectAccountId,
        },
        metadata: {
          booking_ids: JSON.stringify(finalPaymentMethod === 'stripe' 
            ? createdPendingBookings.map(b => b.id) 
            : createdBookings.map(b => b.id)),
          therapist_id: therapistId,
          client_id: clientId,
          service_name: service.name,
          appointments_count: totalSessions.toString(),
          coupon_code: appliedCoupon?.code || '',
          discount_amount: discountAmount.toFixed(2),
          platform_fee_percent: platformFeePercent.toString(),
          original_amount: totalAmount.toFixed(2),
          final_amount: finalAmount.toFixed(2)
        },
      },
      metadata: {
        booking_ids: JSON.stringify(finalPaymentMethod === 'stripe' 
          ? createdPendingBookings.map(b => b.id) 
          : createdBookings.map(b => b.id)),
        therapist_id: therapistId,
        client_id: clientId,
        service_name: service.name,
      },
      success_url: `${returnUrl || process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl || process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/cancel?session_id={CHECKOUT_SESSION_ID}`,
      ...(clientEmail && { customer_email: clientEmail }),
      ...(clientName && { billing_address_collection: 'required' }),
    });
    
    console.log('   ✅ Checkout Session creada exitosamente:');
    console.log('      - ID:', checkoutSession.id);
    console.log('      - Status:', checkoutSession.status);
    console.log('      - URL:', checkoutSession.url?.substring(0, 50) + '...');
    console.log('      - Payment Intent:', checkoutSession.payment_intent);
    
    // Guardar el payment intent ID para actualizar después
    const stripePaymentIntentId = checkoutSession.payment_intent;
    
    // 11. Actualizar bookings con payment_intent_id (ignoramos error si no existe la columna)
    // NOTA: Para Stripe, actualizamos pending_bookings en lugar de bookings
    if (stripePaymentIntentId) {
      console.log('\n🔍 [Paso 11] Actualizando bookings con payment_intent_id...');
      if (finalPaymentMethod === 'stripe') {
        // Actualizar pending_bookings con payment_intent_id
        const { error: updatePendingError } = await supabase
          .from('pending_bookings')
          .update({ 
            payment_intent_id: stripePaymentIntentId,
            updated_at: new Date().toISOString()
          })
          .in('id', createdPendingBookings.map(b => b.id));
        
        if (updatePendingError) {
          console.log('   ⚠️ No se pudo actualizar payment_intent_id en pending_bookings');
        } else {
          console.log('   ✅ Pending bookings actualizados con payment_intent_id');
        }
      } else {
        // Para otros métodos, actualizar bookings normales
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ 
            payment_intent_id: stripePaymentIntentId,
            updated_at: new Date().toISOString()
          })
          .in('id', createdBookings.map(b => b.id));
        
        if (updateError) {
          console.log('   ⚠️ No se pudo actualizar payment_intent_id (columna puede no existir)');
        } else {
          console.log('   ✅ Bookings actualizados con payment_intent_id');
        }
      }
    }
    
    // 12. Crear o verificar conversación entre cliente y terapeuta
    // NOTA: Para Stripe, la conversación se creará después del pago exitoso
    console.log('\n🔍 [Paso 12] Creando/verificando conversación entre cliente y terapeuta...');
    let conversation = null;
    try {
      const bookingIds = finalPaymentMethod === 'stripe' 
        ? createdPendingBookings.map(b => b.id)
        : createdBookings.map(b => b.id);
      
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
        checkoutUrl: checkoutSession.url,
        checkoutSessionId: checkoutSession.id,
        paymentIntentId: stripePaymentIntentId,
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
  console.log('PaymentIntent ID:', paymentIntent.id);
  console.log('Metadata:', paymentIntent.metadata);
  
  const pendingBookingIds = JSON.parse(paymentIntent.metadata.booking_ids || '[]');
  
  console.log('Pending Booking IDs a procesar:', pendingBookingIds);
  
  if (pendingBookingIds.length === 0) {
    console.error('ERROR: No pending booking IDs');
    return;
  }
  
  // 1. Buscar pending_bookings
  console.log('Buscando pending_bookings...');
  const { data: pendingBookings, error: fetchError } = await supabase
    .from('pending_bookings')
    .select('*')
    .in('id', pendingBookingIds)
    .eq('status', 'awaiting_payment');
  
  if (fetchError || !pendingBookings || pendingBookings.length === 0) {
    console.error('Error o no encontrados:', fetchError);
    return;
  }
  
  console.log(`Encontrados ${pendingBookings.length} pending_bookings`);
  
  // 2. Crear bookings reales
  console.log('Creando bookings reales desde pending_bookings...');
  const createdBookings = [];
  
  for (const pb of pendingBookings) {
    const bookingData = {
      therapist_id: pb.therapist_id,
      client_id: pb.client_id,
      therapy_type: pb.therapy_type,
      therapy_duration: pb.therapy_duration,
      date: pb.date,
      start_time: pb.start_time,
      end_time: pb.end_time,
      status: 'upcoming',
      payment_status: 'paid',
      amount: pb.amount,
      currency: pb.currency || 'EUR',
      payment_method: 'online',
      location: 'No especificado',
      service_id: pb.service_id,
      notes: `Servicio: ${pb.service_name || pb.therapy_type} (Pagado via Stripe)`
    };
    
    const { data: booking, error: createError } = await supabase
      .from('bookings')
      .insert(bookingData)
      .select()
      .single();
    
    if (createError) {
      console.error('Error creando booking:', createError);
    } else {
      console.log('Booking creado:', booking.id);
      createdBookings.push(booking);
    }
  }
  
  // 3. Marcar pending_bookings como pagados
  console.log('Marcando pending_bookings como pagados...');
  const { error: updateError } = await supabase
    .from('pending_bookings')
    .update({
      status: 'paid',
      payment_intent_id: paymentIntent.id,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('id', pendingBookingIds);
  
  if (updateError) {
    console.error('Error actualizando pending_bookings:', updateError);
  } else {
    console.log('Pending bookings actualizados');
  }
  
  // Incrementar uso del cupón si aplica
  if (paymentIntent.metadata.coupon_code) {
    console.log('Procesando cupón:', paymentIntent.metadata.coupon_code);
    await supabase.rpc('increment_coupon_usage', {
      coupon_code: paymentIntent.metadata.coupon_code
    });
  }
  
  console.log('Proceso completado');
}

async function handlePaymentFailure(paymentIntent) {
  console.log('\nPROCESANDO PAGO FALLIDO');
  console.log('PaymentIntent ID:', paymentIntent.id);
  console.log('Error:', paymentIntent.last_payment_error?.message);
  
  const pendingBookingIds = JSON.parse(paymentIntent.metadata.booking_ids || '[]');
  
  console.log('Pending Booking IDs a eliminar:', pendingBookingIds);
  
  if (pendingBookingIds.length === 0) {
    console.log('No hay pending bookings para eliminar');
    return;
  }
  
  // ELIMINAR pending_bookings (liberar el slot inmediatamente)
  console.log('Eliminando pending_bookings...');
  const { error } = await supabase
    .from('pending_bookings')
    .delete()
    .in('id', pendingBookingIds);
  
  if (error) {
    console.error('Error eliminando pending_bookings:', error);
  } else {
    console.log('Pending bookings eliminados - slots liberados');
  }
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
  const fs = require('fs');
  const path = require('path');
  const debugFilePath = path.join(__dirname, '..', '..', 'debug_payment_permissions.json');
  
  const { therapistId } = req.params;
  const clientId = req.user.id;
  
  // Verificar configuración del terapeuta desde therapist_payment_settings
  const { data: therapistSettings, error } = await supabase
    .from('therapist_payment_settings')
    .select('subscription_plan, can_accept_online_payments')
    .eq('therapist_id', therapistId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    return next(new AppError('Error al verificar permisos', 500));
  }

  // También verificar Stripe Connect status desde la tabla users
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('stripe_connect_status, stripe_connect_account_id')
    .eq('id', therapistId)
    .single();

  console.log('\n🔍 [getPaymentPermissions] Raw values:');
  console.log('   therapistSettings:', therapistSettings);
  console.log('   therapistSettings?.subscription_plan:', therapistSettings?.subscription_plan);
  console.log('   therapistSettings?.can_accept_online_payments:', therapistSettings?.can_accept_online_payments);
  console.log('   userData?.stripe_connect_status:', userData?.stripe_connect_status);
  console.log('   userData?.stripe_connect_account_id:', userData?.stripe_connect_account_id ? 'Presente' : 'Ausente');

  const isPro = therapistSettings?.subscription_plan === 'avanzado-pro';
  
  // Permitir Stripe si:
  // 1. Terapeuta tiene plan Pro Y can_accept_online_payments = true, O
  // 2. Terapeuta tiene stripe_connect_status = 'active' Y stripe_connect_account_id existe
  const hasActiveStripeConnect = userData?.stripe_connect_status === 'active' && userData?.stripe_connect_account_id;
  const canUseStripe = isPro && 
                       (therapistSettings?.can_accept_online_payments || hasActiveStripeConnect);

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
  
  // Crear archivo debug (solo una vez)
  if (!fs.existsSync(debugFilePath)) {
    const debugData = {
      timestamp: new Date().toISOString(),
      therapistId,
      clientId,
      therapistSettings,
      userData,
      isPro,
      hasActiveStripeConnect,
      canUseStripe,
      clientPrefs,
      isNewClient,
      availableMethods,
      defaultMethod
    };
    fs.writeFileSync(debugFilePath, JSON.stringify(debugData, null, 2));
    console.log('📄 Debug file creado:', debugFilePath);
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

/**
 * @desc    Verify payment status from Stripe
 * @route   GET /api/booking-payments/verify-payment
 * @access  Private (Client only)
 */
const verifyPayment = asyncHandler(async (req, res, next) => {
  console.log('\n[verifyPayment] Verificando estado del pago');
  
  const { session_id } = req.query;
  
  if (!session_id) {
    return next(new AppError('Session ID es requerido', 400));
  }
  
  console.log('Session ID:', session_id);
  
  try {
    // Recuperar la sesión de Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    console.log('Session recuperada:');
    console.log('  - Status:', session.status);
    console.log('  - Payment Status:', session.payment_status);
    
    const isPaid = session.payment_status === 'paid';
    const isComplete = session.status === 'complete';
    
    // Si el pago fue exitoso, crear el booking real
    let createdBookings = [];
    if (isPaid && isComplete) {
      console.log('Pago exitoso! Creando bookings desde pending_bookings...');
      console.log('Session metadata:', session.metadata);
      
      const pendingBookingIds = JSON.parse(session.metadata?.booking_ids || '[]');
      console.log('Pending booking IDs from metadata:', pendingBookingIds);
      console.log('Length:', pendingBookingIds.length);
      
      if (pendingBookingIds.length > 0) {
        console.log('Buscando pending_bookings en base de datos...');
        // Buscar pending_bookings
        const { data: pendingBookings, error: fetchError } = await supabase
          .from('pending_bookings')
          .select('*')
          .in('id', pendingBookingIds)
          .eq('status', 'awaiting_payment');
        
        console.log('Resultado de busqueda:');
        console.log('  - fetchError:', fetchError);
        console.log('  - pendingBookings:', pendingBookings);
        console.log('  - pendingBookings.length:', pendingBookings?.length);
        
        if (fetchError) {
          console.error('ERROR al buscar pending_bookings:', fetchError);
        }
        
        if (!fetchError && pendingBookings && pendingBookings.length > 0) {
          console.log(`Encontrados ${pendingBookings.length} pending_bookings`);
          
          // Check if booking already exists for this stripe session (prevent duplicates)
          const { data: existingBookings } = await supabase
            .from('bookings')
            .select('id')
            .eq('stripe_session_id', session.id);
          
          if (existingBookings && existingBookings.length > 0) {
            console.log('⚠️ Booking ya existe para esta sesión de Stripe, evitando duplicado');
            console.log('   Booking IDs existentes:', existingBookings.map(b => b.id));
            createdBookings = existingBookings;
          } else {
            // Crear bookings reales
            for (const pb of pendingBookings) {
            console.log('Procesando pending_booking:', pb.id);
            console.log('Datos del pending_booking:', pb);
            
            const bookingData = {
              therapist_id: pb.therapist_id,
              client_id: pb.client_id,
              therapy_type: pb.therapy_type,
              therapy_duration: pb.therapy_duration,
              date: pb.date,
              start_time: pb.start_time,
              end_time: pb.end_time,
              status: 'upcoming',
              payment_status: 'paid',
              amount: pb.amount,
              currency: pb.currency || 'EUR',
              payment_method: 'online',
              location: 'No especificado',
              service_id: pb.service_id,
              notes: `Servicio: ${pb.service_name || pb.therapy_type} (Pagado via Stripe)`,
              stripe_session_id: session.id
            };
            
            console.log('Insertando booking con datos:', bookingData);
            
            const { data: booking, error: createError } = await supabase
              .from('bookings')
              .insert(bookingData)
              .select()
              .single();
            
            if (createError) {
              console.error('ERROR creando booking:', createError);
            }
            
            if (!createError && booking) {
              console.log('✅ Booking creado:', booking.id);
              createdBookings.push(booking);
            }
          }
          }
          
          // Marcar pending_bookings como pagados
          console.log('Marcando pending_bookings como pagados...');
          const { error: updateError } = await supabase
            .from('pending_bookings')
            .update({
              status: 'paid',
              stripe_session_id: session.id,
              paid_at: new Date().toISOString()
            })
            .in('id', pendingBookingIds);
          
          if (updateError) {
            console.error('ERROR actualizando pending_bookings:', updateError);
          }
          
          console.log('✅ Total bookings creados:', createdBookings.length);
        } else {
          console.log('⚠️ No se encontraron pending_bookings con status awaiting_payment');
        }
      } else {
        console.log('⚠️ No hay pending_booking_ids en metadata');
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        isPaid,
        isComplete,
        amountTotal: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email,
        metadata: session.metadata,
        bookingsCreated: createdBookings.length,
        bookingIds: createdBookings.map(b => b.id)
      }
    });
  } catch (error) {
    console.error('Error verificando sesión:', error);
    return next(new AppError('Error al verificar el pago', 500));
  }
});

module.exports = {
  createBookingWithPayment,
  handleStripeWebhook,
  getPaymentPermissions,
  verifyPayment
};