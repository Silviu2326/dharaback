const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required'],
    unique: true // One subscription per therapist
  },
  plan: {
    type: String,
    enum: ['basic', 'professional', 'premium'],
    required: [true, 'Plan is required']
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'suspended', 'expired', 'pending', 'trial'],
    default: 'pending',
    required: true
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
  renewalDate: {
    type: Date,
    required: [true, 'Renewal date is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    enum: ['EUR', 'USD', 'GBP'],
    default: 'EUR',
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'paypal', 'stripe', 'admin'],
    required: [true, 'Payment method is required']
  },
  features: [{
    type: String,
    required: true
  }],
  limits: {
    maxClients: {
      type: Number,
      required: [true, 'Max clients limit is required'],
      min: [1, 'Max clients must be at least 1']
    },
    maxStorage: {
      type: Number, // in bytes
      required: [true, 'Max storage limit is required'],
      min: [0, 'Max storage cannot be negative']
    },
    maxSessions: {
      type: Number,
      required: [true, 'Max sessions limit is required'],
      min: [1, 'Max sessions must be at least 1']
    }
  },
  // Billing and payment details
  billing: {
    interval: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },
    nextBillingDate: Date,
    lastBillingDate: Date,
    totalPaid: {
      type: Number,
      default: 0,
      min: 0
    },
    outstandingAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    discount: {
      percentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      amount: {
        type: Number,
        default: 0,
        min: 0
      },
      reason: String,
      validUntil: Date
    }
  },
  // Payment history
  paymentHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'EUR'
    },
    method: String,
    transactionId: String,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    invoice: {
      invoiceNumber: String,
      invoiceUrl: String
    },
    metadata: mongoose.Schema.Types.Mixed
  }],
  // Usage tracking
  usage: {
    currentClients: {
      type: Number,
      default: 0,
      min: 0
    },
    currentSessions: {
      type: Number,
      default: 0,
      min: 0
    },
    storageUsed: {
      type: Number, // in bytes
      default: 0,
      min: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  // Trial settings
  trial: {
    isTrialUsed: {
      type: Boolean,
      default: false
    },
    trialDays: {
      type: Number,
      default: 14,
      min: 0
    },
    trialStartDate: Date,
    trialEndDate: Date
  },
  // Subscription management
  management: {
    autoRenew: {
      type: Boolean,
      default: true
    },
    cancellationDate: Date,
    cancellationReason: String,
    suspensionDate: Date,
    suspensionReason: String,
    reactivationDate: Date,
    downgradeTo: {
      type: String,
      enum: ['basic', 'professional', 'premium'],
      default: null
    },
    upgradeFrom: {
      type: String,
      enum: ['basic', 'professional', 'premium'],
      default: null
    }
  },
  // Notifications and alerts
  notifications: {
    renewalReminder: {
      enabled: {
        type: Boolean,
        default: true
      },
      daysBefore: {
        type: Number,
        default: 7,
        min: 1,
        max: 30
      },
      lastSent: Date
    },
    usageAlerts: {
      enabled: {
        type: Boolean,
        default: true
      },
      thresholds: {
        clients: {
          type: Number,
          default: 80,
          min: 50,
          max: 100
        },
        sessions: {
          type: Number,
          default: 80,
          min: 50,
          max: 100
        },
        storage: {
          type: Number,
          default: 80,
          min: 50,
          max: 100
        }
      }
    },
    paymentFailure: {
      enabled: {
        type: Boolean,
        default: true
      },
      retryAttempts: {
        type: Number,
        default: 3,
        min: 1,
        max: 5
      },
      lastFailure: Date
    }
  },
  // Add-ons and extras
  addOns: [{
    name: {
      type: String,
      required: true
    },
    description: String,
    price: {
      type: Number,
      required: true,
      min: 0
    },
    billing: {
      type: String,
      enum: ['one_time', 'monthly', 'yearly'],
      default: 'monthly'
    },
    enabled: {
      type: Boolean,
      default: true
    },
    addedDate: {
      type: Date,
      default: Date.now
    }
  }],
  // Support and service
  support: {
    priorityLevel: {
      type: String,
      enum: ['basic', 'standard', 'priority', 'premium'],
      default: 'basic'
    },
    dedicatedSupport: {
      type: Boolean,
      default: false
    },
    supportTickets: [{
      ticketId: String,
      subject: String,
      status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open'
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  // Analytics and metrics
  analytics: {
    lifetimeValue: {
      type: Number,
      default: 0,
      min: 0
    },
    churnRisk: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    },
    satisfactionScore: {
      type: Number,
      min: 1,
      max: 5
    },
    lastActivityDate: Date,
    engagementScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
subscriptionSchema.index({ therapistId: 1 }, { unique: true });
subscriptionSchema.index({ status: 1, renewalDate: 1 });
subscriptionSchema.index({ plan: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ 'billing.nextBillingDate': 1 });

// Virtual for therapist details
subscriptionSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for days until renewal
subscriptionSchema.virtual('daysUntilRenewal').get(function() {
  if (!this.renewalDate) return null;

  const now = new Date();
  const diffTime = this.renewalDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for days until expiry
subscriptionSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.endDate) return null;

  const now = new Date();
  const diffTime = this.endDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is expired
subscriptionSchema.virtual('isExpired').get(function() {
  return new Date() > this.endDate;
});

// Virtual for is trial
subscriptionSchema.virtual('isTrial').get(function() {
  return this.status === 'trial';
});

// Virtual for trial days remaining
subscriptionSchema.virtual('trialDaysRemaining').get(function() {
  if (!this.trial.trialEndDate) return 0;

  const now = new Date();
  const diffTime = this.trial.trialEndDate - now;
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
});

// Virtual for usage percentages
subscriptionSchema.virtual('usagePercentages').get(function() {
  return {
    clients: Math.round((this.usage.currentClients / this.limits.maxClients) * 100),
    sessions: Math.round((this.usage.currentSessions / this.limits.maxSessions) * 100),
    storage: Math.round((this.usage.storageUsed / this.limits.maxStorage) * 100)
  };
});

// Virtual for monthly recurring revenue
subscriptionSchema.virtual('monthlyRevenue').get(function() {
  if (this.billing.interval === 'monthly') return this.amount;
  if (this.billing.interval === 'quarterly') return this.amount / 3;
  if (this.billing.interval === 'yearly') return this.amount / 12;
  return 0;
});

// Method to activate subscription
subscriptionSchema.methods.activate = function() {
  this.status = 'active';
  if (!this.startDate) {
    this.startDate = new Date();
  }
  return this.save();
};

// Method to cancel subscription
subscriptionSchema.methods.cancel = function(reason = '') {
  this.status = 'cancelled';
  this.management.cancellationDate = new Date();
  this.management.cancellationReason = reason;
  this.management.autoRenew = false;
  return this.save();
};

// Method to suspend subscription
subscriptionSchema.methods.suspend = function(reason = '') {
  this.status = 'suspended';
  this.management.suspensionDate = new Date();
  this.management.suspensionReason = reason;
  return this.save();
};

// Method to reactivate subscription
subscriptionSchema.methods.reactivate = function() {
  this.status = 'active';
  this.management.reactivationDate = new Date();
  this.management.suspensionDate = null;
  this.management.suspensionReason = null;
  return this.save();
};

// Method to start trial
subscriptionSchema.methods.startTrial = function() {
  if (this.trial.isTrialUsed) {
    throw new Error('Trial has already been used for this account');
  }

  this.status = 'trial';
  this.trial.isTrialUsed = true;
  this.trial.trialStartDate = new Date();
  this.trial.trialEndDate = new Date(Date.now() + (this.trial.trialDays * 24 * 60 * 60 * 1000));

  return this.save();
};

// Method to upgrade plan
subscriptionSchema.methods.upgrade = function(newPlan) {
  const planHierarchy = { basic: 1, professional: 2, premium: 3 };

  if (planHierarchy[newPlan] <= planHierarchy[this.plan]) {
    throw new Error('Can only upgrade to a higher plan');
  }

  this.management.upgradeFrom = this.plan;
  this.plan = newPlan;

  // Update features and limits based on new plan
  this.updatePlanDetails(newPlan);

  return this.save();
};

// Method to downgrade plan
subscriptionSchema.methods.downgrade = function(newPlan) {
  const planHierarchy = { basic: 1, professional: 2, premium: 3 };

  if (planHierarchy[newPlan] >= planHierarchy[this.plan]) {
    throw new Error('Can only downgrade to a lower plan');
  }

  this.management.downgradeTo = newPlan;
  // Downgrade takes effect at next renewal

  return this.save();
};

// Method to update plan details
subscriptionSchema.methods.updatePlanDetails = function(plan) {
  const planDetails = {
    basic: {
      features: ['Basic Dashboard', 'Client Management', 'Basic Reports'],
      limits: { maxClients: 25, maxStorage: 1024 * 1024 * 1024, maxSessions: 100 }, // 1GB
      amount: 29.99
    },
    professional: {
      features: ['Advanced Dashboard', 'Client Management', 'Advanced Reports', 'Video Sessions', 'Calendar Integration'],
      limits: { maxClients: 100, maxStorage: 5 * 1024 * 1024 * 1024, maxSessions: 500 }, // 5GB
      amount: 79.99
    },
    premium: {
      features: ['Premium Dashboard', 'Unlimited Clients', 'Advanced Reports', 'Video Sessions', 'Calendar Integration', 'API Access', 'Priority Support'],
      limits: { maxClients: 1000, maxStorage: 20 * 1024 * 1024 * 1024, maxSessions: 2000 }, // 20GB
      amount: 149.99
    }
  };

  const details = planDetails[plan];
  if (details) {
    this.features = details.features;
    this.limits = details.limits;
    this.amount = details.amount;
  }
};

// Method to process payment
subscriptionSchema.methods.processPayment = function(paymentData) {
  this.paymentHistory.push({
    amount: paymentData.amount,
    currency: paymentData.currency || this.currency,
    method: paymentData.method,
    transactionId: paymentData.transactionId,
    status: paymentData.status || 'completed',
    invoice: paymentData.invoice || {}
  });

  if (paymentData.status === 'completed') {
    this.billing.totalPaid += paymentData.amount;
    this.billing.lastBillingDate = new Date();
    this.billing.outstandingAmount = Math.max(0, this.billing.outstandingAmount - paymentData.amount);

    // Update next billing date
    if (this.billing.interval === 'monthly') {
      this.billing.nextBillingDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
    } else if (this.billing.interval === 'quarterly') {
      this.billing.nextBillingDate = new Date(Date.now() + (90 * 24 * 60 * 60 * 1000));
    } else if (this.billing.interval === 'yearly') {
      this.billing.nextBillingDate = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000));
    }

    // Update analytics
    this.analytics.lifetimeValue += paymentData.amount;
  }

  return this.save();
};

// Method to update usage
subscriptionSchema.methods.updateUsage = function(usageData) {
  if (usageData.currentClients !== undefined) {
    this.usage.currentClients = usageData.currentClients;
  }
  if (usageData.currentSessions !== undefined) {
    this.usage.currentSessions = usageData.currentSessions;
  }
  if (usageData.storageUsed !== undefined) {
    this.usage.storageUsed = usageData.storageUsed;
  }

  this.usage.lastUpdated = new Date();
  return this.save();
};

// Method to check if limit is exceeded
subscriptionSchema.methods.checkLimits = function() {
  return {
    clients: this.usage.currentClients >= this.limits.maxClients,
    sessions: this.usage.currentSessions >= this.limits.maxSessions,
    storage: this.usage.storageUsed >= this.limits.maxStorage
  };
};

// Method to add add-on
subscriptionSchema.methods.addAddOn = function(addOnData) {
  this.addOns.push(addOnData);
  return this.save();
};

// Method to remove add-on
subscriptionSchema.methods.removeAddOn = function(addOnId) {
  this.addOns.pull(addOnId);
  return this.save();
};

// Static method to get active subscriptions
subscriptionSchema.statics.getActiveSubscriptions = function() {
  return this.find({ status: 'active' })
    .populate('therapist', 'name email profile.firstName profile.lastName');
};

// Static method to get expiring subscriptions
subscriptionSchema.statics.getExpiringSubscriptions = function(daysAhead = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  return this.find({
    status: 'active',
    endDate: { $lte: futureDate, $gte: new Date() }
  }).populate('therapist', 'name email');
};

// Static method to get subscription statistics
subscriptionSchema.statics.getSubscriptionStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$plan',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$billing.totalPaid' },
        avgLifetimeValue: { $avg: '$analytics.lifetimeValue' },
        activeCount: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to calculate monthly recurring revenue
subscriptionSchema.statics.calculateMRR = function() {
  return this.aggregate([
    { $match: { status: 'active' } },
    {
      $group: {
        _id: null,
        totalMRR: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ['$billing.interval', 'monthly'] }, then: '$amount' },
                { case: { $eq: ['$billing.interval', 'quarterly'] }, then: { $divide: ['$amount', 3] } },
                { case: { $eq: ['$billing.interval', 'yearly'] }, then: { $divide: ['$amount', 12] } }
              ],
              default: 0
            }
          }
        }
      }
    }
  ]);
};

// Pre-save middleware
subscriptionSchema.pre('save', function(next) {
  // Update end date based on renewal date and billing interval
  if (this.isModified('renewalDate') || this.isModified('billing.interval')) {
    if (this.billing.interval === 'monthly') {
      this.endDate = new Date(this.renewalDate.getTime() + (30 * 24 * 60 * 60 * 1000));
    } else if (this.billing.interval === 'quarterly') {
      this.endDate = new Date(this.renewalDate.getTime() + (90 * 24 * 60 * 60 * 1000));
    } else if (this.billing.interval === 'yearly') {
      this.endDate = new Date(this.renewalDate.getTime() + (365 * 24 * 60 * 60 * 1000));
    }
  }

  // Auto-expire if past end date
  if (this.endDate && new Date() > this.endDate && this.status === 'active') {
    this.status = 'expired';
  }

  next();
});

// Post-save middleware
subscriptionSchema.post('save', function() {
  // Here you would trigger notifications or analytics updates
  // Example: notificationService.notifySubscriptionUpdate(this);
});

module.exports = mongoose.model('Subscription', subscriptionSchema);