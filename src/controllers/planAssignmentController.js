const { validationResult } = require('express-validator');
const { PlanAssignment, TherapyPlan, Client, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const planAssignmentController = {
  // Get all plan assignments
  async getPlanAssignments(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const {
        clientId,
        status,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      let query = supabase
        .from('plan_assignments')
        .select('*, therapy_plan:therapy_plan_id(*), client:client_id(*), therapist:therapistId(*)', { count: 'exact' });

      if (userRole === 'therapist') {
        query = query.eq('therapistId', userId);
      } else if (userRole === 'client') {
        query = query.eq('client_id', userId);
      }

      if (clientId) query = query.eq('client_id', clientId);
      if (status) query = query.eq('status', status);

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
                   .range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: {
          assignments: data || [],
          pagination: {
            current: parseInt(page),
            pages: Math.ceil((count || 0) / parseInt(limit)),
            total: count || 0
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get single assignment
  async getPlanAssignment(req, res, next) {
    try {
      const { assignmentId } = req.params;

      const assignment = await PlanAssignment.findById(assignmentId);

      if (!assignment) {
        return next(new AppError('Plan assignment not found', 404));
      }

      // Get related data
      const [therapyPlan, client, therapist] = await Promise.all([
        TherapyPlan.findById(assignment.therapy_plan_id),
        Client.findById(assignment.client_id),
        User.findById(assignment.therapistId)
      ]);

      res.json({
        success: true,
        data: {
          ...assignment,
          therapy_plan: therapyPlan,
          client,
          therapist: therapist ? {
            id: therapist.id,
            name: therapist.name,
            email: therapist.email
          } : null
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Create new plan assignment
  async createPlanAssignment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const userId = req.user.id;
      const {
        therapyPlanId,
        clientId,
        startDate,
        endDate,
        goals,
        notes
      } = req.body;

      // Verify therapy plan exists
      const therapyPlan = await TherapyPlan.findById(therapyPlanId);
      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      // Verify client exists
      const client = await Client.findById(clientId);
      if (!client) {
        return next(new AppError('Client not found', 404));
      }

      const assignmentData = {
        therapistId: userId,
        therapyPlanId,
        clientId,
        startDate,
        endDate,
        goals: goals || therapyPlan.goals || [],
        notes,
        status: 'active',
        progress: {
          completedSessions: 0,
          totalSessions: therapyPlan.estimatedSessions || 10,
          completionPercentage: 0
        }
      };

      const assignment = await PlanAssignment.create(assignmentData);

      res.status(201).json({
        success: true,
        data: assignment
      });
    } catch (error) {
      next(error);
    }
  },

  // Update plan assignment
  async updatePlanAssignment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { assignmentId } = req.params;
      const userId = req.user.id;

      const existing = await PlanAssignment.findById(assignmentId);
      if (!existing) {
        return next(new AppError('Plan assignment not found', 404));
      }

      if (existing.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await PlanAssignment.findByIdAndUpdate(assignmentId, req.body);

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete plan assignment
  async deletePlanAssignment(req, res, next) {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.id;

      const existing = await PlanAssignment.findById(assignmentId);
      if (!existing) {
        return next(new AppError('Plan assignment not found', 404));
      }

      if (existing.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      await PlanAssignment.findByIdAndDelete(assignmentId);

      res.json({
        success: true,
        message: 'Plan assignment deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Record session completion
  async recordSessionCompletion(req, res, next) {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.id;
      const { sessionId, notes, milestonesCompleted = [] } = req.body;

      const assignment = await PlanAssignment.findById(assignmentId);
      if (!assignment) {
        return next(new AppError('Plan assignment not found', 404));
      }

      if (assignment.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      // Update progress
      const currentProgress = assignment.progress || {};
      const newCompletedSessions = (currentProgress.completedSessions || 0) + 1;
      const totalSessions = currentProgress.totalSessions || 10;

      const progress = {
        ...currentProgress,
        completedSessions: newCompletedSessions,
        completionPercentage: Math.min(100, Math.round((newCompletedSessions / totalSessions) * 100)),
        lastSessionAt: new Date().toISOString()
      };

      // Add to session history
      const sessionHistory = assignment.session_history || [];
      sessionHistory.push({
        sessionId,
        completedAt: new Date().toISOString(),
        notes,
        milestonesCompleted
      });

      const updated = await PlanAssignment.findByIdAndUpdate(assignmentId, {
        progress,
        session_history: sessionHistory,
        updated_at: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Complete milestone
  async completeMilestone(req, res, next) {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.id;
      const { milestoneIndex } = req.body;

      const assignment = await PlanAssignment.findById(assignmentId);
      if (!assignment) {
        return next(new AppError('Plan assignment not found', 404));
      }

      if (assignment.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const milestones = assignment.milestones || [];
      if (milestoneIndex >= milestones.length) {
        return next(new AppError('Invalid milestone index', 400));
      }

      milestones[milestoneIndex] = {
        ...milestones[milestoneIndex],
        completed: true,
        completedAt: new Date().toISOString()
      };

      const updated = await PlanAssignment.findByIdAndUpdate(assignmentId, {
        milestones,
        updated_at: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Pause assignment
  async pauseAssignment(req, res, next) {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.id;
      const { reason } = req.body;

      const assignment = await PlanAssignment.findById(assignmentId);
      if (!assignment) {
        return next(new AppError('Plan assignment not found', 404));
      }

      if (assignment.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await PlanAssignment.findByIdAndUpdate(assignmentId, {
        status: 'paused',
        pausedAt: new Date().toISOString(),
        pauseReason: reason
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Resume assignment
  async resumeAssignment(req, res, next) {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.id;

      const assignment = await PlanAssignment.findById(assignmentId);
      if (!assignment) {
        return next(new AppError('Plan assignment not found', 404));
      }

      if (assignment.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await PlanAssignment.findByIdAndUpdate(assignmentId, {
        status: 'active',
        resumedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Complete assignment
  async completeAssignment(req, res, next) {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.id;
      const { finalNotes, outcome } = req.body;

      const assignment = await PlanAssignment.findById(assignmentId);
      if (!assignment) {
        return next(new AppError('Plan assignment not found', 404));
      }

      if (assignment.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await PlanAssignment.findByIdAndUpdate(assignmentId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        finalNotes,
        outcome
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Get assignment statistics
  async getAssignmentStats(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      let query = supabase
        .from('plan_assignments')
        .select('status, progress')
        .eq(userRole === 'therapist' ? 'therapistId' : 'client_id', userId);

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      const stats = {
        total: data?.length || 0,
        byStatus: {},
        completionRate: 0,
        averageProgress: 0
      };

      if (data && data.length > 0) {
        data.forEach(a => {
          stats.byStatus[a.status] = (stats.byStatus[a.status] || 0) + 1;
          if (a.progress?.completionPercentage) {
            stats.averageProgress += a.progress.completionPercentage;
          }
        });
        stats.averageProgress = Math.round(stats.averageProgress / data.length);
        stats.completionRate = stats.byStatus.completed
          ? Math.round((stats.byStatus.completed / stats.total) * 100)
          : 0;
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = planAssignmentController;
