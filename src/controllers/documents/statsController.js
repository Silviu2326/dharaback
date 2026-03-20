const { Document } = require('../../models');

const statsController = {
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
  }
};

module.exports = statsController;
