🔍 ===== INCOMING REQUEST =====
Method: POST
URL: /api/terapeutas/suscribir
Headers: {
  'content-type': 'application/json',
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

✅ Customer created: cus_UDX8bap1t8lHx1
✅ Subscription checkout session created: cs_test_a1NzdFyh2ej3yAhyxMCDRBJrLzBRgbF8vVIHSOIUnwDNAOKQe0ggbMtHat Immediate payment (no trial)
✅ Therapist subscription checkout created: {
  sessionId: 'cs_test_a1NzdFyh2ej3yAhyxMCDRBJrLzBRgbF8vVIHSOIUnwDNAOKQe0ggbMtHat',
  email: 'opanaderolazaro@gmail.com',
  plan: 'avanzado-pro',
  trialDays: 0
}
POST /api/terapeutas/suscribir 200 857.171 ms - 637

🔍 ===== INCOMING REQUEST =====
Method: GET
URL: /api/auth/me
Headers: {
  'content-type': undefined,
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

🔐 [protect] Token decodificado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  iat: 1774497125,
  exp: 1774583525
}
🔐 [protect] Buscando usuario en Supabase con ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3
🔐 [protect] Resultado consulta Supabase: { user: 'ENCONTRADO', error: null }
✅ [protect] Usuario encontrado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  email: 'opanaderolazaro@gmail.com',
  role: 'therapist'
}
✅ [protect] Usuario agregado a req.user, llamando next()
GET /api/auth/me 200 183.305 ms - 1005

🔍 ===== INCOMING REQUEST =====
Method: POST
URL: /api/terapeutas/confirmar-cambio-plan
Headers: {
  'content-type': 'application/json',
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

🔐 [protect] Token decodificado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  iat: 1774497125,
  exp: 1774583525
}
🔐 [protect] Buscando usuario en Supabase con ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3

🔍 ===== INCOMING REQUEST =====
Method: POST
URL: /api/terapeutas/confirmar-cambio-plan
Headers: {
  'content-type': 'application/json',
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

🔐 [protect] Token decodificado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  iat: 1774497125,
  exp: 1774583525
}
🔐 [protect] Buscando usuario en Supabase con ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3
🔐 [protect] Resultado consulta Supabase: { user: 'ENCONTRADO', error: null }
✅ [protect] Usuario encontrado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  email: 'opanaderolazaro@gmail.com',
  role: 'therapist'
}
✅ [protect] Usuario agregado a req.user, llamando next()
🔐 [protect] Resultado consulta Supabase: { user: 'ENCONTRADO', error: null }
✅ [protect] Usuario encontrado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  email: 'opanaderolazaro@gmail.com',
  role: 'therapist'
}
✅ [protect] Usuario agregado a req.user, llamando next()
✅ Plan change confirmed for user: 51c7c3c7-dc65-4776-8e51-cba2e19281a3 → avanzado-pro
POST /api/terapeutas/confirmar-cambio-plan 200 679.541 ms - 172
✅ Plan change confirmed for user: 51c7c3c7-dc65-4776-8e51-cba2e19281a3 → avanzado-pro
POST /api/terapeutas/confirmar-cambio-plan 200 891.933 ms - 172

🔍 ===== INCOMING REQUEST =====
Method: GET
URL: /api/api/payments/stripe/connect/status
Headers: {
  'content-type': undefined,
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

GET /api/api/payments/stripe/connect/status 404 0.210 ms - 772

🔍 ===== INCOMING REQUEST =====
Method: GET
URL: /api/api/payments/stripe/connect/status
Headers: {
  'content-type': undefined,
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

GET /api/api/payments/stripe/connect/status 404 0.252 ms - 772

🔍 ===== INCOMING REQUEST =====
Method: GET
URL: /api/client-payment-settings/therapists/me/subscription
Headers: {
  'content-type': undefined,
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

🔐 [protect] Token decodificado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  iat: 1774497125,
  exp: 1774583525
}
🔐 [protect] Buscando usuario en Supabase con ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3

🔍 ===== INCOMING REQUEST =====
Method: GET
URL: /api/client-payment-settings/therapists/me/subscription
Headers: {
  'content-type': undefined,
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

🔐 [protect] Token decodificado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  iat: 1774497125,
  exp: 1774583525
}
🔐 [protect] Buscando usuario en Supabase con ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3
🔐 [protect] Resultado consulta Supabase: { user: 'ENCONTRADO', error: null }
✅ [protect] Usuario encontrado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  email: 'opanaderolazaro@gmail.com',
  role: 'therapist'
}
✅ [protect] Usuario agregado a req.user, llamando next()
🔐 [protect] Resultado consulta Supabase: { user: 'ENCONTRADO', error: null }
✅ [protect] Usuario encontrado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  email: 'opanaderolazaro@gmail.com',
  role: 'therapist'
}
✅ [protect] Usuario agregado a req.user, llamando next()
GET /api/client-payment-settings/therapists/me/subscription 200 542.777 ms - 206
GET /api/client-payment-settings/therapists/me/subscription 200 546.343 ms - 206

🔍 ===== INCOMING REQUEST =====
Method: GET
URL: /api/payments/methods
Headers: {
  'content-type': undefined,
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

🔐 [protect] Token decodificado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  iat: 1774497125,
  exp: 1774583525
}
🔐 [protect] Buscando usuario en Supabase con ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3

🔍 ===== INCOMING REQUEST =====
Method: GET
URL: /api/payments/methods
Headers: {
  'content-type': undefined,
  authorization: 'Bearer ***',
  origin: 'http://localhost:5173',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWeb...'
}
Query: [Object: null prototype] {}
================================

🔐 [protect] Token decodificado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  iat: 1774497125,
  exp: 1774583525
}
🔐 [protect] Buscando usuario en Supabase con ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3
🔐 [protect] Resultado consulta Supabase: { user: 'ENCONTRADO', error: null }
✅ [protect] Usuario encontrado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  email: 'opanaderolazaro@gmail.com',
  role: 'therapist'
}
✅ [protect] Usuario agregado a req.user, llamando next()
🔍 [getPaymentMethods] User ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3
📡 [getPaymentMethods] Fetching user from Supabase...
🔐 [protect] Resultado consulta Supabase: { user: 'ENCONTRADO', error: null }
✅ [protect] Usuario encontrado: {
  id: '51c7c3c7-dc65-4776-8e51-cba2e19281a3',
  email: 'opanaderolazaro@gmail.com',
  role: 'therapist'
}
✅ [protect] Usuario agregado a req.user, llamando next()
🔍 [getPaymentMethods] User ID: 51c7c3c7-dc65-4776-8e51-cba2e19281a3
📡 [getPaymentMethods] Fetching user from Supabase...
👤 [getPaymentMethods] User data: {
  "id": "51c7c3c7-dc65-4776-8e51-cba2e19281a3",
  "email": "opanaderolazaro@gmail.com",
  "name": "ISABEL MIRALLES",
  "stripe_customer_id": "cus_UDX8bap1t8lHx1"
}
❌ [getPaymentMethods] User error: null
💳 [getPaymentMethods] Stripe Customer ID: cus_UDX8bap1t8lHx1
📡 [getPaymentMethods] Fetching payment methods from Stripe...
🔍 [StripeService] Getting payment methods for customer: cus_UDX8bap1t8lHx1
📡 [StripeService] Calling Stripe API...
👤 [getPaymentMethods] User data: {
  "id": "51c7c3c7-dc65-4776-8e51-cba2e19281a3",
  "email": "opanaderolazaro@gmail.com",
  "name": "ISABEL MIRALLES",
  "stripe_customer_id": "cus_UDX8bap1t8lHx1"
}
❌ [getPaymentMethods] User error: null
💳 [getPaymentMethods] Stripe Customer ID: cus_UDX8bap1t8lHx1
📡 [getPaymentMethods] Fetching payment methods from Stripe...
🔍 [StripeService] Getting payment methods for customer: cus_UDX8bap1t8lHx1
📡 [StripeService] Calling Stripe API...
📊 [StripeService] Raw response from Stripe: { object: 'list', count: 1, has_more: false }
✅ [StripeService] Retrieved 1 payment methods: [
  {
    "id": "pm_1TF63yCWwvC7shblV7yi2aiZ",
    "type": "card",
    "brand": "visa",
    "last4": "4242",
    "expMonth": 2,
    "expYear": 2044,
    "isDefault": false
  }
]
✅ [getPaymentMethods] Payment methods from Stripe: [
  {
    "id": "pm_1TF63yCWwvC7shblV7yi2aiZ",
    "type": "card",
    "brand": "visa",
    "last4": "4242",
    "expMonth": 2,
    "expYear": 2044,
    "isDefault": false
  }
]
📡 [getPaymentMethods] Fetching default payment method...
🔍 [StripeService] Getting default payment method for customer: cus_UDX8bap1t8lHx1
📡 [StripeService] Fetching customer from Stripe...
📊 [StripeService] Raw response from Stripe: { object: 'list', count: 1, has_more: false }
✅ [StripeService] Retrieved 1 payment methods: [
  {
    "id": "pm_1TF63yCWwvC7shblV7yi2aiZ",
    "type": "card",
    "brand": "visa",
    "last4": "4242",
    "expMonth": 2,
    "expYear": 2044,
    "isDefault": false
  }
]
✅ [getPaymentMethods] Payment methods from Stripe: [
  {
    "id": "pm_1TF63yCWwvC7shblV7yi2aiZ",
    "type": "card",
    "brand": "visa",
    "last4": "4242",
    "expMonth": 2,
    "expYear": 2044,
    "isDefault": false
  }
]
📡 [getPaymentMethods] Fetching default payment method...
🔍 [StripeService] Getting default payment method for customer: cus_UDX8bap1t8lHx1
📡 [StripeService] Fetching customer from Stripe...
📊 [StripeService] Customer retrieved: {
  id: 'cus_UDX8bap1t8lHx1',
  hasInvoiceSettings: true,
  defaultPaymentMethod: null
}
⚠️ [StripeService] No default payment method set for customer
✅ [getPaymentMethods] Default method: null
📤 [getPaymentMethods] Sending response: {
  "success": true,
  "data": {
    "methods": [
      {
        "id": "pm_1TF63yCWwvC7shblV7yi2aiZ",
        "type": "card",
        "brand": "visa",
        "last4": "4242",
        "expMonth": 2,
        "expYear": 2044,
        "isDefault": true
      }
    ],
    "defaultMethod": {
      "id": "pm_1TF63yCWwvC7shblV7yi2aiZ",
      "type": "card",
      "brand": "visa",
      "last4": "4242",
      "expMonth": 2,
      "expYear": 2044,
      "isDefault": true
    },
    "hasPaymentMethods": true,
    "customerId": "cus_UDX8bap1t8lHx1"
  }
}
📊 [getPaymentMethods] Response size: 364 bytes
GET /api/payments/methods 200 637.948 ms - 364
📊 [StripeService] Customer retrieved: {
  id: 'cus_UDX8bap1t8lHx1',
  hasInvoiceSettings: true,
  defaultPaymentMethod: null
}
⚠️ [StripeService] No default payment method set for customer
✅ [getPaymentMethods] Default method: null
📤 [getPaymentMethods] Sending response: {
  "success": true,
  "data": {
    "methods": [
      {
        "id": "pm_1TF63yCWwvC7shblV7yi2aiZ",
        "type": "card",
        "brand": "visa",
        "last4": "4242",
        "expMonth": 2,
        "expYear": 2044,
        "isDefault": true
      }
    ],
    "defaultMethod": {
      "id": "pm_1TF63yCWwvC7shblV7yi2aiZ",
      "type": "card",
      "brand": "visa",
      "last4": "4242",
      "expMonth": 2,
      "expYear": 2044,
      "isDefault": true
    },
    "hasPaymentMethods": true,
    "customerId": "cus_UDX8bap1t8lHx1"
  }
}
📊 [getPaymentMethods] Response size: 364 bytes
GET /api/payments/methods 200 660.744 ms - 364