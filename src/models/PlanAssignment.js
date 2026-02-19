const mongoose = require('mongoose');

const planAssignmentSchema = new mongoose.Schema({
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TherapyPlan',
    required: [true, 'Plan ID is required']
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client ID is required']
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    default: Date.now
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled', 'paused', 'on_hold'],
    default: 'active',
    required: true
  },
  progress: {
    completedSessions: {
      type: Number,
      default: 0,
      min: 0
    },
    completedObjectives: [{
      objective: String,
      completedAt: {
        type: Date,
        default: Date.now
      },
      notes: String
    }],
    notes: {
      type: String,
      maxlength: [2000, 'Progress notes cannot exceed 2000 characters']
    },
    overallProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  assignedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  completedAt: {
    type: Date,
    default: null
  },
  // Extended assignment details
  customizations: {
    modifiedObjectives: [{
      originalObjective: String,
      modifiedObjective: String,
      reason: String,
      modifiedAt: Date,
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    additionalHomework: [{
      title: String,
      description: String,
      dueDate: Date,
      isCompleted: {
        type: Boolean,
        default: false
      },
      completedAt: Date,
      feedback: String
    }],
    sessionAdjustments: [{
      sessionNumber: Number,
      originalContent: String,
      modifiedContent: String,
      reason: String,
      modifiedAt: Date
    }]
  },
  // Session tracking
  sessionTracking: [{
    sessionNumber: {
      type: Number,
      required: true,
      min: 1
    },
    plannedDate: Date,
    actualDate: Date,
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled'],
      default: 'scheduled'
    },
    duration: {
      type: Number, // in minutes
      min: 15,
      max: 180
    },
    objectives: [{
      objective: String,
      achieved: {
        type: Boolean,
        default: false
      },
      notes: String
    }],
    homework: {
      assigned: [{
        title: String,
        description: String,
        dueDate: Date
      }],
      reviewed: [{
        title: String,
        completed: Boolean,
        feedback: String,
        rating: {
          type: Number,
          min: 1,
          max: 5
        }
      }]
    },
    therapistNotes: {
      type: String,
      maxlength: [1000, 'Therapist notes cannot exceed 1000 characters']
    },
    clientFeedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comments: String,
      mood: {
        type: String,
        enum: ['very_low', 'low', 'neutral', 'good', 'excellent']
      }
    },
    techniques: [{
      name: String,
      effectiveness: {
        type: Number,
        min: 1,
        max: 5
      },
      notes: String
    }]
  }],
  // Assessment and evaluation
  assessments: [{
    name: String,
    type: {
      type: String,
      enum: ['initial', 'progress', 'final', 'custom']
    },
    date: Date,
    score: Number,
    results: mongoose.Schema.Types.Mixed,
    interpretedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }],
  // Milestones and achievements
  milestones: [{
    title: String,
    description: String,
    targetDate: Date,
    achievedDate: Date,
    isAchieved: {
      type: Boolean,
      default: false
    },
    evidence: String,
    celebrationNote: String
  }],
  // Client engagement metrics
  engagement: {
    attendanceRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    homeworkCompletionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    averageSessionRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    communicationFrequency: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    motivationLevel: {
      type: String,
      enum: ['very_low', 'low', 'medium', 'high', 'very_high'],
      default: 'medium'
    }
  },
  // Financial tracking
  financial: {
    totalCost: {
      type: Number,
      default: 0,
      min: 0
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    outstandingAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    paymentPlan: {
      type: String,
      enum: ['per_session', 'weekly', 'monthly', 'full_upfront'],
      default: 'per_session'
    },
    currency: {
      type: String,
      default: 'EUR',
      enum: ['EUR', 'USD', 'GBP']
    }
  },
  // Communication preferences
  communicationSettings: {
    preferredChannel: {
      type: String,
      enum: ['email', 'sms', 'whatsapp', 'app_notification'],
      default: 'app_notification'
    },
    reminderFrequency: {
      type: String,
      enum: ['none', 'day_before', 'two_days_before', 'week_before'],
      default: 'day_before'
    },
    progressReportFrequency: {
      type: String,
      enum: ['never', 'weekly', 'biweekly', 'monthly'],
      default: 'monthly'
    }
  },
  // Emergency and crisis management
  crisisManagement: {
    hasCrisisPlan: {
      type: Boolean,
      default: false
    },
    crisisPlan: {
      triggers: [String],
      contactNumbers: [String],
      immediateActions: [String],
      escalationProcedure: String
    },
    crisisIncidents: [{
      date: Date,
      description: String,
      actionsTaken: String,
      outcome: String,
      followUpRequired: Boolean
    }]
  },
  // Pause and resumption tracking
  pauseHistory: [{
    pausedAt: Date,
    resumedAt: Date,
    reason: String,
    pausedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }],
  // Final outcome and evaluation
  outcome: {
    overallSatisfaction: {
      type: Number,
      min: 1,
      max: 5
    },
    goalAchievement: {
      type: Number,
      min: 0,
      max: 100
    },
    symptomsImprovement: {
      type: Number,
      min: 0,
      max: 100
    },
    qualityOfLifeImprovement: {
      type: Number,
      min: 0,
      max: 100
    },
    wouldRecommend: {
      type: Boolean,
      default: null
    },
    completionReason: {
      type: String,
      enum: ['goals_achieved', 'time_completed', 'client_decision', 'therapist_recommendation', 'external_factors'],
      default: null
    },
    followUpPlan: String,
    finalNotes: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
planAssignmentSchema.index({ therapistId: 1, status: 1, startDate: -1 });
planAssignmentSchema.index({ clientId: 1, status: 1 });
planAssignmentSchema.index({ planId: 1, status: 1 });
planAssignmentSchema.index({ status: 1, endDate: 1 });

// Compound index for active assignments
planAssignmentSchema.index({
  therapistId: 1,
  status: 1,
  'progress.lastUpdated': -1
});

// Virtual for plan details
planAssignmentSchema.virtual('plan', {
  ref: 'TherapyPlan',
  localField: 'planId',
  foreignField: '_id',
  justOne: true
});

// Virtual for client details
planAssignmentSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for therapist details
planAssignmentSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for assignment duration in days
planAssignmentSchema.virtual('durationDays').get(function() {
  const diffTime = this.endDate - this.startDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for remaining sessions
planAssignmentSchema.virtual('remainingSessions').get(function() {
  if (!this.plan) return null;
  return Math.max(0, this.plan.totalSessions - this.progress.completedSessions);
});

// Virtual for days remaining
planAssignmentSchema.virtual('daysRemaining').get(function() {
  if (this.status !== 'active') return 0;
  const now = new Date();
  if (now > this.endDate) return 0;
  const diffTime = this.endDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
planAssignmentSchema.virtual('isOverdue').get(function() {
  return this.status === 'active' && new Date() > this.endDate;
});

// Virtual for completion percentage
planAssignmentSchema.virtual('completionPercentage').get(function() {
  if (!this.plan) return 0;
  return Math.round((this.progress.completedSessions / this.plan.totalSessions) * 100);
});

// Method to complete session
planAssignmentSchema.methods.completeSession = function(sessionData) {
  const sessionNumber = this.progress.completedSessions + 1;

  // Add session tracking
  this.sessionTracking.push({
    sessionNumber,
    actualDate: new Date(),
    status: 'completed',
    ...sessionData
  });

  // Update progress
  this.progress.completedSessions += 1;
  this.progress.lastUpdated = new Date();

  // Calculate overall progress
  if (this.plan) {
    this.progress.overallProgress = Math.round(
      (this.progress.completedSessions / this.plan.totalSessions) * 100
    );
  }

  // Update engagement metrics
  this.updateEngagementMetrics();

  return this.save();
};

// Method to complete objective
planAssignmentSchema.methods.completeObjective = function(objective, notes = '') {
  this.progress.completedObjectives.push({
    objective,
    completedAt: new Date(),
    notes
  });

  this.progress.lastUpdated = new Date();
  return this.save();
};

// Method to pause assignment
planAssignmentSchema.methods.pause = function(reason, pausedBy) {
  this.status = 'paused';

  this.pauseHistory.push({
    pausedAt: new Date(),
    reason,
    pausedBy
  });

  return this.save();
};

// Method to resume assignment
planAssignmentSchema.methods.resume = function(notes = '') {
  this.status = 'active';

  // Update the last pause record
  const lastPause = this.pauseHistory[this.pauseHistory.length - 1];
  if (lastPause && !lastPause.resumedAt) {
    lastPause.resumedAt = new Date();
    lastPause.notes = notes;
  }

  return this.save();
};

// Method to complete assignment
planAssignmentSchema.methods.complete = function(outcomeData = {}) {
  this.status = 'completed';
  this.completedAt = new Date();

  // Update outcome data
  Object.assign(this.outcome, outcomeData);

  // Update plan statistics
  this.updatePlanStatistics();

  return this.save();
};

// Method to cancel assignment
planAssignmentSchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  this.outcome.completionReason = reason;
  return this.save();
};

// Method to update engagement metrics
planAssignmentSchema.methods.updateEngagementMetrics = function() {
  const completedSessions = this.sessionTracking.filter(s => s.status === 'completed');
  const totalScheduled = this.sessionTracking.length;

  // Calculate attendance rate
  if (totalScheduled > 0) {
    this.engagement.attendanceRate = Math.round((completedSessions.length / totalScheduled) * 100);
  }

  // Calculate homework completion rate
  let totalHomework = 0;
  let completedHomework = 0;

  completedSessions.forEach(session => {
    if (session.homework && session.homework.reviewed) {
      totalHomework += session.homework.reviewed.length;
      completedHomework += session.homework.reviewed.filter(h => h.completed).length;
    }
  });

  if (totalHomework > 0) {
    this.engagement.homeworkCompletionRate = Math.round((completedHomework / totalHomework) * 100);
  }

  // Calculate average session rating
  const ratingsArray = completedSessions
    .filter(s => s.clientFeedback && s.clientFeedback.rating)
    .map(s => s.clientFeedback.rating);

  if (ratingsArray.length > 0) {
    this.engagement.averageSessionRating = ratingsArray.reduce((a, b) => a + b) / ratingsArray.length;
  }
};

// Method to update plan statistics
planAssignmentSchema.methods.updatePlanStatistics = async function() {
  const TherapyPlan = mongoose.model('TherapyPlan');
  const plan = await TherapyPlan.findById(this.planId);
  if (plan) {
    await plan.updateStatistics();
  }
};

// Method to generate progress report
planAssignmentSchema.methods.generateProgressReport = function() {
  const completedSessions = this.sessionTracking.filter(s => s.status === 'completed');

  return {
    assignmentId: this._id,
    client: this.client,
    plan: this.plan,
    startDate: this.startDate,
    endDate: this.endDate,
    status: this.status,
    progress: {
      sessionsCompleted: this.progress.completedSessions,
      overallProgress: this.progress.overallProgress,
      objectivesCompleted: this.progress.completedObjectives.length
    },
    engagement: this.engagement,
    recentSessions: completedSessions.slice(-5),
    milestones: this.milestones,
    nextSteps: this.getNextSteps(),
    generatedAt: new Date()
  };
};

// Method to get next steps
planAssignmentSchema.methods.getNextSteps = function() {
  const nextSteps = [];

  // Check for upcoming sessions
  const nextSessionNumber = this.progress.completedSessions + 1;
  if (this.plan && nextSessionNumber <= this.plan.totalSessions) {
    nextSteps.push(`Prepare for session ${nextSessionNumber}`);
  }

  // Check for pending homework
  const pendingHomework = this.customizations.additionalHomework.filter(h => !h.isCompleted);
  if (pendingHomework.length > 0) {
    nextSteps.push(`Complete ${pendingHomework.length} pending homework assignments`);
  }

  // Check for milestones
  const upcomingMilestones = this.milestones.filter(m => !m.isAchieved && m.targetDate > new Date());
  if (upcomingMilestones.length > 0) {
    nextSteps.push(`Work towards ${upcomingMilestones.length} upcoming milestones`);
  }

  return nextSteps;
};

// Static method to get assignments by status
planAssignmentSchema.statics.getByStatus = function(status, therapistId = null) {
  const query = { status };
  if (therapistId) query.therapistId = therapistId;

  return this.find(query)
    .populate('plan', 'name type duration totalSessions')
    .populate('client', 'name email phone avatar')
    .sort({ 'progress.lastUpdated': -1 });
};

// Static method to get overdue assignments
planAssignmentSchema.statics.getOverdueAssignments = function(therapistId = null) {
  const query = {
    status: 'active',
    endDate: { $lt: new Date() }
  };

  if (therapistId) query.therapistId = therapistId;

  return this.find(query)
    .populate('plan', 'name type')
    .populate('client', 'name email phone');
};

// Static method to get assignment statistics
planAssignmentSchema.statics.getAssignmentStats = function(therapistId = null) {
  const matchQuery = therapistId ? { therapistId: new mongoose.Types.ObjectId(therapistId) } : {};

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        averageProgress: { $avg: '$progress.overallProgress' },
        averageEngagement: { $avg: '$engagement.attendanceRate' }
      }
    }
  ]);
};

// Pre-save middleware
planAssignmentSchema.pre('save', function(next) {
  // Update financial calculations
  if (this.isModified('financial.totalCost') || this.isModified('financial.paidAmount')) {
    this.financial.outstandingAmount = this.financial.totalCost - this.financial.paidAmount;
  }

  // Auto-complete if all sessions are done
  if (this.plan && this.progress.completedSessions >= this.plan.totalSessions && this.status === 'active') {
    this.status = 'completed';
    this.completedAt = new Date();
  }

  next();
});

// Post-save middleware
planAssignmentSchema.post('save', function() {
  // Here you would trigger notifications or updates
  // Example: notificationService.notifyAssignmentUpdate(this);
});

// Ensure only one active assignment per client-plan combination
planAssignmentSchema.index(
  { clientId: 1, planId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' }
  }
);

module.exports = mongoose.model('PlanAssignment', planAssignmentSchema);