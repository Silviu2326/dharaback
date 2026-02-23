const { validationResult } = require('express-validator');
const { Conversation, Message, Client, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const conversationController = {
  // Get all conversations for a therapist
  async getConversations(req, res, next) {
    try {
      const therapistId = req.user.id;
      const { status = 'all', hasUnread = false, search = '', page = 1, limit = 20 } = req.query;

      // Build query
      let query = supabase
        .from('conversations')
        .select('*, client:client_id(*)', { count: 'exact' })
        .eq('therapist_id', therapistId);

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (hasUnread === 'true') {
        query = query.gt('unread_count', 0);
      }

      // Apply sorting and pagination
      query = query.order('last_message_at', { ascending: false });
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      const conversations = (data || []).map(c => new Conversation.Conversation(c));

      // Filter by search term if provided
      let filteredConversations = conversations;
      if (search.trim()) {
        const searchLower = search.toLowerCase();
        filteredConversations = conversations.filter(c => 
          c.client?.name?.toLowerCase().includes(searchLower) ||
          c.metadata?.lastMessage?.toLowerCase().includes(searchLower)
        );
      }

      res.json({
        success: true,
        data: {
          conversations: filteredConversations.map(c => c.toJSON()),
          pagination: {
            current: parseInt(page),
            pages: Math.ceil((count || 0) / parseInt(limit)),
            total: count || 0
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get a specific conversation with messages
  async getConversation(req, res, next) {
    try {
      const { conversationId } = req.params;
      const therapistId = req.user.id;
      const { page = 1, limit = 50 } = req.query;

      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      // Get client data
      const client = await Client.findById(conversation.clientId);

      // Get messages with pagination
      const messages = await Message.findByConversation(conversationId, {
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        ascending: false
      });

      res.json({
        success: true,
        data: {
          conversation: {
            ...conversation.toJSON(),
            client: client ? {
              id: client.id,
              name: client.name,
              email: client.email,
              avatar: client.avatar,
              status: client.status
            } : null
          },
          messages: messages.map(m => m.toJSON()),
          pagination: {
            current: parseInt(page),
            limit: parseInt(limit)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Create or get existing conversation
  async createConversation(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const therapistId = req.user.id;
      const { clientId } = req.body;

      // Check if client exists
      const client = await Client.findById(clientId);
      if (!client) {
        return next(new AppError('Client not found', 404));
      }

      // Find or create conversation
      let conversation = await Conversation.findBetweenUsers(clientId, therapistId);
      
      if (!conversation) {
        conversation = await Conversation.create({
          clientId,
          therapistId,
          status: 'active'
        });
      } else if (conversation.isArchived) {
        // Reactivate if archived
        await conversation.reactivate();
      }

      res.status(201).json({
        success: true,
        data: {
          ...conversation.toJSON(),
          client: {
            id: client.id,
            name: client.name,
            email: client.email,
            avatar: client.avatar
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Update conversation settings
  async updateConversation(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { conversationId } = req.params;
      const therapistId = req.user.id;
      const updateData = req.body;

      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      // Update only allowed fields
      const allowedUpdates = ['status', 'metadata'];
      const updates = {};

      allowedUpdates.forEach(field => {
        if (updateData[field] !== undefined) {
          updates[field] = updateData[field];
        }
      });

      const updatedConversation = await Conversation.findByIdAndUpdate(
        conversationId,
        updates,
        { new: true }
      );

      res.json({
        success: true,
        data: updatedConversation.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark conversation as read
  async markAsRead(req, res, next) {
    try {
      const { conversationId } = req.params;
      const therapistId = req.user.id;

      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      await conversation.markAsRead();
      await Message.markAllAsRead(conversationId, therapistId);

      res.json({
        success: true,
        message: 'Conversation marked as read'
      });
    } catch (error) {
      next(error);
    }
  },

  // Update typing status
  async updateTypingStatus(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { isTyping } = req.body;
      const therapistId = req.user.id;

      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      // Update typing status in metadata
      const metadata = {
        ...conversation.metadata,
        typingStatus: {
          therapist: isTyping,
          updatedAt: new Date().toISOString()
        }
      };

      await Conversation.findByIdAndUpdate(conversationId, { metadata });

      // Here you would emit socket event for real-time updates
      // socketService.emitTypingStatus(conversationId, 'therapist', isTyping);

      res.json({
        success: true,
        message: 'Typing status updated'
      });
    } catch (error) {
      next(error);
    }
  },

  // Archive conversation
  async archiveConversation(req, res, next) {
    try {
      const { conversationId } = req.params;
      const therapistId = req.user.id;

      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      await conversation.archive();

      res.json({
        success: true,
        message: 'Conversation archived successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Unarchive conversation
  async unarchiveConversation(req, res, next) {
    try {
      const { conversationId } = req.params;
      const therapistId = req.user.id;

      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      await conversation.reactivate();

      res.json({
        success: true,
        message: 'Conversation unarchived successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Search messages in conversations
  async searchMessages(req, res, next) {
    try {
      const therapistId = req.user.id;
      const { q: searchTerm, conversationId, messageType, startDate, endDate, limit = 20 } = req.query;

      if (!searchTerm) {
        return next(new AppError('Search term is required', 400));
      }

      let conversations;
      if (conversationId) {
        // Search in specific conversation
        const conversation = await Conversation.findOne({
          id: conversationId,
          therapistId: therapistId
        });

        if (!conversation) {
          return next(new AppError('Conversation not found', 404));
        }

        conversations = [conversation];
      } else {
        // Search in all therapist conversations
        conversations = await Conversation.findByTherapist(therapistId);
      }

      const searchResults = [];
      for (const conversation of conversations) {
        const messages = await Message.search(conversation.id, searchTerm, {
          limit: parseInt(limit),
          messageType,
          startDate,
          endDate
        });

        if (messages.length > 0) {
          const client = await Client.findById(conversation.clientId);
          searchResults.push({
            conversation: {
              id: conversation.id,
              client: client ? {
                id: client.id,
                name: client.name,
                avatar: client.avatar
              } : null,
              lastMessageAt: conversation.lastMessageAt
            },
            messages: messages.map(m => m.toJSON())
          });
        }
      }

      res.json({
        success: true,
        data: {
          searchTerm,
          results: searchResults,
          totalResults: searchResults.reduce((acc, conv) => acc + conv.messages.length, 0)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get conversation statistics
  async getConversationStats(req, res, next) {
    try {
      const therapistId = req.user.id;

      const stats = await Conversation.getStats(therapistId);

      res.json({
        success: true,
        data: stats || {
          total: 0,
          active: 0,
          archived: 0,
          unread: 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Calculate average response time for conversation
  async calculateResponseTime(req, res, next) {
    try {
      const { conversationId } = req.params;
      const therapistId = req.user.id;

      const conversation = await Conversation.findOne({
        id: conversationId,
        therapistId: therapistId
      });

      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }

      // Get all messages for the conversation
      const messages = await Message.findByConversation(conversationId, {
        ascending: true
      });

      // Calculate average response time
      let totalResponseTime = 0;
      let responseCount = 0;
      let lastClientMessage = null;

      for (const message of messages) {
        if (message.senderType === 'client') {
          lastClientMessage = new Date(message.createdAt);
        } else if (message.senderType === 'therapist' && lastClientMessage) {
          const responseTime = new Date(message.createdAt) - lastClientMessage;
          totalResponseTime += responseTime;
          responseCount++;
          lastClientMessage = null;
        }
      }

      const averageResponseTime = responseCount > 0 
        ? Math.round(totalResponseTime / responseCount / (1000 * 60)) // in minutes
        : 0;

      res.json({
        success: true,
        data: {
          conversationId,
          averageResponseTime: `${averageResponseTime} minutes`,
          averageResponseTimeMinutes: averageResponseTime
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = conversationController;
