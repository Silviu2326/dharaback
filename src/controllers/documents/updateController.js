const { validationResult } = require('express-validator');
const { Document } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');

const updateController = {
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
  }
};

module.exports = updateController;
