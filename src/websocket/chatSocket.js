const { Server } = require('socket.io');
const { supabase } = require('../config/supabase');
const jwt = require('jsonwebtoken');

let io = null;
const connectedUsers = new Map(); // userId -> { socketId, userType }

/**
 * Inicializar el servidor WebSocket
 * @param {http.Server} httpServer - Servidor HTTP de Express
 */
const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://localhost:8081",
        "https://dhara-peach.vercel.app",
        "https://www.appdhara.com",
        "https://appdhara.com",
        process.env.FRONTEND_URL
      ].filter(Boolean),
      credentials: true,
      methods: ["GET", "POST"]
    },
    path: '/socket.io',
    transports: ['websocket', 'polling']
  });

  // Middleware de autenticación JWT
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      socket.userId = decoded.id || decoded.user_id;
      socket.userRole = decoded.role || 'client';
      
      console.log('🔐 Socket authenticated:', socket.userId, 'Role:', socket.userRole);
      next();
    } catch (err) {
      console.error('❌ Socket authentication error:', err.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.userId);
    
    // Registrar usuario como conectado
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      userType: socket.userRole
    });

    // Unirse a rooms de conversaciones del usuario
    joinUserConversations(socket);

    // Emitir lista de usuarios online a todos
    io.emit('users_online', Array.from(connectedUsers.keys()));

    /**
     * Evento: Usuario está escribiendo
     */
    socket.on('typing', async (data) => {
      const { conversationId, isTyping } = data;
      
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        conversationId,
        isTyping,
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Evento: Enviar mensaje
     */
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content, type = 'text', replyTo, attachments = [] } = data;

        console.log('💬 New message:', { conversationId, sender: socket.userId, type });

        // Validar que el usuario tiene acceso a la conversación
        const { data: conversation, error: convError } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', conversationId)
          .or(`therapist_id.eq.${socket.userId},client_id.eq.${socket.userId}`)
          .single();

        if (convError || !conversation) {
          socket.emit('message_error', { 
            error: 'No tienes acceso a esta conversación' 
          });
          return;
        }

        // Guardar mensaje en base de datos
        const { data: message, error } = await supabase
          .from('messages')
          .insert([{
            conversation_id: conversationId,
            sender_id: socket.userId,
            sender_type: socket.userRole === 'therapist' ? 'therapist' : 'client',
            content,
            type,
            reply_to: replyTo || null,
            attachments: attachments.length > 0 ? attachments : null,
            status: 'sent',
            is_read: false
          }])
          .select(`
            *,
            sender:sender_id(id, name, avatar)
          `)
          .single();

        if (error) {
          console.error('❌ Error saving message:', error);
          socket.emit('message_error', { error: 'Error al guardar el mensaje' });
          return;
        }

        // Emitir mensaje a todos en la conversación
        io.to(`conversation:${conversationId}`).emit('new_message', {
          message,
          conversationId
        });

        console.log('✅ Message sent:', message.id);

        // Notificar al receptor si está offline
        await notifyOfflineUser(conversationId, socket.userId, message, conversation);

      } catch (error) {
        console.error('❌ Error sending message:', error);
        socket.emit('message_error', { error: error.message });
      }
    });

    /**
     * Evento: Marcar mensajes como leídos
     */
    socket.on('mark_read', async (data) => {
      try {
        const { conversationId } = data;
        
        console.log('👁️ Marking as read:', conversationId, 'by:', socket.userId);

        // Actualizar mensajes no leídos del otro usuario
        const { data: updatedMessages, error } = await supabase
          .from('messages')
          .update({ 
            is_read: true, 
            read_at: new Date().toISOString(),
            status: 'read'
          })
          .eq('conversation_id', conversationId)
          .neq('sender_id', socket.userId)
          .eq('is_read', false)
          .select();

        if (error) {
          console.error('❌ Error marking as read:', error);
          return;
        }

        if (updatedMessages && updatedMessages.length > 0) {
          // Resetear contador de no leídos en conversación
          await supabase
            .from('conversations')
            .update({ unread_count: 0 })
            .eq('id', conversationId);

          // Notificar a otros que se leyó
          socket.to(`conversation:${conversationId}`).emit('messages_read', {
            conversationId,
            userId: socket.userId,
            readAt: new Date().toISOString(),
            messageIds: updatedMessages.map(m => m.id)
          });

          console.log('✅ Marked', updatedMessages.length, 'messages as read');
        }
      } catch (error) {
        console.error('❌ Error marking as read:', error);
      }
    });

    /**
     * Evento: Unirse a una conversación específica
     */
    socket.on('join_conversation', async (data) => {
      const { conversationId } = data;
      
      // Verificar acceso
      const { data: conversation, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .or(`therapist_id.eq.${socket.userId},client_id.eq.${socket.userId}`)
        .single();

      if (conversation) {
        socket.join(`conversation:${conversationId}`);
        console.log(`👥 User ${socket.userId} joined conversation:${conversationId}`);
        socket.emit('joined_conversation', { conversationId, success: true });
      } else {
        socket.emit('joined_conversation', { 
          conversationId, 
          success: false, 
          error: 'Acceso denegado' 
        });
      }
    });

    /**
     * Evento: Salir de una conversación
     */
    socket.on('leave_conversation', (data) => {
      const { conversationId } = data;
      socket.leave(`conversation:${conversationId}`);
      console.log(`👋 User ${socket.userId} left conversation:${conversationId}`);
    });

    /**
     * Desconexión
     */
    socket.on('disconnect', (reason) => {
      console.log('🔌 User disconnected:', socket.userId, 'Reason:', reason);
      connectedUsers.delete(socket.userId);
      
      // Notificar a todos que usuario está offline
      io.emit('users_offline', socket.userId);
      io.emit('users_online', Array.from(connectedUsers.keys()));
    });
  });

  return io;
};

/**
 * Unir usuario a todas sus conversaciones
 */
const joinUserConversations = async (socket) => {
  try {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id')
      .or(`therapist_id.eq.${socket.userId},client_id.eq.${socket.userId}`);

    if (error) {
      console.error('❌ Error fetching conversations:', error);
      return;
    }

    conversations?.forEach(conv => {
      socket.join(`conversation:${conv.id}`);
    });

    console.log(`👥 User ${socket.userId} joined ${conversations?.length || 0} conversations`);
  } catch (error) {
    console.error('❌ Error joining conversations:', error);
  }
};

/**
 * Notificar a usuario offline vía notificación push/email
 */
const notifyOfflineUser = async (conversationId, senderId, message, conversation) => {
  try {
    // Determinar quién es el receptor
    const receiverId = conversation.therapist_id === senderId 
      ? conversation.client_id 
      : conversation.therapist_id;

    // Verificar si receptor está conectado
    const receiverConnected = connectedUsers.has(receiverId);
    
    if (!receiverConnected) {
      console.log('📧 Receiver offline, creating notification:', receiverId);
      
      // Crear notificación en base de datos
      await supabase
        .from('notifications')
        .insert([{
          user_id: receiverId,
          type: 'new_message',
          title: 'Nuevo mensaje',
          content: `Tienes un nuevo mensaje`,
          data: { 
            conversationId, 
            messageId: message.id,
            senderId: senderId
          },
          is_read: false
        }]);

      // Incrementar contador de no leídos
      await supabase
        .from('conversations')
        .update({ 
          unread_count: supabase.rpc('increment', { x: 1 })
        })
        .eq('id', conversationId);
    }
  } catch (error) {
    console.error('❌ Error notifying offline user:', error);
  }
};

/**
 * Emitir evento a una conversación específica (desde controllers HTTP)
 */
const emitToConversation = (conversationId, event, data) => {
  if (io) {
    io.to(`conversation:${conversationId}`).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Verificar si un usuario está online
 */
const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

/**
 * Obtener lista de usuarios conectados
 */
const getOnlineUsers = () => {
  return Array.from(connectedUsers.keys());
};

/**
 * Obtener instancia de io
 */
const getIO = () => io;

module.exports = {
  initializeSocket,
  emitToConversation,
  isUserOnline,
  getOnlineUsers,
  getIO
};
