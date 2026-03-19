// Script para limpiar mensajes locales de la base de datos
require('dotenv').config();

const { supabase } = require('./src/config/supabase');

async function cleanupLocalMessages() {
  console.log('🧹 LIMPIANDO MENSAJES LOCALES DE LA BASE DE DATOS\n');
  
  try {
    // Buscar mensajes con _localOnly o _errorFallback
    console.log('1. Buscando mensajes locales...');
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, content, metadata, sender_id, created_at')
      .or('metadata->>_localOnly.eq.true,metadata->>_errorFallback.eq.true');
    
    if (error) {
      console.error('❌ Error buscando mensajes:', error.message);
      return;
    }
    
    if (!messages || messages.length === 0) {
      console.log('✅ No hay mensajes locales para limpiar');
      return;
    }
    
    console.log(`🗑️  Encontrados ${messages.length} mensajes locales:`);
    messages.forEach(msg => {
      console.log(`   - ID: ${msg.id}, Content: "${msg.content?.substring(0, 30)}..."`);
    });
    
    // Eliminar mensajes locales
    console.log('\n2. Eliminando mensajes locales...');
    const messageIds = messages.map(m => m.id);
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .in('id', messageIds);
    
    if (deleteError) {
      console.error('❌ Error eliminando mensajes:', deleteError.message);
      return;
    }
    
    console.log(`✅ Eliminados ${messages.length} mensajes locales`);
    
    // Verificar conteo final
    console.log('\n3. Verificando mensajes restantes...');
    const { count, error: countError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Error contando mensajes:', countError.message);
    } else {
      console.log(`✅ Total de mensajes en BD: ${count}`);
    }
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
  
  console.log('\n✅ Limpieza completada');
}

cleanupLocalMessages().catch(console.error);
