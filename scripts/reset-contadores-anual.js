#!/usr/bin/env node

/**
 * Script standalone para resetear contadores de facturación anualmente.
 * Este script puede ejecutarse desde un cron job del sistema operativo.
 * 
 * Configuración de cron (crontab):
 * 0 0 1 1 * /usr/bin/node /path/a/reset-contadores-anual.js
 * 
 * O mediante un servicio externo como GitHub Actions, Vercel Cron, etc.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetearContadoresAnuales() {
  const nuevoAnio = new Date().getFullYear().toString();
  
  console.log(`🔄 [reset-contadores] Iniciando reset para el año ${nuevoAnio}...`);

  try {
    const { data, error } = await supabase.rpc('resetear_contadores_anuales');

    if (error) {
      console.error('❌ Error al ejecutar resetear_contadores_anuales:', error);
      process.exit(1);
    }

    console.log(`✅ [reset-contadores] Reset completado. Terapeutas afectados: ${data}`);
    console.log(`📅 Nueva serie: ${nuevoAnio}`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error inesperado:', err);
    process.exit(1);
  }
}

async function verificarEstado() {
  const currentYear = new Date().getFullYear().toString();
  
  console.log(`🔍 [reset-contadores] Verificando estado de contadores...`);

  try {
    const { data: profiles, error } = await supabase
      .from('professional_profiles')
      .select('user_id, datos_facturacion')
      .not('datos_facturacion', 'is', null);

    if (error) throw error;

    const summary = (profiles || []).map(p => ({
      userId: p.user_id,
      serieActual: p.datos_facturacion?.serieActual || 'sin datos',
      contadorTickets: p.datos_facturacion?.contadorTickets || 0,
      contadorFacturas: p.datos_facturacion?.contadorFacturas || 0
    }));

    const needReset = summary.filter(s => s.serieActual !== currentYear);

    console.log(`📊 Total terapeutas: ${summary.length}`);
    console.log(`📊 Serie actual del sistema: ${currentYear}`);
    console.log(`📊 Necesitan reset: ${needReset.length}`);

    if (needReset.length > 0) {
      console.log('\n⚠️ Terapeutas con serie desactualizada:');
      needReset.forEach(t => console.log(`  - ${t.userId}: ${t.serieActual}`));
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error al verificar estado:', err);
    process.exit(1);
  }
}

// Ejecutar según argumento
const args = process.argv.slice(2);
const command = args[0] || 'reset';

if (command === 'status') {
  verificarEstado();
} else if (command === 'reset') {
  resetearContadoresAnuales();
} else {
  console.log('Uso: node reset-contadores-anual.js [status|reset]');
  process.exit(1);
}