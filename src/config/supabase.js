/**
 * Configuración de Supabase para el Backend
 * Reemplaza la conexión a MongoDB
 */

const { createClient } = require('@supabase/supabase-js');

// Validar variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridas');
  process.exit(1);
}

// Crear cliente de Supabase con service role key (acceso completo)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

// Verificar conexión
const checkConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });
    
    if (error) throw error;
    
    console.log('✅ Supabase PostgreSQL conectado correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error conectando a Supabase:', error.message);
    return false;
  }
};

module.exports = {
  supabase,
  checkConnection
};
