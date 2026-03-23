/**
 * Script para limpiar clientes duplicados en Supabase
 * Ejecutar: node scripts/cleanup-duplicate-clients.js
 */

// Cargar variables de entorno
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { supabase } = require('../src/config/supabase');

async function cleanupDuplicateClients() {
  console.log('🧹 Iniciando limpieza de clientes duplicados...\n');

  try {
    // Paso 1: Obtener todos los clientes
    console.log('📊 Obteniendo lista de clientes...');
    const { data: clients, error: fetchError } = await supabase
      .from('clients')
      .select('id, email, name, created_at')
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw new Error(`Error al obtener clientes: ${fetchError.message}`);
    }

    console.log(`✅ Total de clientes encontrados: ${clients.length}\n`);

    // Paso 2: Agrupar por email y encontrar duplicados
    const emailGroups = {};
    clients.forEach(client => {
      if (client.email) {
        const email = client.email.toLowerCase().trim();
        if (!emailGroups[email]) {
          emailGroups[email] = [];
        }
        emailGroups[email].push(client);
      }
    });

    // Encontrar duplicados
    const duplicates = Object.entries(emailGroups).filter(([email, group]) => group.length > 1);
    
    if (duplicates.length === 0) {
      console.log('✅ No se encontraron clientes duplicados. Todo está limpio!\n');
      return;
    }

    console.log(`⚠️  Se encontraron ${duplicates.length} emails con duplicados:\n`);
    
    duplicates.forEach(([email, group]) => {
      console.log(`  📧 ${email} (${group.length} registros):`);
      group.forEach((client, idx) => {
        const isMain = idx === 0;
        console.log(`     ${isMain ? '✅' : '❌'} ${client.id} - ${client.name} (${client.created_at})${isMain ? ' [CONSERVAR]' : ' [ELIMINAR]'}`);
      });
      console.log('');
    });

    // Paso 3: Procesar cada grupo de duplicados
    console.log('🔄 Procesando duplicados...\n');
    
    let totalProcessed = 0;
    let totalDeleted = 0;

    for (const [email, group] of duplicates) {
      // El primero es el más reciente (por el orden DESC)
      const [mainClient, ...duplicatesToDelete] = group;
      
      console.log(`\n📧 Procesando: ${email}`);
      console.log(`   ✅ Conservando: ${mainClient.id} (${mainClient.name})`);

      // Actualizar referencias en otras tablas antes de eliminar
      for (const dupClient of duplicatesToDelete) {
        console.log(`   ❌ Eliminando duplicado: ${dupClient.id}`);
        
        // Actualizar appointments
        await updateReferences('appointments', 'client_id', dupClient.id, mainClient.id);
        
        // Actualizar bookings
        await updateReferences('bookings', 'client_id', dupClient.id, mainClient.id);
        
        // Actualizar document_clients
        await updateReferences('document_clients', 'client_id', dupClient.id, mainClient.id);
        
        // Actualizar documents (client_id directo)
        await updateReferences('documents', 'client_id', dupClient.id, mainClient.id);
        
        // Actualizar messages
        await updateReferences('messages', 'client_id', dupClient.id, mainClient.id);
        
        // Actualizar notifications
        await updateReferences('notifications', 'client_id', dupClient.id, mainClient.id);
        
        // Actualizar reviews
        await updateReferences('reviews', 'client_id', dupClient.id, mainClient.id);
        
        // Actualizar payments
        await updateReferences('payments', 'client_id', dupClient.id, mainClient.id);
        
        // Actualizar invitations
        await updateReferences('invitations', 'invited_client_id', dupClient.id, mainClient.id);
        await updateReferences('invitations', 'registered_client_id', dupClient.id, mainClient.id);

        // Eliminar el duplicado
        const { error: deleteError } = await supabase
          .from('clients')
          .delete()
          .eq('id', dupClient.id);

        if (deleteError) {
          console.error(`   ⚠️  Error al eliminar ${dupClient.id}:`, deleteError.message);
        } else {
          console.log(`   ✅ Eliminado exitosamente`);
          totalDeleted++;
        }
      }
      
      totalProcessed++;
    }

    console.log(`\n✅ Limpieza completada!`);
    console.log(`   - Emails procesados: ${totalProcessed}`);
    console.log(`   - Registros eliminados: ${totalDeleted}`);

    // Paso 4: Verificar que no queden duplicados
    console.log('\n🔍 Verificando que no queden duplicados...');
    const { data: remainingClients, error: verifyError } = await supabase
      .from('clients')
      .select('email');

    if (verifyError) {
      console.error('Error al verificar:', verifyError.message);
    } else {
      const emailCount = {};
      remainingClients.forEach(c => {
        if (c.email) {
          emailCount[c.email] = (emailCount[c.email] || 0) + 1;
        }
      });
      
      const remainingDuplicates = Object.entries(emailCount).filter(([email, count]) => count > 1);
      
      if (remainingDuplicates.length === 0) {
        console.log('✅ Verificación exitosa: No quedan duplicados\n');
      } else {
        console.log(`⚠️  Aún quedan ${remainingDuplicates.length} emails duplicados:\n`);
        remainingDuplicates.forEach(([email, count]) => {
          console.log(`   - ${email}: ${count} registros`);
        });
      }
    }

  } catch (error) {
    console.error('\n❌ Error durante la limpieza:', error.message);
    process.exit(1);
  }
}

async function updateReferences(tableName, columnName, oldId, newId) {
  try {
    const { error } = await supabase
      .from(tableName)
      .update({ [columnName]: newId })
      .eq(columnName, oldId);

    if (error) {
      // Ignorar error si la tabla no existe
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return;
      }
      console.error(`      ⚠️  Error actualizando ${tableName}:`, error.message);
    }
  } catch (err) {
    // Ignorar errores de tablas que no existen
    if (!err.message.includes('does not exist')) {
      console.error(`      ⚠️  Error en ${tableName}:`, err.message);
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  cleanupDuplicateClients()
    .then(() => {
      console.log('\n🏁 Script finalizado');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { cleanupDuplicateClients };
