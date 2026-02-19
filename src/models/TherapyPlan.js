const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const therapyPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
    maxlength: [200, 'Plan name cannot exceed 200 characters']
  },
  type: {
    type: String,
    enum: ['ansiedad', 'depresion', 'pareja', 'trauma', 'adicciones', 'autoestima', 'estres', 'trastornos_alimentarios', 'duelo', 'toc', 'other'],
    required: [true, 'Plan type is required']
  },
  description: {
    type: String,
    required: [true, 'Plan description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  duration: {
    type: Number,
    required: [true, 'Duration in weeks is required'],
    min: [1, 'Duration must be at least 1 week'],
    max: [104, 'Duration cannot exceed 2 years (104 weeks)']
  },
  sessionsPerWeek: {
    type: Number,
    required: [true, 'Sessions per week is required'],
    min: [1, 'Must have at least 1 session per week'],
    max: [7, 'Cannot exceed 7 sessions per week']
  },
  totalSessions: {
    type: Number,
    required: [true, 'Total sessions is required'],
    min: [1, 'Must have at least 1 session']
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived', 'template'],
    default: 'draft',
    required: true
  },
  objectives: [{
    type: String,
    trim: true,
    maxlength: [500, 'Objective cannot exceed 500 characters'],
    required: true
  }],
  techniques: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Technique name cannot exceed 100 characters']
    },
    description: {
      type: String,
      maxlength: [500, 'Technique description cannot exceed 500 characters']
    },
    sessionNumbers: [{
      type: Number,
      min: 1
    }]
  }],
  homework: [{
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Homework title cannot exceed 200 characters']
    },
    description: {
      type: String,
      required: true,
      maxlength: [1000, 'Homework description cannot exceed 1000 characters']
    },
    sessionNumber: {
      type: Number,
      required: true,
      min: 1
    },
    estimatedTime: {
      type: Number, // in minutes
      min: 5,
      max: 180
    },
    resources: [{
      type: String,
      trim: true
    }]
  }],
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  assignedClientsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Extended plan structure
  phases: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Phase name cannot exceed 100 characters']
    },
    description: {
      type: String,
      maxlength: [500, 'Phase description cannot exceed 500 characters']
    },
    startSession: {
      type: Number,
      required: true,
      min: 1
    },
    endSession: {
      type: Number,
      required: true,
      min: 1
    },
    objectives: [{
      type: String,
      maxlength: [300, 'Phase objective cannot exceed 300 characters']
    }],
    milestones: [{
      description: String,
      sessionNumber: Number,
      isCompleted: {
        type: Boolean,
        default: false
      }
    }]
  }],
  // Session templates
  sessionTemplates: [{
    sessionNumber: {
      type: Number,
      required: true,
      min: 1
    },
    title: {
      type: String,
      required: true,
      maxlength: [200, 'Session title cannot exceed 200 characters']
    },
    objectives: [{
      type: String,
      maxlength: [300, 'Session objective cannot exceed 300 characters']
    }],
    activities: [{
      name: String,
      duration: Number, // in minutes
      description: String,
      materials: [String]
    }],
    homework: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TherapyPlan.homework'
    },
    notes: {
      type: String,
      maxlength: [1000, 'Session notes cannot exceed 1000 characters']
    }
  }],
  // Assessment and evaluation
  assessmentTools: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    frequency: {
      type: String,
      enum: ['initial', 'weekly', 'biweekly', 'monthly', 'final'],
      default: 'initial'
    },
    sessionNumbers: [Number]
  }],
  successCriteria: [{
    criterion: {
      type: String,
      required: true,
      maxlength: [300, 'Success criterion cannot exceed 300 characters']
    },
    measurementMethod: String,
    targetValue: String
  }],
  // Plan metadata
  category: {
    type: String,
    enum: ['individual', 'couple', 'family', 'group'],
    default: 'individual'
  },
  ageGroup: {
    type: String,
    enum: ['child', 'adolescent', 'adult', 'elderly', 'all'],
    default: 'adult'
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  // Pricing and availability
  pricing: {
    sessionPrice: {
      type: Number,
      min: 0
    },
    packagePrice: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'EUR',
      enum: ['EUR', 'USD', 'GBP']
    }
  },
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TherapyPlan',
    default: null
  },
  // Usage statistics
  statistics: {
    totalAssignments: {
      type: Number,
      default: 0,
      min: 0
    },
    completedAssignments: {
      type: Number,
      default: 0,
      min: 0
    },
    averageCompletionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRatings: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  // Sharing and collaboration
  isPublic: {
    type: Boolean,
    default: false
  },
  sharedWith: [{
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      type: String,
      enum: ['view', 'edit', 'copy'],
      default: 'view'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Version control
  version: {
    type: Number,
    default: 1,
    min: 1
  },
  previousVersions: [{
    versionNumber: Number,
    changes: String,
    modifiedAt: Date,
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
therapyPlanSchema.index({ therapistId: 1, status: 1 });
therapyPlanSchema.index({ type: 1, status: 1 });
therapyPlanSchema.index({ status: 1, createdAt: -1 });
therapyPlanSchema.index({ tags: 1 });
therapyPlanSchema.index({ isPublic: 1, status: 1 });

// Virtual for therapist details
therapyPlanSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for plan assignments
therapyPlanSchema.virtual('assignments', {
  ref: 'PlanAssignment',
  localField: '_id',
  foreignField: 'planId'
});

// Virtual for completion rate
therapyPlanSchema.virtual('completionRate').get(function() {
  if (this.statistics.totalAssignments === 0) return 0;
  return Math.round((this.statistics.completedAssignments / this.statistics.totalAssignments) * 100);
});

// Virtual for estimated duration in weeks
therapyPlanSchema.virtual('estimatedWeeks').get(function() {
  return Math.ceil(this.totalSessions / this.sessionsPerWeek);
});

// Virtual for plan complexity score
therapyPlanSchema.virtual('complexityScore').get(function() {
  let score = 0;
  score += this.objectives.length * 2;
  score += this.techniques.length * 3;
  score += this.homework.length * 2;
  score += this.phases.length * 5;
  score += this.sessionTemplates.length * 1;
  return Math.min(score, 100); // Cap at 100
});

// Method to activate plan
therapyPlanSchema.methods.activate = function() {
  if (this.status === 'draft') {
    this.status = 'active';
  }
  return this.save();
};

// Method to archive plan
therapyPlanSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Method to create template from plan
therapyPlanSchema.methods.createTemplate = function() {
  const templateData = this.toObject();
  delete templateData._id;
  delete templateData.createdAt;
  delete templateData.updatedAt;
  delete templateData.assignedClientsCount;
  delete templateData.statistics;

  templateData.isTemplate = true;
  templateData.templateOf = this._id;
  templateData.status = 'template';
  templateData.name = `${this.name} (Template)`;

  return this.constructor.create(templateData);
};

// Method to assign to client
therapyPlanSchema.methods.assignToClient = function(clientId, startDate = new Date()) {
  const PlanAssignment = mongoose.model('PlanAssignment');

  const assignmentData = {
    planId: this._id,
    clientId,
    therapistId: this.therapistId,
    startDate,
    endDate: new Date(startDate.getTime() + (this.duration * 7 * 24 * 60 * 60 * 1000)),
    status: 'active'
  };

  return PlanAssignment.create(assignmentData);
};

// Method to calculate session schedule
therapyPlanSchema.methods.calculateSessionSchedule = function(startDate) {
  const sessions = [];
  let currentDate = new Date(startDate);
  const sessionsPerWeek = this.sessionsPerWeek;
  const totalSessions = this.totalSessions;

  for (let i = 1; i <= totalSessions; i++) {
    sessions.push({
      sessionNumber: i,
      scheduledDate: new Date(currentDate),
      template: this.sessionTemplates.find(t => t.sessionNumber === i) || null
    });

    // Calculate next session date
    if (i % sessionsPerWeek === 0) {
      // Move to next week
      currentDate.setDate(currentDate.getDate() + (7 - sessionsPerWeek + 1));
    } else {
      // Next day in the same week
      currentDate.setDate(currentDate.getDate() + Math.floor(7 / sessionsPerWeek));
    }
  }

  return sessions;
};

// Method to update statistics
therapyPlanSchema.methods.updateStatistics = async function() {
  const PlanAssignment = mongoose.model('PlanAssignment');

  const stats = await PlanAssignment.aggregate([
    { $match: { planId: this._id } },
    {
      $group: {
        _id: null,
        totalAssignments: { $sum: 1 },
        completedAssignments: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        averageProgress: {
          $avg: {
            $divide: ['$progress.completedSessions', this.totalSessions]
          }
        }
      }
    }
  ]);

  if (stats.length > 0) {
    this.statistics.totalAssignments = stats[0].totalAssignments;
    this.statistics.completedAssignments = stats[0].completedAssignments;
    this.statistics.averageCompletionRate = Math.round((stats[0].averageProgress || 0) * 100);
  }

  this.assignedClientsCount = this.statistics.totalAssignments;
  return this.save();
};

// Method to add rating
therapyPlanSchema.methods.addRating = function(rating) {
  const currentTotal = this.statistics.averageRating * this.statistics.totalRatings;
  this.statistics.totalRatings += 1;
  this.statistics.averageRating = (currentTotal + rating) / this.statistics.totalRatings;
  return this.save();
};

// Method to share with therapist
therapyPlanSchema.methods.shareWith = function(therapistId, permissions = 'view') {
  // Remove existing share if exists
  this.sharedWith = this.sharedWith.filter(
    share => share.therapistId.toString() !== therapistId.toString()
  );

  // Add new share
  this.sharedWith.push({
    therapistId,
    permissions,
    sharedAt: new Date()
  });

  return this.save();
};

// Method to create new version
therapyPlanSchema.methods.createVersion = function(changes, modifiedBy) {
  this.previousVersions.push({
    versionNumber: this.version,
    changes,
    modifiedAt: new Date(),
    modifiedBy
  });

  this.version += 1;
  this.lastModifiedBy = modifiedBy;

  return this.save();
};

// Static method to get plans by type
therapyPlanSchema.statics.getByType = function(type, filters = {}) {
  const query = { type, status: 'active', ...filters };
  return this.find(query)
    .populate('therapist', 'name specialties avatar')
    .sort({ createdAt: -1 });
};

// Static method to get popular plans
therapyPlanSchema.statics.getPopularPlans = function(limit = 10) {
  return this.find({ status: 'active', isPublic: true })
    .sort({ 'statistics.totalAssignments': -1, 'statistics.averageRating': -1 })
    .limit(limit)
    .populate('therapist', 'name specialties avatar');
};

// Static method to get plan statistics
therapyPlanSchema.statics.getPlanStatistics = function(therapistId = null) {
  const matchQuery = therapistId ? { therapistId: new mongoose.Types.ObjectId(therapistId) } : {};

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAssignments: { $sum: '$statistics.totalAssignments' },
        averageRating: { $avg: '$statistics.averageRating' },
        averageCompletionRate: { $avg: '$statistics.averageCompletionRate' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to search plans
therapyPlanSchema.statics.searchPlans = function(searchQuery, filters = {}) {
  const query = {
    status: 'active',
    ...filters
  };

  if (searchQuery) {
    query.$or = [
      { name: { $regex: searchQuery, $options: 'i' } },
      { description: { $regex: searchQuery, $options: 'i' } },
      { tags: { $in: [new RegExp(searchQuery, 'i')] } },
      { 'objectives': { $in: [new RegExp(searchQuery, 'i')] } }
    ];
  }

  return this.find(query)
    .populate('therapist', 'name specialties avatar')
    .sort({ 'statistics.averageRating': -1, 'statistics.totalAssignments': -1 });
};

// Pre-save middleware
therapyPlanSchema.pre('save', function(next) {
  // Calculate total sessions if not set
  if (this.isModified('duration') || this.isModified('sessionsPerWeek')) {
    if (!this.totalSessions) {
      this.totalSessions = this.duration * this.sessionsPerWeek;
    }
  }

  // Validate session templates don't exceed total sessions
  if (this.sessionTemplates.length > 0) {
    const maxSessionNumber = Math.max(...this.sessionTemplates.map(t => t.sessionNumber));
    if (maxSessionNumber > this.totalSessions) {
      return next(new Error('Session template numbers cannot exceed total sessions'));
    }
  }

  // Update lastModifiedBy if not set
  if (this.isModified() && !this.isNew && !this.lastModifiedBy) {
    this.lastModifiedBy = this.therapistId;
  }

  next();
});

// Post-save middleware
therapyPlanSchema.post('save', function() {
  // Here you would trigger notifications or updates
  // Example: notificationService.notifyPlanUpdate(this);
});

// Add pagination plugin
therapyPlanSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('TherapyPlan', therapyPlanSchema);