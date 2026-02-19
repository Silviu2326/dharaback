/**
 * globalSetup.js
 * Se ejecuta UNA SOLA VEZ antes de todos los tests.
 * Carga las variables de entorno.
 */
const path = require('path');

module.exports = async () => {
  // Cargar .env desde la raíz del backend
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  
  // Suprimir logs ruidosos durante los tests
  process.env.NODE_ENV = 'test';
  
  console.log('🚀 [Tests] Setup global completado');
};
