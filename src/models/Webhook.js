const mongoose = require('mongoose');
const crypto = require('crypto');

const webhookSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  integrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Integration',
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

  method: {
    type: String,
    enum: ['POST', 'PUT', 'PATCH'],
    default: 'POST'
  },

  events: [{
    type: String,
    required: true,
    enum: [
      'booking.created',
      'booking.updated',
      'booking.cancelled',
      'booking.completed',
      'payment.received',
      'payment.failed',
      'client.created',
      'client.updated',
      'session.started',
      'session.ended',
      'document.uploaded',
      'review.created',
      'plan.assigned',
      'subscription.created',
      'subscription.cancelled',
      'coupon.used',
      'user.login',
      'user.logout',
      'integration.connected',
      'integration.disconnected',
      'sync.completed',
      'sync.failed'
    ]
  }],

  headers: {
    type: Map,
    of: String,
    default: function() {
      return new Map([
        ['Content-Type', 'application/json'],
        ['User-Agent', 'Dharaterapeutas-Webhook/1.0']
      ]);
    }
  },

  authentication: {
    type: {
      type: String,
      enum: ['none', 'bearer', 'basic', 'api_key', 'custom'],
      default: 'none'
    },
    token: {
      type: String,
      select: false
    },
    username: {
      type: String,
      select: false
    },
    password: {
      type: String,
      select: false
    },
    apiKey: {
      type: String,
      select: false
    },
    apiKeyHeader: {
      type: String,
      default: 'X-API-Key'
    },
    customHeaders: {
      type: Map,
      of: String,
      select: false
    }
  },

  secret: {
    type: String,
    required: true,
    default: function() {
      return crypto.randomBytes(32).toString('hex');
    },
    select: false
  },

  signature: {
    enabled: {
      type: Boolean,
      default: true
    },
    algorithm: {
      type: String,
      enum: ['sha256', 'sha1', 'md5'],
      default: 'sha256'
    },
    header: {
      type: String,
      default: 'X-Webhook-Signature'
    }
  },

  retryPolicy: {
    enabled: {
      type: Boolean,
      default: true
    },
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 10
    },
    retryDelays: [{
      type: Number,
      default: [1000, 5000, 15000]
    }],
    backoffStrategy: {
      type: String,
      enum: ['fixed', 'exponential', 'linear'],
      default: 'exponential'
    }
  },

  timeout: {
    type: Number,
    default: 30000,
    min: 1000,
    max: 120000
  },

  status: {
    type: String,
    enum: ['active', 'inactive', 'error', 'suspended'],
    default: 'active',
    index: true
  },

  statistics: {
    totalDeliveries: {
      type: Number,
      default: 0
    },
    successfulDeliveries: {
      type: Number,
      default: 0
    },
    failedDeliveries: {
      type: Number,
      default: 0
    },
    lastDelivery: {
      timestamp: Date,
      status: {
        type: String,
        enum: ['success', 'failed', 'retry']
      },
      responseCode: Number,
      responseTime: Number,
      error: String
    },
    averageResponseTime: {
      type: Number,
      default: 0
    },
    successRate: {
      type: Number,
      default: 100
    }
  },

  deliveryLogs: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    event: {
      type: String,
      required: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed
    },
    attempt: {
      type: Number,
      default: 1
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'retry'],
      required: true
    },
    responseCode: Number,
    responseHeaders: {
      type: Map,
      of: String
    },
    responseBody: String,
    responseTime: Number,
    error: {
      message: String,
      code: String,
      stack: String
    },
    signature: String
  }],

  filters: {
    conditions: [{
      field: {
        type: String,
        required: true
      },
      operator: {
        type: String,
        enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'in', 'not_in'],
        required: true
      },
      value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
      }
    }],
    logic: {
      type: String,
      enum: ['AND', 'OR'],
      default: 'AND'
    }
  },

  transformation: {
    enabled: {
      type: Boolean,
      default: false
    },
    template: String,
    mapping: [{
      sourceField: {
        type: String,
        required: true
      },
      targetField: {
        type: String,
        required: true
      },
      transformation: {
        type: String,
        enum: ['none', 'uppercase', 'lowercase', 'date_format', 'custom']
      },
      customTransformation: String
    }]
  },

  rateLimit: {
    enabled: {
      type: Boolean,
      default: false
    },
    requestsPerSecond: {
      type: Number,
      default: 10,
      min: 1,
      max: 100
    },
    burstLimit: {
      type: Number,
      default: 50
    }
  },

  monitoring: {
    enabled: {
      type: Boolean,
      default: true
    },
    alertThresholds: {
      failureRate: {
        type: Number,
        default: 10,
        min: 0,
        max: 100
      },
      responseTime: {
        type: Number,
        default: 5000
      }
    },
    notifications: [{
      type: {
        type: String,
        enum: ['email', 'sms', 'webhook'],
        required: true
      },
      recipient: {
        type: String,
        required: true
      },
      events: [{
        type: String,
        enum: ['delivery_failed', 'high_failure_rate', 'slow_response', 'webhook_disabled']
      }]
    }]
  },

  metadata: {
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    version: {
      type: String,
      default: '1.0.0'
    },
    environment: {
      type: String,
      enum: ['production', 'staging', 'development'],
      default: 'production'
    },
    notes: {
      type: String,
      maxlength: 1000
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

webhookSchema.virtual('successRate').get(function() {
  if (this.statistics.totalDeliveries === 0) return 100;
  return (this.statistics.successfulDeliveries / this.statistics.totalDeliveries) * 100;
});

webhookSchema.virtual('failureRate').get(function() {
  if (this.statistics.totalDeliveries === 0) return 0;
  return (this.statistics.failedDeliveries / this.statistics.totalDeliveries) * 100;
});

webhookSchema.virtual('isHealthy').get(function() {
  return this.status === 'active' &&
         this.successRate >= (100 - this.monitoring.alertThresholds.failureRate) &&
         this.statistics.averageResponseTime <= this.monitoring.alertThresholds.responseTime;
});

webhookSchema.virtual('nextRetryAt').get(function() {
  const lastLog = this.deliveryLogs[this.deliveryLogs.length - 1];
  if (!lastLog || lastLog.status !== 'retry') return null;

  const { retryDelays, backoffStrategy } = this.retryPolicy;
  const attempt = lastLog.attempt;

  let delay;
  if (backoffStrategy === 'exponential') {
    delay = Math.min(retryDelays[0] * Math.pow(2, attempt - 1), 300000);
  } else if (backoffStrategy === 'linear') {
    delay = retryDelays[0] * attempt;
  } else {
    delay = retryDelays[Math.min(attempt - 1, retryDelays.length - 1)] || retryDelays[0];
  }

  return new Date(lastLog.timestamp.getTime() + delay);
});

webhookSchema.pre('save', function(next) {
  if (this.deliveryLogs.length > 100) {
    this.deliveryLogs = this.deliveryLogs.slice(-100);
  }

  if (this.statistics.totalDeliveries > 0) {
    this.statistics.successRate = (this.statistics.successfulDeliveries / this.statistics.totalDeliveries) * 100;
  }

  next();
});

webhookSchema.methods.generateSignature = function(payload, timestamp) {
  const data = `${timestamp}.${payload}`;
  return crypto
    .createHmac(this.signature.algorithm, this.secret)
    .update(data, 'utf8')
    .digest('hex');
};

webhookSchema.methods.validateSignature = function(signature, payload, timestamp) {
  const expectedSignature = this.generateSignature(payload, timestamp);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

webhookSchema.methods.shouldTrigger = function(event, data) {
  if (!this.events.includes(event)) return false;
  if (this.status !== 'active') return false;

  if (this.filters.conditions.length === 0) return true;

  const results = this.filters.conditions.map(condition => {
    const fieldValue = this.getNestedValue(data, condition.field);
    return this.evaluateCondition(fieldValue, condition.operator, condition.value);
  });

  return this.filters.logic === 'AND'
    ? results.every(result => result)
    : results.some(result => result);
};

webhookSchema.methods.getNestedValue = function(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
};

webhookSchema.methods.evaluateCondition = function(fieldValue, operator, value) {
  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'not_equals':
      return fieldValue !== value;
    case 'contains':
      return String(fieldValue).includes(String(value));
    case 'not_contains':
      return !String(fieldValue).includes(String(value));
    case 'greater_than':
      return Number(fieldValue) > Number(value);
    case 'less_than':
      return Number(fieldValue) < Number(value);
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'not_in':
      return Array.isArray(value) && !value.includes(fieldValue);
    default:
      return false;
  }
};

webhookSchema.methods.transformPayload = function(originalPayload) {
  if (!this.transformation.enabled) return originalPayload;

  let transformedPayload = { ...originalPayload };

  this.transformation.mapping.forEach(mapping => {
    const sourceValue = this.getNestedValue(originalPayload, mapping.sourceField);
    let transformedValue = sourceValue;

    switch (mapping.transformation) {
      case 'uppercase':
        transformedValue = String(sourceValue).toUpperCase();
        break;
      case 'lowercase':
        transformedValue = String(sourceValue).toLowerCase();
        break;
      case 'date_format':
        transformedValue = new Date(sourceValue).toISOString();
        break;
      case 'custom':
        if (mapping.customTransformation) {
          try {
            const transform = new Function('value', mapping.customTransformation);
            transformedValue = transform(sourceValue);
          } catch (error) {
            transformedValue = sourceValue;
          }
        }
        break;
    }

    this.setNestedValue(transformedPayload, mapping.targetField, transformedValue);
  });

  return transformedPayload;
};

webhookSchema.methods.setNestedValue = function(obj, path, value) {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;
};

webhookSchema.methods.recordDelivery = function(event, payload, status, response = {}) {
  const deliveryLog = {
    timestamp: new Date(),
    event,
    payload,
    status,
    responseCode: response.status,
    responseHeaders: response.headers ? new Map(Object.entries(response.headers)) : undefined,
    responseBody: response.data,
    responseTime: response.responseTime,
    error: response.error ? {
      message: response.error.message,
      code: response.error.code,
      stack: response.error.stack
    } : undefined
  };

  this.deliveryLogs.push(deliveryLog);

  this.statistics.totalDeliveries += 1;
  if (status === 'success') {
    this.statistics.successfulDeliveries += 1;
  } else {
    this.statistics.failedDeliveries += 1;
  }

  if (response.responseTime) {
    const totalTime = this.statistics.averageResponseTime * (this.statistics.totalDeliveries - 1);
    this.statistics.averageResponseTime = (totalTime + response.responseTime) / this.statistics.totalDeliveries;
  }

  this.statistics.lastDelivery = deliveryLog;

  return this.save();
};

webhookSchema.methods.disable = function(reason) {
  this.status = 'suspended';
  this.metadata.notes = `Disabled: ${reason}`;
  return this.save();
};

webhookSchema.methods.enable = function() {
  this.status = 'active';
  return this.save();
};

webhookSchema.methods.testDelivery = async function() {
  const testPayload = {
    event: 'webhook.test',
    timestamp: new Date().toISOString(),
    data: {
      webhookId: this._id,
      test: true
    }
  };

  return testPayload;
};

webhookSchema.statics.findByEvent = function(event, therapistId = null) {
  const query = {
    events: event,
    status: 'active',
    isActive: true
  };
  if (therapistId) query.therapistId = therapistId;
  return this.find(query);
};

webhookSchema.statics.findUnhealthy = function() {
  return this.find({
    isActive: true,
    $or: [
      { status: 'error' },
      { 'statistics.successRate': { $lt: 90 } },
      { 'statistics.averageResponseTime': { $gt: 5000 } }
    ]
  });
};

webhookSchema.statics.findForRetry = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    status: 'active',
    'retryPolicy.enabled': true,
    'deliveryLogs': {
      $elemMatch: {
        status: 'retry',
        timestamp: { $lt: now }
      }
    }
  });
};

webhookSchema.statics.getStatsByTherapist = function(therapistId) {
  return this.aggregate([
    { $match: { therapistId: mongoose.Types.ObjectId(therapistId), isActive: true } },
    {
      $group: {
        _id: null,
        totalWebhooks: { $sum: 1 },
        activeWebhooks: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        totalDeliveries: { $sum: '$statistics.totalDeliveries' },
        successfulDeliveries: { $sum: '$statistics.successfulDeliveries' },
        failedDeliveries: { $sum: '$statistics.failedDeliveries' },
        avgResponseTime: { $avg: '$statistics.averageResponseTime' }
      }
    }
  ]);
};

webhookSchema.statics.cleanupOldLogs = function(daysToKeep = 30) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  return this.updateMany(
    {},
    {
      $pull: {
        deliveryLogs: {
          timestamp: { $lt: cutoffDate }
        }
      }
    }
  );
};

webhookSchema.index({ therapistId: 1, status: 1 });
webhookSchema.index({ events: 1, status: 1 });
webhookSchema.index({ integrationId: 1 });
webhookSchema.index({ 'deliveryLogs.timestamp': 1 });
webhookSchema.index({ 'statistics.successRate': 1 });
webhookSchema.index({ 'metadata.tags': 1 });

module.exports = mongoose.model('Webhook', webhookSchema);