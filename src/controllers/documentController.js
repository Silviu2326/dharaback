/**
 * Document Controller
 * 
 * IMPORTANT: This file is now a proxy for backward compatibility.
 * The actual implementation has been split into multiple files in the ./documents/ directory.
 * 
 * Structure:
 *   - ./documents/listController.js      - List and query operations
 *   - ./documents/uploadController.js    - Upload and versioning
 *   - ./documents/updateController.js    - Update operations
 *   - ./documents/accessController.js    - Download, share, access control
 *   - ./documents/maintenanceController.js - Archive, delete, bulk ops
 *   - ./documents/statsController.js     - Statistics and analytics
 *   - ./documents/index.js               - Main exports
 * 
 * For new code, consider importing directly from the specific controller:
 *   const { uploadDocument } = require('./documents/uploadController');
 */

const documentController = require('./documents/index');

module.exports = documentController;
