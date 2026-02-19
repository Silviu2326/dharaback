const mongoose = require('mongoose');

const notificationSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  email: {
    enabled: {
      type: Boolean,
      default: true
    },
    address: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function(v) {
          return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Invalid email address'
      }
    },
    verified: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['immediate', 'hourly', 'daily', 'weekly', 'never'],
      default: 'immediate'
    },
    digest: {
      enabled: {
        type: Boolean,
        default: false
      },
      time: {
        type: String,
        default: '09:00',
        validate: {
          validator: function(v) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'Time must be in HH:MM format'
        }
      },
      timezone: {
        type: String,
        default: 'Europe/Madrid'
      }
    },
    preferences: {
      booking: {
        type: Boolean,
        default: true
      },
      payment: {
        type: Boolean,
        default: true
      },
      reminder: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      },
      newsletter: {
        type: Boolean,
        default: false
      },
      system: {
        type: Boolean,
        default: true
      },
      security: {
        type: Boolean,
        default: true
      }
    }
  },

  sms: {
    enabled: {
      type: Boolean,
      default: false
    },
    phoneNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          return !v || /^\+?[1-9]\d{1,14}$/.test(v.replace(/\s/g, ''));
        },
        message: 'Invalid phone number format'
      }
    },
    verified: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['immediate', 'hourly', 'daily', 'never'],
      default: 'immediate'
    },
    preferences: {
      urgentOnly: {
        type: Boolean,
        default: true
      },
      booking: {
        type: Boolean,
        default: true
      },
      payment: {
        type: Boolean,
        default: false
      },
      reminder: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      },
      security: {
        type: Boolean,
        default: true
      }
    }
  },

  push: {
    enabled: {
      type: Boolean,
      default: true
    },
    devices: [{
      deviceId: {
        type: String,
        required: true
      },
      platform: {
        type: String,
        enum: ['ios', 'android', 'web'],
        required: true
      },
      token: {
        type: String,
        required: true,
        select: false
      },
      lastUsed: {
        type: Date,
        default: Date.now
      },
      active: {
        type: Boolean,
        default: true
      }
    }],
    frequency: {
      type: String,
      enum: ['immediate', 'hourly', 'daily', 'never'],
      default: 'immediate'
    },
    quietHours: {
      enabled: {
        type: Boolean,
        default: false
      },
      start: {
        type: String,
        default: '22:00',
        validate: {
          validator: function(v) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'Time must be in HH:MM format'
        }
      },
      end: {
        type: String,
        default: '08:00',
        validate: {
          validator: function(v) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'Time must be in HH:MM format'
        }
      },
      timezone: {
        type: String,
        default: 'Europe/Madrid'
      }
    },
    preferences: {
      booking: {
        type: Boolean,
        default: true
      },
      payment: {
        type: Boolean,
        default: true
      },
      reminder: {
        type: Boolean,
        default: true
      },
      message: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      },
      system: {
        type: Boolean,
        default: true
      },
      security: {
        type: Boolean,
        default: true
      }
    }
  },

  inApp: {
    enabled: {
      type: Boolean,
      default: true
    },
    sound: {
      type: Boolean,
      default: true
    },
    badge: {
      type: Boolean,
      default: true
    },
    preferences: {
      booking: {
        type: Boolean,
        default: true
      },
      payment: {
        type: Boolean,
        default: true
      },
      reminder: {
        type: Boolean,
        default: true
      },
      message: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      },
      system: {
        type: Boolean,
        default: true
      },
      security: {
        type: Boolean,
        default: true
      },
      social: {
        type: Boolean,
        default: true
      }
    }
  },

  webhook: {
    enabled: {
      type: Boolean,
      default: false
    },
    url: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Webhook URL must be a valid URL'
      }
    },
    secret: {
      type: String,
      select: false
    },
    events: [{
      type: String,
      enum: [
        'booking.created',
        'booking.updated',
        'booking.cancelled',
        'payment.received',
        'payment.failed',
        'client.created',
        'session.completed',
        'review.received'
      ]
    }],
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
      }
    }
  },

  categories: {
    booking: {
      enabled: {
        type: Boolean,
        default: true
      },
      channels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'inApp', 'webhook']
      }],
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
      },
      scheduleAdvance: {
        type: Number,
        default: 24
      }
    },

    payment: {
      enabled: {
        type: Boolean,
        default: true
      },
      channels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'inApp', 'webhook']
      }],
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'high'
      }
    },

    reminder: {
      enabled: {
        type: Boolean,
        default: true
      },
      channels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'inApp']
      }],
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
      },
      timing: [{
        type: Number,
        default: [24, 2]
      }]
    },

    message: {
      enabled: {
        type: Boolean,
        default: true
      },
      channels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'inApp']
      }],
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
      }
    },

    marketing: {
      enabled: {
        type: Boolean,
        default: false
      },
      channels: [{
        type: String,
        enum: ['email', 'push', 'inApp']
      }],
      priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low'
      },
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'never'],
        default: 'weekly'
      }
    },

    system: {
      enabled: {
        type: Boolean,
        default: true
      },
      channels: [{
        type: String,
        enum: ['email', 'push', 'inApp']
      }],
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'high'
      }
    },

    security: {
      enabled: {
        type: Boolean,
        default: true
      },
      channels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'inApp']
      }],
      priority: {
        type: String,
        enum: ['high', 'urgent'],
        default: 'urgent'
      }
    }
  },

  doNotDisturb: {
    enabled: {
      type: Boolean,
      default: false
    },
    start: {
      type: String,
      default: '22:00',
      validate: {
        validator: function(v) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Time must be in HH:MM format'
      }
    },
    end: {
      type: String,
      default: '08:00',
      validate: {
        validator: function(v) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Time must be in HH:MM format'
      }
    },
    days: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    exceptions: [{
      type: String,
      enum: ['urgent', 'security', 'emergency']
    }],
    timezone: {
      type: String,
      default: 'Europe/Madrid'
    }
  },

  language: {
    type: String,
    enum: ['es', 'en', 'fr', 'de', 'it', 'pt'],
    default: 'es'
  },

  timezone: {
    type: String,
    default: 'Europe/Madrid'
  },

  lastUpdated: {
    type: Date,
    default: Date.now
  },

  migrationData: {
    version: {
      type: String,
      default: '1.0.0'
    },
    migratedAt: Date,
    previousSettings: {
      type: mongoose.Schema.Types.Mixed
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

notificationSettingsSchema.virtual('hasActiveChannels').get(function() {
  return this.email.enabled || this.sms.enabled || this.push.enabled || this.inApp.enabled;
});

notificationSettingsSchema.virtual('activeDevicesCount').get(function() {
  return this.push.devices.filter(device => device.active).length;
});

notificationSettingsSchema.virtual('isInQuietHours').get(function() {
  if (!this.push.quietHours.enabled && !this.doNotDisturb.enabled) return false;

  const now = new Date();
  const timezone = this.timezone;

  const currentTime = now.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  const quietStart = this.push.quietHours.enabled ? this.push.quietHours.start : this.doNotDisturb.start;
  const quietEnd = this.push.quietHours.enabled ? this.push.quietHours.end : this.doNotDisturb.end;

  if (quietStart > quietEnd) {
    return currentTime >= quietStart || currentTime <= quietEnd;
  } else {
    return currentTime >= quietStart && currentTime <= quietEnd;
  }
});

notificationSettingsSchema.virtual('enabledCategories').get(function() {
  return Object.keys(this.categories).filter(category => this.categories[category].enabled);
});

notificationSettingsSchema.pre('save', function(next) {
  this.lastUpdated = new Date();

  if (!this.email.address && this.userId) {
    this.populate('userId', 'email')
      .then(() => {
        if (this.userId && this.userId.email) {
          this.email.address = this.userId.email;
        }
        next();
      })
      .catch(next);
  } else {
    next();
  }
});

notificationSettingsSchema.pre('save', function(next) {
  this.push.devices = this.push.devices.filter(device => device.active);

  if (this.push.devices.length === 0) {
    this.push.enabled = false;
  }

  next();
});

notificationSettingsSchema.methods.shouldSendNotification = function(category, channel, priority = 'medium') {
  if (!this.categories[category] || !this.categories[category].enabled) return false;

  if (!this[channel] || !this[channel].enabled) return false;

  if (this.isInQuietHours) {
    const exceptions = this.doNotDisturb.exceptions || [];
    if (!exceptions.includes(priority) && priority !== 'urgent') return false;
  }

  const categoryConfig = this.categories[category];
  if (categoryConfig.channels && categoryConfig.channels.length > 0) {
    return categoryConfig.channels.includes(channel);
  }

  return true;
};

notificationSettingsSchema.methods.getPreferredChannels = function(category) {
  const categoryConfig = this.categories[category];
  if (!categoryConfig || !categoryConfig.enabled) return [];

  const availableChannels = [];

  if (this.email.enabled) availableChannels.push('email');
  if (this.sms.enabled) availableChannels.push('sms');
  if (this.push.enabled && this.activeDevicesCount > 0) availableChannels.push('push');
  if (this.inApp.enabled) availableChannels.push('inApp');
  if (this.webhook.enabled) availableChannels.push('webhook');

  if (categoryConfig.channels && categoryConfig.channels.length > 0) {
    return availableChannels.filter(channel => categoryConfig.channels.includes(channel));
  }

  return availableChannels;
};

notificationSettingsSchema.methods.addDevice = function(deviceData) {
  const existingIndex = this.push.devices.findIndex(d => d.deviceId === deviceData.deviceId);

  if (existingIndex >= 0) {
    this.push.devices[existingIndex] = {
      ...this.push.devices[existingIndex].toObject(),
      ...deviceData,
      lastUsed: new Date(),
      active: true
    };
  } else {
    this.push.devices.push({
      ...deviceData,
      lastUsed: new Date(),
      active: true
    });
  }

  this.push.enabled = true;
  return this.save();
};

notificationSettingsSchema.methods.removeDevice = function(deviceId) {
  this.push.devices = this.push.devices.filter(device => device.deviceId !== deviceId);

  if (this.push.devices.length === 0) {
    this.push.enabled = false;
  }

  return this.save();
};

notificationSettingsSchema.methods.updateChannelPreferences = function(channel, preferences) {
  if (this[channel]) {
    Object.assign(this[channel].preferences, preferences);
    return this.save();
  }
  throw new Error(`Invalid channel: ${channel}`);
};

notificationSettingsSchema.methods.enableCategory = function(category, channels = []) {
  if (this.categories[category]) {
    this.categories[category].enabled = true;
    if (channels.length > 0) {
      this.categories[category].channels = channels;
    }
    return this.save();
  }
  throw new Error(`Invalid category: ${category}`);
};

notificationSettingsSchema.methods.disableCategory = function(category) {
  if (this.categories[category]) {
    this.categories[category].enabled = false;
    return this.save();
  }
  throw new Error(`Invalid category: ${category}`);
};

notificationSettingsSchema.methods.getDigestSettings = function() {
  if (!this.email.digest.enabled) return null;

  return {
    time: this.email.digest.time,
    timezone: this.email.digest.timezone,
    frequency: this.email.frequency
  };
};

notificationSettingsSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

notificationSettingsSchema.statics.createDefault = function(userId, userEmail = null) {
  const defaultSettings = new this({ userId });

  if (userEmail) {
    defaultSettings.email.address = userEmail;
  }

  return defaultSettings.save();
};

notificationSettingsSchema.statics.findDigestRecipients = function(time, timezone = 'Europe/Madrid') {
  return this.find({
    'email.digest.enabled': true,
    'email.digest.time': time,
    'email.digest.timezone': timezone,
    'email.enabled': true,
    'email.verified': true
  }).populate('userId', 'name email');
};

notificationSettingsSchema.statics.findByChannelEnabled = function(channel) {
  const query = {};
  query[`${channel}.enabled`] = true;
  return this.find(query);
};

notificationSettingsSchema.statics.bulkUpdatePreferences = function(userIds, updates) {
  return this.updateMany(
    { userId: { $in: userIds } },
    { $set: updates },
    { upsert: false }
  );
};

notificationSettingsSchema.statics.getChannelStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        emailEnabled: {
          $sum: { $cond: ['$email.enabled', 1, 0] }
        },
        smsEnabled: {
          $sum: { $cond: ['$sms.enabled', 1, 0] }
        },
        pushEnabled: {
          $sum: { $cond: ['$push.enabled', 1, 0] }
        },
        inAppEnabled: {
          $sum: { $cond: ['$inApp.enabled', 1, 0] }
        },
        webhookEnabled: {
          $sum: { $cond: ['$webhook.enabled', 1, 0] }
        }
      }
    }
  ]);
};

notificationSettingsSchema.index({ userId: 1 }, { unique: true });
notificationSettingsSchema.index({ 'email.enabled': 1, 'email.verified': 1 });
notificationSettingsSchema.index({ 'sms.enabled': 1, 'sms.verified': 1 });
notificationSettingsSchema.index({ 'push.enabled': 1 });
notificationSettingsSchema.index({ 'push.devices.deviceId': 1 });
notificationSettingsSchema.index({ 'email.digest.enabled': 1, 'email.digest.time': 1 });

module.exports = mongoose.model('NotificationSettings', notificationSettingsSchema);