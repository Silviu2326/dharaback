const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { Document, Client, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

// Helper function to upload file to Supabase Storage
const uploadToSupabaseStorage = async (filePath, fileName, userId) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileExt = path.extname(fileName);
    const uniqueFileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(uniqueFileName, fileBuffer, {
        contentType: filePath.mimetype || 'application/octet-stream',
        upsert: false
      });
    
    if (error) {
      console.error('Error uploading to Supabase Storage:', error);
      throw error;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(data.path);
    
    return {
      path: data.path,
      publicUrl: publicUrl
    };
  } catch (error) {
    console.error('Supabase Storage upload failed:', error);
    throw error;
  }
};

const documentController = {
  // Get all documents for a therapist
  async getDocuments(req, res, next) {
    try {
      const therapistId = req.user.id;
      const {
        page = 1,
        limit = 20,
        category,
        clientId,
        status = 'active',
        type,
        tags,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      // Build query with Supabase
      let query = supabase
        .from('documents')
        .select('*, client:client_id(*), uploader:user_id(*)', { count: 'exact' })
        .eq('user_id', therapistId);

      if (category) query = query.eq('category', category);
      if (clientId) query = query.eq('client_id', clientId);
      if (type) query = query.eq('type', type);
      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim());
        query = query.overlaps('tags', tagArray);
      }

      // Map frontend column names to Supabase column names
      const columnMap = {
        'uploadedAt': 'created_at',
        'updatedAt': 'updated_at',
        'title': 'description'
      };
      
      const mappedSortBy = columnMap[sortBy] || sortBy;
      
      // Apply sorting and pagination
      query = query.order(mappedSortBy, { ascending: sortOrder === 'asc' });
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      const documents = (data || []).map(d => new Document.Document(d));

      res.json({
        success: true,
        data: {
          documents: documents.map(d => d.toJSON()),
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

  // Get a specific document
  async getDocument(req, res, next) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;

      const document = await Document.findById(documentId);

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Check permissions
      const hasAccess = document.userId === userId ||
                       document.checkPermission(userId, 'read');

      if (!hasAccess) {
        return next(new AppError('Access denied', 403));
      }

      // Track access
      await document.trackAccess(userId, 'view');

      // Fetch related data
      const [client, uploader] = await Promise.all([
        document.clientId ? Client.findById(document.clientId) : null,
        User.findById(document.userId)
      ]);

      const responseData = document.toJSON();
      responseData.client = client ? {
        id: client.id,
        name: client.name,
        avatar: client.avatar,
        email: client.email
      } : null;
      responseData.uploader = uploader ? {
        id: uploader.id,
        name: uploader.name,
        avatar: uploader.avatar
      } : null;

      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  },

  // Upload a new document
  async uploadDocument(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }

      const therapistId = req.user.id;
      const {
        title,
        category = 'other',
        clientId,
        session,
        tags = [],
        visibility = 'therapist_only',
        isConfidential = true
      } = req.body;

      // Verify client if provided
      if (clientId) {
        const client = await Client.findById(clientId);
        if (!client) {
          return next(new AppError('Client not found', 404));
        }
      }

      // Determine document type based on mime type
      const getDocumentType = (mimeType) => {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType === 'application/pdf') return 'pdf';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel';
        if (mimeType.startsWith('text/')) return 'text';
        return 'other';
      };

      // Upload file to Supabase Storage
      let supabaseUrl = null;
      let supabasePath = null;
      try {
        console.log('📤 Uploading file to Supabase Storage...');
        const uploadResult = await uploadToSupabaseStorage(
          req.file.path,
          req.file.originalname,
          therapistId
        );
        supabaseUrl = uploadResult.publicUrl;
        supabasePath = uploadResult.path;
        console.log('✅ File uploaded to Supabase:', supabaseUrl);
        
        // Delete local file after successful Supabase upload
        try {
          fs.unlinkSync(req.file.path);
          console.log('🗑️ Local file deleted');
        } catch (unlinkError) {
          console.warn('⚠️ Could not delete local file:', unlinkError.message);
        }
      } catch (storageError) {
        console.error('❌ Supabase Storage upload failed:', storageError);
        // Continue with local storage as fallback
        console.log('⚠️ Falling back to local storage');
      }

      const documentData = {
        userId: therapistId,
        clientId: clientId || null,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        type: getDocumentType(req.file.mimetype),
        size: req.file.size,
        path: supabasePath || `/uploads/documents/${req.file.filename}`,
        supabaseUrl: supabaseUrl,
        category,
        description: title,
        isPublic: visibility === 'public',
        metadata: {
          session,
          visibility,
          isConfidential,
          uploadedBy: therapistId,
          uploadSource: 'web',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          storageType: supabaseUrl ? 'supabase' : 'local'
        },
        accessLog: [{
          userId: therapistId,
          action: 'upload',
          timestamp: new Date().toISOString(),
          ip: req.ip
        }]
      };

      const document = await Document.create(documentData);

      // Fetch related data for response
      const [client, uploader] = await Promise.all([
        document.clientId ? Client.findById(document.clientId) : null,
        User.findById(document.userId)
      ]);

      const responseData = document.toJSON();
      responseData.client = client ? {
        id: client.id,
        name: client.name,
        avatar: client.avatar
      } : null;
      responseData.uploader = uploader ? {
        id: uploader.id,
        name: uploader.name,
        avatar: uploader.avatar
      } : null;

      res.status(201).json({
        success: true,
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  },

  // Update document metadata
  async updateDocument(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { documentId } = req.params;
      const therapistId = req.user.id;
      const updateData = req.body;

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Update only allowed fields
      const allowedUpdates = ['title', 'category', 'tags', 'visibility', 'isConfidential', 'session'];
      const updates = {};

      allowedUpdates.forEach(field => {
        if (updateData[field] !== undefined) {
          if (field === 'title') {
            updates.description = updateData[field];
          } else if (field === 'visibility') {
            updates.isPublic = updateData[field] === 'public';
            // Update metadata too
            updates.metadata = {
              ...document.metadata,
              visibility: updateData[field]
            };
          } else if (field === 'isConfidential') {
            updates.metadata = {
              ...document.metadata,
              isConfidential: updateData[field]
            };
          } else if (field === 'session') {
            updates.metadata = {
              ...document.metadata,
              session: updateData[field]
            };
          } else {
            updates[field] = updateData[field];
          }
        }
      });

      const updatedDocument = await Document.findByIdAndUpdate(documentId, updates, { new: true });

      res.json({
        success: true,
        data: updatedDocument.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Download document
  async downloadDocument(req, res, next) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;

      const document = await Document.findById(documentId);
      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Check permissions
      const hasAccess = document.userId === userId ||
                       document.checkPermission(userId, 'read');

      if (!hasAccess) {
        return next(new AppError('Access denied', 403));
      }

      // Track download
      await document.trackAccess(userId, 'download');

      // If file is stored in Supabase Storage, redirect to the public URL
      if (document.supabaseUrl) {
        console.log('📥 Redirecting to Supabase Storage URL:', document.supabaseUrl);
        return res.redirect(document.supabaseUrl);
      }

      // Fallback to local file system
      const filePath = path.join(__dirname, '../../uploads/documents', document.filename);

      try {
        if (fs.existsSync(filePath)) {
          res.download(filePath, document.originalName);
        } else {
          return next(new AppError('File not found on server', 404));
        }
      } catch (fileError) {
        return next(new AppError('File not found on server', 404));
      }
    } catch (error) {
      next(error);
    }
  },

  // Share document with client
  async shareDocument(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { documentId } = req.params;
      const { clientId, permissions = ['view'] } = req.body;
      const therapistId = req.user.id;

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Verify client
      const client = await Client.findById(clientId);
      if (!client) {
        return next(new AppError('Client not found', 404));
      }

      const permObj = {
        read: permissions.includes('view') || permissions.includes('download'),
        write: permissions.includes('edit')
      };

      await document.shareWith(clientId, permObj);

      res.json({
        success: true,
        message: 'Document shared successfully',
        data: document.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Revoke document access
  async revokeAccess(req, res, next) {
    try {
      const { documentId } = req.params;
      const { userId: targetUserId } = req.body;
      const therapistId = req.user.id;

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      await document.revokeAccess(targetUserId);

      res.json({
        success: true,
        message: 'Access revoked successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Archive document
  async archiveDocument(req, res, next) {
    try {
      const { documentId } = req.params;
      const therapistId = req.user.id;

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Update metadata to mark as archived
      const updatedDocument = await Document.findByIdAndUpdate(documentId, {
        metadata: {
          ...document.metadata,
          status: 'archived',
          archivedAt: new Date().toISOString()
        }
      }, { new: true });

      res.json({
        success: true,
        message: 'Document archived successfully',
        data: updatedDocument.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete document (soft delete)
  async deleteDocument(req, res, next) {
    try {
      const { documentId } = req.params;
      const therapistId = req.user.id;

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Soft delete by updating metadata
      await Document.findByIdAndUpdate(documentId, {
        metadata: {
          ...document.metadata,
          status: 'deleted',
          deletedAt: new Date().toISOString(),
          deletedBy: therapistId
        }
      });

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get documents by category
  async getDocumentsByCategory(req, res, next) {
    try {
      const { category } = req.params;
      const therapistId = req.user.id;
      const { clientId, page = 1, limit = 20 } = req.query;

      const filters = { user_id: therapistId, category };
      if (clientId) filters.client_id = clientId;

      const documents = await Document.getByCategory(therapistId, category, {
        filters: clientId ? { client_id: clientId } : undefined,
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      const { count } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', therapistId)
        .eq('category', category)
        .eq('metadata->>status', 'active');

      res.json({
        success: true,
        data: {
          documents: documents.map(d => d.toJSON()),
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

  // Search documents
  async searchDocuments(req, res, next) {
    try {
      const { q: searchQuery, category, type, clientId } = req.query;
      const therapistId = req.user.id;

      const filters = {};
      if (category) filters.category = category;
      if (type) filters.type = type;
      if (clientId) filters.client_id = clientId;

      const documents = await Document.searchDocuments(therapistId, searchQuery, {
        filters
      });

      res.json({
        success: true,
        data: {
          documents: documents.map(d => d.toJSON()),
          searchQuery,
          filters
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get storage statistics
  async getStorageStats(req, res, next) {
    try {
      const therapistId = req.user.id;

      const stats = await Document.getStorageStats(therapistId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  },

  // Get recent documents
  async getRecentDocuments(req, res, next) {
    try {
      const therapistId = req.user.id;
      const { limit = 10 } = req.query;

      const documents = await Document.find({
        filters: { user_id: therapistId },
        orderBy: 'created_at',
        ascending: false,
        limit: parseInt(limit)
      });

      // Populate client and uploader data
      const populatedDocuments = await Promise.all(
        documents.map(async (doc) => {
          const [client, uploader] = await Promise.all([
            doc.clientId ? Client.findById(doc.clientId) : null,
            User.findById(doc.userId)
          ]);
          
          const docData = doc.toJSON();
          docData.client = client ? {
            id: client.id,
            name: client.name,
            avatar: client.avatar
          } : null;
          docData.uploader = uploader ? {
            id: uploader.id,
            name: uploader.name,
            avatar: uploader.avatar
          } : null;
          
          return docData;
        })
      );

      res.json({
        success: true,
        data: populatedDocuments
      });
    } catch (error) {
      next(error);
    }
  },

  // Create new version of document
  async createVersion(req, res, next) {
    try {
      const { documentId } = req.params;
      const { changes = '' } = req.body;
      const therapistId = req.user.id;

      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Create version info in metadata
      const versions = document.metadata?.versions || [];
      versions.push({
        version: versions.length + 1,
        filename: req.file.filename,
        size: req.file.size,
        url: `/uploads/documents/${req.file.filename}`,
        createdBy: therapistId,
        createdAt: new Date().toISOString(),
        changes
      });

      const updatedDocument = await Document.findByIdAndUpdate(documentId, {
        filename: req.file.filename,
        size: req.file.size,
        path: `/uploads/documents/${req.file.filename}`,
        metadata: {
          ...document.metadata,
          versions
        }
      }, { new: true });

      res.json({
        success: true,
        message: 'New version created successfully',
        data: updatedDocument.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Get document access log
  async getAccessLog(req, res, next) {
    try {
      const { documentId } = req.params;
      const therapistId = req.user.id;

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Populate user data for access log
      const accessLog = await Promise.all(
        (document.accessLog || []).map(async (entry) => {
          const user = await User.findById(entry.userId);
          return {
            ...entry,
            user: user ? {
              id: user.id,
              name: user.name,
              avatar: user.avatar
            } : null
          };
        })
      );

      res.json({
        success: true,
        data: {
          documentId,
          accessLog: accessLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Bulk operations
  async bulkDelete(req, res, next) {
    try {
      const { documentIds } = req.body;
      const therapistId = req.user.id;

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return next(new AppError('Document IDs array is required', 400));
      }

      // Soft delete all documents
      const { data, error } = await supabase
        .from('documents')
        .update({
          metadata: supabase.rpc('jsonb_set', {
            target: 'metadata',
            path: '{status}',
            value: '"deleted"'
          })
        })
        .in('id', documentIds)
        .eq('user_id', therapistId)
        .select();

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'Documents deleted successfully',
        data: {
          modifiedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Bulk archive
  async bulkArchive(req, res, next) {
    try {
      const { documentIds } = req.body;
      const therapistId = req.user.id;

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return next(new AppError('Document IDs array is required', 400));
      }

      // Archive all documents by updating metadata
      const { data, error } = await supabase
        .from('documents')
        .update({
          metadata: supabase.rpc('jsonb_set', {
            target: 'metadata',
            path: '{status}',
            value: '"archived"'
          })
        })
        .in('id', documentIds)
        .eq('user_id', therapistId)
        .select();

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'Documents archived successfully',
        data: {
          modifiedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Helper method to format file size
  formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
};

module.exports = documentController;