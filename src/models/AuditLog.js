const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },

  sessionId: {
    type: String,
    index: true
  },

  action: {
    type: String,
    required: true,
    enum: [
      'login',
      'logout',
      'login_failed',
      'password_change',
      'profile_update',
      'create',
      'read',
      'update',
      'delete',
      'export',
      'import',
      'booking_create',
      'booking_update',
      'booking_cancel',
      'payment_process',
      'payment_refund',
      'file_upload',
      'file_download',
      'file_delete',
      'email_send',
      'sms_send',
      'integration_connect',
      'integration_disconnect',
      'webhook_trigger',
      'data_sync',
      'backup_create',
      'backup_restore',
      'permission_change',
      'role_change',
      'subscription_create',
      'subscription_update',
      'subscription_cancel',
      'coupon_create',
      'coupon_use',
      'notification_send',
      'security_alert',
      'api_call',
      'bulk_operation',
      'data_migration',
      'system_maintenance'
    ],
    index: true
  },

  resource: {
    type: {
      type: String,
      required: true,
      enum: [
        'user',
        'client',
        'booking',
        'payment',
        'document',
        'session',
        'review',
        'notification',
        'integration',
        'webhook',
        'subscription',
        'coupon',
        'plan',
        'credential',
        'rate',
        'package',
        'location',
        'setting',
        'file',
        'report',
        'backup',
        'system'
      ],
      index: true
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },
    name: String,
    collection: String
  },

  changes: {
    before: {
      type: mongoose.Schema.Types.Mixed
    },
    after: {
      type: mongoose.Schema.Types.Mixed
    },
    fields: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      type: {
        type: String,
        enum: ['create', 'update', 'delete']
      }
    }]
  },

  metadata: {
    ip: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(v) ||
                 /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(v);
        },
        message: 'Invalid IP address format'
      },
      index: true
    },
    userAgent: String,
    browser: {
      name: String,
      version: String
    },
    os: {
      name: String,
      version: String
    },
    device: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'api']
    },
    location: {
      country: String,
      region: String,
      city: String,
      timezone: String,
      coordinates: {
        type: [Number],
        index: '2dsphere'
      }
    },
    referer: String,
    apiEndpoint: String,
    httpMethod: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    },
    responseCode: Number,
    responseTime: Number,
    requestSize: Number,
    responseSize: Number
  },

  context: {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      index: true
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session'
    },
    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Integration'
    },
    webhookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Webhook'
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription'
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization'
    },
    parentLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog'
    },
    correlationId: {
      type: String,
      index: true
    },
    traceId: String
  },

  severity: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info',
    index: true
  },

  category: {
    type: String,
    enum: ['security', 'data', 'system', 'user', 'api', 'integration', 'payment', 'communication'],
    required: true,
    index: true
  },

  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    index: true
  }],

  description: {
    type: String,
    maxlength: 1000
  },

  details: {
    type: mongoose.Schema.Types.Mixed
  },

  result: {
    success: {
      type: Boolean,
      default: true,
      index: true
    },
    error: {
      code: String,
      message: String,
      stack: String
    },
    warnings: [{
      code: String,
      message: String
    }]
  },

  timing: {
    startTime: {
      type: Date,
      default: Date.now
    },
    endTime: Date,
    duration: Number
  },

  privacy: {
    sensitive: {
      type: Boolean,
      default: false
    },
    encrypted: {
      type: Boolean,
      default: false
    },
    retention: {
      type: Number,
      default: 365
    },
    anonymized: {
      type: Boolean,
      default: false
    }
  },

  compliance: {
    gdpr: {
      lawfulBasis: {
        type: String,
        enum: ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests']
      },
      dataSubject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    hipaa: {
      covered: {
        type: Boolean,
        default: false
      },
      phi: {
        type: Boolean,
        default: false
      }
    },
    sox: {
      relevant: {
        type: Boolean,
        default: false
      },
      controlId: String
    }
  },

  archived: {
    type: Boolean,
    default: false,
    index: true
  },

  archivedAt: Date,

  deletedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

auditLogSchema.virtual('isRecent').get(function() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.createdAt > twentyFourHoursAgo;
});

auditLogSchema.virtual('riskScore').get(function() {
  let score = 0;

  const severityWeights = { info: 1, warning: 2, error: 3, critical: 5 };
  score += severityWeights[this.severity] || 1;

  const actionWeights = {
    login_failed: 3,
    password_change: 2,
    permission_change: 4,
    role_change: 4,
    delete: 3,
    export: 2,
    data_migration: 3,
    security_alert: 5
  };
  score += actionWeights[this.action] || 1;

  if (!this.result.success) score += 2;
  if (this.privacy.sensitive) score += 2;
  if (this.metadata.ip && this.isUnusualIP()) score += 2;

  return Math.min(score, 10);
});

auditLogSchema.virtual('formattedDuration').get(function() {
  if (!this.timing.duration) return null;

  const ms = this.timing.duration;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
});

auditLogSchema.virtual('actionPastTense').get(function() {
  const pastTenseMap = {
    create: 'created',
    read: 'accessed',
    update: 'updated',
    delete: 'deleted',
    login: 'logged in',
    logout: 'logged out',
    export: 'exported',
    import: 'imported'
  };

  return pastTenseMap[this.action] || this.action;
});

auditLogSchema.pre('save', function(next) {
  if (this.timing.startTime && this.timing.endTime) {
    this.timing.duration = this.timing.endTime - this.timing.startTime;
  }

  if (this.privacy.sensitive) {
    this.privacy.retention = Math.min(this.privacy.retention, 90);
  }

  if (this.category === 'security') {
    this.privacy.retention = Math.max(this.privacy.retention, 730);
  }

  next();
});

auditLogSchema.pre('save', function(next) {
  if (this.changes && this.changes.before && this.changes.after) {
    this.changes.fields = this.calculateFieldChanges(this.changes.before, this.changes.after);
  }

  next();
});

auditLogSchema.methods.isUnusualIP = function() {
  return false;
};

auditLogSchema.methods.calculateFieldChanges = function(before, after) {
  const changes = [];
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  allKeys.forEach(key => {
    const oldValue = before ? before[key] : undefined;
    const newValue = after ? after[key] : undefined;

    if (oldValue !== newValue) {
      let type = 'update';
      if (oldValue === undefined) type = 'create';
      if (newValue === undefined) type = 'delete';

      changes.push({
        field: key,
        oldValue,
        newValue,
        type
      });
    }
  });

  return changes;
};

auditLogSchema.methods.anonymize = function() {
  if (this.privacy.anonymized) return this;

  this.metadata.ip = this.hashValue(this.metadata.ip);
  this.metadata.userAgent = '[ANONYMIZED]';

  if (this.changes) {
    this.changes.before = this.anonymizeData(this.changes.before);
    this.changes.after = this.anonymizeData(this.changes.after);
  }

  if (this.details) {
    this.details = this.anonymizeData(this.details);
  }

  this.privacy.anonymized = true;
  return this.save();
};

auditLogSchema.methods.hashValue = function(value) {
  if (!value) return value;
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(value.toString()).digest('hex').substring(0, 8);
};

auditLogSchema.methods.anonymizeData = function(data) {
  if (!data || typeof data !== 'object') return data;

  const sensitiveFields = ['email', 'phone', 'name', 'address', 'ssn', 'passport'];
  const anonymized = { ...data };

  sensitiveFields.forEach(field => {
    if (anonymized[field]) {
      anonymized[field] = '[ANONYMIZED]';
    }
  });

  return anonymized;
};

auditLogSchema.methods.archive = function() {
  this.archived = true;
  this.archivedAt = new Date();
  return this.save();
};

auditLogSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  return this.save();
};

auditLogSchema.methods.shouldRetain = function() {
  const now = new Date();
  const retentionDays = this.privacy.retention || 365;
  const retentionDate = new Date(this.createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);

  return now < retentionDate;
};

auditLogSchema.methods.getRelatedLogs = function() {
  const query = {};

  if (this.context.correlationId) {
    query['context.correlationId'] = this.context.correlationId;
  } else if (this.sessionId) {
    query.sessionId = this.sessionId;
  } else {
    return [];
  }

  return this.constructor.find(query).sort({ createdAt: -1 }).limit(50);
};

auditLogSchema.statics.createLog = function(data) {
  const log = new this(data);

  if (!log.timing.startTime) {
    log.timing.startTime = new Date();
  }

  if (!log.context.correlationId) {
    log.context.correlationId = require('crypto').randomUUID();
  }

  return log;
};

auditLogSchema.statics.findByUser = function(userId, options = {}) {
  const query = { userId };

  if (options.category) query.category = options.category;
  if (options.action) query.action = options.action;
  if (options.severity) query.severity = options.severity;
  if (options.startDate || options.endDate) {
    query.createdAt = {};
    if (options.startDate) query.createdAt.$gte = options.startDate;
    if (options.endDate) query.createdAt.$lte = options.endDate;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100);
};

auditLogSchema.statics.findSecurityEvents = function(options = {}) {
  const query = {
    $or: [
      { category: 'security' },
      { severity: { $in: ['error', 'critical'] } },
      { action: { $in: ['login_failed', 'permission_change', 'role_change'] } }
    ]
  };

  if (options.startDate || options.endDate) {
    query.createdAt = {};
    if (options.startDate) query.createdAt.$gte = options.startDate;
    if (options.endDate) query.createdAt.$lte = options.endDate;
  }

  return this.find(query).sort({ createdAt: -1 });
};

auditLogSchema.statics.getActivityStats = function(userId, timeframe = '24h') {
  const timeframes = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };

  const since = new Date(Date.now() - timeframes[timeframe]);

  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: null,
        totalActions: { $sum: 1 },
        successfulActions: {
          $sum: { $cond: ['$result.success', 1, 0] }
        },
        failedActions: {
          $sum: { $cond: [{ $not: '$result.success' }, 1, 0] }
        },
        categories: { $addToSet: '$category' },
        avgRiskScore: { $avg: '$riskScore' },
        uniqueIPs: { $addToSet: '$metadata.ip' }
      }
    }
  ]);
};

auditLogSchema.statics.findSuspiciousActivity = function(options = {}) {
  const pipeline = [
    {
      $match: {
        createdAt: { $gte: options.since || new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    },
    {
      $addFields: {
        riskScore: {
          $switch: {
            branches: [
              { case: { $eq: ['$severity', 'critical'] }, then: 5 },
              { case: { $eq: ['$severity', 'error'] }, then: 3 },
              { case: { $eq: ['$severity', 'warning'] }, then: 2 }
            ],
            default: 1
          }
        }
      }
    },
    {
      $match: {
        $or: [
          { riskScore: { $gte: 3 } },
          { 'result.success': false },
          { action: { $in: ['login_failed', 'permission_change', 'security_alert'] } }
        ]
      }
    },
    {
      $sort: { riskScore: -1, createdAt: -1 }
    },
    {
      $limit: options.limit || 100
    }
  ];

  return this.aggregate(pipeline);
};

auditLogSchema.statics.cleanupExpired = function() {
  const cutoffDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  return this.deleteMany({
    createdAt: { $lt: cutoffDate },
    privacy: { retention: { $lt: 365 } },
    category: { $ne: 'security' }
  });
};

auditLogSchema.statics.bulkArchive = function(query) {
  return this.updateMany(query, {
    $set: {
      archived: true,
      archivedAt: new Date()
    }
  });
};

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, severity: 1 });
auditLogSchema.index({ 'resource.type': 1, 'resource.id': 1 });
auditLogSchema.index({ 'context.correlationId': 1 });
auditLogSchema.index({ 'metadata.ip': 1 });
auditLogSchema.index({ tags: 1 });
auditLogSchema.index({ archived: 1, createdAt: 1 });
auditLogSchema.index({ deletedAt: 1 }, { sparse: true });
auditLogSchema.index({ 'result.success': 1, severity: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);