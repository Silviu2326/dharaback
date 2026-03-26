/**
 * Stripe Webhook Handler
 */

const stripe = require('../../../config/stripe');
const { handlePaymentSuccess, handlePaymentFailure, handleRefund } = require('../utils');

const handleStripeWebhook = async (req, res) => {
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
};

module.exports = { handleStripeWebhook };
