const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabase');

/**
 * @desc    Check if client has active relation with therapist
 * @route   GET /api/client-therapists/check-relation
 * @access  Private (Client or Therapist)
 */
const checkClientTherapistRelation = asyncHandler(async (req, res, next) => {
  const { clientId, therapistId } = req.query;
  
  console.log('[checkClientTherapistRelation] Checking relation:', { clientId, therapistId });
  
  if (!clientId || !therapistId) {
    return next(new AppError('clientId y therapistId son requeridos', 400));
  }
  
  try {
    // Check relation in client_therapists
    const { data: relation, error } = await supabase
      .from('client_therapists')
      .select('id, status, payment_method, created_at')
      .eq('client_id', clientId)
      .eq('therapist_id', therapistId)
      .single();
    
    console.log('[checkClientTherapistRelation] Query result:', { relation, error });
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking relation:', error);
      return next(new AppError('Error al verificar relación', 500));
    }
    
    const hasRelation = relation && relation.status === 'active';
    
    res.status(200).json({
      success: true,
      data: {
        hasRelation,
        relation: hasRelation ? {
          id: relation.id,
          status: relation.status,
          paymentMethod: relation.payment_method || 'cash',
          createdAt: relation.created_at
        } : null,
        isNewClient: !hasRelation
      }
    });
  } catch (err) {
    console.error('Error in checkClientTherapistRelation:', err);
    return next(new AppError('Error al verificar relación', 500));
  }
});

module.exports = {
  checkClientTherapistRelation
};
