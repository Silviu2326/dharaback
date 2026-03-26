🔍 ===== INCOMING REQUEST =====
Method: POST
URL: /api/booking-payments/create-with-payment
Headers: {
  'content-type': 'application/json',
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

🔐 [protect] Token decodificado: {
  id: '6bb42843-e46c-4971-b801-1eea8e87ed14',
  type: 'client',
  iat: 1774512500,
  exp: 1774598900
}
🔐 [protect] Token es de cliente, buscando en clients
✅ [protect] Cliente encontrado: {
  id: '6bb42843-e46c-4971-b801-1eea8e87ed14',
  email: 'sherlockholmes@gmail.com'
}
✅ [protect] Cliente agregado a req.user, llamando next()

🚀 [createBookingWithPayment] INICIANDO PROCESO DE RESERVA CON PAGO
═══════════════════════════════════════════════════════════
📋 Datos recibidos:
  - therapistId: 24eb106f-dc32-40e6-9c4f-de4f5b065a06
  - serviceId: 1773994376803
  - clientId: 6bb42843-e46c-4971-b801-1eea8e87ed14
  - appointments: 1 citas
  - paymentMethod (recibido): manual
  - couponCode: Ninguno
  - returnUrl: http://localhost:5173

🔍 [Paso 1] Verificando configuración del terapeuta...
   - stripe_connect_account_id: acct_1TE4Z1CzMCYwOoPU
   - stripe_connect_status: active
✅ Configuración del terapeuta:
  - Plan: avanzado-pro
  - isProPlan: true
  - can_accept_online_payments: true
  - stripe_connect_account_id: acct_1TE4Z1CzMCYwOoPU

🔍 [Paso 2] Verificando preferencias del cliente...
✅ Preferencias del cliente:
  - ¿Existe en BD?: Sí
  - ¿Tiene relación ClientTherapist?: Sí
  - relationPaymentMethod: cash
  - isNewClient: false
  - clientPaymentMethod: stripe
  - isExempt: false

🔍 [Paso 3] Determinando método de pago final...
  - paymentMethod recibido: manual
  - clientPaymentMethod: stripe
  - Método inicial: stripe
  ✅ Método final determinado: stripe

🔍 [Paso 4] Obteniendo información del servicio...
  ⚠️ No se encontró en tabla services, usando datos del body
  ✅ Servicio obtenido del body
  - Nombre: aaaa
  - Precio: 2
  - Duración: 50

🔍 [Paso 5] Calculando montos...
  - sessionPrice: 2
  - totalSessions: 1
  - totalAmount (sin descuento): 2

🔍 [Paso 6] Aplicando cupón si existe...
  - No se proporcionó cupón
  - discountAmount: 0
  - finalAmount: 2

🔍 [Paso 6.5] Verificando/Creando relación cliente-terapeuta...
  - Relación existente: ClientTherapist {
  id: 'c23817a9-59a0-4e0a-820c-4642d4f4e500',
  clientId: '6bb42843-e46c-4971-b801-1eea8e87ed14',
  therapistId: '24eb106f-dc32-40e6-9c4f-de4f5b065a06',
  status: 'active',
  createdAt: '2026-03-25T15:42:39.203917+00:00',
  updatedAt: '2026-03-26T07:38:44.696363+00:00',
  _data: {
    id: 'c23817a9-59a0-4e0a-820c-4642d4f4e500',
    client_id: '6bb42843-e46c-4971-b801-1eea8e87ed14',
    therapist_id: '24eb106f-dc32-40e6-9c4f-de4f5b065a06',
    status: 'active',
    created_at: '2026-03-25T15:42:39.203917+00:00',
    updated_at: '2026-03-26T07:38:44.696363+00:00',
    payment_method: 'cash'
  }
}
  ✅ Relación ya existe y está activa

[Paso 7] Creando reservas...

  Procesando cita 1/1:
    - Fecha: 2026-04-05
    - Hora: 11:40
    - Hora fin calculada: 12:30
    -> Creando pending_booking...
    -> Pending booking creado: 20b5d8fb-9875-47a3-9c8b-b5c7eecfd2f6

Total procesados: 1

🔍 [Paso 8] Verificando método de pago final...
   - finalPaymentMethod: stripe

🔍 [Paso 9] Verificando cuenta Stripe Connect...
   - stripe_connect_account_id: acct_1TE4Z1CzMCYwOoPU
   ✅ Cuenta Stripe Connect configurada

🔍 [Paso 10] Creando Stripe Checkout Session...
   - Monto (céntimos): 200
   - Platform Fee (céntimos): 20 (10%)
   - Cuenta destino: acct_1TE4Z1CzMCYwOoPU
   🚀 Llamando a stripe.checkout.sessions.create()...
   ✅ Checkout Session creada:
      - ID: cs_test_a1liTMEK0lnOOVig04SyJXcB2MRKHLyL9JL0YiXUE7TF5XVvW3cUDg5O43
      - Status: open
      - URL: https://checkout.stripe.com/c/pay/cs_test_a1liTMEK...

🔍 [Paso 12] Creando/verificando conversación...
🔍 DEBUG Conversation.findOne - input filters: {
  client_id: '6bb42843-e46c-4971-b801-1eea8e87ed14',
  therapist_id: '24eb106f-dc32-40e6-9c4f-de4f5b065a06'
}
🔍 DEBUG Conversation.findOne - DB filters: {
  client_id: '6bb42843-e46c-4971-b801-1eea8e87ed14',
  therapist_id: '24eb106f-dc32-40e6-9c4f-de4f5b065a06'
}
   → Actualizando conversación existente...
   ✅ Conversación actualizada

🎉 PROCESO COMPLETADO EXITOSAMENTE
═══════════════════════════════════════════════════════════

POST /api/booking-payments/create-with-payment 201 1426.874 ms - 708