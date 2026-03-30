/**
 * Verify Payment
 * Check payment status from Stripe
 */

const stripe = require('../../config/stripe');
const { AppError } = require('../../middleware/errorHandler');
const { supabase } = require('../../config/supabase');
const emailService = require('../../services/emailService');

const verifyPayment = async (req, res, next) => {
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
            // Atomic claim: marcar directamente como 'paid' para evitar race conditions.
            // Solo actualiza si el status sigue siendo 'awaiting_payment', y usa el count
            // para saber si esta petición ganó el lock.
            const { count: claimedCount, error: claimError } = await supabase
              .from('pending_bookings')
              .update({
                status: 'paid',
                stripe_session_id: session.id,
                paid_at: new Date().toISOString()
              }, { count: 'exact' })
              .in('id', pendingBookingIds)
              .eq('status', 'awaiting_payment');

            if (claimError) {
              console.error('ERROR en atomic claim:', claimError);
            }

            console.log(`  → Atomic claim: ${claimedCount} pending_booking(s) reclamados`);

            if (claimedCount === null || claimedCount === 0) {
              console.log('⚠️ Otra petición ya está procesando estos bookings (race condition evitada)');
              // Devolver los bookings que ya se crearon por la otra petición
              const { data: alreadyCreated } = await supabase
                .from('bookings')
                .select('id')
                .eq('stripe_session_id', session.id);
              createdBookings = alreadyCreated || [];
              // Saltar el bloque de creación
              pendingBookings.length = 0;
            }

            // Recuperar payment_intent para obtener charge_id
            let stripeChargeId = null;
            let stripePaymentIntentId = session.payment_intent || null;
            if (stripePaymentIntentId) {
              try {
                const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
                stripeChargeId = paymentIntent.latest_charge || null;
              } catch (e) {
                console.warn('  ⚠️ No se pudo recuperar charge_id:', e.message);
              }
            }

            // Crear bookings reales
            for (const pb of pendingBookings) {
              console.log('Procesando pending_booking:', pb.id);

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

                // Crear registro en payments
                const platformFee = session.amount_total
                  ? Math.round(session.amount_total * 0.1) / 100
                  : 0;
                const netAmount = pb.amount - platformFee;

                // Resolver nombre y email del cliente.
                // client_id es el users.id del cliente registrado; buscar primero en
                // la tabla clients del terapeuta, y como fallback en users.
                const [{ data: clientRecord }, { data: userRecord }, { data: therapist }] = await Promise.all([
                  supabase.from('clients').select('name, email').eq('id', pb.client_id).single(),
                  supabase.from('users').select('name, email').eq('id', pb.client_id).single(),
                  supabase.from('users').select('name').eq('id', pb.therapist_id).single()
                ]);

                const resolvedClientName = clientRecord?.name || userRecord?.name || session.customer_details?.name || 'Cliente';
                const resolvedClientEmail = clientRecord?.email || userRecord?.email || session.customer_details?.email || null;

                const { error: paymentError } = await supabase
                  .from('payments')
                  .insert({
                    booking_id: booking.id,
                    client_id: pb.client_id,
                    therapist_id: pb.therapist_id,
                    amount: pb.amount,
                    currency: pb.currency || 'EUR',
                    status: 'completed',
                    method: 'card',
                    stripe_payment_intent_id: stripePaymentIntentId,
                    stripe_charge_id: stripeChargeId,
                    description: `Pago Stripe - ${pb.service_name || pb.therapy_type}`,
                    platform_fee: platformFee,
                    net_amount: netAmount,
                    paid_at: new Date().toISOString(),
                    metadata: {
                      stripe_session_id: session.id,
                      service_id: pb.service_id,
                      service_name: pb.service_name,
                      clientName: resolvedClientName,
                      clientEmail: resolvedClientEmail
                    }
                  });

                if (paymentError) {
                  console.error('  ⚠️ Error creando registro de payment:', paymentError);
                } else {
                  console.log('  ✅ Registro de payment creado para:', resolvedClientName);
                }

                // Enviar email de confirmación al cliente
                try {
                  // Reutilizar datos ya resueltos
                  const client = clientRecord || userRecord
                    ? { name: resolvedClientName, email: resolvedClientEmail }
                    : null;

                  if (client?.email) {
                    const appointmentDate = new Date(pb.date + 'T' + pb.start_time).toLocaleDateString('es-ES', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });
                    const appointmentTime = pb.start_time.substring(0, 5);

                    emailService.sendAppointmentConfirmation({
                      to: client.email,
                      clientName: client.name,
                      therapistName: therapist?.name || 'tu terapeuta',
                      date: appointmentDate,
                      time: appointmentTime,
                      location: null
                    }).catch(err => console.error('  ⚠️ Error enviando email de confirmación:', err));

                    console.log('  ✅ Email de confirmación enviado a:', client.email);
                  }
                } catch (emailErr) {
                  console.error('  ⚠️ Error preparando email de confirmación:', emailErr.message);
                }
              }
            }
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
};

module.exports = { verifyPayment };
