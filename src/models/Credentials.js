const mongoose = require('mongoose');

const credentialsSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  title: {
    type: String,
    required: [true, 'Credential title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  institution: {
    type: String,
    required: [true, 'Institution is required'],
    trim: true,
    maxlength: [200, 'Institution name cannot exceed 200 characters']
  },
  year: {
    type: String,
    required: [true, 'Year is required'],
    validate: {
      validator: function(v) {
        return /^\d{4}$/.test(v) && parseInt(v) >= 1900 && parseInt(v) <= new Date().getFullYear();
      },
      message: 'Year must be a valid 4-digit year between 1900 and current year'
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  documentUrl: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^(https?:\/\/)|(\/uploads\/)/.test(v);
      },
      message: 'Document URL must be a valid URL or file path'
    }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // Additional credential details
  credentialType: {
    type: String,
    enum: ['degree', 'certification', 'license', 'specialization', 'course', 'training', 'membership', 'award'],
    default: 'certification'
  },
  level: {
    type: String,
    enum: ['bachelor', 'master', 'doctorate', 'postgraduate', 'professional', 'continuing_education'],
    default: 'professional'
  },
  field: {
    type: String,
    trim: true,
    maxlength: [100, 'Field cannot exceed 100 characters']
  },
  grade: {
    type: String,
    trim: true,
    maxlength: [50, 'Grade cannot exceed 50 characters']
  },
  honors: {
    type: String,
    trim: true,
    maxlength: [100, 'Honors cannot exceed 100 characters']
  },
  // Verification details
  verificationStatus: {
    type: String,
    enum: ['pending', 'in_review', 'verified', 'rejected', 'expired'],
    default: 'pending'
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  verificationNotes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Verification notes cannot exceed 1000 characters']
  },
  // Document details
  originalFilename: {
    type: String,
    trim: true
  },
  fileSize: {
    type: Number,
    min: 0
  },
  mimeType: {
    type: String,
    trim: true
  },
  // Expiry and renewal
  expiryDate: {
    type: Date,
    default: null
  },
  requiresRenewal: {
    type: Boolean,
    default: false
  },
  renewalReminder: {
    type: Boolean,
    default: false
  },
  // Additional metadata
  country: {
    type: String,
    default: 'España',
    trim: true,
    maxlength: [50, 'Country cannot exceed 50 characters']
  },
  registrationNumber: {
    type: String,
    trim: true,
    maxlength: [100, 'Registration number cannot exceed 100 characters']
  },
  issuingBody: {
    type: String,
    trim: true,
    maxlength: [200, 'Issuing body cannot exceed 200 characters']
  },
  creditHours: {
    type: Number,
    min: 0,
    max: 10000
  },
  // Professional standing
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  displayOrder: {
    type: Number,
    default: 0,
    min: 0
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  // Tags and categories
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  // Related credentials
  relatedCredentials: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Credentials'
  }],
  // Validation history
  validationHistory: [{
    action: {
      type: String,
      enum: ['submitted', 'reviewed', 'verified', 'rejected', 'updated', 'renewed'],
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: {
      type: String,
      maxlength: [500, 'Validation notes cannot exceed 500 characters']
    },
    previousStatus: String,
    newStatus: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
credentialsSchema.index({ therapistId: 1, isActive: 1 });
credentialsSchema.index({ therapistId: 1, verificationStatus: 1 });
credentialsSchema.index({ credentialType: 1, verificationStatus: 1 });
credentialsSchema.index({ year: -1 });
credentialsSchema.index({ priority: -1, displayOrder: 1 });
credentialsSchema.index({ expiryDate: 1 });

// Virtual for therapist details
credentialsSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for verifier details
credentialsSchema.virtual('verifier', {
  ref: 'User',
  localField: 'verifiedBy',
  foreignField: '_id',
  justOne: true
});

// Virtual for credential age
credentialsSchema.virtual('credentialAge').get(function() {
  const currentYear = new Date().getFullYear();
  return currentYear - parseInt(this.year);
});

// Virtual for expiry status
credentialsSchema.virtual('isExpiring').get(function() {
  if (!this.expiryDate) return false;

  const now = new Date();
  const threeMonthsFromNow = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));

  return this.expiryDate <= threeMonthsFromNow && this.expiryDate > now;
});

// Virtual for expired status
credentialsSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

// Virtual for display name
credentialsSchema.virtual('displayName').get(function() {
  let display = this.title;
  if (this.institution) {
    display += ` - ${this.institution}`;
  }
  if (this.year) {
    display += ` (${this.year})`;
  }
  return display;
});

// Method to verify credential
credentialsSchema.methods.verify = function(verifierId, notes = '') {
  this.verificationStatus = 'verified';
  this.isVerified = true;
  this.verifiedBy = verifierId;
  this.verifiedAt = new Date();
  this.verificationNotes = notes;

  this.validationHistory.push({
    action: 'verified',
    reviewerId: verifierId,
    notes,
    previousStatus: this.verificationStatus,
    newStatus: 'verified'
  });

  return this.save();
};

// Method to reject credential
credentialsSchema.methods.reject = function(reviewerId, notes) {
  this.verificationStatus = 'rejected';
  this.isVerified = false;
  this.verifiedBy = reviewerId;
  this.verifiedAt = new Date();
  this.verificationNotes = notes;

  this.validationHistory.push({
    action: 'rejected',
    reviewerId,
    notes,
    previousStatus: this.verificationStatus,
    newStatus: 'rejected'
  });

  return this.save();
};

// Method to update priority and display order
credentialsSchema.methods.updateDisplay = function(priority, displayOrder) {
  this.priority = priority || this.priority;
  this.displayOrder = displayOrder || this.displayOrder;
  return this.save();
};

// Method to check if renewal is needed
credentialsSchema.methods.needsRenewal = function() {
  if (!this.expiryDate || !this.requiresRenewal) return false;

  const now = new Date();
  const sixMonthsFromNow = new Date(now.getTime() + (180 * 24 * 60 * 60 * 1000));

  return this.expiryDate <= sixMonthsFromNow;
};

// Static method to get credentials by therapist
credentialsSchema.statics.getByTherapist = function(therapistId, options = {}) {
  const {
    includeInactive = false,
    verificationStatus = null,
    credentialType = null
  } = options;

  const query = { therapistId };

  if (!includeInactive) {
    query.isActive = true;
  }

  if (verificationStatus) {
    query.verificationStatus = verificationStatus;
  }

  if (credentialType) {
    query.credentialType = credentialType;
  }

  return this.find(query)
    .sort({ priority: -1, displayOrder: 1, year: -1 })
    .populate('verifier', 'name email');
};

// Static method to get verified credentials
credentialsSchema.statics.getVerified = function(therapistId = null) {
  const query = {
    verificationStatus: 'verified',
    isActive: true,
    isPublic: true
  };

  if (therapistId) {
    query.therapistId = therapistId;
  }

  return this.find(query)
    .sort({ priority: -1, year: -1 })
    .populate('therapist', 'name profile.firstName profile.lastName');
};

// Static method to get expiring credentials
credentialsSchema.statics.getExpiring = function(daysAhead = 90) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  return this.find({
    expiryDate: { $lte: futureDate, $gte: new Date() },
    verificationStatus: 'verified',
    isActive: true,
    requiresRenewal: true
  }).populate('therapist', 'name email profile.firstName profile.lastName');
};

// Static method to get credential statistics
credentialsSchema.statics.getCredentialStats = function(therapistId = null) {
  const matchQuery = therapistId ? { therapistId: new mongoose.Types.ObjectId(therapistId) } : {};

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$verificationStatus',
        count: { $sum: 1 },
        types: { $push: '$credentialType' }
      }
    }
  ]);
};

// Pre-save middleware
credentialsSchema.pre('save', function(next) {
  // Update verification status based on expiry
  if (this.expiryDate && new Date() > this.expiryDate && this.verificationStatus === 'verified') {
    this.verificationStatus = 'expired';
    this.isVerified = false;
  }

  // Add validation history entry for status changes
  if (this.isModified('verificationStatus') && !this.isNew) {
    const statusChange = this.validationHistory.find(h => h.newStatus === this.verificationStatus);
    if (!statusChange) {
      this.validationHistory.push({
        action: 'updated',
        date: new Date(),
        newStatus: this.verificationStatus
      });
    }
  }

  next();
});

// Post-save middleware
credentialsSchema.post('save', function() {
  // Here you would trigger notifications or updates
  // Example: notificationService.notifyCredentialUpdate(this);
});

module.exports = mongoose.model('Credentials', credentialsSchema);