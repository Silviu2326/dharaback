const { validationResult } = require('express-validator');
const { Conversation, Message, Client, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const conversationController = {
  // Get all conversations for a therapist or client
  async getConversations(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { status = 'all', hasUnread = false, search = '', page = 1, limit = 20, include_last_message = true } = req.query;

      // Determine if user is a client (no role property means it's a client)
      const isClient = !userRole || userRole === 'client';

      // Build query with explicit field selection for therapist to ensure name is included
      let query = supabase
        .from('conversations')
        .select(`
          *,
          client:client_id(*),
          therapist:therapist_id(id, name, email, avatar)
        `, { count: 'exact' });

      // Filter by client_id for clients, therapist_id for therapists
      if (isClient) {
        // For clients, we need to find all their client records (one per therapist)
        // and get conversations for all of them
        console.log('🔍 DEBUG: Client listing conversations, userId:', userId, 'email:', req.user.email);
        
        // First, get all client records for this user (by email)
        const { data: clientRecords, error: clientError } = await supabase
          .from('clients')
          .select('id')
          .eq('email', req.user.email);
        
        if (clientError) {
          console.error('❌ Error fetching client records:', clientError);
        }
        
        const clientIds = clientRecords?.map(c => c.id) || [];
        console.log('🔍 DEBUG: Found client IDs for user:', clientIds);
        
        if (clientIds.length > 0) {
          // Filter conversations by client_ids
          query = query.in('client_id', clientIds);
        } else {
          // If no client records found, return empty result
          console.log('⚠️  No client records found for user, returning empty conversations');
          return res.json({
            conversations: [],
            pagination: {
              limit: parseInt(limit),
              offset: (parseInt(page) - 1) * parseInt(limit),
              total: 0,
              hasMore: false
            }
          });
        }
      } else {
        query = query.eq('therapist_id', userId);
      }

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

      console.log(`🔍 DEBUG: Found ${data?.length || 0} conversations`);
      if (data && data.length > 0) {
        console.log(`🔍 DEBUG: First conversation raw data:`, JSON.stringify(data[0], null, 2));
      }

      const conversations = (data || []).map(c => new Conversation.Conversation(c));

      // If client, fetch therapist names separately if join didn't work
      // If therapist, fetch client names separately if join didn't work
      let therapistMap = new Map();
      let clientMap = new Map();
      
      if (conversations.length > 0) {
        if (isClient) {
          // Client view: need therapist info
          const therapistIds = [...new Set(conversations.map(c => c.therapistId).filter(Boolean))];
          if (therapistIds.length > 0) {
            const { data: therapistsData, error: therapistsError } = await supabase
              .from('users')
              .select('id, name, email, avatar')
              .in('id', therapistIds);
            
            if (!therapistsError && therapistsData) {
              therapistsData.forEach(t => therapistMap.set(t.id, t));
              console.log(`🔍 DEBUG: Fetched ${therapistsData.length} therapists:`, therapistsData.map(t => ({ id: t.id, name: t.name })));
            }
          }
        } else {
          // Therapist view: need client info
          const clientIds = [...new Set(conversations.map(c => c.clientId).filter(Boolean))];
          if (clientIds.length > 0) {
            const { data: clientsData, error: clientsError } = await supabase
              .from('clients')
              .select('id, name, email, phone, avatar, is_online, status, rating, tags, sessions_count')
              .in('id', clientIds);
            
            if (!clientsError && clientsData) {
              clientsData.forEach(c => clientMap.set(c.id, c));
              console.log(`🔍 DEBUG: Fetched ${clientsData.length} clients:`, clientsData.map(c => ({ id: c.id, name: c.name })));
            }
          }
        }
      }

      // Debug: log first conversation object
      if (conversations.length > 0) {
        console.log(`🔍 DEBUG: First conversation object:`, {
          id: conversations[0].id,
          therapistId: conversations[0].therapistId,
          therapist: conversations[0].therapist,
          client: conversations[0].client
        });
      }

      // Filter by search term if provided
      let filteredConversations = conversations;
      if (search.trim()) {
        const searchLower = search.toLowerCase();
        filteredConversations = conversations.filter(c => {
          const otherParty = isClient ? c.therapist : c.client;
          return otherParty?.name?.toLowerCase().includes(searchLower) ||
            c.metadata?.lastMessage?.toLowerCase().includes(searchLower);
        });
      }

      // Get last messages for all conversations if requested
      let lastMessagesMap = new Map();
      const shouldIncludeLastMessage = include_last_message === true || include_last_message === 'true';
      if (shouldIncludeLastMessage && filteredConversations.length > 0) {
        const conversationIds = filteredConversations.map(c => c.id);
        
        // Query messages table to get the last message for each conversation
        // Limit to 1 message per conversation by using a subquery approach
        const { data: lastMessages, error: lastMessagesError } = await supabase
          .from('messages')
          .select('id, conversation_id, content, sender_id, created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false })
          .limit(1000); // Limit to avoid too many results

        if (!lastMessagesError && lastMessages) {
          // Group by conversation_id and take the first (most recent) for each
          const messageByConversation = new Map();
          for (const msg of lastMessages) {
            if (!messageByConversation.has(msg.conversation_id)) {
              messageByConversation.set(msg.conversation_id, msg);
            }
          }
          lastMessagesMap = messageByConversation;
          console.log(`🔍 DEBUG: Fetched last messages for ${lastMessagesMap.size} conversations`);
        }
      }

      // Format conversations for frontend compatibility
      const formattedConversations = filteredConversations.map((c, index) => {
        const conv = c.toJSON();
        
        // For clients, get therapist info from join or separate query
        // For therapists, get client info from join or separate query
        let therapistInfo = conv.therapist;
        let clientInfo = conv.client;
        
        if (isClient) {
          // Client view: get therapist info if join didn't work
          if (!therapistInfo && conv.therapistId) {
            therapistInfo = therapistMap.get(conv.therapistId);
          }
          
          // Debug first conversation
          if (index === 0) {
            console.log(`🔍 DEBUG: conv.therapist =`, conv.therapist);
            console.log(`🔍 DEBUG: therapistInfo from map =`, therapistInfo);
            console.log(`🔍 DEBUG: Final name =`, therapistInfo?.name || 'Terapeuta');
          }
        } else {
          // Therapist view: get client info if join didn't work
          if (!clientInfo && conv.clientId) {
            clientInfo = clientMap.get(conv.clientId);
          }
          
          // Debug first conversation
          if (index === 0) {
            console.log(`🔍 DEBUG: conv.client =`, conv.client);
            console.log(`🔍 DEBUG: clientInfo from map =`, clientInfo);
            console.log(`🔍 DEBUG: Final name =`, clientInfo?.name || 'Cliente');
          }
        }
        
        return {
          id: conv.id,
          // For clients, show therapist info as "client" (the other party)
          // For therapists, show client info
          client: isClient ? {
            id: therapistInfo?.id || conv.therapistId,
            name: therapistInfo?.name || 'Terapeuta',
            email: therapistInfo?.email,
            phone: therapistInfo?.phone,
            avatar: therapistInfo?.avatar,
            isOnline: false, // TODO: implement therapist online status
            status: 'active',
            isTherapist: true // Flag to identify this is the therapist
          } : {
            id: clientInfo?.id || conv.clientId,
            name: clientInfo?.name || 'Cliente',
            email: clientInfo?.email,
            phone: clientInfo?.phone,
            avatar: clientInfo?.avatar,
            isOnline: clientInfo?.is_online || false,
            status: clientInfo?.status,
            rating: clientInfo?.rating,
            tags: clientInfo?.tags || [],
            sessionsCount: clientInfo?.sessions_count || 0
          },
          lastMessage: lastMessagesMap.has(conv.id) ? {
            id: lastMessagesMap.get(conv.id).id,
            content: lastMessagesMap.get(conv.id).content,
            sentAt: lastMessagesMap.get(conv.id).created_at,
            senderId: lastMessagesMap.get(conv.id).sender_id
          } : null,
          unreadCount: conv.unreadCount || 0,
          createdAt: conv.createdAt,
          type: conv.type || 'therapy_session',
          status: conv.status || 'active'
        };
      });

      res.json({
        conversations: formattedConversations,
        pagination: {
          limit: parseInt(limit),
          offset: (parseInt(page) - 1) * parseInt(limit),
          total: count || 0,
          hasMore: formattedConversations.length === parseInt(limit)
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

      const { clientId: bodyClientId, therapistId: bodyTherapistId, participants, type, createdBy, title, metadata } = req.body;
      
      let therapistId;
      let actualClientId;
      
      // Determine if the user is a client or therapist based on user type
      const isClient = req.user.type === 'client';
      
      if (isClient) {
        // When a client creates a conversation:
        // - req.user.id is the clientId
        // - therapistId comes from the body
        actualClientId = req.user.id;
        therapistId = bodyTherapistId;
        
        if (!therapistId) {
          return next(new AppError('Therapist ID is required', 400));
        }
      } else {
        // When a therapist creates a conversation:
        // - req.user.id is the therapistId
        // - clientId comes from the body or participants
        therapistId = req.user.id;
        
        // Handle new format with participants array
        if (!bodyClientId && participants && Array.isArray(participants)) {
          const clientParticipant = participants.find(p => p.role === 'client');
          if (clientParticipant) {
            actualClientId = clientParticipant.id;
          }
        }
        
        // Also check metadata for clientId
        if (!actualClientId && metadata?.clientId) {
          actualClientId = metadata.clientId;
        }
        
        // Fall back to body clientId
        if (!actualClientId) {
          actualClientId = bodyClientId;
        }
        
        if (!actualClientId) {
          return next(new AppError('Client ID is required', 400));
        }
      }

      // Check if client exists
      const client = await Client.findById(actualClientId);
      if (!client) {
        return next(new AppError('Client not found', 404));
      }

      // Find or create conversation
      let conversation = await Conversation.findBetweenUsers(actualClientId, therapistId);
      
      if (!conversation) {
        conversation = await Conversation.create({
          clientId: actualClientId,
          therapistId,
          status: 'active',
          type: type || 'therapy_session',
          title: title || `Chat con ${client.name}`,
          metadata: metadata || {}
        });
      } else if (conversation.isArchived) {
        // Reactivate if archived
        await conversation.reactivate();
      }

      res.status(201).json({
        id: conversation.id,
        participants: participants || [
          { id: therapistId, role: 'therapist' },
          { id: actualClientId, role: 'client' }
        ],
        type: conversation.type || 'therapy_session',
        status: conversation.status,
        title: conversation.title || `Chat con ${client.name}`,
        metadata: conversation.metadata || metadata || {},
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          avatar: client.avatar
        },
        createdAt: conversation.createdAt,
        lastActivity: conversation.lastActivity || conversation.createdAt,
        messageCount: conversation.messageCount || 0
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
