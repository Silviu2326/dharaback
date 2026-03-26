/**
 * Create Booking with Payment
 * Main booking creation controller
 */

const stripe = require('../../config/stripe');
const { AppError } = require('../../middleware/errorHandler');
const { supabase } = require('../../config/supabase');
const { ClientTherapist, Conversation } = require('../../models');

const createBookingWithPayment = async (req, res, next) => {
  console.log('\n🚀 [createBookingWithPayment] INICIANDO PROCESO DE RESERVA CON PAGO');
  console.log('═══════════════════════════════════════════════════════════');
  
  const {
    returnUrl,
    therapistId,
    serviceId,
    appointments,
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
  
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_status')
    .eq('id', therapistId)
    .single();
  
  console.log('   - stripe_connect_account_id:', userData?.stripe_connect_account_id || 'No configurado');
  console.log('   - stripe_connect_status:', userData?.stripe_connect_status);
  
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
  
  // 2. Verificar preferencias del cliente
  console.log('\n🔍 [Paso 2] Verificando preferencias del cliente...');
  const { data: clientPrefs, error: prefsError } = await supabase
    .from('client_payment_preferences')
    .select('payment_method, is_exempt_from_payment')
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .single();
  
  // También verificar relación ClientTherapist para saber si el cliente ya existe
  const existingRelationEarly = await ClientTherapist.findByClientAndTherapist(clientId, therapistId);
  const hasExistingRelation = !!existingRelationEarly;
  const relationPaymentMethod = existingRelationEarly?._data?.payment_method || null;

  // Cliente es nuevo solo si no existe en preferencias Y tampoco tiene relación previa
  const isNewClient = !clientPrefs && prefsError?.code === 'PGRST116' && !hasExistingRelation;

  console.log('✅ Preferencias del cliente:');
  console.log('  - ¿Existe en BD?:', clientPrefs ? 'Sí' : 'No');
  console.log('  - ¿Tiene relación ClientTherapist?:', hasExistingRelation ? 'Sí' : 'No');
  console.log('  - relationPaymentMethod:', relationPaymentMethod || 'N/A');
  console.log('  - isNewClient:', isNewClient);
  console.log('  - clientPaymentMethod:', clientPrefs?.payment_method || relationPaymentMethod || 'manual (default)');
  console.log('  - isExempt:', clientPrefs?.is_exempt_from_payment || false);

  const clientPaymentMethod = clientPrefs?.payment_method || relationPaymentMethod || 'manual';
  const isExempt = clientPrefs?.is_exempt_from_payment || false;

  // 3. Determinar método de pago final
  console.log('\n🔍 [Paso 3] Determinando método de pago final...');
  console.log('  - paymentMethod recibido:', paymentMethod);
  console.log('  - clientPaymentMethod:', clientPaymentMethod);

  // El método del cliente (asignado por el terapeuta) tiene prioridad sobre lo recibido del frontend
  let finalPaymentMethod = clientPaymentMethod || paymentMethod;
  console.log('  - Método inicial:', finalPaymentMethod);

  // Solo forzar Stripe si es cliente nuevo SIN relación previa y el terapeuta tiene Pro
  if (isNewClient && isProPlan) {
    console.log('  ⚠️ REGLA APLICADA: Cliente nuevo (sin relación previa) + Terapeuta Pro = FORZAR Stripe');
    finalPaymentMethod = 'stripe';
  }
  
  if (!isProPlan && finalPaymentMethod === 'stripe') {
    console.log('  ⚠️ REGLA APLICADA: Terapeuta no es Pro = Forzar Manual');
    finalPaymentMethod = 'manual';
  }
  
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
    const { data: therapistProfile, error: profileError } = await supabase
      .from('therapist_profiles')
      .select('pricing_packages')
      .eq('user_id', therapistId)
      .single();

    const coupons = therapistProfile?.pricing_packages?.coupons || [];
    const coupon = coupons.find(
      (c) => c.code?.toUpperCase() === couponCode.toUpperCase()
    );

    if (coupon) {
      console.log('  ✅ Cupón encontrado:', coupon.code);
      const now = new Date();
      const validFrom = coupon.validFrom ? new Date(coupon.validFrom) : null;
      const validUntil = coupon.validUntil ? new Date(coupon.validUntil) : null;

      if (!coupon.isActive) {
        console.log('  ❌ Cupón no activo');
      } else if (validFrom && validFrom > now) {
        console.log('  ❌ Cupón aún no válido');
      } else if (validUntil && validUntil < now) {
        console.log('  ❌ Cupón expirado');
      } else if (coupon.minAmount && totalAmount < parseFloat(coupon.minAmount)) {
        console.log('  ❌ Importe mínimo no alcanzado:', coupon.minAmount);
      } else {
        console.log('  ✅ Cupón válido');
        if (coupon.discountType === 'percentage') {
          discountAmount = totalAmount * (coupon.discountValue / 100);
          console.log('  - Descuento porcentaje:', coupon.discountValue, '% =', discountAmount);
        } else {
          discountAmount = parseFloat(coupon.discountValue);
          console.log('  - Descuento fijo:', discountAmount);
        }

        if (discountAmount > totalAmount) {
          discountAmount = totalAmount;
          console.log('  - Ajustado al total:', discountAmount);
        }

        appliedCoupon = coupon;
      }
    } else {
      console.log('  ❌ Cupón no encontrado');
    }
  } else {
    console.log('  - No se proporcionó cupón');
  }
  
  const finalAmount = totalAmount - discountAmount;
  console.log('  - discountAmount:', discountAmount);
  console.log('  - finalAmount:', finalAmount);
  
  // 6.5. Crear o verificar relación cliente-terapeuta
  console.log('\n🔍 [Paso 6.5] Verificando/Creando relación cliente-terapeuta...');
  
  try {
    const existingRelation = existingRelationEarly || await ClientTherapist.findByClientAndTherapist(clientId, therapistId);
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
    console.error('  ⚠️ Error al gestionar relación:', error.message);
  }
  
  // 7. Crear bookings o pending_bookings según método de pago
  console.log('\n[Paso 7] Creando reservas...');
  const createdBookings = [];
  const createdPendingBookings = [];
  
  for (let i = 0; i < appointments.length; i++) {
    const appointment = appointments[i];
    console.log(`\n  Procesando cita ${i + 1}/${appointments.length}:`);
    console.log('    - Fecha:', appointment.date);
    console.log('    - Hora:', appointment.time);
    
    const [hours, minutes] = appointment.time.split(':');
    const startDateTime = new Date(`${appointment.date}T${appointment.time}`);
    const duration = service.duration || 60;
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
    const endTime = `${String(endDateTime.getHours()).padStart(2, '0')}:${String(endDateTime.getMinutes()).padStart(2, '0')}`;
    
    console.log('    - Hora fin calculada:', endTime);
    
    if (finalPaymentMethod === 'stripe') {
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
        notes: `Servicio: ${service.name || 'Sesion'}${appliedCoupon ? ` (Cupon: ${appliedCoupon.code})` : ''}${finalPaymentMethod === 'manual' ? ' (Pago manual)' : ' (Exento)'}`
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
  
  // 8. Si es pago manual o exento, retornar bookings creados
  console.log('\n🔍 [Paso 8] Verificando método de pago final...');
  console.log('   - finalPaymentMethod:', finalPaymentMethod);
  
  if (finalPaymentMethod !== 'stripe') {
    console.log('\n🔍 [Paso 8.5] Creando/verificando conversación...');
    let conversation = null;
    try {
      const bookingIds = createdBookings.map(b => b.id);
      conversation = await Conversation.findBetweenUsers(clientId, therapistId);
      
      if (!conversation) {
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
        console.log('   ✅ Conversación creada:', conversation.id);
      } else {
        console.log('   → Actualizando conversación existente...');
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
        console.log('   ✅ Conversación actualizada');
      }
    } catch (convError) {
      console.error('   ⚠️ Error:', convError.message);
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
  
  // 10. Crear Stripe Checkout Session
  console.log('\n🔍 [Paso 10] Creando Stripe Checkout Session...');
  const platformFeePercent = therapistSettings?.platform_fee_percent || 10;
  const platformFee = Math.round(finalAmount * 100 * (platformFeePercent / 100));
  const amountInCents = Math.round(finalAmount * 100);
  
  console.log('   - Monto (céntimos):', amountInCents);
  console.log('   - Platform Fee (céntimos):', platformFee, `(${platformFeePercent}%)`);
  console.log('   - Cuenta destino:', stripeConnectAccountId);

  try {
    console.log('   🚀 Llamando a stripe.checkout.sessions.create()...');
    
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
    
    console.log('   ✅ Checkout Session creada:');
    console.log('      - ID:', checkoutSession.id);
    console.log('      - Status:', checkoutSession.status);
    console.log('      - URL:', checkoutSession.url?.substring(0, 50) + '...');
    
    const stripePaymentIntentId = checkoutSession.payment_intent;
    
    // 11. Actualizar bookings con payment_intent_id
    if (stripePaymentIntentId) {
      console.log('\n🔍 [Paso 11] Actualizando bookings con payment_intent_id...');
      if (finalPaymentMethod === 'stripe') {
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
          console.log('   ✅ Pending bookings actualizados');
        }
      } else {
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ 
            payment_intent_id: stripePaymentIntentId,
            updated_at: new Date().toISOString()
          })
          .in('id', createdBookings.map(b => b.id));
        
        if (updateError) {
          console.log('   ⚠️ No se pudo actualizar payment_intent_id');
        } else {
          console.log('   ✅ Bookings actualizados');
        }
      }
    }
    
    // 12. Crear o verificar conversación
    console.log('\n🔍 [Paso 12] Creando/verificando conversación...');
    let conversation = null;
    try {
      const bookingIds = finalPaymentMethod === 'stripe' 
        ? createdPendingBookings.map(b => b.id)
        : createdBookings.map(b => b.id);
      
      conversation = await Conversation.findBetweenUsers(clientId, therapistId);
      
      if (!conversation) {
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
        console.log('   ✅ Conversación creada:', conversation.id);
      } else {
        console.log('   → Actualizando conversación existente...');
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
        console.log('   ✅ Conversación actualizada');
      }
    } catch (convError) {
      console.error('   ⚠️ Error:', convError.message);
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
    
    console.log('\n🔄 Rollback: Eliminando bookings creados...');
    
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
};

module.exports = { createBookingWithPayment };
