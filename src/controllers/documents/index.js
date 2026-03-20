const listController = require('./listController');
const uploadController = require('./uploadController');
const updateController = require('./updateController');
const accessController = require('./accessController');
const maintenanceController = require('./maintenanceController');
const statsController = require('./statsController');
const { formatFileSize } = require('../../helpers/documentFormatters');

// Combined document controller for backward compatibility
const documentController = {
  // List operations
  getDocuments: listController.getDocuments,
  getDocument: listController.getDocument,
  getDocumentsByCategory: listController.getDocumentsByCategory,
  searchDocuments: listController.searchDocuments,
  getRecentDocuments: listController.getRecentDocuments,

  // Upload operations
  uploadDocument: uploadController.uploadDocument,
  createVersion: uploadController.createVersion,

  // Update operations
  updateDocument: updateController.updateDocument,

  // Access operations
  downloadDocument: accessController.downloadDocument,
  shareDocument: accessController.shareDocument,
  revokeAccess: accessController.revokeAccess,
  getAccessLog: accessController.getAccessLog,

  // Maintenance operations
  archiveDocument: maintenanceController.archiveDocument,
  deleteDocument: maintenanceController.deleteDocument,
  bulkDelete: maintenanceController.bulkDelete,
  bulkArchive: maintenanceController.bulkArchive,

  // Statistics
  getStorageStats: statsController.getStorageStats,

  // Helper method
  formatFileSize
};

module.exports = documentController;
