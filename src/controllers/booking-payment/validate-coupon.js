/**
 * Validate Coupon
 * Validates a coupon code for a given therapist and amount
 */

const { AppError } = require('../../middleware/errorHandler');
const { supabase } = require('../../config/supabase');

const validateCoupon = async (req, res, next) => {
  const { couponCode, therapistId, amount } = req.body;

  if (!couponCode || !therapistId) {
    return next(new AppError('couponCode y therapistId son requeridos', 400));
  }

  // Obtener el perfil del terapeuta para acceder a pricing_packages.coupons
  const { data: profile, error } = await supabase
    .from('therapist_profiles')
    .select('pricing_packages')
    .eq('user_id', therapistId)
    .single();

  if (error || !profile) {
    return next(new AppError('Terapeuta no encontrado', 404));
  }

  const coupons = profile.pricing_packages?.coupons || [];
  const coupon = coupons.find(
    (c) => c.code?.toUpperCase() === couponCode.toUpperCase()
  );

  if (!coupon) {
    return res.status(404).json({ success: false, error: 'Cupón no encontrado' });
  }

  if (!coupon.isActive) {
    return res.status(400).json({ success: false, error: 'El cupón no está activo' });
  }

  const now = new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    return res.status(400).json({ success: false, error: 'El cupón aún no es válido' });
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    return res.status(400).json({ success: false, error: 'El cupón ha expirado' });
  }

  if (coupon.minAmount && amount && parseFloat(amount) < parseFloat(coupon.minAmount)) {
    return res.status(400).json({
      success: false,
      error: `El importe mínimo para este cupón es €${coupon.minAmount}`,
    });
  }

  // Calcular descuento
  const totalAmount = parseFloat(amount) || 0;
  let discountAmount = 0;

  if (coupon.discountType === 'percentage') {
    discountAmount = totalAmount * (coupon.discountValue / 100);
  } else {
    discountAmount = parseFloat(coupon.discountValue);
  }

  if (discountAmount > totalAmount) discountAmount = totalAmount;

  return res.json({
    success: true,
    data: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      description: coupon.description,
    },
  });
};

module.exports = { validateCoupon };
