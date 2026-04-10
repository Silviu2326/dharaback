const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { supabase } = require('../config/supabase');

/**
 * @desc    Check if client has active connection with therapist
 * @route   GET /api/client-therapists/connection/:therapistId
 * @access  Private (Client)
 */
const getClientTherapistConnection = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;

  // Get clientId from authenticated user (set by auth middleware)
  const clientId = req.user?.id;

  console.log('[getClientTherapistConnection] Checking connection:', { clientId, therapistId });

  if (!clientId) {
    return next(new AppError('Token de cliente no válido o no proporcionado', 401));
  }

  if (!therapistId) {
    return next(new AppError('El ID del terapeuta es requerido', 400));
  }

  try {
    // Check connection in client_therapists table
    const { data: connection, error } = await supabase
      .from('client_therapists')
      .select('id, status, payment_method, created_at, updated_at')
      .eq('client_id', clientId)
      .eq('therapist_id', therapistId)
      .single();

    console.log('[getClientTherapistConnection] Query result:', { connection, error });

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking connection:', error);
      return next(new AppError('Error al verificar la conexión', 500));
    }

    const hasConnection = connection && connection.status === 'active';

    res.status(200).json({
      success: true,
      data: {
        hasConnection,
        connection: hasConnection ? {
          id: connection.id,
          status: connection.status,
          paymentMethod: connection.payment_method || 'cash',
          createdAt: connection.created_at,
          updatedAt: connection.updated_at
        } : null,
        isNewClient: !hasConnection
      }
    });
  } catch (err) {
    console.error('Error in getClientTherapistConnection:', err);
    return next(new AppError('Error al verificar la conexión', 500));
  }
});

/**
 * @desc    Create connection between client and therapist
 * @route   POST /api/client-therapists/connection
 * @access  Private (Client)
 */
const createClientTherapistConnection = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.body;

  // Get clientId from authenticated user (set by auth middleware)
  const clientId = req.user?.id;

  console.log('[createClientTherapistConnection] Creating connection:', { clientId, therapistId });

  if (!clientId) {
    return next(new AppError('Token de cliente no válido o no proporcionado', 401));
  }

  if (!therapistId) {
    return next(new AppError('El ID del terapeuta es requerido', 400));
  }

  try {
    // Check if connection already exists
    const { data: existingConnection, error: checkError } = await supabase
      .from('client_therapists')
      .select('id, status')
      .eq('client_id', clientId)
      .eq('therapist_id', therapistId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing connection:', checkError);
      return next(new AppError('Error al verificar conexión existente', 500));
    }

    // If connection exists and is active, return success
    if (existingConnection && existingConnection.status === 'active') {
      return res.status(200).json({
        success: true,
        message: 'La conexión ya existe',
        data: {
          id: existingConnection.id,
          status: existingConnection.status
        }
      });
    }

    // If connection exists but is inactive/archived, reactivate it
    if (existingConnection && existingConnection.status !== 'active') {
      const { data: updated, error: updateError } = await supabase
        .from('client_therapists')
        .update({
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConnection.id)
        .select('id, status, payment_method, created_at, updated_at')
        .single();

      if (updateError) {
        console.error('Error reactivating connection:', updateError);
        return next(new AppError('Error al reactivar la conexión', 500));
      }

      return res.status(200).json({
        success: true,
        message: 'Conexión reactivada exitosamente',
        data: {
          id: updated.id,
          status: updated.status,
          paymentMethod: updated.payment_method || 'cash',
          createdAt: updated.created_at,
          updatedAt: updated.updated_at
        }
      });
    }

    // Create new connection
    const { data: newConnection, error: insertError } = await supabase
      .from('client_therapists')
      .insert({
        client_id: clientId,
        therapist_id: therapistId,
        status: 'active',
        payment_method: 'cash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, status, payment_method, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('Error creating connection:', insertError);
      return next(new AppError('Error al crear la conexión', 500));
    }

    res.status(201).json({
      success: true,
      message: 'Conexión creada exitosamente',
      data: {
        id: newConnection.id,
        status: newConnection.status,
        paymentMethod: newConnection.payment_method || 'cash',
        createdAt: newConnection.created_at,
        updatedAt: newConnection.updated_at
      }
    });
  } catch (err) {
    console.error('Error in createClientTherapistConnection:', err);
    return next(new AppError('Error al crear la conexión', 500));
  }
});

module.exports = {
  getClientTherapistConnection,
  createClientTherapistConnection
};
