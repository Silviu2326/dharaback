/**
 * Script de migración para agregar campos de Stripe Connect a la tabla users
 * 
 * Ejecutar con: node backend/src/migrations/addStripeConnectFields.js
 */

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridos');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🚀 Iniciando migración de Stripe Connect...\n');

  try {
    // Verificar si los campos ya existen
    console.log('🔍 Verificando estructura actual de la tabla users...');
    
    const { data: columns, error: columnsError } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (columnsError) {
      throw new Error(`Error verificando tabla: ${columnsError.message}`);
    }

    const sampleUser = columns && columns[0] ? columns[0] : {};
    const hasStripeConnectAccountId = 'stripe_connect_account_id' in sampleUser;
    const hasStripeConnectStatus = 'stripe_connect_status' in sampleUser;

    if (hasStripeConnectAccountId && hasStripeConnectStatus) {
      console.log('✅ Los campos de Stripe Connect ya existen en la tabla users');
      return;
    }

    // Agregar columna stripe_connect_account_id
    if (!hasStripeConnectAccountId) {
      console.log('➕ Agregando columna stripe_connect_account_id...');
      
      const { error: error1 } = await supabase.rpc('add_column_if_not_exists', {
        table_name: 'users',
        column_name: 'stripe_connect_account_id',
        column_type: 'text',
        default_value: null
      });

      if (error1) {
        // Intentar con SQL directo
        const { error: sqlError1 } = await supabase.rpc('execute_sql', {
          sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;`
        });
        
        if (sqlError1) {
          console.log('⚠️  No se pudo agregar mediante RPC, intentando SQL directo...');
          // Fallback: usar REST API directamente
          console.log('   La columna puede necesitar ser agregada manualmente en SQL Editor');
          console.log('   SQL: ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;');
        } else {
          console.log('✅ Columna stripe_connect_account_id agregada');
        }
      } else {
        console.log('✅ Columna stripe_connect_account_id agregada');
      }
    }

    // Agregar columna stripe_connect_status
    if (!hasStripeConnectStatus) {
      console.log('➕ Agregando columna stripe_connect_status...');
      
      const { error: error2 } = await supabase.rpc('add_column_if_not_exists', {
        table_name: 'users',
        column_name: 'stripe_connect_status',
        column_type: 'text',
        default_value: null
      });

      if (error2) {
        const { error: sqlError2 } = await supabase.rpc('execute_sql', {
          sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT;`
        });
        
        if (sqlError2) {
          console.log('⚠️  No se pudo agregar mediante RPC, intentando SQL directo...');
          console.log('   La columna puede necesitar ser agregada manualmente en SQL Editor');
          console.log('   SQL: ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT;');
        } else {
          console.log('✅ Columna stripe_connect_status agregada');
        }
      } else {
        console.log('✅ Columna stripe_connect_status agregada');
      }
    }

    // Verificar nuevamente
    console.log('\n🔍 Verificando migración...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('users')
      .select('stripe_connect_account_id, stripe_connect_status')
      .limit(1);

    if (verifyError) {
      console.log('⚠️  Error verificando migración:', verifyError.message);
      console.log('\n📋 Instrucciones manuales:');
      console.log('Ejecuta el siguiente SQL en el SQL Editor de Supabase:');
      console.log('------------------------------------------------');
      console.log('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;');
      console.log('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT;');
      console.log('------------------------------------------------');
    } else {
      console.log('✅ Migración completada exitosamente!');
      console.log('\n📊 Campos agregados:');
      console.log('  - stripe_connect_account_id: ID de la cuenta de Stripe Connect');
      console.log('  - stripe_connect_status: Estado de la cuenta (pending/active/disconnected)');
    }

  } catch (error) {
    console.error('❌ Error en la migración:', error);
    console.log('\n📋 Instrucciones manuales:');
    console.log('Ejecuta el siguiente SQL en el SQL Editor de Supabase:');
    console.log('------------------------------------------------');
    console.log('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;');
    console.log('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT;');
    console.log('------------------------------------------------');
    process.exit(1);
  }
}

// Si se ejecuta directamente
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('\n✨ Migración finalizada');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error:', error);
      process.exit(1);
    });
}

module.exports = { migrate };
