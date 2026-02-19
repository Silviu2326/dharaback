const mongoose = require('mongoose');
const path = require('path');

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Document title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  filename: {
    type: String,
    required: [true, 'Filename is required'],
    trim: true
  },
  originalName: {
    type: String,
    required: [true, 'Original name is required'],
    trim: true,
    maxlength: [255, 'Original name cannot exceed 255 characters']
  },
  type: {
    type: String,
    enum: ['pdf', 'image', 'audio', 'video', 'doc', 'excel', 'text', 'other'],
    required: [true, 'Document type is required']
  },
  mimeType: {
    type: String,
    required: [true, 'MIME type is required'],
    trim: true
  },
  size: {
    type: Number,
    required: [true, 'File size is required'],
    min: [0, 'File size cannot be negative'],
    max: [100 * 1024 * 1024, 'File size cannot exceed 100MB'] // 100MB limit
  },
  url: {
    type: String,
    required: [true, 'Document URL is required'],
    trim: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  session: {
    type: String,
    default: null,
    trim: true,
    maxlength: [100, 'Session reference cannot exceed 100 characters']
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  isShared: {
    type: Boolean,
    default: false
  },
  downloadCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Additional document management fields
  category: {
    type: String,
    enum: ['session_notes', 'assessment', 'treatment_plan', 'report', 'consent_form', 'invoice', 'certificate', 'homework', 'resource', 'other'],
    default: 'other'
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  },
  visibility: {
    type: String,
    enum: ['private', 'client_shared', 'therapist_only', 'admin_only'],
    default: 'therapist_only'
  },
  // Access control
  permissions: {
    canView: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      userType: {
        type: String,
        enum: ['therapist', 'client', 'admin']
      },
      grantedAt: {
        type: Date,
        default: Date.now
      },
      grantedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    canDownload: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      userType: {
        type: String,
        enum: ['therapist', 'client', 'admin']
      },
      grantedAt: {
        type: Date,
        default: Date.now
      }
    }],
    canEdit: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      grantedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  // File metadata
  metadata: {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadSource: {
      type: String,
      enum: ['web', 'mobile', 'api', 'email', 'scan'],
      default: 'web'
    },
    ipAddress: String,
    userAgent: String,
    exifData: mongoose.Schema.Types.Mixed,
    checksum: String,
    version: {
      type: Number,
      default: 1,
      min: 1
    },
    isEncrypted: {
      type: Boolean,
      default: false
    },
    encryptionMethod: String
  },
  // Document processing
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'completed'
  },
  ocrText: {
    type: String,
    default: null
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  previewUrl: {
    type: String,
    default: null
  },
  // Version control
  versions: [{
    versionNumber: Number,
    filename: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changes: String,
    isActive: {
      type: Boolean,
      default: false
    }
  }],
  // Access tracking
  accessLog: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userType: String,
    action: {
      type: String,
      enum: ['view', 'download', 'share', 'edit', 'delete']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String
  }],
  // Expiration and retention
  expiresAt: {
    type: Date,
    default: null
  },
  retentionPeriod: {
    type: Number, // in days
    default: null
  },
  autoDeleteAt: {
    type: Date,
    default: null
  },
  // Related entities
  relatedEntities: {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null
    },
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review',
      default: null
    }
  },
  // Security and compliance
  isConfidential: {
    type: Boolean,
    default: true
  },
  complianceNotes: {
    type: String,
    maxlength: [500, 'Compliance notes cannot exceed 500 characters']
  },
  lastAccessedAt: {
    type: Date,
    default: null
  },
  lastModifiedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
documentSchema.index({ therapistId: 1, status: 1, createdAt: -1 });
documentSchema.index({ clientId: 1, status: 1, createdAt: -1 });
documentSchema.index({ category: 1, status: 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ filename: 1 });
documentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
documentSchema.index({ autoDeleteAt: 1 });

// Virtual for therapist details
documentSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for client details
documentSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for uploader details
documentSchema.virtual('uploader', {
  ref: 'User',
  localField: 'metadata.uploadedBy',
  foreignField: '_id',
  justOne: true
});

// Virtual for file extension
documentSchema.virtual('extension').get(function() {
  return path.extname(this.originalName).toLowerCase();
});

// Virtual for human readable file size
documentSchema.virtual('humanFileSize').get(function() {
  const bytes = this.size;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Virtual for document age
documentSchema.virtual('documentAge').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
});

// Virtual for is expired
documentSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Method to track access
documentSchema.methods.trackAccess = function(userId, userType, action, req = null) {
  this.accessLog.push({
    userId,
    userType,
    action,
    timestamp: new Date(),
    ipAddress: req?.ip,
    userAgent: req?.get('User-Agent')
  });

  if (action === 'download') {
    this.downloadCount += 1;
  }

  this.lastAccessedAt = new Date();
  return this.save();
};

// Method to share document
documentSchema.methods.shareWith = function(userId, userType, permissions = ['view'], grantedBy) {
  // Remove existing permissions for this user
  this.permissions.canView = this.permissions.canView.filter(
    p => p.userId.toString() !== userId.toString()
  );
  this.permissions.canDownload = this.permissions.canDownload.filter(
    p => p.userId.toString() !== userId.toString()
  );

  // Add new permissions
  if (permissions.includes('view')) {
    this.permissions.canView.push({
      userId,
      userType,
      grantedAt: new Date(),
      grantedBy
    });
  }

  if (permissions.includes('download')) {
    this.permissions.canDownload.push({
      userId,
      userType,
      grantedAt: new Date()
    });
  }

  this.isShared = true;
  return this.save();
};

// Method to revoke access
documentSchema.methods.revokeAccess = function(userId) {
  this.permissions.canView = this.permissions.canView.filter(
    p => p.userId.toString() !== userId.toString()
  );
  this.permissions.canDownload = this.permissions.canDownload.filter(
    p => p.userId.toString() !== userId.toString()
  );
  this.permissions.canEdit = this.permissions.canEdit.filter(
    p => p.userId.toString() !== userId.toString()
  );

  // Check if document is still shared with anyone
  this.isShared = this.permissions.canView.length > 0 ||
                  this.permissions.canDownload.length > 0 ||
                  this.permissions.canEdit.length > 0;

  return this.save();
};

// Method to check user permissions
documentSchema.methods.checkPermission = function(userId, permission) {
  const permissionArrays = {
    view: this.permissions.canView,
    download: this.permissions.canDownload,
    edit: this.permissions.canEdit
  };

  const permissionArray = permissionArrays[permission];
  if (!permissionArray) return false;

  return permissionArray.some(p => p.userId.toString() === userId.toString());
};

// Method to create new version
documentSchema.methods.createVersion = function(newFileData, uploadedBy, changes = '') {
  // Deactivate current active version
  this.versions.forEach(v => { v.isActive = false; });

  const newVersion = {
    versionNumber: this.metadata.version + 1,
    filename: newFileData.filename,
    size: newFileData.size,
    uploadedAt: new Date(),
    uploadedBy,
    changes,
    isActive: true
  };

  this.versions.push(newVersion);
  this.metadata.version += 1;

  // Update main document fields
  this.filename = newFileData.filename;
  this.size = newFileData.size;
  this.url = newFileData.url;
  this.lastModifiedAt = new Date();

  return this.save();
};

// Method to archive document
documentSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Method to soft delete document
documentSchema.methods.softDelete = function() {
  this.status = 'deleted';
  return this.save();
};

// Static method to get documents by category
documentSchema.statics.getByCategory = function(therapistId, category, options = {}) {
  const {
    clientId = null,
    status = 'active',
    page = 1,
    limit = 20
  } = options;

  const query = {
    therapistId,
    category,
    status
  };

  if (clientId) query.clientId = clientId;

  return this.find(query)
    .populate('client', 'name avatar')
    .populate('uploader', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
};

// Static method to search documents
documentSchema.statics.searchDocuments = function(therapistId, searchQuery, filters = {}) {
  const query = {
    therapistId,
    status: 'active',
    ...filters
  };

  if (searchQuery) {
    query.$or = [
      { title: { $regex: searchQuery, $options: 'i' } },
      { originalName: { $regex: searchQuery, $options: 'i' } },
      { tags: { $in: [new RegExp(searchQuery, 'i')] } },
      { ocrText: { $regex: searchQuery, $options: 'i' } }
    ];
  }

  return this.find(query)
    .populate('client', 'name avatar')
    .populate('uploader', 'name avatar')
    .sort({ createdAt: -1 });
};

// Static method to get storage statistics
documentSchema.statics.getStorageStats = function(therapistId) {
  return this.aggregate([
    {
      $match: {
        therapistId: new mongoose.Types.ObjectId(therapistId),
        status: 'active'
      }
    },
    {
      $group: {
        _id: null,
        totalDocuments: { $sum: 1 },
        totalSize: { $sum: '$size' },
        byType: {
          $push: {
            type: '$type',
            size: '$size'
          }
        },
        byCategory: {
          $push: {
            category: '$category',
            size: '$size'
          }
        }
      }
    }
  ]);
};

// Static method to find documents to auto-delete
documentSchema.statics.findExpiredDocuments = function() {
  const now = new Date();
  return this.find({
    $or: [
      { expiresAt: { $lt: now } },
      { autoDeleteAt: { $lt: now } }
    ],
    status: { $ne: 'deleted' }
  });
};

// Pre-save middleware
documentSchema.pre('save', function(next) {
  // Set auto-delete date based on retention period
  if (this.isModified('retentionPeriod') && this.retentionPeriod) {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + this.retentionPeriod);
    this.autoDeleteAt = retentionDate;
  }

  // Update last modified date
  if (this.isModified('title') || this.isModified('tags') || this.isModified('category')) {
    this.lastModifiedAt = new Date();
  }

  next();
});

// Post-save middleware
documentSchema.post('save', function() {
  // Here you would trigger any post-processing tasks
  // Example: generate thumbnails, extract text, etc.
});

module.exports = mongoose.model('Document', documentSchema);