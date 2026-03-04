const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT secret from .env
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here_change_in_production';

// Real therapist data
const therapistData = {
  id: '68ce20c17931a40b74af366a', // Real therapist ID from database
  email: 'admin@demo.com',
  role: 'therapist',
  name: 'Admin Demo'
};

// Generate valid JWT token
function generateValidToken() {
  const payload = {
    id: therapistData.id,  // Backend expects 'id' field, not 'sub'
    email: therapistData.email,
    role: therapistData.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };

  const token = jwt.sign(payload, JWT_SECRET);
  return token;
}

// Generate and display token
const validToken = generateValidToken();

console.log('=== VALID JWT TOKEN GENERATED ===');
console.log('');
console.log('🔑 Token:');
console.log(validToken);
console.log('');
console.log('👤 Therapist Data:');
console.log('   ID:', therapistData.id);
console.log('   Email:', therapistData.email);
console.log('   Role:', therapistData.role);
console.log('   Name:', therapistData.name);
console.log('');
console.log('🔐 JWT Secret Used:', JWT_SECRET);
console.log('');

// Verify the token works
try {
  const decoded = jwt.verify(validToken, JWT_SECRET);
  console.log('✅ Token verification: SUCCESS');
  console.log('📋 Decoded payload:', decoded);
} catch (error) {
  console.log('❌ Token verification: FAILED');
  console.log('Error:', error.message);
}

console.log('');
console.log('📋 Instructions:');
console.log('1. Copy the token above');
console.log('2. In browser console, run:');
console.log('   localStorage.setItem("dhara-token", "' + validToken + '")');
console.log('3. Set user data:');
console.log('   localStorage.setItem("dhara-user", \'' + JSON.stringify(therapistData) + '\')');
console.log('4. Reload the page');

// Also create a browser-ready script
const browserScript = `
// Valid token generated with correct JWT secret
const validToken = "${validToken}";
const userData = ${JSON.stringify(therapistData)};

localStorage.setItem('dhara-token', validToken);
localStorage.setItem('dhara-user', JSON.stringify(userData));

console.log('✅ Valid token set for therapist:', userData.name);
console.log('🔄 Reload the page to see changes');

// Test the token
fetch('https://dharaback-production.up.railway.app/api/reviews?therapistId=current&verified=true&limit=5', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + validToken,
    'Content-Type': 'application/json'
  }
})
.then(response => {
  console.log('🧪 API Test Result:', response.status, response.statusText);
  return response.json();
})
.then(data => {
  console.log('📊 API Response:', data);
})
.catch(error => {
  console.error('💥 API Test Error:', error);
});
`;

console.log('');
console.log('🌐 Browser Script (copy and paste in browser console):');
console.log('```javascript');
console.log(browserScript);
console.log('```');