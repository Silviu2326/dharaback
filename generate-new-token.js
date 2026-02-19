const jwt = require('jsonwebtoken');

// Usar la misma clave que en el backend
const JWT_SECRET = 'your_super_secret_jwt_key_here_change_in_production';

// Datos del terapeuta
const therapistData = {
  id: "68ce20c17931a40b74af366a",
  email: "admin@demo.com",
  role: "therapist"
};

// Generar token válido por 7 días
const now = Math.floor(Date.now() / 1000);
const token = jwt.sign(
  {
    ...therapistData,
    iat: now,
    exp: now + (7 * 24 * 60 * 60) // 7 días
  },
  JWT_SECRET
);

console.log('\n🔑 NEW VALID TOKEN:');
console.log(token);

console.log('\n📅 Token details:');
console.log('- Issued at:', new Date(now * 1000).toISOString());
console.log('- Expires at:', new Date((now + (7 * 24 * 60 * 60)) * 1000).toISOString());

// Verificar que el token es válido
try {
  const decoded = jwt.verify(token, JWT_SECRET);
  console.log('\n✅ Token verification successful:');
  console.log(decoded);
} catch (error) {
  console.log('\n❌ Token verification failed:', error.message);
}