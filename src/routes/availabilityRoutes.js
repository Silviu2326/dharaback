const express = require('express');
const { body, param, query } = require('express-validator');
const availabilityController = require('../controllers/availabilityController');
const { protect } = require('../middleware/auth');
const router = express.Router();

// Import our new availability controller for public access
const {
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
  getTherapistTimeBlocks
} = availabilityController;

// ========================================
// PUBLIC ROUTES FOR CLIENTS
// ========================================
// These routes don't require authentication - clients can view therapist availability

// Validation for therapist ID parameter (UUID v4)
const therapistIdValidation = [
  param('therapistId').notEmpty().withMessage('Therapist ID is required')
];

// Validation for date parameter
const dateValidation = [
  param('date').isISO8601().withMessage('Invalid date format (YYYY-MM-DD expected)')
];

// Validation for date range query
const dateRangeValidation = [
  query('startDate').isISO8601().withMessage('Start date must be in YYYY-MM-DD format'),
  query('endDate').isISO8601().withMessage('End date must be in YYYY-MM-DD format')
];

// Validation for slot availability check
const slotAvailabilityValidation = [
  body('therapistId').notEmpty().withMessage('Therapist ID is required'),
  body('date').isISO8601().withMessage('Date must be in YYYY-MM-DD format'),
  body('startTime').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:mm format'),
  body('endTime').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:mm format')
];

// Get therapist availability for a date range
// GET /api/availability/therapist/:therapistId?startDate=2024-01-01&endDate=2024-01-31
router.get('/therapist/:therapistId',
  therapistIdValidation,
  dateRangeValidation,
  getTherapistAvailability
);

// Get available slots for a specific date
// GET /api/availability/therapist/:therapistId/date/:date?sessionDuration=60
router.get('/therapist/:therapistId/date/:date',
  therapistIdValidation,
  dateValidation,
  getAvailableSlotsForDate
);

// Check if a specific slot is available
// POST /api/availability/check-slot
router.post('/check-slot',
  slotAvailabilityValidation,
  checkSlotAvailability
);

// Get therapist's general schedule/working hours
// GET /api/availability/therapist/:therapistId/schedule
router.get('/therapist/:therapistId/schedule',
  therapistIdValidation,
  getTherapistSchedule
);

// ========================================
// PROTECTED ROUTES FOR THERAPISTS
// ========================================
// These routes require authentication

router.use(protect);

const availabilitySlotValidation = [
  body('title').notEmpty().withMessage('Title is required').isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('startDate').isISO8601().withMessage('Start date must be a valid date'),
  body('endDate').isISO8601().withMessage('End date must be a valid date'),
  body('startTime').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:mm format'),
  body('endTime').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:mm format'),
  body('location').notEmpty().withMessage('Location is required').isLength({ max: 200 }).withMessage('Location cannot exceed 200 characters')
];

const absenceValidation = [
  body('title').notEmpty().withMessage('Title is required').isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('startDate').isISO8601().withMessage('Start date must be a valid date'),
  body('endDate').isISO8601().withMessage('End date must be a valid date'),
  body('absenceType').isIn(['vacation', 'sick_leave', 'conference', 'personal', 'emergency', 'training', 'other']).withMessage('Invalid absence type')
];

const idValidation = [param('id').notEmpty().withMessage('ID is required')];

const calendarQueryValidation = [
  query('startDate').isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').isISO8601().withMessage('End date must be a valid date')
];

// TODO: Add therapist management routes here when needed
// - Availability slot management (CRUD)
// - Absence management (CRUD)
// - Calendar integration
// - Statistics and analytics

// For now, we only have the core public availability functions working

// Conflict checking routes (protected)
router.get('/conflicts/check', protect, checkTimeBlockConflicts);
router.get('/appointments/check', protect, checkExistingAppointments);

// Time block management routes (real CRUD)
router.post('/blocks', protect, createTimeBlock);
router.get('/blocks/:id', protect, getTimeBlockById);
router.put('/blocks/:id', protect, updateTimeBlock);
router.delete('/blocks/:id', protect, deleteTimeBlock);
router.get('/therapist/:therapistId/blocks', protect, getTherapistTimeBlocks);

// Additional mock endpoints
router.post('/sync/external', protect, (req, res) => {
  res.json({
    status: 'synced',
    syncedItems: [],
    conflicts: []
  });
});

router.post('/conflicts/resolve', protect, (req, res) => {
  res.json({
    resolvedConflicts: [],
    failedResolutions: []
  });
});

router.post('/notify', protect, (req, res) => {
  res.json({
    notified: true
  });
});

router.post('/blocks/:id/sync-external', protect, (req, res) => {
  res.json({
    synced: true,
    blockId: req.params.id
  });
});

router.post('/exceptions/:id/sync-external', protect, (req, res) => {
  res.json({
    synced: true,
    exceptionId: req.params.id
  });
});

router.post('/bulk-update', protect, (req, res) => {
  res.json({
    successful: [],
    failed: []
  });
});

// Frontend compatibility routes - provide mock responses for missing endpoints
router.get('/therapist/:therapistId', (req, res) => {
  res.json({
    success: true,
    data: {
      timeBlocks: [],
      exceptions: [],
      recurringPatterns: [],
      total: 0
    }
  });
});

router.get('/exceptions', (req, res) => {
  res.json({
    success: true,
    data: []
  });
});

router.get('/:therapistId/external-calendar-status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'disconnected',
      provider: null,
      lastSync: null,
      conflicts: 0,
      isConfigured: false
    }
  });
});

// ========================================
// ANÁLISIS Y CALENDARIO
// ========================================

// Endpoint de occupancy analysis
router.get('/analysis/occupancy', protect, async (req, res) => {
  const { startDate, endDate } = req.query;
  const therapistId = req.user.id || req.user._id;

  try {
    const { data: bookings } = await require('../config/supabase').supabase
      .from('bookings')
      .select('date, start_time, end_time, status')
      .eq('therapist_id', therapistId)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('status', ['completed', 'upcoming', 'pending']);

    // Calcular occupancy
    const totalSlots = bookings?.length || 0;
    const completed = bookings?.filter(b => b.status === 'completed').length || 0;
    const cancelled = bookings?.filter(b => b.status === 'cancelled').length || 0;
    const noShow = bookings?.filter(b => b.status === 'no_show').length || 0;

    // Calcular horas
    let totalHours = 0;
    bookings?.forEach(b => {
      const [sh, sm] = b.start_time.split(':').map(Number);
      const [eh, em] = b.end_time.split(':').map(Number);
      totalHours += ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    });

    res.json({
      success: true,
      data: {
        totalBookings: totalSlots,
        completedBookings: completed,
        cancelledBookings: cancelled,
        noShowBookings: noShow,
        totalHours,
        occupancyRate: totalSlots > 0 ? Math.round((completed / totalSlots) * 100) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de calendar events (combina availability slots + bookings)
router.get('/calendar/events', protect, async (req, res) => {
  const { startDate, endDate, view } = req.query;
  const therapistId = req.user.id || req.user._id;

  try {
    const supabase = require('../config/supabase').supabase;

    // Obtener availability slots that overlap with the requested date range
    const { data: slots } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('therapist_id', therapistId)
      .eq('is_available', true)
      .or(`and(valid_from.is.null,valid_until.is.null),and(valid_from.lte.${endDate},valid_until.is.null),and(valid_from.is.null,valid_until.gte.${startDate}),and(valid_from.lte.${endDate},valid_until.gte.${startDate})`);

    // Obtener bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('therapist_id', therapistId)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('status', ['upcoming', 'pending', 'confirmed', 'completed']);

    // Formatear como eventos de calendario
    const events = [
      ...(slots || []).map(s => ({
        id: s.id,
        title: s.title || 'Disponible',
        start: `${s.valid_from || s.day_of_week}T${s.start_time}:00`,
        end: `${s.valid_until || s.day_of_week}T${s.end_time}:00`,
        type: 'availability',
        color: s.color || 'sage'
      })),
      ...(bookings || []).map(b => ({
        id: b.id,
        title: `Sesión con cliente`,
        start: `${b.date}T${b.start_time}:00`,
        end: `${b.date}T${b.end_time}:00`,
        type: 'booking',
        status: b.status,
        clientId: b.client_id
      }))
    ];

    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
