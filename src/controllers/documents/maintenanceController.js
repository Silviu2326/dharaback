const { Document } = require('../../models');
const { supabase } = require('../../config/supabase');
const { AppError } = require('../../middleware/errorHandler');

const maintenanceController = {
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
  }
};

module.exports = maintenanceController;
