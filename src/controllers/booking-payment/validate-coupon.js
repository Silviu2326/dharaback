/**
 * Validate Coupon
 * Validates a coupon code for a given therapist and amount
 */

const { AppError } = require('../../middleware/errorHandler');
const { supabase } = require('../../config/supabase');

/**
 * Returns the number of completed/upcoming bookings a client has with a therapist.
 * Used to enforce onlyNewClients and firstSessionOnly conditions.
 */
const getClientBookingCount = async (clientId, therapistId) => {
  if (!clientId) return null; // unknown client, skip check

  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('therapist_id', therapistId)
    .in('status', ['completed', 'upcoming', 'pending', 'client_arrived']);

  if (error) return null; // if we can't query, skip the restriction
  return count ?? 0;
};

/**
 * Returns how many times a specific client has used a coupon code
 * with a given therapist (tracked via bookings.coupon_code).
 */
const getClientCouponUsageCount = async (clientId, therapistId, couponCode) => {
  if (!clientId) return 0;

  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('therapist_id', therapistId)
    .eq('coupon_code', couponCode.toUpperCase());

  if (error) return 0;
  return count ?? 0;
};

const validateCoupon = async (req, res, next) => {
  const { couponCode, therapistId, amount, clientId } = req.body;

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

  // ── Condiciones de uso ─────────────────────────────────────────────────────

  // Solo nuevos clientes: el cliente no debe tener ninguna reserva previa
  if (coupon.onlyNewClients) {
    const bookingCount = await getClientBookingCount(clientId, therapistId);
    if (bookingCount !== null && bookingCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Este cupón es exclusivo para nuevos clientes',
      });
    }
  }

  // Solo primera sesión: igual que onlyNewClients pero más explícito
  if (coupon.firstSessionOnly) {
    const bookingCount = await getClientBookingCount(clientId, therapistId);
    if (bookingCount !== null && bookingCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Este cupón solo es válido para la primera sesión',
      });
    }
  }

  // Máximo de usos por cliente
  if (coupon.maxUsesPerClient) {
    const usageCount = await getClientCouponUsageCount(clientId, therapistId, coupon.code);
    if (usageCount >= parseInt(coupon.maxUsesPerClient)) {
      return res.status(400).json({
        success: false,
        error: `Has alcanzado el límite de ${coupon.maxUsesPerClient} uso(s) de este cupón`,
      });
    }
  }

  // ── Calcular descuento ─────────────────────────────────────────────────────
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
      conditions: {
        onlyNewClients: coupon.onlyNewClients || false,
        firstSessionOnly: coupon.firstSessionOnly || false,
        maxUsesPerClient: coupon.maxUsesPerClient || null,
      },
    },
  });
};

module.exports = { validateCoupon };
