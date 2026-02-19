const ClientPlanProgress = require('../models/ClientPlanProgress');
const Client = require('../models/Client');
const TherapyPlan = require('../models/TherapyPlan');
const { validationResult } = require('express-validator');

// Get all progress for a client in a specific plan
const getAllProgress = async (req, res) => {
  try {
    const { clientId, planId } = req.params;

    // Verify client and plan exist and user has access
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const plan = await TherapyPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Therapy plan not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'therapist') {
      if (client.therapistId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own clients.'
        });
      }
    }

    const progress = await ClientPlanProgress.find({ clientId, planId })
      .populate('client', 'name email')
      .populate('therapyPlan', 'name type')
      .sort({ createdAt: -1 });

    // Get progress summary
    const summary = await ClientPlanProgress.getProgressSummary(clientId, planId);

    res.json({
      success: true,
      data: {
        progress,
        summary: summary[0] || {
          total: 0,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 0,
          completionPercentage: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching client plan progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client plan progress',
      error: error.message
    });
  }
};

// Get specific progress by ID
const getProgressById = async (req, res) => {
  try {
    const { id } = req.params;

    const progress = await ClientPlanProgress.findById(id)
      .populate('client', 'name email')
      .populate('therapyPlan', 'name type');

    if (!progress) {
      return res.status(404).json({
        success: false,
        message: 'Progress record not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'therapist') {
      const client = await Client.findById(progress.clientId);
      if (client.therapistId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own clients.'
        });
      }
    }

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching progress',
      error: error.message
    });
  }
};

// Create new progress record
const createProgress = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { clientId, planId, objective, status, notes } = req.body;

    // Verify client and plan exist
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const plan = await TherapyPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Therapy plan not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'therapist') {
      if (client.therapistId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only create progress for your own clients.'
        });
      }
    }

    const progressData = {
      clientId,
      planId,
      objective,
      status: status || 'not_started',
      notes: notes || ''
    };

    const progress = new ClientPlanProgress(progressData);
    await progress.save();

    await progress.populate([
      { path: 'client', select: 'name email' },
      { path: 'therapyPlan', select: 'name type' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Progress record created successfully',
      data: progress
    });
  } catch (error) {
    console.error('Error creating progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating progress record',
      error: error.message
    });
  }
};

// Update existing progress
const updateProgress = async (req, res) => {
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

    const progress = await ClientPlanProgress.findById(id);
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: 'Progress record not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'therapist') {
      const client = await Client.findById(progress.clientId);
      if (client.therapistId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only update your own clients progress.'
        });
      }
    }

    // Apply updates
    Object.assign(progress, updates);
    await progress.save();

    await progress.populate([
      { path: 'client', select: 'name email' },
      { path: 'therapyPlan', select: 'name type' }
    ]);

    res.json({
      success: true,
      message: 'Progress updated successfully',
      data: progress
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating progress',
      error: error.message
    });
  }
};

// Delete progress record
const deleteProgress = async (req, res) => {
  try {
    const { id } = req.params;

    const progress = await ClientPlanProgress.findById(id);
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: 'Progress record not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'therapist') {
      const client = await Client.findById(progress.clientId);
      if (client.therapistId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only delete your own clients progress.'
        });
      }
    }

    await ClientPlanProgress.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Progress record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting progress',
      error: error.message
    });
  }
};

// Get all progress for a specific plan
const getProgressByPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Verify plan exists
    const plan = await TherapyPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Therapy plan not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'therapist') {
      if (plan.therapistId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own plans.'
        });
      }
    }

    // Build query
    const query = { planId };
    if (status) query.status = status;

    // For therapists, also filter by their clients
    if (req.user.role === 'therapist') {
      const clientIds = await Client.find({ therapistId: req.user._id }).distinct('_id');
      query.clientId = { $in: clientIds };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [progress, total] = await Promise.all([
      ClientPlanProgress.find(query)
        .populate('client', 'name email')
        .populate('therapyPlan', 'name type')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ClientPlanProgress.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: progress,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocs: total,
        hasNextPage: skip + progress.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching progress by plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching progress by plan',
      error: error.message
    });
  }
};

// Get all progress for a specific client
const getProgressByClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { status, planId, page = 1, limit = 20 } = req.query;

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'therapist') {
      if (client.therapistId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own clients.'
        });
      }
    }

    // Build query
    const query = { clientId };
    if (status) query.status = status;
    if (planId) query.planId = planId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [progress, total, overallProgress] = await Promise.all([
      ClientPlanProgress.find(query)
        .populate('client', 'name email')
        .populate('therapyPlan', 'name type')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ClientPlanProgress.countDocuments(query),
      ClientPlanProgress.getClientOverallProgress(clientId)
    ]);

    res.json({
      success: true,
      data: {
        progress,
        overallProgress
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocs: total,
        hasNextPage: skip + progress.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching progress by client:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching progress by client',
      error: error.message
    });
  }
};

// Get therapist's clients progress overview
const getTherapistOverview = async (req, res) => {
  try {
    if (req.user.role !== 'therapist' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const therapistId = req.user.role === 'admin' && req.query.therapistId
      ? req.query.therapistId
      : req.user._id;

    const overview = await ClientPlanProgress.getTherapistClientsProgress(therapistId);

    // Group by client for better organization
    const clientsProgress = {};
    overview.forEach(item => {
      const clientId = item._id.clientId.toString();
      if (!clientsProgress[clientId]) {
        clientsProgress[clientId] = {
          clientId,
          clientName: item._id.clientName,
          plans: []
        };
      }
      clientsProgress[clientId].plans.push({
        planId: item._id.planId,
        planName: item._id.planName,
        total: item.total,
        completed: item.completed,
        inProgress: item.inProgress,
        completionPercentage: Math.round(item.completionPercentage),
        lastUpdate: item.lastUpdate
      });
    });

    // Calculate overall statistics
    const totalClients = Object.keys(clientsProgress).length;
    const totalObjectives = overview.reduce((sum, item) => sum + item.total, 0);
    const completedObjectives = overview.reduce((sum, item) => sum + item.completed, 0);
    const overallCompletionRate = totalObjectives > 0 ? Math.round((completedObjectives / totalObjectives) * 100) : 0;

    res.json({
      success: true,
      data: {
        clients: Object.values(clientsProgress),
        statistics: {
          totalClients,
          totalObjectives,
          completedObjectives,
          overallCompletionRate
        }
      }
    });
  } catch (error) {
    console.error('Error fetching therapist overview:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching therapist overview',
      error: error.message
    });
  }
};

// Bulk update progress status
const bulkUpdateStatus = async (req, res) => {
  try {
    const { progressIds, status, notes } = req.body;

    if (!progressIds || !Array.isArray(progressIds) || progressIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Progress IDs array is required'
      });
    }

    if (!['not_started', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Verify all progress records exist and user has access
    const progressRecords = await ClientPlanProgress.find({ _id: { $in: progressIds } })
      .populate('client', 'therapistId');

    if (progressRecords.length !== progressIds.length) {
      return res.status(404).json({
        success: false,
        message: 'Some progress records not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'therapist') {
      const unauthorized = progressRecords.some(p =>
        p.client.therapistId.toString() !== req.user._id.toString()
      );

      if (unauthorized) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only update your own clients progress.'
        });
      }
    }

    // Prepare update data
    const updateData = { status };
    if (notes) updateData.notes = notes;
    if (status === 'completed') {
      updateData.completedAt = new Date();
    } else if (status !== 'completed') {
      updateData.completedAt = null;
    }

    // Perform bulk update
    const result = await ClientPlanProgress.updateMany(
      { _id: { $in: progressIds } },
      updateData
    );

    res.json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} progress records`,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error bulk updating progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk updating progress',
      error: error.message
    });
  }
};

module.exports = {
  getAllProgress,
  getProgressById,
  createProgress,
  updateProgress,
  deleteProgress,
  getProgressByPlan,
  getProgressByClient,
  getTherapistOverview,
  bulkUpdateStatus
};