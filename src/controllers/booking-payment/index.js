/**
 * Booking Payment Controllers
 * Main export file for all booking payment related controllers
 */

const { createBookingWithPayment } = require('./create-booking');
const { getPaymentPermissions } = require('./get-permissions');
const { verifyPayment } = require('./verify-payment');
const { handleStripeWebhook } = require('./webhook');
const { handlePaymentSuccess, handlePaymentFailure, handleRefund } = require('./utils');
const { validateCoupon } = require('./validate-coupon');

module.exports = {
  // Main controllers
  createBookingWithPayment,
  getPaymentPermissions,
  verifyPayment,
  handleStripeWebhook,
  validateCoupon,

  // Utility functions (exported for testing or advanced use)
  handlePaymentSuccess,
  handlePaymentFailure,
  handleRefund
};
