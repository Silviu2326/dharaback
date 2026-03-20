/**
 * Availability Controller - Migrado a Supabase
 */
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabase');
const { User, AvailabilitySlot, Booking } = require('../models');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Formatea un slot de Supabase a la forma esperada por el frontend
 */
const formatSlot = (row) => ({
  id:         row.id,
  therapistId: row.therapistId,
  title:      row.title || 'Disponible',
  startDate:  row.valid_from   || null,
  endDate:    row.valid_until  || null,
  startTime:  row.start_time,
  endTime:    row.end_time,
  dayOfWeek:  row.day_of_week,
  location:   row.location     || 'online',
  color:      row.color        || 'sage',
  repeat:     row.repeat       || 'none',
  notes:      row.notes        || null,
  timezone:   row.timezone     || 'Europe/Madrid',
  type:       'availability',
  isActive:   row.is_available !== false,
  durationMinutes: row.slot_duration || null,
  createdAt:  row.created_at,
  updatedAt:  row.updated_at
});

// ─────────────────────────────────────────────────────────────
// RUTAS PÚBLICAS
// ─────────────────────────────────────────────────────────────

// @desc  Get therapist availability for a date range
// @route GET /api/availability/therapist/:therapistId
// @access Public
const getTherapistAvailability = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new AppError('Start date and end date are required', 400));
  }

  // Verify therapist
  const therapist = await User.findById(therapistId);
  if (!therapist || therapist.role !== 'therapist' || !therapist.isActive) {
    return next(new AppError('Therapist not found or not available', 404));
  }

  // Get availability slots for range
  // Filter slots that overlap with the requested date range
  const { data: slots, error } = await supabase
    .from('availability_slots')
    .select('*')
    .eq('therapist_id', therapistId)
    .eq('is_available', true)
    .or(`and(valid_from.is.null,valid_until.is.null),and(valid_from.lte.${endDate},valid_until.is.null),and(valid_from.is.null,valid_until.gte.${startDate}),and(valid_from.lte.${endDate},valid_until.gte.${startDate})`)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching availability:', error.message);
    return next(new AppError('Error fetching availability data', 500));
  }

  // Obtener ausencias del terapeuta en el rango de fechas
  console.log('[getTherapistAvailability] Fetching absences...');
  const { data: absences, error: absencesError } = await supabase
    .from('absences')
    .select('*')
    .eq('therapist_id', therapistId)
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .order('start_date', { ascending: true });

  if (absencesError) {
    console.error('[getTherapistAvailability] Error fetching absences:', absencesError.message);
  }

  console.log(`[getTherapistAvailability] Found ${(absences || []).length} absences`);

  // Formatear las ausencias para el frontend
  const formattedAbsences = (absences || []).map(row => ({
    id: row.id,
    title: row.reason || row.type || 'Ausencia',
    startDate: row.start_date,
    endDate: row.end_date,
    start_date: row.start_date,
    end_date: row.end_date,
    allDay: true,
    absenceType: row.type,
    type: 'absence',
    status: row.status
  }));

  res.status(200).json({
    success: true,
    data: {
      therapist: { id: therapist.id, name: therapist.name },
      slots: (slots || []).map(formatSlot),
      absences: formattedAbsences,
      exceptions: formattedAbsences, // Alias para compatibilidad
      total: (slots || []).length,
      totalAbsences: formattedAbsences.length
    }
  });
});

// @desc  Get available slots for a specific date
// @route GET /api/availability/therapist/:therapistId/date/:date
// @access Public
const getAvailableSlotsForDate = asyncHandler(async (req, res, next) => {
  const { therapistId, date } = req.params;
  const { sessionDuration = 60 } = req.query;

  console.log('\n═══════════════════════════════════════════════════');
  console.log('🔍 getAvailableSlotsForDate: Buscando slots disponibles');
  console.log('═══════════════════════════════════════════════════');
  console.log('📋 Parámetros:');
  console.log('   - TherapistId:', therapistId);
  console.log('   - Fecha:', date);
  console.log('   - SessionDuration:', sessionDuration, 'minutos');

  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    console.log('❌ ERROR: Formato de fecha inválido');
    return next(new AppError('Invalid date format', 400));
  }

  const dayOfWeek = targetDate.getDay(); // 0 = domingo
  console.log('   - DayOfWeek:', dayOfWeek);

  // DEBUG: Primero consultar TODOS los slots del terapeuta sin filtros
  console.log('\n📡 DEBUG: Consultando TODOS los slots del terapeuta...');
  const { data: allSlotsDebug, error: debugError } = await supabase
    .from('availability_slots')
    .select('*')
    .eq('therapist_id', therapistId);

  if (debugError) {
    console.error('❌ Error en debug query:', debugError.message);
  } else {
    console.log('✅ Total slots del terapeuta (sin filtros):', (allSlotsDebug || []).length);
    if (allSlotsDebug && allSlotsDebug.length > 0) {
      console.log('📊 Datos de los slots:');
      allSlotsDebug.forEach((slot, idx) => {
        console.log(`   [${idx + 1}] ID:${slot.id} | ${slot.start_time}-${slot.end_time} | day_of_week:${slot.day_of_week} | is_available:${slot.is_available} | valid_from:${slot.valid_from} | valid_until:${slot.valid_until}`);
      });
    }
  }

  // PASO 1: Obtener slots de disponibilidad
  // Usar el mismo enfoque EXACTO que getTherapistTimeBlocks que sí funciona
  console.log('\n📡 PASO 1: Consultando availability_slots...');
  console.log('   Usando MISMO enfoque que getTherapistTimeBlocks');

  let query = supabase
    .from('availability_slots')
    .select('*')
    .eq('therapist_id', therapistId)
    .eq('is_available', true);

  // Calcular rango de fechas (2 meses desde la fecha solicitada)
  const checkDate = new Date(date);
  const startDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), 1).toISOString().split('T')[0];
  const endDate = new Date(checkDate.getFullYear(), checkDate.getMonth() + 2, 0).toISOString().split('T')[0];
  
  console.log('   - Rango de búsqueda:', startDate, 'hasta', endDate);

  // Usar el mismo filtro exacto que getTherapistTimeBlocks
  query = query
    .or(`and(valid_from.is.null,valid_until.is.null),and(valid_from.lte.${endDate},valid_until.is.null),and(valid_from.is.null,valid_until.gte.${startDate}),and(valid_from.lte.${endDate},valid_until.gte.${startDate})`);

  query = query
    .order('valid_from', { ascending: true })
    .order('start_time', { ascending: true });

  console.log('   - Ejecutando query...');
  const { data: allSlots, error: slotsError } = await query;

  if (slotsError) {
    console.error('❌ Error consultando slots:', slotsError.message);
    return next(new AppError('Error fetching slots', 500));
  }

  console.log('✅ Slots encontrados en BD:', (allSlots || []).length);
  if (allSlots && allSlots.length > 0) {
    console.log('📊 Slots encontrados:');
    allSlots.forEach((slot, idx) => {
      console.log(`   [${idx + 1}] ${slot.start_time}-${slot.end_time} | day_of_week:${slot.day_of_week} | valid_from:${slot.valid_from} | valid_until:${slot.valid_until}`);
    });
  }

  // PASO 2: Filtrar slots por día de la semana (si tienen day_of_week configurado)
  // Si day_of_week es null, asumimos que aplica a todos los días (slots recurrentes)
  console.log('\n📡 PASO 2: Filtrando slots por día de la semana (dayOfWeek=' + dayOfWeek + ')...');
  const validSlots = (allSlots || []).filter(slot => {
    // Si no tiene day_of_week, aplica a cualquier día (recurrente)
    if (slot.day_of_week === null || slot.day_of_week === undefined) {
      console.log(`   ✅ Slot ${slot.start_time}-${slot.end_time}: día recurrente (day_of_week=null)`);
      return true;
    }
    // Si tiene day_of_week, debe coincidir
    const matches = slot.day_of_week === dayOfWeek;
    console.log(`   ${matches ? '✅' : '❌'} Slot ${slot.start_time}-${slot.end_time}: day_of_week=${slot.day_of_week} vs ${dayOfWeek}`);
    return matches;
  });

  console.log('✅ Slots válidos para el día:', validSlots.length);

  // PASO 3: Obtener citas existentes para esta fecha
  console.log('\n📡 PASO 3: Consultando citas existentes...');
  const { data: existingBookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('start_time, end_time, status')
    .eq('therapist_id', therapistId)
    .eq('date', date)
    .in('status', ['upcoming', 'pending', 'confirmed']);

  if (bookingsError) {
    console.error('❌ Error consultando citas:', bookingsError.message);
  }

  console.log('✅ Citas encontradas para esta fecha:', (existingBookings || []).length);
  if (existingBookings && existingBookings.length > 0) {
    existingBookings.forEach((booking, idx) => {
      console.log(`   [${idx + 1}] ${booking.start_time}-${booking.end_time} | Status: ${booking.status}`);
    });
  }

  // PASO 4: Restar horarios ocupados de los slots disponibles
  console.log('\n⚙️  PASO 4: Calculando slots libres...');
  const availableSlots = [];

  validSlots.forEach(slot => {
    console.log(`\n   Procesando slot: ${slot.start_time} - ${slot.end_time}`);

    // Convertir a minutos desde medianoche
    const [slotStartH, slotStartM] = slot.start_time.split(':').map(Number);
    const [slotEndH, slotEndM] = slot.end_time.split(':').map(Number);
    let currentMinutes = slotStartH * 60 + slotStartM;
    const slotEndMinutes = slotEndH * 60 + slotEndM;

    // Generar slots individuales
    while (currentMinutes + parseInt(sessionDuration) <= slotEndMinutes) {
      const startH = Math.floor(currentMinutes / 60);
      const startM = currentMinutes % 60;
      const endMinutes = currentMinutes + parseInt(sessionDuration);
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;

      const slotStartStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
      const slotEndStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

      // Verificar si este slot específico está ocupado por alguna cita
      const isBooked = (existingBookings || []).some(booking => {
        const bookingStart = booking.start_time;
        const bookingEnd = booking.end_time;

        // Hay solapamiento si:
        // El inicio del slot está dentro de la cita O el fin del slot está dentro de la cita
        const overlap = (
          (slotStartStr >= bookingStart && slotStartStr < bookingEnd) ||
          (slotEndStr > bookingStart && slotEndStr <= bookingEnd) ||
          (slotStartStr <= bookingStart && slotEndStr >= bookingEnd)
        );

        if (overlap) {
          console.log(`      ❌ ${slotStartStr}-${slotEndStr} SOLAPADO con cita ${bookingStart}-${bookingEnd}`);
        }

        return overlap;
      });

      if (!isBooked) {
        availableSlots.push({
          id: `${slot.id}_${slotStartStr}`,
          startTime: slotStartStr,
          endTime: slotEndStr,
          isAvailable: true,
          location: slot.location || 'online'
        });
        console.log(`      ✅ ${slotStartStr}-${slotEndStr} DISPONIBLE`);
      }

      currentMinutes += parseInt(sessionDuration);
    }
  });

  console.log('\n📊 RESULTADO FINAL:');
  console.log('   - Total slots disponibles:', availableSlots.length);
  console.log('   - Slots:', availableSlots.map(s => `${s.startTime}-${s.endTime}`).join(', ') || 'NINGUNO');
  console.log('═══════════════════════════════════════════════════\n');

  res.status(200).json({
    success: true,
    data: {
      date,
      dayOfWeek,
      slots: availableSlots
    }
  });
});

// @desc  Check if a specific slot is available
// @route POST /api/availability/check-slot
// @access Public
const checkSlotAvailability = asyncHandler(async (req, res, next) => {
  const { therapistId, date, startTime, endTime } = req.body;

  if (!therapistId || !date || !startTime || !endTime) {
    return next(new AppError('therapistId, date, startTime and endTime are required', 400));
  }

  // Check for existing bookings at this time
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, start_time, end_time')
    .eq('therapist_id', therapistId)
    .eq('date', date)
    .in('status', ['upcoming', 'pending', 'confirmed'])
    .lt('start_time', endTime)
    .gt('end_time', startTime);

  if (bookings && bookings.length > 0) {
    return res.status(200).json({ success: true, available: false, reason: 'Time slot already booked' });
  }

  res.status(200).json({ success: true, available: true, reason: 'Time slot is available' });
});

// @desc  Get therapist schedule
// @route GET /api/availability/therapist/:therapistId/schedule
// @access Public
const getTherapistSchedule = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;

  const therapist = await User.findById(therapistId);
  if (!therapist || !therapist.isActive) {
    return next(new AppError('Therapist not found', 404));
  }

  const { data: slots } = await supabase
    .from('availability_slots')
    .select('*')
    .eq('therapist_id', therapistId)
    .eq('is_available', true)
    .order('day_of_week')
    .order('start_time');

  // Agrupar por día
  const schedule = {};
  (slots || []).forEach(slot => {
    const day = slot.day_of_week;
    if (!schedule[day]) schedule[day] = [];
    schedule[day].push(formatSlot(slot));
  });

  res.status(200).json({
    success: true,
    data: {
      therapist: { id: therapist.id, name: therapist.name },
      schedule
    }
  });
});

// ─────────────────────────────────────────────────────────────
// RUTAS PROTEGIDAS (CRUD de bloques)
// ─────────────────────────────────────────────────────────────

// @desc  Check time block conflicts
// @route GET /api/availability/conflicts/check
// @access Private
const checkTimeBlockConflicts = asyncHandler(async (req, res, next) => {
  const { therapistId, start_time, end_time } = req.query;

  if (!therapistId || !start_time || !end_time) {
    return next(new AppError('therapistId, start_time and end_time are required', 400));
  }

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, date, status')
    .eq('therapist_id', therapistId)
    .in('status', ['upcoming', 'pending', 'confirmed'])
    .lt('start_time', end_time)
    .gt('end_time', start_time);

  const conflicts = (bookings || []).map(b => ({
    type: 'booking',
    id: b.id,
    startTime: b.start_time,
    endTime: b.end_time,
    date: b.date,
    status: b.status
  }));

  res.status(200).json({
    hasConflicts: conflicts.length > 0,
    conflicts
  });
});

// @desc  Check existing appointments
// @route GET /api/availability/appointments/check
// @access Private
const checkExistingAppointments = asyncHandler(async (req, res, next) => {
  const { therapistId, date, start_time, end_time } = req.query;

  if (!therapistId || !date) {
    return next(new AppError('therapistId and date are required', 400));
  }

  let query = supabase
    .from('bookings')
    .select('id, start_time, end_time, date, status, client_id')
    .eq('therapist_id', therapistId)
    .eq('date', date)
    .in('status', ['upcoming', 'pending', 'confirmed']);

  if (start_time && end_time) {
    query = query.lt('start_time', end_time).gt('end_time', start_time);
  }

  const { data: appointments } = await query;

  res.status(200).json(
    (appointments || []).map(a => ({
      id: a.id,
      startTime: a.start_time,
      endTime: a.end_time,
      date: a.date,
      clientId: a.client_id,
      status: a.status
    }))
  );
});

// @desc  Create new time block (slot de disponibilidad)
// @route POST /api/availability/blocks
// @access Private
const createTimeBlock = asyncHandler(async (req, res, next) => {
  const {
    therapistId,
    title,
    startDate,
    endDate,
    startTime,
    endTime,
    location,
    color,
    repeat,
    notes,
    timezone
  } = req.body;

  console.log('📝 Creating time block:', { therapistId, title, startDate, endDate, startTime, endTime });

  if (!therapistId || !startDate || !startTime || !endTime) {
    return next(new AppError('Missing required fields: therapistId, startDate, startTime, endTime', 400));
  }

  // Determinar el día de la semana del slot
  const dayOfWeek = new Date(startDate).getDay();

  // Calcular duración en minutos
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

  // Build base data with correct snake_case column names for Supabase
  const slotData = {
    therapist_id:  therapistId,     // Fixed: snake_case for Supabase
    day_of_week:   dayOfWeek,
    start_time:    startTime,
    end_time:      endTime,
    is_available:  true,
    location:      location || 'online',
    location_type: 'office',
    slot_duration: durationMinutes > 0 ? durationMinutes : 60,
    valid_from:    startDate,
    valid_until:   endDate || startDate
  };

  // Try to insert with all fields (some may not exist in older schemas)
  try {
    const fullSlotData = {
      ...slotData,
      // Extra fields that may exist in newer schema
      title:         title || 'Disponible',
      color:         color || 'sage',
      repeat:        repeat === 'never' ? 'none' : (repeat || 'none'),
      notes:         notes || null,
      timezone:      timezone || 'Europe/Madrid'
    };

    const { data, error } = await supabase
      .from('availability_slots')
      .insert(fullSlotData)
      .select()
      .single();

    if (error) {
      // If extra columns don't exist, retry with minimal data
      console.warn('⚠️  Insert with extra cols failed, retrying minimal:', error.message);
      
      const { data: data2, error: error2 } = await supabase
        .from('availability_slots')
        .insert(slotData)  // Use only the base fields with correct column names
        .select()
        .single();

      if (error2) {
        console.error('❌ Error creating time block:', error2.message);
        return next(new AppError(`Failed to create time block: ${error2.message}`, 500));
      }

      console.log('✅ Time block created (minimal):', data2.id);
      // Return formatted response including frontend fields
      return res.status(201).json(formatSlot({ 
        ...data2, 
        title: title || 'Disponible', 
        color: color || 'sage', 
        repeat: repeat || 'none', 
        notes: notes || null, 
        timezone: timezone || 'Europe/Madrid' 
      }));
    }

    console.log('✅ Time block created:', data.id);
    res.status(201).json(formatSlot(data));

  } catch (err) {
    console.error('❌ Unexpected error creating time block:', err.message);
    return next(new AppError(`Failed to create time block: ${err.message}`, 500));
  }
});

// @desc  Get time block by ID
// @route GET /api/availability/blocks/:id
// @access Private
const getTimeBlockById = asyncHandler(async (req, res, next) => {
  const { data, error } = await supabase
    .from('availability_slots')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    return next(new AppError('Time block not found', 404));
  }

  res.status(200).json(formatSlot(data));
});

// @desc  Update time block
// @route PUT /api/availability/blocks/:id
// @access Private
const updateTimeBlock = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const body = req.body;

  // Verificar que existe
  const { data: existing } = await supabase
    .from('availability_slots')
    .select('id')
    .eq('id', id)
    .single();

  if (!existing) {
    return next(new AppError('Time block not found', 404));
  }

  // Build update data - only columns that definitely exist in the table
  const updateData = {
    // Note: therapist_id should not be updated, it's the owner
    start_time:    body.startTime || existing.start_time,
    end_time:      body.endTime || existing.end_time,
    is_available:  body.isActive !== undefined ? body.isActive : existing.is_available,
    location:      body.location || existing.location,
    slot_duration: existing.slot_duration,
    valid_from:    body.startDate || existing.valid_from,
    valid_until:   body.endDate || existing.valid_until,
    day_of_week:   body.startDate ? new Date(body.startDate).getDay() : existing.day_of_week
  };

  try {
    // Try to update with all fields
    const fullUpdateData = {
      ...updateData,
      title:   body.title || existing.title,
      color:   body.color || existing.color,
      notes:   body.notes !== undefined ? body.notes : existing.notes,
      repeat:  body.repeat || existing.repeat || 'none'
    };

    const { data, error } = await supabase
      .from('availability_slots')
      .update(fullUpdateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // If columns don't exist, retry with basic columns only
      console.warn('⚠️ Update with extra cols failed, retrying minimal:', error.message);
      
      const { data: data2, error: error2 } = await supabase
        .from('availability_slots')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error2) {
        return next(new AppError(`Failed to update time block: ${error2.message}`, 500));
      }

      console.log('✅ Time block updated (minimal):', data2.id);
      return res.status(200).json(formatSlot({ ...data2, title: body.title, color: body.color, notes: body.notes }));
    }

    console.log('✅ Time block updated:', data.id);
    res.status(200).json(formatSlot(data));

  } catch (err) {
    return next(new AppError(`Failed to update time block: ${err.message}`, 500));
  }
});

// @desc  Delete time block
// @route DELETE /api/availability/blocks/:id
// @access Private
const deleteTimeBlock = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const { data: existing } = await supabase
    .from('availability_slots')
    .select('id')
    .eq('id', id)
    .single();

  if (!existing) {
    return next(new AppError('Time block not found', 404));
  }

  const { error } = await supabase
    .from('availability_slots')
    .delete()
    .eq('id', id);

  if (error) {
    return next(new AppError(`Failed to delete time block: ${error.message}`, 500));
  }

  res.status(200).json({ id, deleted: true });
});

// @desc  Get therapist time blocks
// @route GET /api/availability/therapist/:therapistId/blocks
// @access Private
const getTherapistTimeBlocks = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;
  const { startDate, endDate, isActive } = req.query;

  console.log('🔍 Fetching time blocks for therapist:', therapistId, { startDate, endDate });

  let query = supabase
    .from('availability_slots')
    .select('*')
    .eq('therapist_id', therapistId)
    .order('valid_from', { ascending: true })
    .order('start_time', { ascending: true });

  if (isActive !== 'false') {
    query = query.eq('is_available', true);
  }

  if (startDate && endDate) {
    // Filter slots that overlap with the requested date range
    // A slot overlaps if: valid_from <= endDate AND valid_until >= startDate
    // (with null handling for open-ended slots)
    query = query
      .or(`and(valid_from.is.null,valid_until.is.null),and(valid_from.lte.${endDate},valid_until.is.null),and(valid_from.is.null,valid_until.gte.${startDate}),and(valid_from.lte.${endDate},valid_until.gte.${startDate})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ Error fetching time blocks:', error.message);
    return next(new AppError('Error fetching time blocks', 500));
  }

  console.log('✅ Found time blocks:', (data || []).length);

  res.status(200).json((data || []).map(formatSlot));
});

// @desc  Bulk update time blocks
// @route POST /api/availability/bulk-update
// @access Private
const bulkUpdateTimeBlocks = asyncHandler(async (req, res, next) => {
  const { ids, updates } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError('No block IDs provided for bulk update', 400));
  }

  if (!updates || typeof updates !== 'object') {
    return next(new AppError('No updates provided', 400));
  }

  console.log('📝 Bulk updating time blocks:', { count: ids.length, updates });

  const results = {
    successful: [],
    failed: []
  };

  // Build update data with only allowed fields
  const updateData = {};
  const minimalUpdateData = {}; // Only columns that definitely exist
  
  // Map frontend field names to database column names
  if (updates.startTime !== undefined) {
    updateData.start_time = updates.startTime;
    minimalUpdateData.start_time = updates.startTime;
  }
  if (updates.endTime !== undefined) {
    updateData.end_time = updates.endTime;
    minimalUpdateData.end_time = updates.endTime;
  }
  if (updates.location !== undefined) {
    updateData.location = updates.location;
    minimalUpdateData.location = updates.location;
  }
  // These columns may not exist in older schemas
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.isActive !== undefined) {
    updateData.is_available = updates.isActive;
    minimalUpdateData.is_available = updates.isActive;
  }
  
  // Update all blocks in parallel
  const updatePromises = ids.map(async (id) => {
    try {
      // Verify block exists
      const { data: existing } = await supabase
        .from('availability_slots')
        .select('id, therapist_id')
        .eq('id', id)
        .single();

      if (!existing) {
        results.failed.push({ id, error: 'Block not found' });
        return;
      }

      // Try full update first
      let { data, error } = await supabase
        .from('availability_slots')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      // If extra columns don't exist, retry with minimal data
      if (error && Object.keys(minimalUpdateData).length > 0) {
        console.warn(`⚠️ Full update failed for ${id}, retrying minimal:`, error.message);
        const minimalResult = await supabase
          .from('availability_slots')
          .update(minimalUpdateData)
          .eq('id', id)
          .select()
          .single();
        
        data = minimalResult.data;
        error = minimalResult.error;
      }

      if (error) {
        console.error(`❌ Failed to update block ${id}:`, error.message);
        results.failed.push({ id, error: error.message });
      } else {
        console.log(`✅ Block updated:`, data.id);
        results.successful.push(formatSlot(data));
      }
    } catch (err) {
      console.error(`❌ Error updating block ${id}:`, err.message);
      results.failed.push({ id, error: err.message });
    }
  });

  await Promise.all(updatePromises);

  console.log('✅ Bulk update completed:', {
    successful: results.successful.length,
    failed: results.failed.length
  });

  res.status(200).json({
    success: true,
    message: `Updated ${results.successful.length} blocks`,
    data: results
  });
});

module.exports = {
  getTherapistAvailability,
  getAvailableSlotsForDate,
  checkSlotAvailability,
  getTherapistSchedule,
  checkTimeBlockConflicts,
  checkExistingAppointments,
  createTimeBlock,
  getTimeBlockById,
  updateTimeBlock,
  deleteTimeBlock,
  getTherapistTimeBlocks,
  bulkUpdateTimeBlocks
};
