const mongoose = require('mongoose');

const verificationDocumentSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  type: {
    type: String,
    enum: ['diploma', 'license', 'insurance', 'certificate', 'id_card', 'cv', 'recommendation', 'other'],
    required: [true, 'Document type is required']
  },
  name: {
    type: String,
    required: [true, 'Document name is required'],
    trim: true,
    maxlength: [200, 'Document name cannot exceed 200 characters']
  },
  filename: {
    type: String,
    required: [true, 'Filename is required'],
    trim: true
  },
  originalName: {
    type: String,
    required: [true, 'Original filename is required'],
    trim: true
  },
  url: {
    type: String,
    required: [true, 'Document URL is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'expired'],
    default: 'pending',
    required: true
  },
  reviewerComment: {
    type: String,
    default: null,
    maxlength: [1000, 'Reviewer comment cannot exceed 1000 characters'],
    trim: true
  },
  reviewDate: {
    type: Date,
    default: null
  },
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  uploadDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  expiryDate: {
    type: Date,
    default: null
  },
  // Additional fields for better verification management
  mimeType: {
    type: String,
    required: [true, 'MIME type is required']
  },
  fileSize: {
    type: Number,
    required: [true, 'File size is required'],
    min: [0, 'File size cannot be negative']
  },
  documentNumber: {
    type: String,
    default: null,
    trim: true,
    maxlength: [100, 'Document number cannot exceed 100 characters']
  },
  issuingAuthority: {
    type: String,
    default: null,
    trim: true,
    maxlength: [200, 'Issuing authority cannot exceed 200 characters']
  },
  issueDate: {
    type: Date,
    default: null
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  verificationLevel: {
    type: String,
    enum: ['basic', 'standard', 'enhanced'],
    default: 'basic'
  },
  // Review process tracking
  reviewHistory: [{
    action: {
      type: String,
      enum: ['submitted', 'under_review', 'approved', 'rejected', 'requested_changes', 'resubmitted'],
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
    comment: {
      type: String,
      maxlength: [500, 'Review comment cannot exceed 500 characters']
    },
    previousStatus: String,
    newStatus: String
  }],
  // Automated verification flags
  automatedChecks: {
    virusScan: {
      passed: { type: Boolean, default: false },
      scanDate: Date,
      scanResult: String
    },
    ocrExtraction: {
      attempted: { type: Boolean, default: false },
      successful: { type: Boolean, default: false },
      extractedText: String,
      confidence: Number
    },
    duplicateCheck: {
      checked: { type: Boolean, default: false },
      isDuplicate: { type: Boolean, default: false },
      duplicateOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VerificationDocument'
      }
    }
  },
  // Compliance and legal
  complianceNotes: {
    type: String,
    maxlength: [1000, 'Compliance notes cannot exceed 1000 characters']
  },
  legalRequirements: [{
    requirement: String,
    met: Boolean,
    notes: String
  }],
  // Notification tracking
  notificationsSent: {
    submitted: { type: Boolean, default: false },
    under_review: { type: Boolean, default: false },
    approved: { type: Boolean, default: false },
    rejected: { type: Boolean, default: false },
    expiry_warning: { type: Boolean, default: false },
    expired: { type: Boolean, default: false }
  },
  // Document metadata
  metadata: {
    uploadedFrom: {
      type: String,
      enum: ['web', 'mobile', 'email', 'admin'],
      default: 'web'
    },
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    batchId: String // For bulk uploads
  },
  // Security and integrity
  checksum: {
    type: String,
    default: null
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  accessLog: [{
    action: {
      type: String,
      enum: ['viewed', 'downloaded', 'shared', 'edited']
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String
  }],
  // Reminder system
  reminderSettings: {
    expiryWarningDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365
    },
    remindersSent: [{
      type: {
        type: String,
        enum: ['expiry_warning', 'expired', 'renewal_required']
      },
      sentDate: Date,
      recipient: String
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
verificationDocumentSchema.index({ therapistId: 1, status: 1 });
verificationDocumentSchema.index({ type: 1, status: 1 });
verificationDocumentSchema.index({ status: 1, uploadDate: -1 });
verificationDocumentSchema.index({ expiryDate: 1 });
verificationDocumentSchema.index({ reviewerId: 1, reviewDate: -1 });

// Virtual for therapist details
verificationDocumentSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for reviewer details
verificationDocumentSchema.virtual('reviewer', {
  ref: 'User',
  localField: 'reviewerId',
  foreignField: '_id',
  justOne: true
});

// Virtual for days until expiry
verificationDocumentSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiryDate) return null;

  const now = new Date();
  const diffTime = this.expiryDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is expired
verificationDocumentSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

// Virtual for is expiring soon
verificationDocumentSchema.virtual('isExpiringSoon').get(function() {
  const daysUntilExpiry = this.daysUntilExpiry;
  return daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
});

// Virtual for file size in human readable format
verificationDocumentSchema.virtual('humanFileSize').get(function() {
  const bytes = this.fileSize;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Method to submit for review
verificationDocumentSchema.methods.submitForReview = function(reviewerId = null) {
  this.status = 'under_review';
  this.reviewerId = reviewerId;

  this.reviewHistory.push({
    action: 'under_review',
    reviewerId,
    previousStatus: 'pending',
    newStatus: 'under_review'
  });

  return this.save();
};

// Method to approve document
verificationDocumentSchema.methods.approve = function(reviewerId, comment = '') {
  this.status = 'approved';
  this.reviewerId = reviewerId;
  this.reviewDate = new Date();
  this.reviewerComment = comment;

  this.reviewHistory.push({
    action: 'approved',
    reviewerId,
    comment,
    previousStatus: this.status,
    newStatus: 'approved'
  });

  return this.save();
};

// Method to reject document
verificationDocumentSchema.methods.reject = function(reviewerId, comment) {
  this.status = 'rejected';
  this.reviewerId = reviewerId;
  this.reviewDate = new Date();
  this.reviewerComment = comment;

  this.reviewHistory.push({
    action: 'rejected',
    reviewerId,
    comment,
    previousStatus: this.status,
    newStatus: 'rejected'
  });

  return this.save();
};

// Method to request changes
verificationDocumentSchema.methods.requestChanges = function(reviewerId, comment) {
  this.reviewerId = reviewerId;
  this.reviewDate = new Date();
  this.reviewerComment = comment;

  this.reviewHistory.push({
    action: 'requested_changes',
    reviewerId,
    comment,
    previousStatus: this.status,
    newStatus: this.status
  });

  return this.save();
};

// Method to track access
verificationDocumentSchema.methods.trackAccess = function(userId, action, ipAddress = null) {
  this.accessLog.push({
    action,
    userId,
    timestamp: new Date(),
    ipAddress
  });

  return this.save();
};

// Method to check if document needs renewal
verificationDocumentSchema.methods.needsRenewal = function() {
  if (!this.expiryDate) return false;

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

  return this.expiryDate <= thirtyDaysFromNow;
};

// Method to send expiry reminder
verificationDocumentSchema.methods.sendExpiryReminder = function(type = 'expiry_warning') {
  this.reminderSettings.remindersSent.push({
    type,
    sentDate: new Date(),
    recipient: this.therapistId
  });

  // Update notification flags
  if (this.notificationsSent[type] !== undefined) {
    this.notificationsSent[type] = true;
  }

  return this.save();
};

// Static method to get documents by status
verificationDocumentSchema.statics.getByStatus = function(status, options = {}) {
  const {
    therapistId = null,
    type = null,
    page = 1,
    limit = 20
  } = options;

  const query = { status };
  if (therapistId) query.therapistId = therapistId;
  if (type) query.type = type;

  return this.find(query)
    .populate('therapist', 'name email')
    .populate('reviewer', 'name email')
    .sort({ uploadDate: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
};

// Static method to get expiring documents
verificationDocumentSchema.statics.getExpiringDocuments = function(daysAhead = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  return this.find({
    expiryDate: { $lte: futureDate, $gte: new Date() },
    status: 'approved'
  }).populate('therapist', 'name email');
};

// Static method to get verification statistics
verificationDocumentSchema.statics.getVerificationStats = function(therapistId = null) {
  const matchQuery = therapistId ? { therapistId: new mongoose.Types.ObjectId(therapistId) } : {};

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        types: { $push: '$type' }
      }
    }
  ]);
};

// Pre-save middleware
verificationDocumentSchema.pre('save', function(next) {
  // Set expiry status if expired
  if (this.expiryDate && new Date() > this.expiryDate && this.status === 'approved') {
    this.status = 'expired';
  }

  // Add review history entry for status changes
  if (this.isModified('status') && !this.isNew) {
    const statusChange = this.reviewHistory.find(h => h.newStatus === this.status);
    if (!statusChange) {
      this.reviewHistory.push({
        action: this.status,
        date: new Date(),
        newStatus: this.status
      });
    }
  }

  next();
});

// Post-save middleware for notifications
verificationDocumentSchema.post('save', function() {
  // Here you would trigger notifications based on status changes
  // Example: notificationService.sendVerificationUpdate(this);
});

module.exports = mongoose.model('VerificationDocument', verificationDocumentSchema);