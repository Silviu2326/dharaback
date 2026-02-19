const mongoose = require('mongoose');

const sessionNoteSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: [true, 'Booking ID is required'],
    unique: true,
    index: true
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required'],
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client ID is required'],
    index: true
  },
  notes: {
    type: String,
    required: [true, 'Session notes are required'],
    trim: true,
    minlength: [10, 'Notes must be at least 10 characters long'],
    maxlength: [5000, 'Notes cannot exceed 5000 characters']
  },
  objectives: [{
    type: String,
    trim: true,
    maxlength: [300, 'Each objective cannot exceed 300 characters']
  }],
  homework: [{
    type: String,
    trim: true,
    maxlength: [500, 'Each homework item cannot exceed 500 characters']
  }],
  nextSteps: {
    type: String,
    trim: true,
    maxlength: [2000, 'Next steps cannot exceed 2000 characters']
  },
  mood: {
    type: String,
    enum: ['very_poor', 'poor', 'fair', 'good', 'excellent'],
    required: [true, 'Client mood assessment is required'],
    index: true
  },
  progress: {
    type: String,
    enum: ['no_progress', 'minimal', 'moderate', 'significant', 'excellent'],
    required: [true, 'Progress assessment is required'],
    index: true
  },
  isConfidential: {
    type: Boolean,
    default: true,
    required: true
  },
  // Additional therapeutic information
  sessionType: {
    type: String,
    enum: ['initial', 'follow_up', 'crisis', 'final', 'group', 'family'],
    default: 'follow_up'
  },
  treatmentPlan: {
    interventions: [{
      type: String,
      trim: true,
      maxlength: [200, 'Each intervention cannot exceed 200 characters']
    }],
    techniques: [{
      type: String,
      trim: true,
      maxlength: [200, 'Each technique cannot exceed 200 characters']
    }]
  },
  riskAssessment: {
    level: {
      type: String,
      enum: ['none', 'low', 'moderate', 'high', 'critical'],
      default: 'none'
    },
    notes: {
      type: String,
      maxlength: [1000, 'Risk assessment notes cannot exceed 1000 characters']
    },
    flagged: {
      type: Boolean,
      default: false
    }
  },
  // Clinical measures
  clinicalMeasures: {
    anxiety: {
      type: Number,
      min: 0,
      max: 10,
      default: null
    },
    depression: {
      type: Number,
      min: 0,
      max: 10,
      default: null
    },
    stress: {
      type: Number,
      min: 0,
      max: 10,
      default: null
    },
    functioning: {
      type: Number,
      min: 0,
      max: 10,
      default: null
    }
  },
  // Metadata
  sessionDuration: {
    type: Number, // in minutes
    min: [15, 'Session must be at least 15 minutes'],
    max: [240, 'Session cannot exceed 240 minutes']
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  // Audit fields
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  editHistory: [{
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    editedAt: {
      type: Date,
      default: Date.now
    },
    changes: {
      type: String,
      maxlength: [500, 'Change description cannot exceed 500 characters']
    },
    ipAddress: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
sessionNoteSchema.index({ therapistId: 1, clientId: 1 });
sessionNoteSchema.index({ therapistId: 1, createdAt: -1 });
sessionNoteSchema.index({ clientId: 1, createdAt: -1 });
sessionNoteSchema.index({ mood: 1, progress: 1 });
sessionNoteSchema.index({ isConfidential: 1, therapistId: 1 });
sessionNoteSchema.index({ 'riskAssessment.flagged': 1, therapistId: 1 });
sessionNoteSchema.index({ tags: 1 });

// Virtual for booking details
sessionNoteSchema.virtual('booking', {
  ref: 'Booking',
  localField: 'bookingId',
  foreignField: '_id',
  justOne: true
});

// Virtual for therapist details
sessionNoteSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for client details
sessionNoteSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for overall client wellness score
sessionNoteSchema.virtual('wellnessScore').get(function() {
  const moodValues = {
    'very_poor': 1,
    'poor': 2,
    'fair': 3,
    'good': 4,
    'excellent': 5
  };

  const progressValues = {
    'no_progress': 1,
    'minimal': 2,
    'moderate': 3,
    'significant': 4,
    'excellent': 5
  };

  const moodScore = moodValues[this.mood] || 3;
  const progressScore = progressValues[this.progress] || 3;

  // Calculate clinical measures average if available
  let clinicalScore = 3; // default neutral score
  const measures = this.clinicalMeasures;
  if (measures) {
    const validMeasures = [measures.anxiety, measures.depression, measures.stress, measures.functioning]
      .filter(m => m !== null && m !== undefined);

    if (validMeasures.length > 0) {
      const avg = validMeasures.reduce((sum, val) => sum + val, 0) / validMeasures.length;
      clinicalScore = Math.round((10 - avg) / 2) + 1; // Invert scale (10 becomes 1, 0 becomes 5)
    }
  }

  return Math.round((moodScore + progressScore + clinicalScore) / 3 * 20); // Scale to 0-100
});

// Virtual for session summary
sessionNoteSchema.virtual('sessionSummary').get(function() {
  return {
    mood: this.mood,
    progress: this.progress,
    wellnessScore: this.wellnessScore,
    riskLevel: this.riskAssessment.level,
    objectivesCount: this.objectives.length,
    homeworkCount: this.homework.length,
    duration: this.sessionDuration
  };
});

// Instance method to add edit history
sessionNoteSchema.methods.addEditHistory = function(editedBy, changes, ipAddress = null) {
  this.editHistory.push({
    editedBy,
    editedAt: new Date(),
    changes,
    ipAddress
  });

  this.lastEditedBy = editedBy;
  return this.save();
};

// Instance method to flag for risk assessment
sessionNoteSchema.methods.flagRisk = function(level, notes, flaggedBy) {
  this.riskAssessment.level = level;
  this.riskAssessment.notes = notes;
  this.riskAssessment.flagged = ['high', 'critical'].includes(level);

  if (this.riskAssessment.flagged) {
    this.addEditHistory(flaggedBy, `Risk flagged as ${level}: ${notes}`);
  }

  return this.save();
};

// Instance method to get progress trend
sessionNoteSchema.methods.getProgressTrend = async function(sessionCount = 5) {
  const SessionNote = this.constructor;

  const recentSessions = await SessionNote.find({
    clientId: this.clientId,
    therapistId: this.therapistId,
    createdAt: { $lte: this.createdAt }
  })
  .sort({ createdAt: -1 })
  .limit(sessionCount)
  .select('mood progress createdAt wellnessScore');

  if (recentSessions.length < 2) return { trend: 'insufficient_data', sessions: recentSessions };

  const scores = recentSessions.reverse().map(s => s.wellnessScore);
  const trend = scores[scores.length - 1] > scores[0] ? 'improving' :
                scores[scores.length - 1] < scores[0] ? 'declining' : 'stable';

  return { trend, scores, sessions: recentSessions };
};

// Static method to get therapist session statistics
sessionNoteSchema.statics.getTherapistStats = function(therapistId, startDate, endDate) {
  const matchQuery = {
    therapistId: new mongoose.Types.ObjectId(therapistId)
  };

  if (startDate && endDate) {
    matchQuery.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        avgWellnessScore: { $avg: '$wellnessScore' },
        moodDistribution: {
          $push: '$mood'
        },
        progressDistribution: {
          $push: '$progress'
        },
        riskCases: {
          $sum: { $cond: [{ $eq: ['$riskAssessment.flagged', true] }, 1, 0] }
        },
        uniqueClients: { $addToSet: '$clientId' }
      }
    },
    {
      $project: {
        _id: 0,
        totalSessions: 1,
        avgWellnessScore: { $round: ['$avgWellnessScore', 2] },
        uniqueClientsCount: { $size: '$uniqueClients' },
        riskCases: 1,
        moodDistribution: 1,
        progressDistribution: 1
      }
    }
  ]);
};

// Static method to get client progress summary
sessionNoteSchema.statics.getClientProgressSummary = function(clientId, therapistId = null) {
  const matchQuery = { clientId: new mongoose.Types.ObjectId(clientId) };
  if (therapistId) {
    matchQuery.therapistId = new mongoose.Types.ObjectId(therapistId);
  }

  return this.aggregate([
    { $match: matchQuery },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        firstSession: { $first: '$$ROOT' },
        lastSession: { $last: '$$ROOT' },
        avgWellnessScore: { $avg: '$wellnessScore' },
        wellnessProgression: { $push: { date: '$createdAt', score: '$wellnessScore' } },
        objectives: { $push: '$objectives' },
        homework: { $push: '$homework' },
        riskFlags: { $sum: { $cond: [{ $eq: ['$riskAssessment.flagged', true] }, 1, 0] } }
      }
    }
  ]);
};

// Static method to search session notes
sessionNoteSchema.statics.searchNotes = function(therapistId, searchQuery, filters = {}) {
  const query = { therapistId: new mongoose.Types.ObjectId(therapistId) };

  // Apply filters
  if (filters.clientId) query.clientId = new mongoose.Types.ObjectId(filters.clientId);
  if (filters.mood) query.mood = filters.mood;
  if (filters.progress) query.progress = filters.progress;
  if (filters.sessionType) query.sessionType = filters.sessionType;
  if (filters.riskLevel) query['riskAssessment.level'] = filters.riskLevel;
  if (filters.flagged !== undefined) query['riskAssessment.flagged'] = filters.flagged;
  if (filters.startDate && filters.endDate) {
    query.createdAt = { $gte: new Date(filters.startDate), $lte: new Date(filters.endDate) };
  }

  // Add text search if query provided
  if (searchQuery) {
    query.$or = [
      { notes: { $regex: searchQuery, $options: 'i' } },
      { nextSteps: { $regex: searchQuery, $options: 'i' } },
      { objectives: { $in: [new RegExp(searchQuery, 'i')] } },
      { homework: { $in: [new RegExp(searchQuery, 'i')] } },
      { tags: { $in: [new RegExp(searchQuery, 'i')] } }
    ];
  }

  return this.find(query)
    .populate('client', 'name email')
    .populate('booking', 'date startTime endTime')
    .sort({ createdAt: -1 });
};

// Pre-save middleware for validation and audit
sessionNoteSchema.pre('save', async function(next) {
  try {
    // Validate booking exists and belongs to the therapist and client
    if (this.isNew || this.isModified('bookingId')) {
      const Booking = mongoose.model('Booking');
      const booking = await Booking.findById(this.bookingId);

      if (!booking) {
        return next(new Error('Booking not found'));
      }

      if (booking.therapistId.toString() !== this.therapistId.toString()) {
        return next(new Error('Booking does not belong to this therapist'));
      }

      if (booking.clientId.toString() !== this.clientId.toString()) {
        return next(new Error('Booking does not belong to this client'));
      }

      // Set session duration from booking if not provided
      if (!this.sessionDuration && booking.therapyDuration) {
        this.sessionDuration = booking.therapyDuration;
      }
    }

    // Auto-flag high-risk cases
    if (this.isModified('mood') || this.isModified('clinicalMeasures')) {
      if (this.mood === 'very_poor' ||
          (this.clinicalMeasures.anxiety && this.clinicalMeasures.anxiety >= 8) ||
          (this.clinicalMeasures.depression && this.clinicalMeasures.depression >= 8)) {

        if (this.riskAssessment.level === 'none' || this.riskAssessment.level === 'low') {
          this.riskAssessment.level = 'moderate';
          this.riskAssessment.notes = 'Auto-flagged due to poor mood or high clinical scores';
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware for audit logging
sessionNoteSchema.post('save', async function() {
  // Log confidential note changes for audit
  if (this.isConfidential && this.editHistory.length > 0) {
    try {
      const AuditLog = mongoose.model('AuditLog');

      await AuditLog.create({
        action: this.isNew ? 'session_note_created' : 'session_note_updated',
        entityType: 'SessionNote',
        entityId: this._id,
        userId: this.lastEditedBy || this.therapistId,
        details: {
          clientId: this.clientId,
          bookingId: this.bookingId,
          isConfidential: this.isConfidential,
          riskFlagged: this.riskAssessment.flagged
        },
        ipAddress: this.editHistory[this.editHistory.length - 1]?.ipAddress
      });
    } catch (error) {
      console.error('Error creating audit log for session note:', error);
    }
  }
});

// Pre-remove middleware for audit logging
sessionNoteSchema.pre('remove', async function(next) {
  try {
    const AuditLog = mongoose.model('AuditLog');

    await AuditLog.create({
      action: 'session_note_deleted',
      entityType: 'SessionNote',
      entityId: this._id,
      userId: this.therapistId,
      details: {
        clientId: this.clientId,
        bookingId: this.bookingId,
        isConfidential: this.isConfidential
      }
    });

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('SessionNote', sessionNoteSchema);