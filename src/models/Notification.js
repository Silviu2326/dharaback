const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  type: {
    type: String,
    enum: ['appointment', 'message', 'document', 'payment', 'system', 'review', 'reminder', 'cancellation'],
    required: [true, 'Notification type is required']
  },
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  summary: {
    type: String,
    required: [true, 'Notification summary is required'],
    trim: true,
    maxlength: [500, 'Summary cannot exceed 500 characters']
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false
  },
  source: {
    type: String,
    required: [true, 'Notification source is required'],
    trim: true,
    maxlength: [50, 'Source cannot exceed 50 characters']
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  actionUrl: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow null/empty
        return /^\//.test(v) || /^https?:\/\//.test(v);
      },
      message: 'Action URL must be a valid relative or absolute URL'
    }
  },
  expiresAt: {
    type: Date,
    default: null
  },
  // Additional notification management fields
  category: {
    type: String,
    enum: ['appointment', 'communication', 'financial', 'administrative', 'marketing'],
    default: 'administrative'
  },
  channels: [{
    type: String,
    enum: ['in_app', 'email', 'sms', 'push'],
    default: ['in_app']
  }],
  deliveryStatus: {
    in_app: {
      delivered: { type: Boolean, default: true },
      deliveredAt: { type: Date, default: Date.now }
    },
    email: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      messageId: String,
      bounced: { type: Boolean, default: false },
      opened: { type: Boolean, default: false },
      openedAt: Date
    },
    sms: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      messageId: String,
      failed: { type: Boolean, default: false },
      failureReason: String
    },
    push: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      messageId: String,
      failed: { type: Boolean, default: false },
      clicked: { type: Boolean, default: false },
      clickedAt: Date
    }
  },
  // Interaction tracking
  interactions: [{
    action: {
      type: String,
      enum: ['viewed', 'clicked', 'dismissed', 'archived'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
  }],
  readAt: {
    type: Date,
    default: null
  },
  dismissedAt: {
    type: Date,
    default: null
  },
  archivedAt: {
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
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      default: null
    }
  },
  // Scheduling for future notifications
  scheduledFor: {
    type: Date,
    default: null
  },
  isScheduled: {
    type: Boolean,
    default: false
  },
  // Template information
  templateId: {
    type: String,
    default: null
  },
  templateVariables: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Retry mechanism for failed deliveries
  retryCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  lastRetryAt: {
    type: Date,
    default: null
  },
  // Grouping for similar notifications
  groupKey: {
    type: String,
    default: null,
    index: true
  },
  isGrouped: {
    type: Boolean,
    default: false
  },
  groupCount: {
    type: Number,
    default: 1,
    min: 1
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, priority: 1, isRead: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ scheduledFor: 1, isScheduled: 1 });
notificationSchema.index({ groupKey: 1 });

// Virtual for user details
notificationSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for related booking
notificationSchema.virtual('booking', {
  ref: 'Booking',
  localField: 'relatedEntities.bookingId',
  foreignField: '_id',
  justOne: true
});

// Virtual for related client
notificationSchema.virtual('client', {
  ref: 'Client',
  localField: 'relatedEntities.clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for notification age
notificationSchema.virtual('notificationAge').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
});

// Virtual for is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Virtual for priority color
notificationSchema.virtual('priorityColor').get(function() {
  const colors = {
    low: '#10B981',      // green
    medium: '#F59E0B',   // yellow
    high: '#EF4444',     // red
    critical: '#DC2626'  // dark red
  };
  return colors[this.priority] || colors.medium;
});

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    this.interactions.push({
      action: 'viewed',
      timestamp: new Date()
    });
  }
  return this.save();
};

// Method to dismiss notification
notificationSchema.methods.dismiss = function() {
  this.dismissedAt = new Date();
  this.interactions.push({
    action: 'dismissed',
    timestamp: new Date()
  });
  return this.save();
};

// Method to archive notification
notificationSchema.methods.archive = function() {
  this.archivedAt = new Date();
  this.interactions.push({
    action: 'archived',
    timestamp: new Date()
  });
  return this.save();
};

// Method to track click
notificationSchema.methods.trackClick = function(metadata = {}) {
  this.interactions.push({
    action: 'clicked',
    timestamp: new Date(),
    metadata
  });

  // Mark as read when clicked
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
  }

  return this.save();
};

// Method to update delivery status
notificationSchema.methods.updateDeliveryStatus = function(channel, status) {
  if (!this.deliveryStatus[channel]) {
    return Promise.reject(new Error(`Invalid channel: ${channel}`));
  }

  this.deliveryStatus[channel] = {
    ...this.deliveryStatus[channel],
    ...status,
    deliveredAt: status.delivered ? new Date() : this.deliveryStatus[channel].deliveredAt
  };

  return this.save();
};

// Method to retry failed delivery
notificationSchema.methods.retryDelivery = function() {
  if (this.retryCount >= 3) {
    throw new Error('Maximum retry attempts exceeded');
  }

  this.retryCount += 1;
  this.lastRetryAt = new Date();

  return this.save();
};

// Static method to create notification
notificationSchema.statics.createNotification = async function(notificationData) {
  const {
    userId,
    type,
    title,
    summary,
    data = {},
    priority = 'medium',
    actionUrl = null,
    expiresAt = null,
    channels = ['in_app'],
    relatedEntities = {},
    templateId = null,
    templateVariables = {},
    groupKey = null
  } = notificationData;

  // Check for grouping
  let notification;
  if (groupKey) {
    const existingNotification = await this.findOne({
      userId,
      groupKey,
      isRead: false,
      archivedAt: null
    });

    if (existingNotification) {
      // Update existing grouped notification
      existingNotification.groupCount += 1;
      existingNotification.summary = summary;
      existingNotification.data = { ...existingNotification.data, ...data };
      existingNotification.updatedAt = new Date();
      notification = await existingNotification.save();
    } else {
      // Create new grouped notification
      notification = new this({
        userId,
        type,
        title,
        summary,
        data,
        priority,
        actionUrl,
        expiresAt,
        channels,
        relatedEntities,
        templateId,
        templateVariables,
        groupKey,
        isGrouped: true
      });
      notification = await notification.save();
    }
  } else {
    // Create regular notification
    notification = new this({
      userId,
      type,
      title,
      summary,
      data,
      priority,
      actionUrl,
      expiresAt,
      channels,
      relatedEntities,
      templateId,
      templateVariables,
      source: 'system'
    });
    notification = await notification.save();
  }

  return notification;
};

// Static method to get user notifications
notificationSchema.statics.getUserNotifications = function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    type = null,
    priority = null,
    isRead = null,
    includeArchived = false
  } = options;

  const query = { userId };

  if (type) query.type = type;
  if (priority) query.priority = priority;
  if (isRead !== null) query.isRead = isRead;
  if (!includeArchived) query.archivedAt = null;

  return this.find(query)
    .populate('relatedEntities.clientId', 'name avatar')
    .populate('relatedEntities.bookingId', 'date startTime serviceType')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
};

// Static method to get notification counts
notificationSchema.statics.getNotificationCounts = function(userId) {
  return this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), archivedAt: null } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
        high: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
        critical: { $sum: { $cond: [{ $eq: ['$priority', 'critical'] }, 1, 0] } }
      }
    }
  ]);
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = function(userId, type = null) {
  const query = { userId, isRead: false };
  if (type) query.type = type;

  return this.updateMany(query, {
    isRead: true,
    readAt: new Date(),
    $push: {
      interactions: {
        action: 'viewed',
        timestamp: new Date()
      }
    }
  });
};

// Static method to clean expired notifications
notificationSchema.statics.cleanExpiredNotifications = function() {
  const now = new Date();
  return this.deleteMany({
    expiresAt: { $lt: now }
  });
};

// Pre-save middleware
notificationSchema.pre('save', function(next) {
  // Set source if not provided
  if (this.isNew && !this.source) {
    this.source = 'system';
  }

  // Validate action URL format
  if (this.actionUrl && !this.actionUrl.startsWith('/') && !this.actionUrl.startsWith('http')) {
    this.actionUrl = `/${this.actionUrl}`;
  }

  next();
});

// Post-save middleware for real-time notifications
notificationSchema.post('save', function() {
  // Here you would emit socket events for real-time notifications
  // Example: socketService.emitNotification(this.userId, this);
});

module.exports = mongoose.model('Notification', notificationSchema);