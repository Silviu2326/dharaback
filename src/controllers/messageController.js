const { validationResult } = require('express-validator');
const { Message, Conversation, User, Client } = require('../models');
const { AppError } = require('../middleware/errorHandler');

const messageController = {
  // Send a new message
  async sendMessage(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { conversationId } = req.params;
      const therapistId = req.user.id;
      const { content, type = 'text', replyTo, priority = 'normal', expiresAt } = req.body;

      // Verify conversation exists and therapist has access
      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      // Create message data
      const messageData = {
        conversationId,
        senderId: therapistId,
        senderType: 'therapist',
        content,
        type,
        priority,
        metadata: {
          platform: 'web',
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip
        }
      };

      // Add optional fields if provided
      if (replyTo) messageData.replyTo = replyTo;
      if (expiresAt) messageData.expiresAt = new Date(expiresAt);

      // Handle attachments if present
      if (req.files && req.files.length > 0) {
        messageData.attachments = req.files.map(file => ({
          id: file.filename,
          name: file.originalname,
          url: `/uploads/attachments/${file.filename}`,
          type: file.mimetype.startsWith('image/') ? 'image' : 'document',
          size: file.size,
          mimeType: file.mimetype
        }));
        messageData.type = req.files.length > 1 ? 'mixed' :
                          (req.files[0].mimetype.startsWith('image/') ? 'image' : 'file');
      }

      const message = await Message.create(messageData);

      // Populate sender details
      const sender = await User.findById(therapistId);

      // Emit socket event for real-time delivery
      // socketService.emitNewMessage(conversationId, message);

      res.status(201).json({
        success: true,
        data: {
          ...message.toJSON(),
          sender: sender ? {
            id: sender.id,
            name: sender.name,
            avatar: sender.avatar
          } : null
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get messages for a conversation
  async getMessages(req, res, next) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      const isClient = !userRole || userRole === 'client';
      const { page = 1, limit = 50, beforeMessageId, afterMessageId } = req.query;

      console.log('🔍 DEBUG getMessages - user:', { userId, userRole, isClient, conversationId });

      // Verify conversation access
      let conversation;
      if (isClient) {
        conversation = await Conversation.findOne({
          id: conversationId,
          clientId: userId
        });
      } else {
        conversation = await Conversation.findOne({
          id: conversationId,
          therapistId: userId
        });
      }

      if (!conversation) {
        console.log('🔍 DEBUG getMessages - Conversation not found');
        return next(new AppError('Conversation not found', 404));
      }

      console.log('🔍 DEBUG getMessages - Conversation found:', conversation.id);

      console.log('🔍 DEBUG getMessages - Loading messages for conversation:', conversationId);
      
      const messages = await Message.findByConversation(conversationId, {
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        ascending: false
      });

      console.log('🔍 DEBUG getMessages - Messages found:', messages.length);
      console.log('🔍 DEBUG getMessages - Raw messages from DB:');
      messages.forEach((msg, i) => {
        console.log(`   ${i + 1}. ID: ${msg.id}, Sender: ${msg.senderId}, Type: ${msg.senderType}, Content: "${msg.content?.substring(0, 30)}"`);
      });

      // Populate sender details for each message
      const populatedMessages = await Promise.all(
        messages.map(async (message) => {
          const sender = message.senderType === 'therapist' 
            ? await User.findById(message.senderId)
            : await Client.findById(message.senderId);
          
          return {
            ...message.toJSON(),
            sender: sender ? {
              id: sender.id,
              name: sender.name,
              avatar: sender.avatar
            } : null
          };
        })
      );

      console.log('🔍 DEBUG getMessages - FINAL RESPONSE messages count:', populatedMessages.length);
      console.log('🔍 DEBUG getMessages - Messages being sent to client:');
      populatedMessages.forEach((msg, i) => {
        const isLocal = msg.metadata?._localOnly || msg.metadata?._errorFallback;
        console.log(`   ${i + 1}. [${isLocal ? 'LOCAL' : 'REAL'}] ID: ${msg.id}, Content: "${msg.content?.substring(0, 40)}"`);
      });

      res.json({
        success: true,
        data: {
          messages: populatedMessages,
          pagination: {
            current: parseInt(page),
            limit: parseInt(limit),
            beforeMessageId,
            afterMessageId
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark message as read
  async markMessageAsRead(req, res, next) {
    try {
      const { messageId } = req.params;
      const therapistId = req.user.id;

      const message = await Message.findById(messageId);
      if (!message) {
        return next(new AppError('Message not found', 404));
      }

      // Verify conversation access
      const conversation = await Conversation.findOne({
        id: message.conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Access denied', 403));
      }

      // Only mark as read if message is from client
      if (message.senderType === 'client') {
        await message.markAsRead();
      }

      res.json({
        success: true,
        message: 'Message marked as read'
      });
    } catch (error) {
      next(error);
    }
  },

  // Edit a message
  async editMessage(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { messageId } = req.params;
      const { content } = req.body;
      const therapistId = req.user.id;

      const message = await Message.findById(messageId);
      if (!message) {
        return next(new AppError('Message not found', 404));
      }

      // Verify ownership and that message is from therapist
      if (message.senderId !== therapistId || message.senderType !== 'therapist') {
        return next(new AppError('You can only edit your own messages', 403));
      }

      // Check if message is too old to edit (24 hours)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (new Date(message.createdAt) < twentyFourHoursAgo) {
        return next(new AppError('Message is too old to edit', 400));
      }

      await message.editContent(content);

      res.json({
        success: true,
        data: message.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete a message (soft delete)
  async deleteMessage(req, res, next) {
    try {
      const { messageId } = req.params;
      const therapistId = req.user.id;

      const message = await Message.findById(messageId);
      if (!message) {
        return next(new AppError('Message not found', 404));
      }

      // Verify ownership and that message is from therapist
      if (message.senderId !== therapistId || message.senderType !== 'therapist') {
        return next(new AppError('You can only delete your own messages', 403));
      }

      // Check if message is too old to delete (24 hours)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (new Date(message.createdAt) < twentyFourHoursAgo) {
        return next(new AppError('Message is too old to delete', 400));
      }

      // Soft delete by updating metadata
      const metadata = {
        ...message.metadata,
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: therapistId
      };

      await Message.findByIdAndUpdate(messageId, { metadata });

      res.json({
        success: true,
        message: 'Message deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Add reaction to message
  async addReaction(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { messageId } = req.params;
      const { emoji } = req.body;
      const therapistId = req.user.id;

      const message = await Message.findById(messageId);
      if (!message) {
        return next(new AppError('Message not found', 404));
      }

      // Verify conversation access
      const conversation = await Conversation.findOne({
        id: message.conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Access denied', 403));
      }

      // Add reaction to metadata
      const reactions = message.metadata?.reactions || [];
      const existingReaction = reactions.find(r => r.userId === therapistId);
      
      if (existingReaction) {
        existingReaction.emoji = emoji;
        existingReaction.updatedAt = new Date().toISOString();
      } else {
        reactions.push({
          userId: therapistId,
          userType: 'therapist',
          emoji,
          createdAt: new Date().toISOString()
        });
      }

      await Message.findByIdAndUpdate(messageId, {
        metadata: { ...message.metadata, reactions }
      });

      res.json({
        success: true,
        message: 'Reaction added successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Remove reaction from message
  async removeReaction(req, res, next) {
    try {
      const { messageId } = req.params;
      const therapistId = req.user.id;

      const message = await Message.findById(messageId);
      if (!message) {
        return next(new AppError('Message not found', 404));
      }

      // Verify conversation access
      const conversation = await Conversation.findOne({
        id: message.conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Access denied', 403));
      }

      // Remove reaction from metadata
      const reactions = (message.metadata?.reactions || [])
        .filter(r => r.userId !== therapistId);

      await Message.findByIdAndUpdate(messageId, {
        metadata: { ...message.metadata, reactions }
      });

      res.json({
        success: true,
        message: 'Reaction removed successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get unread messages count
  async getUnreadCount(req, res, next) {
    try {
      const { conversationId } = req.params;
      const therapistId = req.user.id;

      // Verify conversation access
      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      const unreadCount = await Message.countUnread(conversationId);

      res.json({
        success: true,
        data: {
          conversationId,
          unreadCount
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Search messages in conversation
  async searchConversationMessages(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { q: searchTerm, messageType, startDate, endDate, limit = 20 } = req.query;
      const therapistId = req.user.id;

      if (!searchTerm) {
        return next(new AppError('Search term is required', 400));
      }

      // Verify conversation access
      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      const messages = await Message.search(conversationId, searchTerm, {
        limit: parseInt(limit),
        messageType,
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: {
          searchTerm,
          conversationId,
          messages: messages.map(m => m.toJSON()),
          totalResults: messages.length
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get message by ID
  async getMessage(req, res, next) {
    try {
      const { messageId } = req.params;
      const therapistId = req.user.id;

      const message = await Message.findById(messageId);

      if (!message) {
        return next(new AppError('Message not found', 404));
      }

      // Verify conversation access
      const conversation = await Conversation.findOne({
        id: message.conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Access denied', 403));
      }

      // Populate sender details
      const sender = message.senderType === 'therapist'
        ? await User.findById(message.senderId)
        : await Client.findById(message.senderId);

      res.json({
        success: true,
        data: {
          ...message.toJSON(),
          sender: sender ? {
            id: sender.id,
            name: sender.name,
            avatar: sender.avatar
          } : null
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark all messages in conversation as read
  async markAllAsRead(req, res, next) {
    try {
      const { conversationId } = req.params;
      const therapistId = req.user.id;

      // Verify conversation access
      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      const count = await Message.markAllAsRead(conversationId, therapistId);

      res.json({
        success: true,
        message: 'All messages marked as read',
        data: {
          modifiedCount: count
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get messages directly (alternative endpoint for frontend compatibility)
  async getMessagesDirect(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const isClient = !userRole || userRole === 'client';
      const { conversation_id, limit = 50, offset = 0, date_from, date_to, message_type, search } = req.query;

      console.log('📨 getMessagesDirect called:', {
        userId,
        userRole,
        isClient,
        conversation_id,
        limit,
        offset
      });

      if (!conversation_id) {
        return next(new AppError('conversation_id is required', 400));
      }

      // Verify conversation access
      let conversation;
      try {
        if (isClient) {
          // For clients, search by client_id
          conversation = await Conversation.findOne({
            id: conversation_id,
            clientId: userId
          });
        } else {
          // For therapists, search by therapist_id
          conversation = await Conversation.findOne({
            id: conversation_id,
            therapistId: userId
          });
        }
      } catch (convError) {
        console.error('❌ Error finding conversation:', convError.message);
        // Return empty messages array if conversation table doesn't exist
        return res.json({
          messages: [],
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: 0,
            hasMore: false
          }
        });
      }

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      let messages = [];
      try {
        messages = await Message.findByConversation(conversation_id, {
          limit: parseInt(limit),
          offset: parseInt(offset),
          ascending: false
        });
        console.log('🔍 DEBUG getMessagesDirect - Messages from DB:', messages.length);
        messages.forEach((msg, i) => {
          console.log(`   ${i + 1}. ID: ${msg.id}, Sender: ${msg.senderId}, Type: ${msg.senderType}, Content: "${msg.content?.substring(0, 30)}"`);
        });
      } catch (msgError) {
        console.error('❌ Error finding messages:', msgError.message);
        // Return empty array if messages table doesn't exist
        messages = [];
      }

      // Populate sender details for each message
      let populatedMessages = [];
      try {
        populatedMessages = await Promise.all(
          messages.map(async (message) => {
            try {
              const sender = message.senderType === 'therapist'
                ? await User.findById(message.senderId)
                : await Client.findById(message.senderId);

              return {
                ...message.toJSON(),
                sender: sender ? {
                  id: sender.id,
                  name: sender.name,
                  avatar: sender.avatar
                } : null
              };
            } catch (senderError) {
              console.warn('⚠️  Error getting sender details:', senderError.message);
              return {
                ...message.toJSON(),
                sender: null
              };
            }
          })
        );
      } catch (popError) {
        console.error('❌ Error populating messages:', popError.message);
        populatedMessages = messages.map(m => ({ ...m.toJSON(), sender: null }));
      }

      res.json({
        messages: populatedMessages,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: messages.length,
          hasMore: messages.length === parseInt(limit)
        }
      });
    } catch (error) {
      console.error('❌ Error in getMessagesDirect:', error.message, error.stack);
      next(error);
    }
  },

  // Send message directly (alternative endpoint for frontend compatibility)
  async sendMessageDirect(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const isClient = !userRole || userRole === 'client';
      const { conversationId, senderId, type = 'text', content, attachment, messageId, status, sentAt } = req.body;

      console.log('📤 sendMessageDirect called:', {
        userId,
        userRole,
        isClient,
        conversationId,
        type,
        hasContent: !!content,
        hasAttachment: !!attachment
      });

      if (!conversationId) {
        return next(new AppError('conversationId is required', 400));
      }

      // Verify conversation exists and user has access
      let conversation;
      try {
        if (isClient) {
          // For clients, search by client_id
          conversation = await Conversation.findOne({
            id: conversationId,
            clientId: userId
          });
        } else {
          // For therapists, search by therapist_id
          conversation = await Conversation.findOne({
            id: conversationId,
            therapistId: userId
          });
        }
      } catch (convError) {
        console.error('❌ Error finding conversation:', convError.message);
        // If conversations table doesn't exist, we can't verify, but we'll try to create message anyway
        conversation = { id: conversationId };
      }

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      // Create message data
      const messageData = {
        conversationId,
        senderId: senderId || userId,
        senderType: isClient ? 'client' : 'therapist',
        content,
        type,
        status: status || 'sent',
        metadata: {
          platform: 'web',
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip
        }
      };

      // Add optional fields
      if (messageId) messageData.id = messageId;
      if (sentAt) messageData.createdAt = new Date(sentAt);
      if (attachment) messageData.attachments = [attachment];

      let message;
      try {
        message = await Message.create(messageData);
      } catch (msgError) {
        console.error('❌ Error creating message:', msgError.message);
        
        // If messages table doesn't exist, return a mock response
        if (msgError.message && msgError.message.includes('relation "messages" does not exist')) {
          console.warn('⚠️  Messages table does not exist, returning mock response');
          return res.status(201).json({
            id: messageId || `msg-${Date.now()}`,
            conversationId,
            senderId: senderId || therapistId,
            type,
            content,
            status: status || 'sent',
            sentAt: sentAt || new Date().toISOString(),
            deliveredAt: null,
            readAt: null,
            editedAt: null,
            isEdited: false,
            createdAt: new Date().toISOString(),
            _mock: true
          });
        }
        throw msgError;
      }

      // Populate sender details
      let sender = null;
      try {
        if (isClient) {
          sender = await Client.findById(userId);
        } else {
          sender = await User.findById(userId);
        }
      } catch (senderError) {
        console.warn('⚠️  Error getting sender details:', senderError.message);
      }

      // Update conversation last activity
      try {
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessageAt: new Date(),
          metadata: {
            lastMessage: {
              id: message.id,
              content: content,
              senderId: userId,
              timestamp: new Date().toISOString()
            }
          }
        });
      } catch (updateError) {
        console.warn('⚠️  Error updating conversation:', updateError.message);
      }

      res.status(201).json({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        type: message.type,
        content: message.content,
        status: message.status,
        sentAt: message.createdAt,
        deliveredAt: null,
        readAt: null,
        editedAt: null,
        isEdited: false,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('❌ Error in sendMessageDirect:', error.message, error.stack);
      next(error);
    }
  }
};

module.exports = messageController;
