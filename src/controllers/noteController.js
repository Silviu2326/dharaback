const { validationResult } = require('express-validator');
const { Note, Client, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const noteController = {
  // Get all notes for a therapist
  async getNotes(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        page = 1,
        limit = 20,
        category,
        clientId,
        client_id,
        tags,
        isPinned,
        sortBy = 'created_at',
        sortOrder = 'desc',
        search
      } = req.query;

      // Support both clientId (camelCase) and client_id (snake_case)
      const effectiveClientId = clientId || client_id;
      
      console.log('🔍 [getNotes] REQUEST:', {
        userId,
        effectiveClientId,
        category,
        tags,
        isPinned
      });

      // Build filters
      const filters = { user_id: userId };
      
      if (effectiveClientId) {
        filters.client_id = effectiveClientId;
      }
      
      if (category) {
        filters.category = category;
      }
      
      if (isPinned !== undefined) {
        filters.is_pinned = isPinned === 'true';
      }
      
      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim());
        filters.tags = { overlaps: tagArray };
      }
      
      if (search) {
        filters.or = [
          { title: { ilike: `%${search}%` } },
          { content: { ilike: `%${search}%` } }
        ];
      }

      console.log('🔍 [getNotes] FILTERS:', filters);

      // Use Supabase directly for pagination and sorting
      let query = supabase
        .from('notes')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (effectiveClientId) {
        query = query.eq('client_id', effectiveClientId);
      }

      if (category) {
        query = query.eq('category', category);
      }

      if (isPinned !== undefined) {
        query = query.eq('is_pinned', isPinned === 'true');
      }

      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim());
        query = query.overlaps('tags', tagArray);
      }

      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      query = query.order('is_pinned', { ascending: false })
                   .order(sortBy, { ascending: sortOrder === 'asc' });

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('❌ [getNotes] DATABASE ERROR:', error);
        throw new Error(error.message);
      }

      console.log('🔍 [getNotes] RAW DATA:', {
        count: data?.length || 0,
        total: count,
        clientIds: data?.map(n => ({ id: n.id, client_id: n.client_id }))
      });

      const notes = (data || []).map(n => new Note.Note(n));

      // Populate client data
      const populatedNotes = await Promise.all(
        notes.map(async (note) => {
          const noteData = note.toJSON();
          if (note.clientId) {
            try {
              const client = await Client.findById(note.clientId);
              noteData.client = client ? {
                id: client.id,
                name: client.name,
                avatar: client.avatar
              } : null;
            } catch (err) {
              console.error(`❌ Error fetching client ${note.clientId}:`, err.message);
              noteData.client = null;
            }
          }
          return noteData;
        })
      );

      console.log('🔍 [getNotes] RESPONSE:', {
        notesCount: populatedNotes.length,
        requestedClientId: effectiveClientId,
        returnedClientIds: populatedNotes.map(n => n.clientId)
      });

      res.json({
        success: true,
        data: {
          notes: populatedNotes,
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

  // Get a specific note
  async getNote(req, res, next) {
    try {
      const { noteId } = req.params;
      const userId = req.user.id;

      const note = await Note.findById(noteId);

      if (!note) {
        return next(new AppError('Note not found', 404));
      }

      // Check if user can view this note
      if (!note.canBeViewedBy(userId)) {
        return next(new AppError('Access denied', 403));
      }

      // Fetch related data
      const [client, author] = await Promise.all([
        note.clientId ? Client.findById(note.clientId) : null,
        User.findById(note.userId)
      ]);

      const responseData = note.toJSON();
      responseData.client = client ? {
        id: client.id,
        name: client.name,
        avatar: client.avatar
      } : null;
      responseData.author = author ? {
        id: author.id,
        name: author.name,
        avatar: author.avatar
      } : null;

      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  },

  // Create a new note
  async createNote(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const userId = req.user.id;
      const {
        title,
        content,
        category = 'general',
        clientId,
        color,
        tags = [],
        reminders = [],
        isPinned = false
      } = req.body;

      // Verify client if provided
      if (clientId) {
        const client = await Client.findById(clientId);
        if (!client) {
          return next(new AppError('Client not found', 404));
        }
      }

      const noteData = {
        userId,
        clientId: clientId || null,
        title,
        content,
        category,
        color,
        tags: tags.map(tag => tag.toLowerCase()),
        reminders: reminders.map(r => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          date: r.date,
          message: r.message,
          completed: false
        })),
        isPinned,
        hiddenFrom: [],
        responses: [],
        editHistory: [{
          id: Date.now().toString(),
          userId,
          changes: 'Note created',
          editedAt: new Date().toISOString()
        }]
      };

      const note = await Note.create(noteData);

      // Fetch related data for response
      const [client, author] = await Promise.all([
        note.clientId ? Client.findById(note.clientId) : null,
        User.findById(note.userId)
      ]);

      const responseData = note.toJSON();
      responseData.client = client ? {
        id: client.id,
        name: client.name,
        avatar: client.avatar
      } : null;
      responseData.author = author ? {
        id: author.id,
        name: author.name,
        avatar: author.avatar
      } : null;

      res.status(201).json({
        success: true,
        message: 'Note created successfully',
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  },

  // Update a note
  async updateNote(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { noteId } = req.params;
      const userId = req.user.id;
      const updates = req.body;

      const note = await Note.findById(noteId);

      if (!note) {
        return next(new AppError('Note not found', 404));
      }

      // Check ownership
      if (note.userId !== userId) {
        return next(new AppError('Access denied. You can only update your own notes.', 403));
      }

      // Build update data
      const updateData = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.category !== undefined) updateData.category = updates.category;
      if (updates.color !== undefined) updateData.color = updates.color;
      if (updates.tags !== undefined) updateData.tags = updates.tags.map(tag => tag.toLowerCase());
      if (updates.isPinned !== undefined) updateData.isPinned = updates.isPinned;
      if (updates.clientId !== undefined) updateData.clientId = updates.clientId;
      
      // Handle reminders
      if (updates.reminders !== undefined) {
        updateData.reminders = updates.reminders.map(r => ({
          id: r.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
          date: r.date,
          message: r.message,
          completed: r.completed || false
        }));
      }

      // Add to edit history
      const editHistory = [...(note.editHistory || [])];
      editHistory.push({
        id: Date.now().toString(),
        userId,
        changes: updates.changeDescription || 'Note updated',
        editedAt: new Date().toISOString()
      });
      updateData.editHistory = editHistory;

      const updatedNote = await Note.findByIdAndUpdate(noteId, updateData, { new: true });

      // Fetch related data
      const [client, author] = await Promise.all([
        updatedNote.clientId ? Client.findById(updatedNote.clientId) : null,
        User.findById(updatedNote.userId)
      ]);

      const responseData = updatedNote.toJSON();
      responseData.client = client ? {
        id: client.id,
        name: client.name,
        avatar: client.avatar
      } : null;
      responseData.author = author ? {
        id: author.id,
        name: author.name,
        avatar: author.avatar
      } : null;

      res.json({
        success: true,
        message: 'Note updated successfully',
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete a note
  async deleteNote(req, res, next) {
    try {
      const { noteId } = req.params;
      const userId = req.user.id;

      const note = await Note.findById(noteId);

      if (!note) {
        return next(new AppError('Note not found', 404));
      }

      // Check ownership
      if (note.userId !== userId) {
        return next(new AppError('Access denied. You can only delete your own notes.', 403));
      }

      await Note.findByIdAndDelete(noteId);

      res.json({
        success: true,
        message: 'Note deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Toggle pin status
  async togglePin(req, res, next) {
    try {
      const { noteId } = req.params;
      const userId = req.user.id;

      const note = await Note.findById(noteId);

      if (!note) {
        return next(new AppError('Note not found', 404));
      }

      // Check ownership
      if (note.userId !== userId) {
        return next(new AppError('Access denied', 403));
      }

      const updatedNote = await Note.findByIdAndUpdate(
        noteId,
        { isPinned: !note.isPinned },
        { new: true }
      );

      res.json({
        success: true,
        message: updatedNote.isPinned ? 'Note pinned' : 'Note unpinned',
        data: updatedNote.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Add a response to a note
  async addResponse(req, res, next) {
    try {
      const { noteId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      if (!content || content.trim().length === 0) {
        return next(new AppError('Response content is required', 400));
      }

      const note = await Note.findById(noteId);

      if (!note) {
        return next(new AppError('Note not found', 404));
      }

      // Check if user can view the note
      if (!note.canBeViewedBy(userId)) {
        return next(new AppError('Access denied', 403));
      }

      const response = await note.addResponse(userId, content);

      res.json({
        success: true,
        message: 'Response added successfully',
        data: response
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark response as read
  async markResponseRead(req, res, next) {
    try {
      const { noteId, responseId } = req.params;
      const userId = req.user.id;

      const note = await Note.findById(noteId);

      if (!note) {
        return next(new AppError('Note not found', 404));
      }

      // Check ownership
      if (note.userId !== userId) {
        return next(new AppError('Access denied', 403));
      }

      await note.markResponseAsRead(responseId);

      res.json({
        success: true,
        message: 'Response marked as read'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get notes by category
  async getNotesByCategory(req, res, next) {
    try {
      const { category } = req.params;
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const notes = await Note.findByCategory(category, userId, {
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      const { count } = await supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category', category);

      // Populate client data
      const populatedNotes = await Promise.all(
        notes.map(async (note) => {
          const noteData = note.toJSON();
          if (note.clientId) {
            const client = await Client.findById(note.clientId);
            noteData.client = client ? {
              id: client.id,
              name: client.name,
              avatar: client.avatar
            } : null;
          }
          return noteData;
        })
      );

      res.json({
        success: true,
        data: {
          notes: populatedNotes,
          category,
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

  // Get pinned notes
  async getPinnedNotes(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 10 } = req.query;

      const notes = await Note.findPinned(userId, {
        limit: parseInt(limit)
      });

      // Populate client data
      const populatedNotes = await Promise.all(
        notes.map(async (note) => {
          const noteData = note.toJSON();
          if (note.clientId) {
            const client = await Client.findById(note.clientId);
            noteData.client = client ? {
              id: client.id,
              name: client.name,
              avatar: client.avatar
            } : null;
          }
          return noteData;
        })
      );

      res.json({
        success: true,
        data: populatedNotes
      });
    } catch (error) {
      next(error);
    }
  },

  // Get notes with pending reminders
  async getNotesWithReminders(req, res, next) {
    try {
      const userId = req.user.id;

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .not('reminders', 'is', null);

      if (error) throw new Error(error.message);

      const now = new Date().toISOString();
      const notesWithPendingReminders = (data || [])
        .map(n => new Note.Note(n))
        .filter(note => {
          return note.reminders?.some(r => !r.completed && r.date > now);
        });

      res.json({
        success: true,
        data: notesWithPendingReminders.map(n => n.toJSON())
      });
    } catch (error) {
      next(error);
    }
  },

  // Get expired notes (overdue reminders)
  async getExpiredNotes(req, res, next) {
    try {
      const userId = req.user.id;

      const expiredNotes = await Note.getEmergencyNotes(userId);

      // Populate client data
      const populatedNotes = await Promise.all(
        expiredNotes.map(async (note) => {
          const noteData = note.toJSON();
          if (note.clientId) {
            const client = await Client.findById(note.clientId);
            noteData.client = client ? {
              id: client.id,
              name: client.name,
              avatar: client.avatar
            } : null;
          }
          return noteData;
        })
      );

      res.json({
        success: true,
        data: populatedNotes
      });
    } catch (error) {
      next(error);
    }
  },

  // Get notes with pending responses
  async getNotesWithPendingResponses(req, res, next) {
    try {
      const userId = req.user.id;

      const pendingNotes = await Note.getPendingResponses(userId);

      res.json({
        success: true,
        data: pendingNotes.map(n => n.toJSON())
      });
    } catch (error) {
      next(error);
    }
  },

  // Search notes
  async searchNotes(req, res, next) {
    try {
      const { q: searchQuery, category, clientId } = req.query;
      const userId = req.user.id;

      let query = supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);

      if (category) query = query.eq('category', category);
      if (clientId) query = query.eq('client_id', clientId);

      query = query.order('is_pinned', { ascending: false })
                   .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      const notes = (data || []).map(n => new Note.Note(n));

      // Populate client data
      const populatedNotes = await Promise.all(
        notes.map(async (note) => {
          const noteData = note.toJSON();
          if (note.clientId) {
            const client = await Client.findById(note.clientId);
            noteData.client = client ? {
              id: client.id,
              name: client.name,
              avatar: client.avatar
            } : null;
          }
          return noteData;
        })
      );

      res.json({
        success: true,
        data: {
          notes: populatedNotes,
          searchQuery,
          filters: { category, clientId }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get notes by tags
  async getNotesByTags(req, res, next) {
    try {
      const { tags } = req.body;
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      if (!Array.isArray(tags) || tags.length === 0) {
        return next(new AppError('Tags array is required', 400));
      }

      const notes = await Note.findByTags(tags, userId, {
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      // Populate client data
      const populatedNotes = await Promise.all(
        notes.map(async (note) => {
          const noteData = note.toJSON();
          if (note.clientId) {
            const client = await Client.findById(note.clientId);
            noteData.client = client ? {
              id: client.id,
              name: client.name,
              avatar: client.avatar
            } : null;
          }
          return noteData;
        })
      );

      res.json({
        success: true,
        data: {
          notes: populatedNotes,
          tags
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Complete reminder
  async completeReminder(req, res, next) {
    try {
      const { noteId, reminderId } = req.params;
      const userId = req.user.id;

      const note = await Note.findById(noteId);

      if (!note) {
        return next(new AppError('Note not found', 404));
      }

      // Check ownership
      if (note.userId !== userId) {
        return next(new AppError('Access denied', 403));
      }

      const updatedReminders = (note.reminders || []).map(r => {
        if (r.id === reminderId) {
          return { ...r, completed: true, completedAt: new Date().toISOString() };
        }
        return r;
      });

      await Note.findByIdAndUpdate(noteId, { reminders: updatedReminders });

      res.json({
        success: true,
        message: 'Reminder marked as completed'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get note statistics
  async getNoteStats(req, res, next) {
    try {
      const userId = req.user.id;

      // Get counts by category
      const { data: categoryData, error: categoryError } = await supabase
        .from('notes')
        .select('category')
        .eq('user_id', userId);

      if (categoryError) throw new Error(categoryError.message);

      const categoryCount = (categoryData || []).reduce((acc, note) => {
        acc[note.category] = (acc[note.category] || 0) + 1;
        return acc;
      }, {});

      // Get total count
      const { count: totalNotes, error: countError } = await supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) throw new Error(countError.message);

      // Get pinned count
      const { count: pinnedNotes, error: pinnedError } = await supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_pinned', true);

      if (pinnedError) throw new Error(pinnedError.message);

      // Get notes with reminders
      const { data: remindersData, error: remindersError } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .not('reminders', 'is', null);

      if (remindersError) throw new Error(remindersError.message);

      const now = new Date().toISOString();
      const pendingReminders = (remindersData || []).filter(note => 
        note.reminders?.some(r => !r.completed && r.date > now)
      ).length;

      const expiredReminders = (remindersData || []).filter(note =>
        note.reminders?.some(r => !r.completed && r.date <= now)
      ).length;

      res.json({
        success: true,
        data: {
          totalNotes: totalNotes || 0,
          pinnedNotes: pinnedNotes || 0,
          byCategory: categoryCount,
          pendingReminders,
          expiredReminders
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = noteController;
