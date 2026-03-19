/**
 * Script para diagnosticar problemas con mensajes del terapeuta
 * Ejecutar en la consola del backend para verificar:
 * 1. Si la tabla messages existe
 * 2. Si hay mensajes del terapeuta en la base de datos
 * 3. Cuál es el error exacto al guardar mensajes
 */

require('dotenv').config();

const { supabase } = require('./src/config/supabase');

async function diagnoseChatIssues() {
  console.log('🔍 DIAGNÓSTICO DEL CHAT\n');
  
  // 1. Verificar si la tabla messages existe
  console.log('1. Verificando tabla messages...');
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ Error al acceder a tabla messages:', error.message);
    } else {
      console.log('✅ Tabla messages existe');
      console.log('   Total de mensajes:', data);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
  
  // 2. Verificar mensajes por tipo de remitente
  console.log('\n2. Contando mensajes por tipo de remitente...');
  try {
    const { data: therapistMessages, error: therapistError } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('sender_type', 'therapist');
    
    const { data: clientMessages, error: clientError } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('sender_type', 'client');
    
    if (therapistError) {
      console.error('❌ Error contando mensajes del terapeuta:', therapistError.message);
    } else {
      console.log('✅ Mensajes del terapeuta:', therapistMessages?.length || 0);
    }
    
    if (clientError) {
      console.error('❌ Error contando mensajes del cliente:', clientError.message);
    } else {
      console.log('✅ Mensajes del cliente:', clientMessages?.length || 0);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
  
  // 3. Verificar mensajes recientes
  console.log('\n3. Últimos 10 mensajes:');
  try {
    const { data: recentMessages, error } = await supabase
      .from('messages')
      .select('id, sender_id, sender_type, content, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Error:', error.message);
    } else if (recentMessages && recentMessages.length > 0) {
      recentMessages.forEach((msg, i) => {
        console.log(`   ${i + 1}. [${msg.sender_type}] ${msg.content?.substring(0, 30)}... (${msg.created_at})`);
      });
    } else {
      console.log('   No hay mensajes');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
  
  // 4. Verificar conversaciones
  console.log('\n4. Verificando conversaciones...');
  try {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, therapist_id, client_id, status')
      .limit(5);
    
    if (error) {
      console.error('❌ Error:', error.message);
    } else if (conversations && conversations.length > 0) {
      console.log('✅ Conversaciones encontradas:', conversations.length);
      conversations.forEach((conv, i) => {
        console.log(`   ${i + 1}. ID: ${conv.id}, Therapist: ${conv.therapist_id}, Client: ${conv.client_id}`);
      });
    } else {
      console.log('   No hay conversaciones');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
  
  console.log('\n✅ Diagnóstico completado');
}

diagnoseChatIssues().catch(console.error);
