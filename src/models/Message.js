const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'Conversation ID is required']
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Sender ID is required']
  },
  senderType: {
    type: String,
    enum: ['therapist', 'client'],
    required: [true, 'Sender type is required']
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [2000, 'Message content cannot exceed 2000 characters'],
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'audio', 'video', 'mixed'],
    default: 'text'
  },
  attachments: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'document', 'audio', 'video'],
      required: true
    },
    size: {
      type: Number,
      required: true,
      min: 0
    },
    mimeType: {
      type: String,
      required: true
    }
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  editedAt: {
    type: Date,
    default: null
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  originalContent: {
    type: String,
    default: null
  },
  // Message status and delivery
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'failed'],
    default: 'sent'
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  failureReason: {
    type: String,
    maxlength: [200, 'Failure reason cannot exceed 200 characters']
  },
  // Message metadata
  metadata: {
    platform: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    },
    userAgent: String,
    ipAddress: String,
    location: {
      latitude: Number,
      longitude: Number,
      city: String,
      country: String
    }
  },
  // Reply functionality
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  // Reactions/emotions
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    userType: {
      type: String,
      enum: ['therapist', 'client'],
      required: true
    },
    emoji: {
      type: String,
      required: true,
      maxlength: 10
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Message importance/priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  // Auto-deletion
  expiresAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ senderId: 1, timestamp: -1 });
messageSchema.index({ conversationId: 1, isRead: 1 });
messageSchema.index({ timestamp: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for sender details (will be populated based on senderType)
messageSchema.virtual('sender', {
  refPath: function() {
    return this.senderType === 'therapist' ? 'User' : 'Client';
  },
  localField: 'senderId',
  foreignField: '_id',
  justOne: true
});

// Virtual for conversation details
messageSchema.virtual('conversation', {
  ref: 'Conversation',
  localField: 'conversationId',
  foreignField: '_id',
  justOne: true
});

// Virtual for reply message details
messageSchema.virtual('replyToMessage', {
  ref: 'Message',
  localField: 'replyTo',
  foreignField: '_id',
  justOne: true
});

// Virtual for message age
messageSchema.virtual('messageAge').get(function() {
  const now = new Date();
  const diffMs = now - this.timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else {
    return `${diffDays}d`;
  }
});

// Virtual for attachment count
messageSchema.virtual('attachmentCount').get(function() {
  return this.attachments ? this.attachments.length : 0;
});

// Method to mark message as read
messageSchema.methods.markAsRead = async function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    this.status = 'delivered';
    this.deliveredAt = new Date();
    await this.save();

    // Update conversation unread count
    const Conversation = mongoose.model('Conversation');
    const conversation = await Conversation.findById(this.conversationId);
    if (conversation) {
      const recipientType = this.senderType === 'therapist' ? 'client' : 'therapist';
      if (conversation.unreadCount[recipientType] > 0) {
        conversation.unreadCount[recipientType] -= 1;
        await conversation.save();
      }
    }
  }
  return this;
};

// Method to edit message
messageSchema.methods.editMessage = function(newContent) {
  if (!this.isEdited) {
    this.originalContent = this.content;
  }
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, userType, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    reaction => !(reaction.userId.toString() === userId.toString())
  );

  // Add new reaction
  this.reactions.push({
    userId,
    userType,
    emoji,
    timestamp: new Date()
  });

  return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(
    reaction => !(reaction.userId.toString() === userId.toString())
  );
  return this.save();
};

// Method to soft delete message
messageSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.content = '[Message deleted]';
  this.attachments = [];
  return this.save();
};

// Static method to get conversation messages with pagination
messageSchema.statics.getConversationMessages = function(conversationId, options = {}) {
  const {
    page = 1,
    limit = 50,
    beforeMessageId = null,
    afterMessageId = null
  } = options;

  const query = {
    conversationId,
    isDeleted: false
  };

  // Pagination using message ID (more efficient for real-time chat)
  if (beforeMessageId) {
    query._id = { $lt: beforeMessageId };
  } else if (afterMessageId) {
    query._id = { $gt: afterMessageId };
  }

  return this.find(query)
    .populate('replyToMessage', 'content senderType timestamp')
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
};

// Static method to get unread messages count
messageSchema.statics.getUnreadCount = function(conversationId, userType) {
  const senderType = userType === 'therapist' ? 'client' : 'therapist';
  return this.countDocuments({
    conversationId,
    senderType,
    isRead: false,
    isDeleted: false
  });
};

// Static method to mark all messages as read
messageSchema.statics.markAllAsRead = async function(conversationId, userType) {
  const senderType = userType === 'therapist' ? 'client' : 'therapist';

  const result = await this.updateMany(
    {
      conversationId,
      senderType,
      isRead: false,
      isDeleted: false
    },
    {
      isRead: true,
      readAt: new Date(),
      status: 'delivered',
      deliveredAt: new Date()
    }
  );

  // Update conversation unread count
  const Conversation = mongoose.model('Conversation');
  const conversation = await Conversation.findById(conversationId);
  if (conversation) {
    conversation.unreadCount[userType] = 0;
    await conversation.save();
  }

  return result;
};

// Static method to search messages
messageSchema.statics.searchMessages = function(conversationId, searchTerm, options = {}) {
  const {
    limit = 20,
    messageType = null,
    startDate = null,
    endDate = null
  } = options;

  const query = {
    conversationId,
    isDeleted: false,
    content: { $regex: searchTerm, $options: 'i' }
  };

  if (messageType) {
    query.type = messageType;
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Pre-save middleware
messageSchema.pre('save', async function(next) {
  // Update conversation's last message if this is a new message
  if (this.isNew && !this.isDeleted) {
    const Conversation = mongoose.model('Conversation');
    const conversation = await Conversation.findById(this.conversationId);

    if (conversation) {
      await conversation.updateLastMessage({
        content: this.content,
        timestamp: this.timestamp,
        senderId: this.senderId,
        senderType: this.senderType,
        type: this.type
      });
    }
  }

  next();
});

// Post-save middleware for real-time notifications
messageSchema.post('save', function() {
  // Here you would emit socket events for real-time updates
  // Example: socketService.emitNewMessage(this.conversationId, this);
});

module.exports = mongoose.model('Message', messageSchema);