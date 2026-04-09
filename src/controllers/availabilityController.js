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

  

  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    
    return next(new AppError('Invalid date format', 400));
  }

  const dayOfWeek = targetDate.getDay(); // 0 = domingo

  

  // PASO 1: Obtener slots de disponibilidad
  // Usar el mismo enfoque EXACTO que getTherapistTimeBlocks que sí funciona

  let query = supabase
    .from('availability_slots')
    .select('*')
    .eq('therapist_id', therapistId)
    .eq('is_available', true);

  // Calcular rango de fechas (2 meses desde la fecha solicitada)
  const checkDate = new Date(date);
  const startDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), 1).toISOString().split('T')[0];
  const endDate = new Date(checkDate.getFullYear(), checkDate.getMonth() + 2, 0).toISOString().split('T')[0];
  
  

  // Usar el mismo filtro exacto que getTherapistTimeBlocks
  query = query
    .or(`and(valid_from.is.null,valid_until.is.null),and(valid_from.lte.${endDate},valid_until.is.null),and(valid_from.is.null,valid_until.gte.${startDate}),and(valid_from.lte.${endDate},valid_until.gte.${startDate})`);

  query = query
    .order('valid_from', { ascending: true })
    .order('start_time', { ascending: true });

  const { data: allSlots, error: slotsError } = await query;

  if (slotsError) {
    console.error('❌ Error consultando slots:', slotsError.message);
    return next(new AppError('Error fetching slots', 500));
  }

  

  // PASO 2: Filtrar slots por día de la semana (si tienen day_of_week configurado)
  // Si day_of_week es null, asumimos que aplica a todos los días (slots recurrentes)
  const validSlots = (allSlots || []).filter(slot => {
    // Si no tiene day_of_week, aplica a cualquier día (recurrente)
    if (slot.day_of_week === null || slot.day_of_week === undefined) {
      return true;
    }
    // Si tiene day_of_week, debe coincidir
    return slot.day_of_week === dayOfWeek;
  });

  // PASO 3: Obtener citas existentes para esta fecha
  const { data: existingBookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('start_time, end_time, status')
    .eq('therapist_id', therapistId)
    .eq('date', date)
    .in('status', ['upcoming', 'pending', 'confirmed']);

  if (bookingsError) {
    console.error('❌ Error consultando citas:', bookingsError.message);
  }

  

  // PASO 4: Restar horarios ocupados de los slots disponibles
  const availableSlots = [];

  validSlots.forEach(slot => {

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
      }

      currentMinutes += parseInt(sessionDuration);
    }
  });

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

  

  if (!therapistId || !startDate || !startTime || !endTime) {
    return next(new AppError('Missing required fields: therapistId, startDate, startTime, endTime', 400));
  }

  // Comprobar duplicado: mismo terapeuta, misma fecha, mismo horario
  const { data: existing } = await supabase
    .from('availability_slots')
    .select('id')
    .eq('therapist_id', therapistId)
    .eq('valid_from', startDate)
    .eq('start_time', startTime)
    .eq('end_time', endTime)
    .limit(1);

  if (existing && existing.length > 0) {
    return next(new AppError('Ya existe un bloque de disponibilidad para esa fecha y horario', 409));
  }

  // Determinar el día de la semana del slot
  const dayOfWeek = new Date(startDate).getDay();

  // Calcular duración en minutos
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

  const slotData = {
    therapist_id:  therapistId,
    day_of_week:   dayOfWeek,
    start_time:    startTime,
    end_time:      endTime,
    is_available:  true,
    location:      location || 'online',
    location_type: 'office',
    slot_duration: durationMinutes > 0 ? durationMinutes : 60,
    valid_from:    startDate,
    valid_until:   endDate || startDate,
    title:         title || 'Disponible',
    color:         color || 'sage',
    repeat:        repeat === 'never' ? 'none' : (repeat || 'none'),
    notes:         notes || null,
    timezone:      timezone || 'Europe/Madrid'
  };

  const { data, error } = await supabase
    .from('availability_slots')
    .insert(slotData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating time block:', error.message);
    return next(new AppError(`Failed to create time block: ${error.message}`, 500));
  }

  res.status(201).json(formatSlot(data));
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

  const updateData = {
    start_time:    body.startTime || existing.start_time,
    end_time:      body.endTime || existing.end_time,
    is_available:  body.isActive !== undefined ? body.isActive : existing.is_available,
    location:      body.location || existing.location,
    slot_duration: existing.slot_duration,
    valid_from:    body.startDate || existing.valid_from,
    valid_until:   body.endDate || existing.valid_until,
    day_of_week:   body.startDate ? new Date(body.startDate).getDay() : existing.day_of_week,
    title:         body.title || existing.title,
    color:         body.color || existing.color,
    notes:         body.notes !== undefined ? body.notes : existing.notes,
    repeat:        body.repeat || existing.repeat || 'none'
  };

  console.log('🔄 updateTimeBlock payload:', JSON.stringify(updateData));

  const { data, error } = await supabase
    .from('availability_slots')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  console.log('🔄 updateTimeBlock result color:', data?.color, 'error:', error?.message);

  if (error) {
    return next(new AppError(`Failed to update time block: ${error.message}`, 500));
  }

  res.status(200).json(formatSlot(data));
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

  

  res.status(200).json((data || []).map(formatSlot));
});

// @desc  Bulk create time blocks
// @route POST /api/availability/blocks/bulk
// @access Private
const bulkCreateTimeBlocks = asyncHandler(async (req, res, next) => {
  const { slots } = req.body;

  if (!slots || !Array.isArray(slots) || slots.length === 0) {
    return next(new AppError('No slots provided for bulk create', 400));
  }

  const therapistId = req.user?.id || req.user?._id;

  // 1. Deduplicar dentro del propio array entrante (misma fecha+hora)
  const seen = new Set();
  const uniqueSlots = slots.filter(s => {
    const key = `${s.startDate}|${s.startTime}|${s.endTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 2. Obtener slots ya existentes para este terapeuta en las fechas del request
  const dates = [...new Set(uniqueSlots.map(s => s.startDate))];
  const { data: existingSlots } = await supabase
    .from('availability_slots')
    .select('valid_from, start_time, end_time')
    .eq('therapist_id', therapistId)
    .in('valid_from', dates);

  const existingKeys = new Set(
    (existingSlots || []).map(e => `${e.valid_from}|${e.start_time}|${e.end_time}`)
  );

  // 3. Filtrar los que ya existen en BD
  const newSlots = uniqueSlots.filter(s => {
    const key = `${s.startDate}|${s.startTime}|${s.endTime}`;
    return !existingKeys.has(key);
  });

  if (newSlots.length === 0) {
    return res.status(200).json({ success: true, created: [], total: 0, skipped: uniqueSlots.length });
  }

  const rows = newSlots.map(slot => {
    const { startDate, endDate, startTime, endTime, location, color, repeat, notes, timezone, title } = slot;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

    return {
      therapist_id:  therapistId,
      day_of_week:   new Date(startDate).getDay(),
      start_time:    startTime,
      end_time:      endTime,
      is_available:  true,
      location:      location || 'online',
      location_type: 'office',
      slot_duration: durationMinutes > 0 ? durationMinutes : 60,
      valid_from:    startDate,
      valid_until:   endDate || startDate,
      title:         title || 'Disponible',
      color:         color || 'sage',
      repeat:        repeat === 'never' ? 'none' : (repeat || 'none'),
      notes:         notes || null,
      timezone:      timezone || 'Europe/Madrid',
    };
  });

  const { data, error } = await supabase.from('availability_slots').insert(rows).select();

  if (error) {
    console.error('❌ Error bulk creating time blocks:', error.message);
    return next(new AppError(`Failed to bulk create time blocks: ${error.message}`, 500));
  }

  const skipped = slots.length - newSlots.length;

  res.status(201).json({
    success: true,
    created: (data || []).map(formatSlot),
    total: data?.length ?? 0,
    skipped,
  });
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
        
        results.successful.push(formatSlot(data));
      }
    } catch (err) {
      console.error(`❌ Error updating block ${id}:`, err.message);
      results.failed.push({ id, error: err.message });
    }
  });

  await Promise.all(updatePromises);

  

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
  bulkCreateTimeBlocks,
  getTimeBlockById,
  updateTimeBlock,
  deleteTimeBlock,
  getTherapistTimeBlocks,
  bulkUpdateTimeBlocks
};
