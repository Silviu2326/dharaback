const { validationResult } = require('express-validator');
const { TherapyPlan, PlanAssignment, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const therapyPlanController = {
  // Get therapy plans with filters and pagination
  async getTherapyPlans(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      const {
        status,
        type,
        category,
        ageGroup,
        difficulty,
        tags,
        isTemplate,
        isPublic,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc',
        search
      } = req.query;

      // Build Supabase query
      let query = supabase
        .from('therapy_plans')
        .select('*, therapist:therapist_id(*)', { count: 'exact' });

      // Apply filters
      if (status) query = query.eq('status', status);
      if (type) query = query.eq('type', type);
      if (category) query = query.eq('category', category);
      if (ageGroup) query = query.eq('age_group', ageGroup);
      if (difficulty) query = query.eq('difficulty', difficulty);
      if (isTemplate !== undefined) query = query.eq('is_template', isTemplate === 'true');
      // if (isPublic !== undefined) query = query.eq('is_public', isPublic === 'true');
      if (tags) {
        const tagArray = tags.split(',');
        query = query.contains('tags', tagArray);
      }

      // Handle search functionality
      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      // Access control
      if (userRole === 'therapist') {
        // Therapists can see: their own plans + public active plans + plans shared with them
        // query = query.or(`therapist_id.eq.${userId},and(is_public.eq.true,status.eq.active)`);
        query = query.eq('therapist_id', userId);
      }

      // Apply sorting and pagination
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      // Get shared plans separately for therapists
      let sharedPlans = [];
      if (userRole === 'therapist') {
        const { data: shared } = await supabase
          .from('therapy_plan_shares')
          .select('plan_id')
          .eq('therapist_id', userId);
        
        if (shared && shared.length > 0) {
          const planIds = shared.map(s => s.plan_id);
          const { data: sharedPlanData } = await supabase
            .from('therapy_plans')
            .select('*, therapist:therapist_id(*)')
            .in('id', planIds);
          sharedPlans = sharedPlanData || [];
        }
      }

      // Combine and deduplicate
      const allPlans = [...(data || []), ...sharedPlans];
      const uniquePlans = allPlans.filter((plan, index, self) => 
        index === self.findIndex(p => p.id === plan.id)
      );

      res.json({
        success: true,
        plans: uniquePlans, // Return plans array for frontend compatibility
        data: uniquePlans,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil((count || 0) / parseInt(limit)),
          totalDocs: count || 0,
          hasNextPage: offset + uniquePlans.length < (count || 0),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Create new therapy plan
  async createTherapyPlan(req, res, next) {
    try {
      // Convert objectives from object { '0': 'text' } to array ['text'] if needed
      if (req.body.objectives && typeof req.body.objectives === 'object' && !Array.isArray(req.body.objectives)) {
        const objectivesArray = Object.values(req.body.objectives).filter(v => v && typeof v === 'string');
        req.body.objectives = objectivesArray.length > 0 ? objectivesArray : req.body.objectives;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const userId = req.user.id;
      const planData = {
        ...req.body,
        therapistId: userId,
        status: 'draft'
      };

      // Calculate total sessions if not provided
      if (!planData.totalSessions && planData.duration && planData.sessionsPerWeek) {
        planData.totalSessions = planData.duration * planData.sessionsPerWeek;
      }

      const therapyPlan = await TherapyPlan.create(planData);

      res.status(201).json({
        success: true,
        message: 'Therapy plan created successfully',
        data: therapyPlan
      });
    } catch (error) {
      next(error);
    }
  },

  // Get single therapy plan
  async getTherapyPlan(req, res, next) {
    try {
      const { planId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      // Get therapist info
      const therapist = await User.findById(therapyPlan.therapist_id);

      // Check permissions
      const hasAccess =
        userRole === 'admin' ||
        therapyPlan.therapist_id === userId;
        // (therapyPlan.is_public && therapyPlan.status === 'active');

      // Check if shared with user
      if (!hasAccess && userRole === 'therapist') {
        const { data: share } = await supabase
          .from('therapy_plan_shares')
          .select('*')
          .eq('plan_id', planId)
          .eq('therapist_id', userId)
          .single();
        
        if (!share) {
          return next(new AppError('Access denied', 403));
        }
      }

      if (!hasAccess && userRole !== 'therapist') {
        return next(new AppError('Access denied', 403));
      }

      // Get assignments for this plan
      const { data: assignments } = await supabase
        .from('plan_assignments')
        .select('*')
        .eq('therapy_plan_id', planId);

      res.json({
        success: true,
        data: {
          ...therapyPlan,
          therapist: therapist ? {
            id: therapist.id,
            name: therapist.name,
            email: therapist.email
          } : null,
          assignments: assignments || []
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Update therapy plan
  async updateTherapyPlan(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { planId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      const updates = req.body;

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      // Check permissions
      const canEdit =
        userRole === 'admin' ||
        therapyPlan.therapist_id === userId;

      // Check if shared with edit permissions
      if (!canEdit && userRole === 'therapist') {
        const { data: share } = await supabase
          .from('therapy_plan_shares')
          .select('*')
          .eq('plan_id', planId)
          .eq('therapist_id', userId)
          .eq('permissions', 'edit')
          .single();
        
        if (!share) {
          return next(new AppError('Access denied', 403));
        }
      }

      if (!canEdit && userRole !== 'therapist') {
        return next(new AppError('Access denied', 403));
      }

      // Create version if significant changes
      const significantFields = ['objectives', 'techniques', 'homework', 'phases', 'session_templates'];
      const hasSignificantChanges = significantFields.some(field => updates[field]);

      if (hasSignificantChanges) {
        const changesDescription = Object.keys(updates).join(', ');
        
        // Save current version
        await supabase.from('therapy_plan_versions').insert({
          plan_id: planId,
          version_data: therapyPlan,
          changes_description: changesDescription,
          created_by: userId,
          created_at: new Date().toISOString()
        });
      }

      // Recalculate total sessions if duration or sessions per week changed
      if (updates.duration || updates.sessionsPerWeek) {
        const duration = updates.duration || therapyPlan.duration;
        const sessionsPerWeek = updates.sessionsPerWeek || therapyPlan.sessions_per_week;
        updates.totalSessions = duration * sessionsPerWeek;
      }

      const updatedPlan = await TherapyPlan.findByIdAndUpdate(planId, updates);

      res.json({
        success: true,
        message: 'Therapy plan updated successfully',
        data: updatedPlan
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete therapy plan
  async deleteTherapyPlan(req, res, next) {
    try {
      const { planId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      // Check permissions
      if (userRole !== 'admin' && therapyPlan.therapist_id !== userId) {
        return next(new AppError('Access denied', 403));
      }

      // Check if plan has active assignments
      const { count: activeAssignments } = await supabase
        .from('plan_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('therapy_plan_id', planId)
        .in('status', ['active', 'paused']);

      if (activeAssignments > 0) {
        return next(new AppError('Cannot delete plan with active assignments. Archive it instead.', 400));
      }

      await TherapyPlan.findByIdAndDelete(planId);

      res.json({
        success: true,
        message: 'Therapy plan deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Activate therapy plan
  async activateTherapyPlan(req, res, next) {
    try {
      const { planId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      if (userRole !== 'admin' && therapyPlan.therapist_id !== userId) {
        return next(new AppError('Access denied', 403));
      }

      const updatedPlan = await TherapyPlan.findByIdAndUpdate(planId, {
        status: 'active',
        activatedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Therapy plan activated successfully',
        data: updatedPlan
      });
    } catch (error) {
      next(error);
    }
  },

  // Archive therapy plan
  async archiveTherapyPlan(req, res, next) {
    try {
      const { planId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      if (userRole !== 'admin' && therapyPlan.therapist_id !== userId) {
        return next(new AppError('Access denied', 403));
      }

      const updatedPlan = await TherapyPlan.findByIdAndUpdate(planId, {
        status: 'archived',
        archivedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Therapy plan archived successfully',
        data: updatedPlan
      });
    } catch (error) {
      next(error);
    }
  },

  // Create template from therapy plan
  async createTemplate(req, res, next) {
    try {
      const { planId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      if (userRole !== 'admin' && therapyPlan.therapist_id !== userId) {
        return next(new AppError('Access denied', 403));
      }

      // Create template copy
      const templateData = {
        ...therapyPlan,
        id: undefined, // Let Supabase generate new ID
        therapistId: userId,
        isTemplate: true,
        parentPlanId: planId,
        status: 'active',
        createdAt: undefined,
        updatedAt: undefined
      };

      const template = await TherapyPlan.create(templateData);

      res.status(201).json({
        success: true,
        message: 'Template created successfully',
        data: template
      });
    } catch (error) {
      next(error);
    }
  },

  // Share therapy plan with another therapist
  async shareTherapyPlan(req, res, next) {
    try {
      const { planId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      const { therapistId, permissions = 'view' } = req.body;

      if (!therapistId) {
        return next(new AppError('Therapist ID is required', 400));
      }

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      if (userRole !== 'admin' && therapyPlan.therapist_id !== userId) {
        return next(new AppError('Access denied', 403));
      }

      // Add share record
      const { data: share, error } = await supabase
        .from('therapy_plan_shares')
        .upsert({
          plan_id: planId,
          therapist_id: therapistId,
          permissions,
          shared_by: userId,
          shared_at: new Date().toISOString()
        }, {
          onConflict: 'plan_id,therapist_id'
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'Therapy plan shared successfully',
        data: share
      });
    } catch (error) {
      next(error);
    }
  },

  // Assign therapy plan to client
  async assignToClient(req, res, next) {
    try {
      const { planId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      const { clientId, startDate, customizations } = req.body;

      if (!clientId) {
        return next(new AppError('Client ID is required', 400));
      }

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      // Check permissions
      const canAssign =
        userRole === 'admin' ||
        therapyPlan.therapist_id === userId;

      // Check if shared with copy/edit permissions
      if (!canAssign && userRole === 'therapist') {
        const { data: share } = await supabase
          .from('therapy_plan_shares')
          .select('*')
          .eq('plan_id', planId)
          .eq('therapist_id', userId)
          .in('permissions', ['edit', 'copy'])
          .single();
        
        if (!share) {
          return next(new AppError('Access denied', 403));
        }
      }

      if (!canAssign && userRole !== 'therapist') {
        return next(new AppError('Access denied', 403));
      }

      // Calculate end date based on duration
      const start = startDate ? new Date(startDate) : new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + (therapyPlan.duration * 7));

      const assignmentData = {
        therapyPlanId: planId,
        clientId,
        therapistId: userId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: 'active',
        goals: therapyPlan.objectives || [],
        progress: {
          completedSessions: 0,
          totalSessions: therapyPlan.total_sessions || therapyPlan.duration * therapyPlan.sessions_per_week,
          completionPercentage: 0
        },
        customizations
      };

      const assignment = await PlanAssignment.create(assignmentData);

      // Update plan statistics
      await supabase.rpc('increment_plan_assignments', { plan_id: planId });

      res.status(201).json({
        success: true,
        message: 'Therapy plan assigned to client successfully',
        data: assignment
      });
    } catch (error) {
      next(error);
    }
  },

  // Get therapy plan statistics
  async getTherapyPlanStats(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { therapistId } = req.query;

      let targetTherapistId = null;

      if (userRole === 'therapist') {
        targetTherapistId = userId;
      } else if (therapistId && userRole === 'admin') {
        targetTherapistId = therapistId;
      }

      // Build query
      let query = supabase.from('therapy_plans').select('*');
      if (targetTherapistId) {
        query = query.eq('therapist_id', targetTherapistId);
      }

      const { data: plans, error } = await query;

      if (error) throw new Error(error.message);

      // Calculate statistics
      const stats = {
        total: plans?.length || 0,
        byStatus: {},
        byType: {},
        templates: 0,
        public: 0
      };

      (plans || []).forEach(plan => {
        // By status
        stats.byStatus[plan.status] = (stats.byStatus[plan.status] || 0) + 1;
        // By type
        stats.byType[plan.type] = (stats.byType[plan.type] || 0) + 1;
        // Templates
        if (plan.is_template) stats.templates++;
        // Public - column doesn't exist yet
        // if (plan.is_public) stats.public++;
      });

      // Get popular plans (most assigned)
      const { data: popularPlans } = await supabase
        .from('therapy_plans')
        .select('id, name, type, total_assignments')
        .order('total_assignments', { ascending: false })
        .limit(5);

      res.json({
        success: true,
        data: {
          statistics: stats,
          popularPlans: popularPlans || [],
          totals: {
            totalPlans: stats.total,
            activePlans: stats.byStatus.active || 0,
            templates: stats.templates,
            drafts: stats.byStatus.draft || 0,
            archived: stats.byStatus.archived || 0
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get popular therapy plans
  async getPopularPlans(req, res, next) {
    try {
      const { limit = 10 } = req.query;

      const { data: popularPlans, error } = await supabase
        .from('therapy_plans')
        .select('*, therapist:therapist_id(name, email)')
        .order('total_assignments', { ascending: false })
        .limit(parseInt(limit));

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: popularPlans || []
      });
    } catch (error) {
      next(error);
    }
  },

  // Get therapy plans by type
  async getPlansByType(req, res, next) {
    try {
      const { type } = req.params;
      const { category, ageGroup, difficulty } = req.query;
      const userId = req.user.id;
      const userRole = req.user.role;

      let query = supabase
        .from('therapy_plans')
        .select('*')
        .eq('type', type);

      if (category) query = query.eq('category', category);
      if (ageGroup) query = query.eq('age_group', ageGroup);
      if (difficulty) query = query.eq('difficulty', difficulty);

      // Access control
      if (userRole === 'therapist') {
        // query = query.or(`therapist_id.eq.${userId},and(is_public.eq.true,status.eq.active)`);
        query = query.eq('therapist_id', userId);
      }

      const { data: plans, error } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: plans || []
      });
    } catch (error) {
      next(error);
    }
  },

  // Calculate session schedule
  async calculateSessionSchedule(req, res, next) {
    try {
      const { planId } = req.params;
      const { startDate } = req.query;

      if (!startDate) {
        return next(new AppError('Start date is required', 400));
      }

      const therapyPlan = await TherapyPlan.findById(planId);

      if (!therapyPlan) {
        return next(new AppError('Therapy plan not found', 404));
      }

      const start = new Date(startDate);
      const schedule = [];
      const sessionsPerWeek = therapyPlan.sessions_per_week || 1;
      const totalSessions = therapyPlan.total_sessions || therapyPlan.duration * sessionsPerWeek;

      // Generate schedule
      let currentDate = new Date(start);
      for (let i = 0; i < totalSessions; i++) {
        schedule.push({
          sessionNumber: i + 1,
          scheduledDate: currentDate.toISOString(),
          status: 'pending'
        });

        // Advance to next session date
        const daysToAdd = Math.floor(7 / sessionsPerWeek);
        currentDate.setDate(currentDate.getDate() + daysToAdd);
      }

      res.json({
        success: true,
        data: {
          schedule,
          totalSessions: schedule.length,
          estimatedEndDate: schedule[schedule.length - 1]?.scheduledDate
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = therapyPlanController;
