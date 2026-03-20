const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { Document, Client, User } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');

const accessController = {
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
      const filePath = path.join(__dirname, '../../../uploads/documents', document.filename);

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
  }
};

module.exports = accessController;
