const mongoose = require('mongoose');

const clientPlanProgressSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client ID is required'],
    index: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TherapyPlan',
    required: [true, 'Plan ID is required'],
    index: true
  },
  objective: {
    type: String,
    required: [true, 'Objective is required'],
    trim: true,
    maxlength: [500, 'Objective cannot exceed 500 characters']
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'not_started',
    required: true,
    index: true
  },
  notes: {
    type: String,
    maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    trim: true
  },
  completedAt: {
    type: Date,
    default: null,
    validate: {
      validator: function(value) {
        if (value && this.status !== 'completed') {
          return false;
        }
        if (!value && this.status === 'completed') {
          return false;
        }
        return true;
      },
      message: 'completedAt should only be set when status is completed'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
clientPlanProgressSchema.index({ clientId: 1, planId: 1 });
clientPlanProgressSchema.index({ clientId: 1, status: 1 });
clientPlanProgressSchema.index({ planId: 1, status: 1 });
clientPlanProgressSchema.index({ status: 1, updatedAt: -1 });

// Virtual for client details
clientPlanProgressSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for therapy plan details
clientPlanProgressSchema.virtual('therapyPlan', {
  ref: 'TherapyPlan',
  localField: 'planId',
  foreignField: '_id',
  justOne: true
});

// Virtual for progress percentage (based on time since started)
clientPlanProgressSchema.virtual('progressPercentage').get(function() {
  if (this.status === 'not_started') return 0;
  if (this.status === 'completed') return 100;

  // For in_progress, calculate based on time elapsed
  const now = new Date();
  const created = this.createdAt;
  const daysSinceStart = Math.floor((now - created) / (1000 * 60 * 60 * 24));

  // Assume average objective takes 2 weeks to complete
  const estimatedDays = 14;
  const percentage = Math.min(Math.floor((daysSinceStart / estimatedDays) * 100), 95);

  return percentage;
});

// Virtual for duration in days
clientPlanProgressSchema.virtual('durationInDays').get(function() {
  if (this.status === 'not_started') return 0;

  const endDate = this.status === 'completed' ? this.completedAt : new Date();
  const startDate = this.createdAt;

  return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
});

// Instance method to mark as completed
clientPlanProgressSchema.methods.markAsCompleted = function(notes = null) {
  this.status = 'completed';
  this.completedAt = new Date();
  if (notes) {
    this.notes = notes;
  }
  return this.save();
};

// Instance method to mark as in progress
clientPlanProgressSchema.methods.markAsInProgress = function(notes = null) {
  this.status = 'in_progress';
  this.completedAt = null;
  if (notes) {
    this.notes = notes;
  }
  return this.save();
};

// Instance method to reset to not started
clientPlanProgressSchema.methods.reset = function() {
  this.status = 'not_started';
  this.completedAt = null;
  return this.save();
};

// Static method to get progress summary for a client and plan
clientPlanProgressSchema.statics.getProgressSummary = function(clientId, planId) {
  return this.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(clientId), planId: new mongoose.Types.ObjectId(planId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        objectives: { $push: '$objective' }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$count' },
        statusBreakdown: {
          $push: {
            status: '$_id',
            count: '$count',
            objectives: '$objectives'
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        completed: {
          $arrayElemAt: [
            {
              $filter: {
                input: '$statusBreakdown',
                cond: { $eq: ['$$this.status', 'completed'] }
              }
            },
            0
          ]
        },
        inProgress: {
          $arrayElemAt: [
            {
              $filter: {
                input: '$statusBreakdown',
                cond: { $eq: ['$$this.status', 'in_progress'] }
              }
            },
            0
          ]
        },
        notStarted: {
          $arrayElemAt: [
            {
              $filter: {
                input: '$statusBreakdown',
                cond: { $eq: ['$$this.status', 'not_started'] }
              }
            },
            0
          ]
        }
      }
    },
    {
      $addFields: {
        completedCount: { $ifNull: ['$completed.count', 0] },
        inProgressCount: { $ifNull: ['$inProgress.count', 0] },
        notStartedCount: { $ifNull: ['$notStarted.count', 0] },
        completionPercentage: {
          $cond: [
            { $eq: ['$total', 0] },
            0,
            { $multiply: [{ $divide: [{ $ifNull: ['$completed.count', 0] }, '$total'] }, 100] }
          ]
        }
      }
    }
  ]);
};

// Static method to get client's overall progress across all plans
clientPlanProgressSchema.statics.getClientOverallProgress = function(clientId) {
  return this.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
    {
      $lookup: {
        from: 'therapyplans',
        localField: 'planId',
        foreignField: '_id',
        as: 'plan'
      }
    },
    { $unwind: '$plan' },
    {
      $group: {
        _id: {
          planId: '$planId',
          planName: '$plan.name',
          planType: '$plan.type'
        },
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        inProgress: {
          $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
        },
        notStarted: {
          $sum: { $cond: [{ $eq: ['$status', 'not_started'] }, 1, 0] }
        },
        lastUpdate: { $max: '$updatedAt' }
      }
    },
    {
      $addFields: {
        completionPercentage: {
          $cond: [
            { $eq: ['$total', 0] },
            0,
            { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }
          ]
        }
      }
    },
    { $sort: { lastUpdate: -1 } }
  ]);
};

// Static method to get therapist's clients progress overview
clientPlanProgressSchema.statics.getTherapistClientsProgress = function(therapistId) {
  return this.aggregate([
    {
      $lookup: {
        from: 'clients',
        localField: 'clientId',
        foreignField: '_id',
        as: 'client'
      }
    },
    { $unwind: '$client' },
    { $match: { 'client.therapistId': new mongoose.Types.ObjectId(therapistId) } },
    {
      $lookup: {
        from: 'therapyplans',
        localField: 'planId',
        foreignField: '_id',
        as: 'plan'
      }
    },
    { $unwind: '$plan' },
    {
      $group: {
        _id: {
          clientId: '$clientId',
          clientName: '$client.name',
          planId: '$planId',
          planName: '$plan.name'
        },
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        inProgress: {
          $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
        },
        lastUpdate: { $max: '$updatedAt' }
      }
    },
    {
      $addFields: {
        completionPercentage: {
          $cond: [
            { $eq: ['$total', 0] },
            0,
            { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }
          ]
        }
      }
    },
    { $sort: { '_id.clientName': 1, lastUpdate: -1 } }
  ]);
};

// Pre-save middleware to automatically set completedAt
clientPlanProgressSchema.pre('save', function(next) {
  // Set completedAt when status changes to completed
  if (this.isModified('status')) {
    if (this.status === 'completed' && !this.completedAt) {
      this.completedAt = new Date();
    } else if (this.status !== 'completed' && this.completedAt) {
      this.completedAt = null;
    }
  }

  // Validate that clientId and planId exist
  if (this.isNew || this.isModified('clientId') || this.isModified('planId')) {
    // We'll add validation in the controller to check if Client and TherapyPlan exist
  }

  next();
});

// Pre-remove middleware to update related statistics
clientPlanProgressSchema.pre('remove', async function(next) {
  try {
    // Update therapy plan statistics if needed
    const TherapyPlan = mongoose.model('TherapyPlan');
    const plan = await TherapyPlan.findById(this.planId);
    if (plan && plan.updateStatistics) {
      await plan.updateStatistics();
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware for statistics updates
clientPlanProgressSchema.post('save', async function() {
  try {
    // Update therapy plan statistics
    const TherapyPlan = mongoose.model('TherapyPlan');
    const plan = await TherapyPlan.findById(this.planId);
    if (plan && plan.updateStatistics) {
      await plan.updateStatistics();
    }
  } catch (error) {
    console.error('Error updating plan statistics:', error);
  }
});

module.exports = mongoose.model('ClientPlanProgress', clientPlanProgressSchema);