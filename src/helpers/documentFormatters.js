/**
 * Formats file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g., "1.5 MB")
 */
const formatFileSize = (bytes) => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

module.exports = {
  formatFileSize
};
