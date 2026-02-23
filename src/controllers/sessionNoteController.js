const { validationResult } = require('express-validator');
const { SessionNote, Client, Booking, User } = require('../models');
const { supabase } = require('../config/supabase');

// Get all session notes for therapist
const getAllNotes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      clientId,
      mood,
      progress,
      sessionType,
      riskLevel,
      flagged,
      startDate,
      endDate,
      search
    } = req.query;

    const therapistId = req.user.id;

    // Build filters
    const filters = { therapistId: therapistId };

    // Apply filters
    if (clientId) {
      // Verify client belongs to therapist
      const client = await Client.findOne({ 
        id: clientId, 
        therapistId: therapistId 
      });
      if (!client) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Client does not belong to you.'
        });
      }
      filters.client_id = clientId;
    }

    if (mood) filters.mood = mood;
    if (progress) filters.progress = progress;
    if (sessionType) filters.session_type = sessionType;

    // Handle search
    if (search) {
      const notes = await SessionNote.searchNotes(therapistId, search, {
        clientId,
        mood,
        progress,
        sessionType,
        riskLevel,
        flagged: flagged === 'true' ? true : flagged === 'false' ? false : undefined,
        startDate,
        endDate
      });

      // Populate client and booking data manually
      const populatedNotes = await Promise.all(
        notes.map(async (note) => {
          const [client, booking] = await Promise.all([
            Client.findById(note.clientId),
            Booking.findById(note.bookingId)
          ]);
          return {
            ...note.toJSON(),
            client: client ? { 
              id: client.id, 
              name: client.name, 
              email: client.email, 
              avatar: client.avatar 
            } : null,
            booking: booking ? {
              id: booking.id,
              date: booking.date,
              startTime: booking.startTime,
              endTime: booking.endTime,
              status: booking.status
            } : null
          };
        })
      );

      return res.json({
        success: true,
        data: populatedNotes,
        pagination: null
      });
    }

    // Build query with Supabase for pagination and sorting
    let query = supabase
      .from('session_notes')
      .select('*, client:client_id(*), booking:booking_id(*)', { count: 'exact' })
      .eq('therapist_id', therapistId);

    // Apply additional filters
    if (filters.client_id) query = query.eq('client_id', filters.client_id);
    if (filters.mood) query = query.eq('mood', filters.mood);
    if (filters.progress) query = query.eq('progress', filters.progress);
    if (filters.session_type) query = query.eq('session_type', filters.session_type);
    if (flagged !== undefined) {
      query = query.eq('risk_assessment->>flagged', flagged === 'true');
    }
    if (startDate && endDate) {
      query = query
        .gte('created_at', startDate)
        .lte('created_at', endDate);
    }

    // Apply sorting and pagination
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    const notes = (data || []).map(n => new SessionNote.SessionNote(n));

    res.json({
      success: true,
      data: notes.map(n => n.toJSON()),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil((count || 0) / parseInt(limit)),
        totalDocs: count || 0,
        hasNextPage: offset + notes.length < (count || 0),
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching session notes:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching session notes',
      error: error.message
    });
  }
};

// Get session note by ID
const getNoteById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeHistory = false, includeTrend = false } = req.query;

    const note = await SessionNote.findById(id);

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Session note not found'
      });
    }

    // Check access permissions - only the therapist who created it can access
    if (note.therapistId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own session notes.'
      });
    }

    // Fetch related data manually
    const [client, booking, therapist] = await Promise.all([
      Client.findById(note.clientId),
      Booking.findById(note.bookingId),
      User.findById(note.therapistId)
    ]);

    let noteData = note.toJSON();

    // Add related data
    noteData.client = client ? {
      id: client.id,
      name: client.name,
      email: client.email,
      avatar: client.avatar,
      phone: client.phone
    } : null;

    noteData.booking = booking ? {
      id: booking.id,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      therapyType: booking.therapyType,
      location: booking.location
    } : null;

    noteData.therapist = therapist ? {
      id: therapist.id,
      name: therapist.name,
      email: therapist.email
    } : null;

    // Remove edit history if not requested
    if (includeHistory !== 'true') {
      delete noteData.editHistory;
    }

    // Get progress trend if requested
    if (includeTrend === 'true') {
      const progressTrend = await note.getProgressTrend();
      noteData.progressTrend = progressTrend;
    }

    res.json({
      success: true,
      data: noteData
    });
  } catch (error) {
    console.error('Error fetching session note:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching session note',
      error: error.message
    });
  }
};

// Create new session note
const createNote = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      bookingId,
      clientId,
      notes,
      objectives = [],
      homework = [],
      nextSteps,
      mood,
      progress,
      isConfidential = true,
      sessionType = 'follow_up',
      treatmentPlan = {},
      riskAssessment = {},
      clinicalMeasures = {},
      tags = []
    } = req.body;

    const therapistId = req.user.id;

    // Verify booking exists and belongs to therapist
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.therapistId !== therapistId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Booking does not belong to you.'
      });
    }

    if (booking.clientId !== clientId) {
      return res.status(400).json({
        success: false,
        message: 'Client ID does not match booking client'
      });
    }

    // Check if session note already exists for this booking
    const existingNote = await SessionNote.findByBooking(bookingId);
    if (existingNote) {
      return res.status(400).json({
        success: false,
        message: 'Session note already exists for this booking'
      });
    }

    // Verify client belongs to therapist
    const client = await Client.findOne({ 
      id: clientId, 
      therapistId: therapistId 
    });
    if (!client) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Client does not belong to you.'
      });
    }

    const noteData = {
      bookingId,
      therapistId,
      clientId,
      notes,
      objectives,
      homework,
      nextSteps,
      mood,
      progress,
      isConfidential,
      sessionType,
      treatmentPlan,
      riskAssessment: {
        level: riskAssessment.level || 'none',
        notes: riskAssessment.notes || '',
        flagged: riskAssessment.flagged || false
      },
      clinicalMeasures,
      sessionDuration: booking.therapyDuration,
      tags: tags.map(tag => tag.toLowerCase()),
      lastEditedBy: therapistId,
      editHistory: [{
        edited_by: therapistId,
        edited_at: new Date().toISOString(),
        changes: 'Session note created',
        ip_address: req.ip
      }]
    };

    const sessionNote = await SessionNote.create(noteData);

    // Fetch related data for response
    const [populatedClient, populatedBooking] = await Promise.all([
      Client.findById(clientId),
      Booking.findById(bookingId)
    ]);

    const responseData = sessionNote.toJSON();
    responseData.client = populatedClient ? {
      id: populatedClient.id,
      name: populatedClient.name,
      email: populatedClient.email,
      avatar: populatedClient.avatar
    } : null;
    responseData.booking = populatedBooking ? {
      id: populatedBooking.id,
      date: populatedBooking.date,
      startTime: populatedBooking.startTime,
      endTime: populatedBooking.endTime,
      status: populatedBooking.status
    } : null;

    res.status(201).json({
      success: true,
      message: 'Session note created successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error creating session note:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating session note',
      error: error.message
    });
  }
};

// Update session note
const updateNote = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updates = req.body;
    const changeDescription = req.body.changeDescription || 'Session note updated';

    const sessionNote = await SessionNote.findById(id);
    if (!sessionNote) {
      return res.status(404).json({
        success: false,
        message: 'Session note not found'
      });
    }

    // Check access permissions
    if (sessionNote.therapistId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own session notes.'
      });
    }

    // Track changes for confidential notes
    const significantFields = ['notes', 'objectives', 'homework', 'mood', 'progress', 'riskAssessment'];
    const hasSignificantChanges = significantFields.some(field =>
      updates.hasOwnProperty(field)
    );

    // Build update data
    const updateData = {};
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.objectives !== undefined) updateData.objectives = updates.objectives;
    if (updates.homework !== undefined) updateData.homework = updates.homework;
    if (updates.nextSteps !== undefined) updateData.nextSteps = updates.nextSteps;
    if (updates.mood !== undefined) updateData.mood = updates.mood;
    if (updates.progress !== undefined) updateData.progress = updates.progress;
    if (updates.isConfidential !== undefined) updateData.isConfidential = updates.isConfidential;
    if (updates.sessionType !== undefined) updateData.sessionType = updates.sessionType;
    if (updates.treatmentPlan !== undefined) updateData.treatmentPlan = updates.treatmentPlan;
    if (updates.riskAssessment !== undefined) updateData.riskAssessment = updates.riskAssessment;
    if (updates.clinicalMeasures !== undefined) updateData.clinicalMeasures = updates.clinicalMeasures;
    if (updates.tags !== undefined) {
      updateData.tags = updates.tags.map(tag => tag.toLowerCase());
    }

    // Add edit history for significant changes
    if (hasSignificantChanges) {
      const newEditHistory = [...(sessionNote.editHistory || []), {
        edited_by: req.user.id,
        edited_at: new Date().toISOString(),
        changes: changeDescription,
        ip_address: req.ip
      }];
      updateData.editHistory = newEditHistory;
      updateData.lastEditedBy = req.user.id;
    }

    const updatedNote = await SessionNote.findByIdAndUpdate(id, updateData, { new: true });

    // Fetch related data for response
    const [client, booking] = await Promise.all([
      Client.findById(updatedNote.clientId),
      Booking.findById(updatedNote.bookingId)
    ]);

    const responseData = updatedNote.toJSON();
    responseData.client = client ? {
      id: client.id,
      name: client.name,
      email: client.email,
      avatar: client.avatar
    } : null;
    responseData.booking = booking ? {
      id: booking.id,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status
    } : null;

    res.json({
      success: true,
      message: 'Session note updated successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error updating session note:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating session note',
      error: error.message
    });
  }
};

// Delete session note
const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;

    const sessionNote = await SessionNote.findById(id);
    if (!sessionNote) {
      return res.status(404).json({
        success: false,
        message: 'Session note not found'
      });
    }

    // Check access permissions
    if (sessionNote.therapistId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete your own session notes.'
      });
    }

    await SessionNote.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Session note deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting session note:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting session note',
      error: error.message
    });
  }
};

// Get session notes by client
const getNotesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      includeSummary = false
    } = req.query;

    const therapistId = req.user.id;

    // Verify client belongs to therapist
    const client = await Client.findOne({ 
      id: clientId, 
      therapistId: therapistId 
    });
    if (!client) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Client does not belong to you.'
      });
    }

    // Build query with Supabase
    let query = supabase
      .from('session_notes')
      .select('*, booking:booking_id(*)', { count: 'exact' })
      .eq('client_id', clientId)
      .eq('therapist_id', therapistId);

    // Apply sorting and pagination
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    const notes = (data || []).map(n => new SessionNote.SessionNote(n));

    let response = {
      success: true,
      data: {
        notes: notes.map(n => n.toJSON())
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil((count || 0) / parseInt(limit)),
        totalDocs: count || 0,
        hasNextPage: offset + notes.length < (count || 0),
        hasPrevPage: parseInt(page) > 1
      }
    };

    // Include progress summary if requested
    if (includeSummary === 'true') {
      const progressSummary = await SessionNote.getClientProgressSummary(clientId, therapistId);
      response.data.progressSummary = progressSummary;
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching client session notes:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client session notes',
      error: error.message
    });
  }
};

// Get session note by booking
const getNotesByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const therapistId = req.user.id;

    // Verify booking belongs to therapist
    const booking = await Booking.findOne({ 
      id: bookingId, 
      therapistId: therapistId 
    });
    if (!booking) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Booking does not belong to you.'
      });
    }

    const note = await SessionNote.findByBooking(bookingId);

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'No session note found for this booking'
      });
    }

    // Fetch related data
    const [client, bookingData] = await Promise.all([
      Client.findById(note.clientId),
      Booking.findById(note.bookingId)
    ]);

    const responseData = note.toJSON();
    responseData.client = client ? {
      id: client.id,
      name: client.name,
      email: client.email,
      avatar: client.avatar
    } : null;
    responseData.booking = bookingData ? {
      id: bookingData.id,
      date: bookingData.date,
      startTime: bookingData.startTime,
      endTime: bookingData.endTime,
      status: bookingData.status,
      therapyType: bookingData.therapyType
    } : null;

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error fetching session note by booking:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching session note by booking',
      error: error.message
    });
  }
};

// Get therapist statistics
const getTherapistStats = async (req, res) => {
  try {
    const { startDate, endDate, period = '30' } = req.query;
    const therapistId = req.user.id;

    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - parseInt(period));
    }

    const stats = await SessionNote.getTherapistStats(therapistId, start.toISOString(), end.toISOString());

    // Get risk flagged cases
    const { data: riskCases, error } = await supabase
      .from('session_notes')
      .select('id, client_id, risk_assessment, created_at')
      .eq('therapist_id', therapistId)
      .eq('risk_assessment->>flagged', 'true')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw new Error(error.message);

    // Populate client data for risk cases
    const populatedRiskCases = await Promise.all(
      (riskCases || []).map(async (riskCase) => {
        const client = await Client.findById(riskCase.client_id);
        return {
          id: riskCase.id,
          client: client ? { id: client.id, name: client.name } : null,
          riskAssessment: riskCase.risk_assessment,
          createdAt: riskCase.created_at
        };
      })
    );

    res.json({
      success: true,
      data: {
        period: { start, end },
        statistics: stats || {
          totalSessions: 0,
          avgWellnessScore: 0,
          uniqueClients: 0,
          riskCases: 0,
          moodDistribution: {},
          progressDistribution: {}
        },
        recentRiskCases: populatedRiskCases
      }
    });
  } catch (error) {
    console.error('Error fetching therapist statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching therapist statistics',
      error: error.message
    });
  }
};

// Flag risk assessment
const flagRisk = async (req, res) => {
  try {
    const { id } = req.params;
    const { level, notes } = req.body;

    if (!['none', 'low', 'moderate', 'high', 'critical'].includes(level)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid risk level'
      });
    }

    const sessionNote = await SessionNote.findById(id);
    if (!sessionNote) {
      return res.status(404).json({
        success: false,
        message: 'Session note not found'
      });
    }

    // Check access permissions
    if (sessionNote.therapistId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only flag your own session notes.'
      });
    }

    await sessionNote.flagRisk(level, notes, req.user.id);

    res.json({
      success: true,
      message: 'Risk assessment updated successfully',
      data: sessionNote.toJSON()
    });
  } catch (error) {
    console.error('Error flagging risk assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Error flagging risk assessment',
      error: error.message
    });
  }
};

module.exports = {
  getAllNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  getNotesByClient,
  getNotesByBooking,
  getTherapistStats,
  flagRisk
};
