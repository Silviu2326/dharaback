/**
 * Script para actualizar la contraseña del cliente pruebacliente@gmail.com
 * Ejecutar: node update-client-password.cjs
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// Configuración de Supabase
const supabaseUrl = 'https://jeqqvtliltdtbxsgdedo.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXF2dGxpbHRkdGJ4c2dkZWRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY3MDgyNywiZXhwIjoyMDg1MjQ2ODI3fQ.myM2dfSh-fnkfBdxGQNKTuJAYY-rzK96FvfLgZdUOO4';

// Crear cliente de Supabase con service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

async function updateClientPassword() {
  try {
    const email = 'pruebacliente@gmail.com';
    const newPassword = 'pruebacliente@gmail.com';

    console.log(`🔍 Buscando clientes con email: ${email}`);

    // Buscar todos los clientes con ese email
    const { data: clients, error: findError } = await supabase
      .from('clients')
      .select('id, email, name')
      .eq('email', email);

    if (findError) {
      console.error('❌ Error buscando clientes:', findError.message);
      process.exit(1);
    }

    if (!clients || clients.length === 0) {
      console.error('❌ No se encontraron clientes');
      process.exit(1);
    }

    console.log(`✅ Se encontraron ${clients.length} cliente(s):`);
    clients.forEach((client, index) => {
      console.log(`  ${index + 1}. ID: ${client.id}, Nombre: ${client.name}`);
    });

    // Generar hash de la nueva contraseña
    console.log('\n🔐 Generando hash de la contraseña...');
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    console.log('Hash generado:', hashedPassword.substring(0, 30) + '...');

    // Actualizar todos los clientes encontrados
    console.log('\n💾 Actualizando contraseñas...');
    
    for (const client of clients) {
      console.log(`\n📝 Actualizando cliente: ${client.id}`);
      
      const { data: updatedClient, error: updateError } = await supabase
        .from('clients')
        .update({ 
          password: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', client.id)
        .select('id, email, name, updated_at');

      if (updateError) {
        console.error(`❌ Error actualizando cliente ${client.id}:`, updateError.message);
        continue;
      }

      console.log(`✅ Cliente ${client.id} actualizado exitosamente`);
    }

    // Verificar actualizaciones
    console.log('\n🔍 Verificando actualizaciones...');
    
    for (const client of clients) {
      const { data: verifyClient } = await supabase
        .from('clients')
        .select('password')
        .eq('id', client.id)
        .single();

      const isValid = await bcrypt.compare(newPassword, verifyClient.password);
      console.log(`✅ Cliente ${client.id}: Verificación ${isValid ? 'EXITOSA ✓' : 'FALLIDA ✗'}`);
    }

    console.log('\n🎉 Proceso completado!');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Nueva contraseña: ${newPassword}`);
    console.log(`📝 Clientes actualizados: ${clients.length}`);

  } catch (error) {
    console.error('❌ Error inesperado:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar
updateClientPassword();
