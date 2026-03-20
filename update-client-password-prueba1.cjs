const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = 'https://jeqqvtliltdtbxsgdedo.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXF2dGxpbHRkdGJ4c2dkZWRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY3MDgyNywiZXhwIjoyMDg1MjQ2ODI3fQ.myM2dfSh-fnkfBdxGQNKTuJAYY-rzK96FvfLgZdUOO4';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: true, persistSession: false },
  db: { schema: 'public' }
});

async function updateClientPassword() {
  const email = 'pruebacliente1@gmail.com';
  const newPassword = 'pruebacliente1@gmail.com';

  console.log(`Buscando cliente con email: ${email}`);

  const { data: clients, error: findError } = await supabase
    .from('clients')
    .select('id, email, name')
    .eq('email', email);

  if (findError) {
    console.error('Error buscando clientes:', findError.message);
    process.exit(1);
  }

  if (!clients || clients.length === 0) {
    console.error('No se encontraron clientes');
    process.exit(1);
  }

  console.log(`Se encontraron ${clients.length} cliente(s):`);
  clients.forEach((client, index) => {
    console.log(`  ${index + 1}. ID: ${client.id}, Nombre: ${client.name}`);
  });

  console.log('\nGenerando hash de la contraseña...');
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  console.log('Actualizando contraseñas...');
  
  for (const client of clients) {
    const { error: updateError } = await supabase
      .from('clients')
      .update({ 
        password: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', client.id);

    if (updateError) {
      console.error(`Error actualizando cliente ${client.id}:`, updateError.message);
    } else {
      console.log(`Cliente ${client.id} actualizado exitosamente`);
    }
  }

  console.log('\nProceso completado!');
  console.log(`Email: ${email}`);
  console.log(`Nueva contraseña: ${newPassword}`);
}

updateClientPassword();
