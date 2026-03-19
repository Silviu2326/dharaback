// Script para limpiar mensajes locales de la base de datos
require('dotenv').config();

const { supabase } = require('./src/config/supabase');

async function cleanupLocalMessages() {
  console.log('🧹 LIMPIANDO MENSAJES LOCALES DE LA BASE DE DATOS\n');
  
  try {
    // Primero, veamos todos los mensajes para entender la estructura
    console.log('1. Buscando TODOS los mensajes...');
    const { data: allMessages, error: allError } = await supabase
      .from('messages')
      .select('id, content, sender_id, metadata, created_at')
      .limit(20);
    
    if (allError) {
      console.error('❌ Error buscando mensajes:', allError.message);
      return;
    }
    
    console.log(`📊 Total mensajes en BD: ${allMessages?.length || 0}`);
    
    if (allMessages && allMessages.length > 0) {
      console.log('\n📋 Mensajes encontrados:');
      allMessages.forEach(msg => {
        const isLocal = msg.metadata?._localOnly || msg.metadata?._errorFallback;
        const type = isLocal ? 'LOCAL' : 'REAL';
        console.log(`   [${type}] ID: ${msg.id.substring(0, 20)}... Content: "${msg.content?.substring(0, 30)}" Metadata:`, JSON.stringify(msg.metadata)?.substring(0, 50));
      });
      
      // Filtrar mensajes locales
      const localMessages = allMessages.filter(msg => 
        msg.metadata?._localOnly === true || 
        msg.metadata?._errorFallback === true ||
        msg.id?.startsWith('msg-') && msg.id?.length > 30 // IDs temporales largos
      );
      
      if (localMessages.length === 0) {
        console.log('\n✅ No se encontraron mensajes locales para limpiar');
        return;
      }
      
      console.log(`\n🗑️  Encontrados ${localMessages.length} mensajes locales para eliminar:`);
      localMessages.forEach(msg => {
        console.log(`   - ${msg.id}: "${msg.content?.substring(0, 40)}"`);
      });
      
      // Eliminar mensajes locales
      console.log('\n2. Eliminando mensajes locales...');
      for (const msg of localMessages) {
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .eq('id', msg.id);
        
        if (deleteError) {
          console.error(`   ❌ Error eliminando ${msg.id}:`, deleteError.message);
        } else {
          console.log(`   ✅ Eliminado: ${msg.id}`);
        }
      }
      
      console.log('\n✅ Limpieza completada');
      
      // Verificar conteo final
      const { count, error: countError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });
      
      if (!countError) {
        console.log(`📊 Total de mensajes restantes: ${count}`);
      }
    }
    
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e.stack);
  }
}

cleanupLocalMessages().catch(console.error);
