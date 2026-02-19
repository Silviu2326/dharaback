/**
 * Configuración de Base de Datos - Supabase
 * Reemplaza la conexión a MongoDB con Supabase PostgreSQL
 */

const { checkConnection } = require('./supabase');

const connectDB = async () => {
  try {
    const connected = await checkConnection();
    
    if (!connected) {
      throw new Error('Failed to connect to Supabase');
    }
    
    console.log('🗄️  Supabase PostgreSQL Connected');
    return true;
  } catch (error) {
    console.error('❌ Error connecting to Supabase:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
