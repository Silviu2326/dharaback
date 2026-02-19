const mongoose = require('mongoose');
const crypto = require('crypto');

const integrationSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  provider: {
    type: String,
    required: true,
    enum: [
      'google_calendar',
      'outlook_calendar',
      'zoom',
      'teams',
      'stripe',
      'paypal',
      'twilio',
      'sendgrid',
      'mailchimp',
      'whatsapp_business',
      'telegram',
      'slack',
      'discord',
      'google_drive',
      'dropbox',
      'onedrive'
    ],
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  description: {
    type: String,
    trim: true,
    maxlength: 500
  },

  category: {
    type: String,
    required: true,
    enum: ['calendar', 'video_conferencing', 'payment', 'communication', 'storage', 'productivity'],
    index: true
  },

  status: {
    type: String,
    enum: ['active', 'inactive', 'error', 'pending_auth', 'expired'],
    default: 'pending_auth',
    index: true
  },

  config: {
    apiKey: {
      type: String,
      select: false
    },
    clientId: {
      type: String,
      select: false
    },
    clientSecret: {
      type: String,
      select: false
    },
    accessToken: {
      type: String,
      select: false
    },
    refreshToken: {
      type: String,
      select: false
    },
    webhookUrl: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Webhook URL must be a valid URL'
      }
    },
    scopes: [{
      type: String,
      trim: true
    }],
    customSettings: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  permissions: {
    read: {
      type: Boolean,
      default: false
    },
    write: {
      type: Boolean,
      default: false
    },
    delete: {
      type: Boolean,
      default: false
    },
    admin: {
      type: Boolean,
      default: false
    }
  },

  lastSync: {
    type: Date,
    index: true
  },

  syncFrequency: {
    type: String,
    enum: ['real_time', 'hourly', 'daily', 'weekly', 'manual'],
    default: 'daily'
  },

  autoSync: {
    type: Boolean,
    default: true
  },

  syncStatus: {
    status: {
      type: String,
      enum: ['success', 'error', 'in_progress', 'never_synced'],
      default: 'never_synced'
    },
    lastAttempt: Date,
    lastSuccess: Date,
    errorCount: {
      type: Number,
      default: 0
    },
    lastError: {
      message: String,
      code: String,
      timestamp: Date
    }
  },

  usage: {
    totalRequests: {
      type: Number,
      default: 0
    },
    requestsThisMonth: {
      type: Number,
      default: 0
    },
    lastRequestAt: Date,
    dataTransferred: {
      type: Number,
      default: 0
    },
    errorRate: {
      type: Number,
      default: 0
    }
  },

  rateLimits: {
    requestsPerMinute: {
      type: Number,
      default: 60
    },
    requestsPerHour: {
      type: Number,
      default: 1000
    },
    requestsPerDay: {
      type: Number,
      default: 10000
    }
  },

  webhooks: [{
    event: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Webhook URL must be a valid URL'
      }
    },
    secret: {
      type: String,
      select: false
    },
    active: {
      type: Boolean,
      default: true
    },
    lastTriggered: Date,
    failureCount: {
      type: Number,
      default: 0
    }
  }],

  mapping: {
    fieldMappings: [{
      localField: {
        type: String,
        required: true
      },
      remoteField: {
        type: String,
        required: true
      },
      transformation: {
        type: String,
        enum: ['none', 'uppercase', 'lowercase', 'date_format', 'custom']
      },
      customTransformation: String
    }],
    syncDirection: {
      type: String,
      enum: ['bidirectional', 'import_only', 'export_only'],
      default: 'bidirectional'
    }
  },

  security: {
    encryptionEnabled: {
      type: Boolean,
      default: true
    },
    ipWhitelist: [{
      type: String,
      validate: {
        validator: function(v) {
          return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(v);
        },
        message: 'Invalid IP address format'
      }
    }],
    requireSSL: {
      type: Boolean,
      default: true
    },
    tokenExpiry: Date
  },

  metadata: {
    version: {
      type: String,
      default: '1.0.0'
    },
    environment: {
      type: String,
      enum: ['production', 'staging', 'development'],
      default: 'production'
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    notes: {
      type: String,
      maxlength: 1000
    }
  },

  monitoring: {
    enabled: {
      type: Boolean,
      default: true
    },
    alerts: [{
      type: {
        type: String,
        enum: ['error_rate', 'downtime', 'rate_limit', 'auth_failure'],
        required: true
      },
      threshold: {
        type: Number,
        required: true
      },
      notificationMethod: {
        type: String,
        enum: ['email', 'sms', 'webhook'],
        default: 'email'
      },
      enabled: {
        type: Boolean,
        default: true
      }
    }],
    healthCheck: {
      enabled: {
        type: Boolean,
        default: true
      },
      interval: {
        type: Number,
        default: 300
      },
      lastCheck: Date,
      status: {
        type: String,
        enum: ['healthy', 'degraded', 'unhealthy'],
        default: 'healthy'
      }
    }
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

integrationSchema.virtual('isHealthy').get(function() {
  return this.status === 'active' &&
         this.syncStatus.status !== 'error' &&
         this.monitoring.healthCheck.status === 'healthy';
});

integrationSchema.virtual('nextSyncTime').get(function() {
  if (!this.lastSync || !this.autoSync) return null;

  const intervals = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000
  };

  const interval = intervals[this.syncFrequency];
  return interval ? new Date(this.lastSync.getTime() + interval) : null;
});

integrationSchema.virtual('isOverdue').get(function() {
  const nextSync = this.nextSyncTime;
  return nextSync && new Date() > nextSync;
});

integrationSchema.virtual('errorRate').get(function() {
  if (this.usage.totalRequests === 0) return 0;
  return (this.syncStatus.errorCount / this.usage.totalRequests) * 100;
});

integrationSchema.pre('save', function(next) {
  if (this.isModified('config.accessToken') || this.isModified('config.apiKey')) {
    this.security.tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  if (this.isModified('config') && this.config.webhookUrl) {
    this.webhooks.push({
      event: 'data_sync',
      url: this.config.webhookUrl,
      secret: crypto.randomBytes(32).toString('hex')
    });
  }

  next();
});

integrationSchema.pre('save', function(next) {
  if (this.isModified('syncStatus.status') && this.syncStatus.status === 'error') {
    this.syncStatus.errorCount += 1;
    this.syncStatus.lastAttempt = new Date();
  }

  if (this.syncStatus.status === 'success') {
    this.syncStatus.lastSuccess = new Date();
    this.lastSync = new Date();
  }

  next();
});

integrationSchema.methods.generateWebhookSecret = function() {
  return crypto.randomBytes(32).toString('hex');
};

integrationSchema.methods.validateWebhook = function(signature, payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const calculatedSignature = hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculatedSignature));
};

integrationSchema.methods.encrypt = function(data) {
  if (!this.security.encryptionEnabled) return data;

  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex')
  };
};

integrationSchema.methods.decrypt = function(encryptedData) {
  if (!this.security.encryptionEnabled || typeof encryptedData === 'string') return encryptedData;

  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const decipher = crypto.createDecipher(algorithm, key, Buffer.from(encryptedData.iv, 'hex'));

  decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

integrationSchema.methods.recordUsage = function() {
  this.usage.totalRequests += 1;
  this.usage.requestsThisMonth += 1;
  this.usage.lastRequestAt = new Date();

  const errorRate = (this.syncStatus.errorCount / this.usage.totalRequests) * 100;
  this.usage.errorRate = errorRate;

  return this.save();
};

integrationSchema.methods.checkRateLimit = function() {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    canMakeRequest: true,
    limits: {
      perMinute: this.rateLimits.requestsPerMinute,
      perHour: this.rateLimits.requestsPerHour,
      perDay: this.rateLimits.requestsPerDay
    },
    remaining: {
      perMinute: Math.max(0, this.rateLimits.requestsPerMinute - this.getRequestsInWindow(oneMinuteAgo)),
      perHour: Math.max(0, this.rateLimits.requestsPerHour - this.getRequestsInWindow(oneHourAgo)),
      perDay: Math.max(0, this.rateLimits.requestsPerDay - this.getRequestsInWindow(oneDayAgo))
    }
  };
};

integrationSchema.methods.getRequestsInWindow = function(since) {
  return 0;
};

integrationSchema.methods.triggerSync = async function() {
  try {
    this.syncStatus.status = 'in_progress';
    this.syncStatus.lastAttempt = new Date();
    await this.save();

    this.syncStatus.status = 'success';
    this.syncStatus.lastSuccess = new Date();
    this.lastSync = new Date();

    return await this.save();
  } catch (error) {
    this.syncStatus.status = 'error';
    this.syncStatus.lastError = {
      message: error.message,
      code: error.code || 'UNKNOWN',
      timestamp: new Date()
    };
    this.syncStatus.errorCount += 1;

    await this.save();
    throw error;
  }
};

integrationSchema.methods.performHealthCheck = async function() {
  try {
    this.monitoring.healthCheck.lastCheck = new Date();
    this.monitoring.healthCheck.status = 'healthy';

    return await this.save();
  } catch (error) {
    this.monitoring.healthCheck.status = 'unhealthy';
    await this.save();
    throw error;
  }
};

integrationSchema.statics.findByProvider = function(provider, therapistId = null) {
  const query = { provider, isActive: true };
  if (therapistId) query.therapistId = therapistId;
  return this.find(query);
};

integrationSchema.statics.findActiveIntegrations = function(therapistId) {
  return this.find({
    therapistId,
    isActive: true,
    status: 'active'
  }).select('-config.apiKey -config.clientSecret -config.accessToken -config.refreshToken');
};

integrationSchema.statics.findOverdueSync = function() {
  return this.find({
    isActive: true,
    autoSync: true,
    status: 'active'
  }).where('lastSync').lt(new Date(Date.now() - 24 * 60 * 60 * 1000));
};

integrationSchema.statics.getProviderStats = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$provider',
        total: { $sum: 1 },
        active: {
          $sum: {
            $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
          }
        },
        errors: {
          $sum: {
            $cond: [{ $eq: ['$status', 'error'] }, 1, 0]
          }
        },
        avgErrorRate: { $avg: '$usage.errorRate' }
      }
    },
    { $sort: { total: -1 } }
  ]);
};

integrationSchema.statics.getHealthyIntegrations = function(therapistId) {
  return this.find({
    therapistId,
    isActive: true,
    status: 'active',
    'syncStatus.status': { $ne: 'error' },
    'monitoring.healthCheck.status': 'healthy'
  });
};

integrationSchema.index({ therapistId: 1, provider: 1 }, { unique: true });
integrationSchema.index({ status: 1, isActive: 1 });
integrationSchema.index({ category: 1, status: 1 });
integrationSchema.index({ lastSync: 1, autoSync: 1 });
integrationSchema.index({ 'syncStatus.status': 1 });
integrationSchema.index({ 'monitoring.healthCheck.status': 1 });

module.exports = mongoose.model('Integration', integrationSchema);