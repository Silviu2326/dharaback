// Utility functions for the application

/**
 * Generate a random string of specified length
 * @param {number} length - Length of the string
 * @returns {string} Random string
 */
const generateRandomString = (length = 10) => {
  return Math.random().toString(36).substring(2, length + 2);
};

/**
 * Format date to Spanish locale
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDateToSpanish = (date) => {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
};

/**
 * Calculate age from birth date
 * @param {Date} birthDate - Birth date
 * @returns {number} Age in years
 */
const calculateAge = (birthDate) => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
};

/**
 * Validate Spanish phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid
 */
const validateSpanishPhone = (phone) => {
  const phoneRegex = /^(\+34|0034|34)?[6-9]\d{8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Generate invoice number
 * @param {string} prefix - Invoice prefix
 * @param {number} sequence - Sequence number
 * @returns {string} Invoice number
 */
const generateInvoiceNumber = (prefix = 'INV', sequence = 1) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const sequenceStr = sequence.toString().padStart(4, '0');

  return `${prefix}-${year}${month}-${sequenceStr}`;
};

module.exports = {
  generateRandomString,
  formatDateToSpanish,
  calculateAge,
  validateSpanishPhone,
  generateInvoiceNumber
};