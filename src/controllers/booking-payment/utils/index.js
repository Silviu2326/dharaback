/**
 * Booking Payment Utilities
 * Helper functions for payment processing
 */

const stripe = require('../../../config/stripe');
const { supabase } = require('../../../config/supabase');

/**
 * Handle successful Stripe payment
 */
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

/**
 * Handle failed Stripe payment
 */
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

/**
 * Handle Stripe refund
 */
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

module.exports = {
  handlePaymentSuccess,
  handlePaymentFailure,
  handleRefund
};
