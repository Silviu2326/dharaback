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
/**
 * Returns whether the client is considered "existing" for this therapist.
 * Checks both:
 *  1. client_therapists relation (primary — used by get-permissions.js for the same logic)
 *  2. bookings table (fallback)
 * Returns null only if clientId is missing (skip restriction).
 * Returns a number >= 0 otherwise (0 = new, >0 = existing).
 */
const getClientBookingCount = async (clientId, therapistId) => {
  console.log(`[COUPON] getClientBookingCount → clientId=${clientId}, therapistId=${therapistId}`);
  if (!clientId) {
    console.log('[COUPON] clientId es null/undefined → saltando verificación (retorna null)');
    return null; // unknown client, skip check
  }

  // ── 1. Check client_therapists (same source as get-permissions.js) ──────────
  const { data: relation, error: ctError } = await supabase
    .from('client_therapists')
    .select('id, status')
    .eq('client_id', clientId)
    .eq('therapist_id', therapistId)
    .single();

  console.log(`[COUPON] client_therapists → relation=${JSON.stringify(relation)}, error=${ctError?.code}`);

  if (!ctError && relation) {
    console.log(`[COUPON] client_therapists → status="${relation.status}", id=${relation.id}`);
    if (relation.status === 'active') {
      console.log(`[COUPON] Relación ACTIVA → cliente NO es nuevo, retorna 1`);
      return 1;
    }
    console.log(`[COUPON] Relación encontrada pero status="${relation.status}" (no activa) → continúa a bookings`);
  } else {
    console.log(`[COUPON] client_therapists → sin relación (ctError.code=${ctError?.code}) → continúa a bookings`);
  }

  // ── 2. Check bookings table (source of truth for actual sessions) ─────────────
  const { data: bookingsData, count, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, status', { count: 'exact' })
    .eq('client_id', clientId)
    .eq('therapist_id', therapistId)
    .in('status', ['completed', 'upcoming', 'pending', 'client_arrived']);

  if (bookingsError) {
    console.log('[COUPON] Error consultando bookings:', bookingsError.message, '→ retorna null');
    return null;
  }
  console.log(`[COUPON] Reservas en bookings table: count=${count}, registros=${JSON.stringify(bookingsData?.map(b => ({ id: b.id, status: b.status })))}`);
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
  const { couponCode, therapistId, amount } = req.body;
  // Always use the authenticated user's ID — never trust clientId from the body
  const clientId = req.user?.id ?? null;

  console.log(`[COUPON] ── Iniciando validación ──`);
  console.log(`[COUPON] couponCode=${couponCode}, therapistId=${therapistId}, amount=${amount}`);
  console.log(`[COUPON] clientId desde req.user=${clientId}`);

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
  console.log(`[COUPON] Cupones del terapeuta: ${coupons.length}`);

  const coupon = coupons.find(
    (c) => c.code?.toUpperCase() === couponCode.toUpperCase()
  );

  if (!coupon) {
    return res.status(404).json({ success: false, error: 'Cupón no encontrado' });
  }

  console.log(`[COUPON] Cupón encontrado:`, JSON.stringify({
    code: coupon.code,
    isActive: coupon.isActive,
    onlyNewClients: coupon.onlyNewClients,
    firstSessionOnly: coupon.firstSessionOnly,
    maxUsesPerClient: coupon.maxUsesPerClient,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
  }));

  console.log(`[COUPON] ── CHECK isActive=${coupon.isActive} ──`);
  if (!coupon.isActive) {
    console.log(`[COUPON] RECHAZADO: cupón inactivo`);
    return res.status(400).json({ success: false, error: 'El cupón no está activo' });
  }

  const now = new Date();
  console.log(`[COUPON] ── CHECK fechas → now=${now.toISOString()}, validFrom=${coupon.validFrom ?? 'null'}, validUntil=${coupon.validUntil ?? 'null'} ──`);
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    console.log(`[COUPON] RECHAZADO: cupón aún no válido (validFrom=${coupon.validFrom})`);
    return res.status(400).json({ success: false, error: 'El cupón aún no es válido' });
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    console.log(`[COUPON] RECHAZADO: cupón expirado (validUntil=${coupon.validUntil})`);
    return res.status(400).json({ success: false, error: 'El cupón ha expirado' });
  }

  console.log(`[COUPON] ── CHECK minAmount=${coupon.minAmount ?? 'null'}, amount=${amount} ──`);
  if (coupon.minAmount && amount && parseFloat(amount) < parseFloat(coupon.minAmount)) {
    console.log(`[COUPON] RECHAZADO: importe insuficiente (${amount} < ${coupon.minAmount})`);
    return res.status(400).json({
      success: false,
      error: `El importe mínimo para este cupón es €${coupon.minAmount}`,
    });
  }

  // ── Condiciones de uso ─────────────────────────────────────────────────────
  console.log(`[COUPON] ── CHECK condiciones → onlyNewClients=${coupon.onlyNewClients}, firstSessionOnly=${coupon.firstSessionOnly}, maxUsesPerClient=${coupon.maxUsesPerClient} ──`);

  if (coupon.onlyNewClients) {
    const bookingCount = await getClientBookingCount(clientId, therapistId);
    console.log(`[COUPON] onlyNewClients check → bookingCount=${bookingCount}`);
    if (bookingCount !== null && bookingCount > 0) {
      console.log(`[COUPON] RECHAZADO: cliente tiene ${bookingCount} reservas, no es nuevo cliente`);
      return res.status(400).json({
        success: false,
        error: 'Este cupón es exclusivo para nuevos clientes',
      });
    }
    console.log(`[COUPON] onlyNewClients: check pasado`);
  }

  if (coupon.firstSessionOnly) {
    const bookingCount = await getClientBookingCount(clientId, therapistId);
    console.log(`[COUPON] firstSessionOnly check → bookingCount=${bookingCount}`);
    if (bookingCount !== null && bookingCount > 0) {
      console.log(`[COUPON] RECHAZADO: cliente tiene ${bookingCount} reservas, no es primera sesión`);
      return res.status(400).json({
        success: false,
        error: 'Este cupón solo es válido para la primera sesión',
      });
    }
    console.log(`[COUPON] firstSessionOnly: check pasado`);
  }

  if (coupon.maxUsesPerClient) {
    const usageCount = await getClientCouponUsageCount(clientId, therapistId, coupon.code);
    console.log(`[COUPON] maxUsesPerClient check → usageCount=${usageCount}, límite=${coupon.maxUsesPerClient}`);
    if (usageCount >= parseInt(coupon.maxUsesPerClient)) {
      console.log(`[COUPON] RECHAZADO: límite de usos por cliente alcanzado (usageCount=${usageCount} >= ${coupon.maxUsesPerClient})`);
      return res.status(400).json({
        success: false,
        error: `Has alcanzado el límite de ${coupon.maxUsesPerClient} uso(s) de este cupón`,
      });
    }
    console.log(`[COUPON] maxUsesPerClient: check pasado (usageCount=${usageCount})`);
  }

  console.log(`[COUPON] ✅ Cupón VÁLIDO, aplicando descuento`);

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
