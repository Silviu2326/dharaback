const express = require('express');
const { protect, requireAdmin } = require('../middleware/auth');
const billingService = require('../services/billingService');

const router = express.Router();

/**
 * @desc    Resetear contadores de facturación manualmente (admin)
 * @route   POST /api/billing/reset-contadores
 * @access  Admin only
 */
router.post('/reset-contadores', protect, requireAdmin, async (req, res) => {
  try {
    console.log('🔄 [reset-contadores] Iniciando reset anual de contadores...');
    
    const afectados = await billingService.resetearContadoresAnuales();
    
    console.log('✅ [reset-contadores] Contadores reseteados:', afectados);
    
    res.json({
      success: true,
      message: `Contadores de facturación reseteados para ${afectados} terapeutas`,
      data: {
        afectados
      }
    });
  } catch (error) {
    console.error('❌ [reset-contadores] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al resetear contadores'
    });
  }
});

/**
 * @desc    Verificar estado actual de contadores de facturación
 * @route   GET /api/billing/status
 * @access  Admin only
 */
router.get('/status', protect, requireAdmin, async (req, res) => {
  try {
    const { supabase } = require('../config/supabase');
    
    const { data: profiles, error } = await supabase
      .from('professional_profiles')
      .select('user_id, datos_facturacion')
      .not('datos_facturacion', 'is', null);

    if (error) throw error;

    const summary = (profiles || []).map(p => ({
      userId: p.user_id,
      contadorTickets: p.datos_facturacion?.contadorTickets || 0,
      contadorFacturas: p.datos_facturacion?.contadorFacturas || 0,
      serieActual: p.datos_facturacion?.serieActual || new Date().getFullYear().toString()
    }));

    const currentYear = new Date().getFullYear().toString();
    const needReset = summary.filter(s => s.serieActual !== currentYear);

    res.json({
      success: true,
      data: {
        totalTerapeutas: summary.length,
        serieActual: currentYear,
        necesitanReset: needReset.length,
        terapeutas: summary
      }
    });
  } catch (error) {
    console.error('❌ [billing-status] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener estado de facturación'
    });
  }
});

module.exports = router;