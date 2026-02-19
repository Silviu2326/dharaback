const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Document = require('../models/Document');
const { AppError } = require('../middleware/errorHandler');

const clientDocumentController = {
  // Get all documents shared with a client
  async getClientDocuments(req, res, next) {
    try {
      const clientId = req.user.id;
      const {
        page = 1,
        limit = 20,
        category,
        type,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query to find documents where client has view permissions
      const query = {
        status: 'active',
        $or: [
          // Documents where client has explicit view permissions
          { 'permissions.canView.userId': new mongoose.Types.ObjectId(clientId) },
          // Documents with client_shared visibility and assigned to this client
          { visibility: 'client_shared', clientId: new mongoose.Types.ObjectId(clientId) }
        ]
      };

      // Add additional filters
      if (category) query.category = category;
      if (type) query.type = type;

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const documents = await Document.find(query)
        .populate('therapist', 'name avatar email')
        .populate('uploader', 'name avatar')
        .sort(sort)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await Document.countDocuments(query);

      res.json({
        success: true,
        data: {
          documents,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get a specific document for a client
  async getClientDocument(req, res, next) {
    try {
      const { documentId } = req.params;
      const clientId = req.user.id;

      const document = await Document.findById(documentId)
        .populate('therapist', 'name avatar email')
        .populate('uploader', 'name avatar');

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Check if client has permission to view this document
      const hasAccess = document.checkPermission(clientId, 'view') ||
                       (document.visibility === 'client_shared' &&
                        document.clientId &&
                        document.clientId.toString() === clientId);

      if (!hasAccess) {
        return next(new AppError('Access denied - document not shared with you', 403));
      }

      // Track access
      await document.trackAccess(clientId, 'client', 'view', req);

      res.json({
        success: true,
        data: document
      });
    } catch (error) {
      next(error);
    }
  },

  // Download a document for a client
  async downloadClientDocument(req, res, next) {
    try {
      const { documentId } = req.params;
      const clientId = req.user.id;

      const document = await Document.findById(documentId);

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Check if client has permission to download this document
      const canDownload = document.checkPermission(clientId, 'download') ||
                         (document.visibility === 'client_shared' &&
                          document.clientId &&
                          document.clientId.toString() === clientId);

      if (!canDownload) {
        return next(new AppError('Download not permitted', 403));
      }

      // Track download
      await document.trackAccess(clientId, 'client', 'download', req);

      // Set download headers
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
      res.setHeader('Content-Type', document.mimeType);

      // In a real implementation, you'd stream the file from storage
      // For now, we'll return the document URL
      res.json({
        success: true,
        data: {
          downloadUrl: document.url,
          filename: document.originalName,
          size: document.size,
          type: document.mimeType
        }
      });

    } catch (error) {
      next(error);
    }
  },

  // Get documents by category for a client
  async getClientDocumentsByCategory(req, res, next) {
    try {
      const { category } = req.params;
      const clientId = req.user.id;
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {
        category,
        status: 'active',
        $or: [
          { 'permissions.canView.userId': new mongoose.Types.ObjectId(clientId) },
          { visibility: 'client_shared', clientId: new mongoose.Types.ObjectId(clientId) }
        ]
      };

      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const documents = await Document.find(query)
        .populate('therapist', 'name avatar email')
        .populate('uploader', 'name avatar')
        .sort(sort)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await Document.countDocuments(query);

      res.json({
        success: true,
        data: {
          documents,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get recent documents for a client
  async getRecentClientDocuments(req, res, next) {
    try {
      const clientId = req.user.id;
      const { limit = 10 } = req.query;

      const documents = await Document.find({
        status: 'active',
        $or: [
          { 'permissions.canView.userId': new mongoose.Types.ObjectId(clientId) },
          { visibility: 'client_shared', clientId: new mongoose.Types.ObjectId(clientId) }
        ]
      })
      .populate('therapist', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      next(error);
    }
  },

  // Get document statistics for a client
  async getClientDocumentStats(req, res, next) {
    try {
      const clientId = req.user.id;

      const stats = await Document.aggregate([
        {
          $match: {
            status: 'active',
            $or: [
              { 'permissions.canView.userId': new mongoose.Types.ObjectId(clientId) },
              { visibility: 'client_shared', clientId: new mongoose.Types.ObjectId(clientId) }
            ]
          }
        },
        {
          $group: {
            _id: null,
            totalDocuments: { $sum: 1 },
            totalSize: { $sum: '$size' },
            byCategory: {
              $push: {
                category: '$category',
                count: 1
              }
            },
            byType: {
              $push: {
                type: '$type',
                count: 1
              }
            }
          }
        }
      ]);

      // Process category and type statistics
      const result = stats[0] || { totalDocuments: 0, totalSize: 0 };

      if (result.byCategory) {
        const categoryStats = {};
        result.byCategory.forEach(item => {
          categoryStats[item.category] = (categoryStats[item.category] || 0) + 1;
        });
        result.byCategory = categoryStats;
      }

      if (result.byType) {
        const typeStats = {};
        result.byType.forEach(item => {
          typeStats[item.type] = (typeStats[item.type] || 0) + 1;
        });
        result.byType = typeStats;
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = clientDocumentController;