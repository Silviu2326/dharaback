const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client ID is required']
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  lastMessage: {
    content: {
      type: String,
      maxlength: [2000, 'Message content cannot exceed 2000 characters']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    senderType: {
      type: String,
      enum: ['therapist', 'client'],
      required: true
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'audio', 'video'],
      default: 'text'
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  unreadCount: {
    therapist: {
      type: Number,
      default: 0,
      min: 0
    },
    client: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'blocked'],
    default: 'active'
  },
  // Additional conversation metadata
  isTyping: {
    therapist: {
      type: Boolean,
      default: false
    },
    client: {
      type: Boolean,
      default: false
    }
  },
  lastTypingUpdate: {
    therapist: {
      type: Date,
      default: null
    },
    client: {
      type: Date,
      default: null
    }
  },
  settings: {
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    allowedFileTypes: [{
      type: String,
      enum: ['image', 'document', 'audio', 'video'],
      default: ['image', 'document']
    }],
    maxFileSize: {
      type: Number,
      default: 10 * 1024 * 1024 // 10MB
    },
    autoDeleteAfterDays: {
      type: Number,
      default: null // null means never auto-delete
    }
  },
  // Message statistics
  messageStats: {
    totalMessages: {
      type: Number,
      default: 0,
      min: 0
    },
    therapistMessages: {
      type: Number,
      default: 0,
      min: 0
    },
    clientMessages: {
      type: Number,
      default: 0,
      min: 0
    },
    averageResponseTime: {
      type: Number, // in minutes
      default: 0
    }
  },
  // Privacy and security
  isEncrypted: {
    type: Boolean,
    default: false
  },
  encryptionKey: {
    type: String,
    select: false // Never return this field
  },
  // Archive information
  archivedAt: {
    type: Date,
    default: null
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Last activity tracking
  lastActivity: {
    therapist: {
      type: Date,
      default: Date.now
    },
    client: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
conversationSchema.index({ therapistId: 1, status: 1, updatedAt: -1 });
conversationSchema.index({ clientId: 1, therapistId: 1 }, { unique: true });
conversationSchema.index({ 'lastMessage.timestamp': -1 });
conversationSchema.index({ status: 1, updatedAt: -1 });

// Virtual for client details
conversationSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for therapist details
conversationSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for messages
conversationSchema.virtual('messages', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'conversationId'
});

// Virtual for total unread count
conversationSchema.virtual('totalUnreadCount').get(function() {
  return this.unreadCount.therapist + this.unreadCount.client;
});

// Virtual for last message preview
conversationSchema.virtual('lastMessagePreview').get(function() {
  if (!this.lastMessage || !this.lastMessage.content) return '';

  const maxLength = 100;
  if (this.lastMessage.content.length <= maxLength) {
    return this.lastMessage.content;
  }
  return this.lastMessage.content.substring(0, maxLength) + '...';
});

// Virtual for conversation age
conversationSchema.virtual('conversationAge').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffTime = Math.abs(now - created);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // days
});

// Method to update last message
conversationSchema.methods.updateLastMessage = function(message) {
  this.lastMessage = {
    content: message.content,
    timestamp: message.timestamp || new Date(),
    senderId: message.senderId,
    senderType: message.senderType,
    type: message.type || 'text',
    isRead: false
  };

  // Update unread count
  if (message.senderType === 'therapist') {
    this.unreadCount.client += 1;
  } else {
    this.unreadCount.therapist += 1;
  }

  // Update message statistics
  this.messageStats.totalMessages += 1;
  if (message.senderType === 'therapist') {
    this.messageStats.therapistMessages += 1;
  } else {
    this.messageStats.clientMessages += 1;
  }

  // Update last activity
  this.lastActivity[message.senderType] = new Date();

  return this.save();
};

// Method to mark messages as read
conversationSchema.methods.markAsRead = function(userType) {
  if (userType === 'therapist') {
    this.unreadCount.therapist = 0;
    this.lastActivity.therapist = new Date();
  } else if (userType === 'client') {
    this.unreadCount.client = 0;
    this.lastActivity.client = new Date();
  }

  return this.save();
};

// Method to update typing status
conversationSchema.methods.updateTypingStatus = function(userType, isTyping) {
  this.isTyping[userType] = isTyping;
  this.lastTypingUpdate[userType] = new Date();

  return this.save({ validateBeforeSave: false });
};

// Method to archive conversation
conversationSchema.methods.archive = function(archivedBy) {
  this.status = 'archived';
  this.archivedAt = new Date();
  this.archivedBy = archivedBy;

  return this.save();
};

// Method to unarchive conversation
conversationSchema.methods.unarchive = function() {
  this.status = 'active';
  this.archivedAt = null;
  this.archivedBy = null;

  return this.save();
};

// Method to calculate average response time
conversationSchema.methods.calculateAverageResponseTime = async function() {
  const Message = mongoose.model('Message');

  const messages = await Message.find({
    conversationId: this._id
  }).sort({ timestamp: 1 }).limit(50); // Analyze last 50 messages

  if (messages.length < 2) {
    return 0;
  }

  let totalResponseTime = 0;
  let responseCount = 0;
  let lastSenderType = null;
  let lastTimestamp = null;

  for (const message of messages) {
    if (lastSenderType && lastSenderType !== message.senderType && lastTimestamp) {
      const responseTime = (message.timestamp - lastTimestamp) / (1000 * 60); // minutes
      if (responseTime <= 24 * 60) { // Only count responses within 24 hours
        totalResponseTime += responseTime;
        responseCount++;
      }
    }
    lastSenderType = message.senderType;
    lastTimestamp = message.timestamp;
  }

  const averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
  this.messageStats.averageResponseTime = Math.round(averageResponseTime);

  await this.save();
  return this.messageStats.averageResponseTime;
};

// Static method to find or create conversation
conversationSchema.statics.findOrCreateConversation = async function(therapistId, clientId) {
  let conversation = await this.findOne({
    therapistId,
    clientId
  }).populate('client', 'name email avatar status')
    .populate('therapist', 'name avatar');

  if (!conversation) {
    conversation = await this.create({
      therapistId,
      clientId,
      status: 'active'
    });

    // Populate the created conversation
    await conversation.populate('client', 'name email avatar status');
    await conversation.populate('therapist', 'name avatar');
  }

  return conversation;
};

// Static method to get therapist conversations with filters
conversationSchema.statics.getTherapistConversations = function(therapistId, filters = {}) {
  const query = { therapistId };

  if (filters.status && filters.status !== 'all') {
    query.status = filters.status;
  }

  if (filters.hasUnread) {
    query['unreadCount.therapist'] = { $gt: 0 };
  }

  if (filters.search) {
    // This would require populating client data, better to use aggregation
    return this.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'client'
        }
      },
      { $unwind: '$client' },
      {
        $match: {
          $or: [
            { 'client.name': { $regex: filters.search, $options: 'i' } },
            { 'client.email': { $regex: filters.search, $options: 'i' } },
            { 'lastMessage.content': { $regex: filters.search, $options: 'i' } }
          ]
        }
      },
      { $sort: { 'lastMessage.timestamp': -1 } }
    ]);
  }

  return this.find(query)
    .populate('client', 'name email avatar status')
    .sort({ 'lastMessage.timestamp': -1 });
};

// Static method to get conversation statistics
conversationSchema.statics.getConversationStats = function(therapistId) {
  return this.aggregate([
    { $match: { therapistId: new mongoose.Types.ObjectId(therapistId) } },
    {
      $group: {
        _id: null,
        totalConversations: { $sum: 1 },
        activeConversations: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        archivedConversations: {
          $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] }
        },
        totalUnreadMessages: { $sum: '$unreadCount.therapist' },
        totalMessages: { $sum: '$messageStats.totalMessages' },
        averageResponseTime: { $avg: '$messageStats.averageResponseTime' }
      }
    }
  ]);
};

// Pre-save middleware
conversationSchema.pre('save', function(next) {
  // Ensure unread counts are not negative
  if (this.unreadCount.therapist < 0) this.unreadCount.therapist = 0;
  if (this.unreadCount.client < 0) this.unreadCount.client = 0;

  // Update the updatedAt timestamp when lastMessage changes
  if (this.isModified('lastMessage')) {
    this.updatedAt = new Date();
  }

  next();
});

module.exports = mongoose.model('Conversation', conversationSchema);