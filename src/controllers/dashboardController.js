const { Booking, ClientPlanProgress, Client, User, SessionNote } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// @desc    Get dashboard data for client
// @route   GET /api/dashboard/client
// @access  Private (Client)
const getClientDashboard = asyncHandler(async (req, res, next) => {
  const clientId = req.user.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get next upcoming booking
  const { data: nextBooking } = await supabase
    .from('bookings')
    .select('*, therapist:therapist_id(*)')
    .eq('client_id', clientId)
    .in('status', ['upcoming', 'pending', 'confirmed'])
    .gte('date', today.toISOString())
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .single();

  // Get completed sessions count
  const { count: completedSessions } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'completed');

  // Get pending exercises (plan progress)
  const { count: pendingExercises } = await supabase
    .from('client_plan_progress')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('status', ['not_started', 'in_progress']);

  // Get client creation date to calculate progress days
  const client = await Client.findById(clientId);
  const progressDays = client ? Math.ceil((new Date() - new Date(client.created_at)) / (1000 * 60 * 60 * 24)) : 0;

  // Format next booking data
  let nextAppointment = null;
  if (nextBooking) {
    const therapistName = nextBooking.therapist?.name || 'Unknown';

    nextAppointment = {
      date: nextBooking.date,
      startTime: nextBooking.start_time,
      endTime: nextBooking.end_time,
      therapistName,
      location: nextBooking.location,
      therapyType: nextBooking.therapy_type,
      bookingId: nextBooking.id
    };
  }

  // Prepare dashboard cards data
  const dashboardCards = [
    {
      title: 'Próxima Cita',
      value: nextAppointment
        ? `${new Date(nextAppointment.date).toLocaleDateString('es-ES')} ${nextAppointment.startTime}`
        : 'Sin citas',
      color: '#8CA48F'
    },
    {
      title: 'Sesiones Completadas',
      value: (completedSessions || 0).toString(),
      color: '#C9A2A6'
    },
    {
      title: 'Ejercicios Pendientes',
      value: (pendingExercises || 0).toString(),
      color: '#D58E6E'
    },
    {
      title: 'Días de Progreso',
      value: progressDays.toString(),
      color: '#A2B2C2'
    }
  ];

  res.status(200).json({
    success: true,
    data: {
      dashboardCards,
      nextAppointment,
      statistics: {
        completedSessions: completedSessions || 0,
        pendingExercises: pendingExercises || 0,
        progressDays
      }
    }
  });
});

// @desc    Get dashboard data for therapist
// @route   GET /api/dashboard/therapist
// @access  Private (Therapist)
const getTherapistDashboard = asyncHandler(async (req, res, next) => {
  const therapistId = req.user.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get today's bookings
  const { data: todaysBookings } = await supabase
    .from('bookings')
    .select('*, client:client_id(*)')
    .eq('therapist_id', therapistId)
    .gte('date', today.toISOString())
    .lt('date', tomorrow.toISOString())
    .in('status', ['upcoming', 'pending', 'confirmed'])
    .order('start_time', { ascending: true });

  // Get next upcoming booking
  const { data: nextBooking } = await supabase
    .from('bookings')
    .select('*, client:client_id(*)')
    .eq('therapist_id', therapistId)
    .in('status', ['upcoming', 'pending', 'confirmed'])
    .gte('date', today.toISOString())
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .single();

  // Get completed sessions this month
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const { count: completedSessions } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('therapist_id', therapistId)
    .eq('status', 'completed')
    .gte('date', startOfMonth.toISOString());

  // Get total active clients
  const { count: activeClients } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('therapist_id', therapistId)
    .eq('status', 'active');

  // Get pending exercises across all clients
  const { count: pendingExercises } = await supabase
    .from('client_plan_progress')
    .select('*', { count: 'exact', head: true })
    .eq('therapist_id', therapistId)
    .in('status', ['not_started', 'in_progress']);

  // Format next booking data
  let nextAppointment = null;
  if (nextBooking) {
    nextAppointment = {
      date: nextBooking.date,
      startTime: nextBooking.start_time,
      endTime: nextBooking.end_time,
      clientName: nextBooking.client?.name || 'Unknown',
      location: nextBooking.location,
      therapyType: nextBooking.therapy_type,
      bookingId: nextBooking.id
    };
  }

  // Prepare dashboard cards data
  const dashboardCards = [
    {
      title: 'Próxima Cita',
      value: nextAppointment
        ? `${new Date(nextAppointment.date).toLocaleDateString('es-ES')} ${nextAppointment.startTime}`
        : 'Sin citas',
      color: '#8CA48F'
    },
    {
      title: 'Sesiones Este Mes',
      value: (completedSessions || 0).toString(),
      color: '#C9A2A6'
    },
    {
      title: 'Clientes Activos',
      value: (activeClients || 0).toString(),
      color: '#D58E6E'
    },
    {
      title: 'Citas Hoy',
      value: (todaysBookings?.length || 0).toString(),
      color: '#A2B2C2'
    }
  ];

  res.status(200).json({
    success: true,
    data: {
      dashboardCards,
      nextAppointment,
      todaysBookings: (todaysBookings || []).map(booking => ({
        id: booking.id,
        startTime: booking.start_time,
        endTime: booking.end_time,
        clientName: booking.client?.name || 'Unknown',
        therapyType: booking.therapy_type,
        location: booking.location
      })),
      statistics: {
        completedSessions: completedSessions || 0,
        activeClients: activeClients || 0,
        todaysBookingsCount: todaysBookings?.length || 0,
        pendingExercises: pendingExercises || 0
      }
    }
  });
});

// @desc    Get dashboard stats summary
// @route   GET /api/dashboard/stats
// @access  Private
const getDashboardStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  if (userRole === 'client') {
    // Client-specific stats
    const [completedSessions, pendingExercises, totalPlans] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('client_id', userId).eq('status', 'completed').then(r => r.count),
      supabase.from('client_plan_progress').select('*', { count: 'exact', head: true })
        .eq('client_id', userId).in('status', ['not_started', 'in_progress']).then(r => r.count),
      supabase.from('client_plan_progress').select('plan_id', { count: 'exact', head: true })
        .eq('client_id', userId).then(r => r.count)
    ]);

    const client = await Client.findById(userId);
    const progressDays = client ? Math.ceil((new Date() - new Date(client.created_at)) / (1000 * 60 * 60 * 24)) : 0;

    res.status(200).json({
      success: true,
      data: {
        completedSessions: completedSessions || 0,
        pendingExercises: pendingExercises || 0,
        totalPlans: totalPlans || 0,
        progressDays,
        userRole
      }
    });
  } else if (userRole === 'therapist') {
    // Therapist-specific stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [completedSessions, activeClients, todaysBookings, totalNotes] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('therapist_id', userId).eq('status', 'completed')
        .gte('date', startOfMonth.toISOString()).then(r => r.count),
      supabase.from('clients').select('*', { count: 'exact', head: true })
        .eq('therapist_id', userId).eq('status', 'active').then(r => r.count),
      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('therapist_id', userId)
        .gte('date', today.toISOString())
        .lt('date', tomorrow.toISOString())
        .in('status', ['upcoming', 'pending', 'confirmed']).then(r => r.count),
      supabase.from('session_notes').select('*', { count: 'exact', head: true })
        .eq('therapist_id', userId).then(r => r.count)
    ]);

    res.status(200).json({
      success: true,
      data: {
        completedSessions: completedSessions || 0,
        activeClients: activeClients || 0,
        todaysBookings: todaysBookings || 0,
        totalNotes: totalNotes || 0,
        userRole
      }
    });
  } else {
    return next(new AppError('Unauthorized access', 403));
  }
});

module.exports = {
  getClientDashboard,
  getTherapistDashboard,
  getDashboardStats
};
