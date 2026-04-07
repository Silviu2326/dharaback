const { supabase } = require('../config/supabase');

/**
 * Valida formato NIF/NIE español.
 * NIF: 8 dígitos + letra
 * NIE: X/Y/Z + 7 dígitos + letra
 */
function validarNIF(nif) {
  if (!nif) return false;
  const clean = nif.trim().toUpperCase();
  return /^[0-9]{8}[A-Z]$/.test(clean) || /^[XYZ][0-9]{7}[A-Z]$/.test(clean);
}

/**
 * Genera número de ticket correlativo por terapeuta.
 * Formato: DH-2026-000123
 * Delega el incremento atómico a la función SQL generar_numero_ticket().
 */
async function generarNumeroTicket(therapistId) {
  const { data, error } = await supabase.rpc('generar_numero_ticket', {
    p_therapist_id: therapistId
  });

  if (error) {
    throw new Error('Error al generar número de ticket: ' + error.message);
  }

  return data;
}

/**
 * Genera número de factura correlativo por terapeuta.
 * Formato: DH-F-2026-000045
 */
async function generarNumeroFactura(therapistId) {
  const { data, error } = await supabase.rpc('generar_numero_factura', {
    p_therapist_id: therapistId
  });

  if (error) {
    throw new Error('Error al generar número de factura: ' + error.message);
  }

  return data;
}

/**
 * Reset anual de contadores. Llamar desde cron job el 1 de enero.
 * En Supabase puedes programarlo en: Project > Database > Cron Jobs
 *   Schedule: 0 0 1 1 *
 *   Command:  SELECT resetear_contadores_anuales();
 */
async function resetearContadoresAnuales() {
  const { data, error } = await supabase.rpc('resetear_contadores_anuales');

  if (error) {
    throw new Error('Error al resetear contadores: ' + error.message);
  }

  return data; // número de terapeutas afectados
}

module.exports = {
  validarNIF,
  generarNumeroTicket,
  generarNumeroFactura,
  resetearContadoresAnuales
};
