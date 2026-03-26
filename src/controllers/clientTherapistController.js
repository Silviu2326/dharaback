const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabase');

/**
 * @desc    Get client's payment method from client_therapists
 * @route   GET /api/client-therapists/:clientId/payment-method
 * @access  Private (Therapist only)
 */
const getClientPaymentMethod = asyncHandler(async (req, res, next) => {
  const { clientId } = req.params;
  const therapistId = req.user.id;

  console.log(`[getClientPaymentMethod] Getting payment method for client ${clientId} with therapist ${therapistId}`);

  const { data: relation, error } = await supabase
    .from('client_therapists')
    .select('payment_method, status')
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .single();

  if (error) {
    console.error('Error fetching client payment method:', error);
    return next(new AppError('No se pudo obtener el método de pago del cliente', 500));
  }

  if (!relation) {
    return next(new AppError('No se encontró relación cliente-terapeuta', 404));
  }

  res.status(200).json({
    success: true,
    data: {
      paymentMethod: relation.payment_method || 'cash',
      status: relation.status
    }
  });
});

/**
 * @desc    Update client's payment method in client_therapists
 * @route   PUT /api/client-therapists/:clientId/payment-method
 * @access  Private (Therapist only)
 */
const updateClientPaymentMethod = asyncHandler(async (req, res, next) => {
  const { clientId } = req.params;
  const { paymentMethod } = req.body;
  const therapistId = req.user.id;

  console.log(`[updateClientPaymentMethod] Updating payment method for client ${clientId} to ${paymentMethod}`);

  // Validate payment method
  const validMethods = ['cash', 'card', 'transfer', 'stripe', 'other'];
  if (!paymentMethod || !validMethods.includes(paymentMethod)) {
    return next(new AppError('Método de pago inválido', 400));
  }

  // Update payment method
  const { data: relation, error } = await supabase
    .from('client_therapists')
    .update({ 
      payment_method: paymentMethod,
      updated_at: new Date().toISOString()
    })
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) {
    console.error('Error updating client payment method:', error);
    return next(new AppError('No se pudo actualizar el método de pago', 500));
  }

  if (!relation) {
    return next(new AppError('No se encontró relación cliente-terapeuta', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Método de pago actualizado exitosamente',
    data: {
      paymentMethod: relation.payment_method,
      status: relation.status
    }
  });
});

module.exports = {
  getClientPaymentMethod,
  updateClientPaymentMethod
};
