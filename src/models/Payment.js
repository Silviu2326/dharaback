const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0, 'Amount must be positive']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'EUR',
    enum: ['EUR', 'USD', 'GBP']
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled', 'canceled', 'processing', 'requires_payment_method', 'requires_confirmation', 'requires_action', 'succeeded'],
    default: 'pending'
  },
  method: {
    type: String,
    enum: ['card', 'transfer', 'cash', 'online', 'stripe', 'paypal', 'other'],
    required: [true, 'Payment method is required']
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client is required']
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist is required']
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  description: {
    type: String,
    required: [true, 'Payment description is required'],
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  invoiceUrl: {
    type: String,
    default: null
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true // Allows null values but ensures uniqueness when present
  },
  fees: {
    type: Number,
    default: 0,
    min: [0, 'Fees must be positive']
  },
  netAmount: {
    type: Number,
    required: [true, 'Net amount is required'],
    min: [0, 'Net amount must be positive']
  },
  paymentDate: {
    type: Date,
    default: null
  },
  refundReason: {
    type: String,
    maxlength: [500, 'Refund reason cannot exceed 500 characters']
  },
  refundAmount: {
    type: Number,
    min: [0, 'Refund amount must be positive'],
    default: 0
  },
  refundDate: {
    type: Date,
    default: null
  },
  stripePaymentIntentId: {
    type: String,
    sparse: true,
    index: true
  },
  stripeCustomerId: {
    type: String,
    sparse: true
  },
  paidAt: {
    type: Date,
    default: null
  },
  refundedAt: {
    type: Date,
    default: null
  },
  metadata: {
    stripeChargeId: String,
    paypalOrderId: String,
    customerEmail: String,
    customerName: String,
    platform: {
      type: String,
      enum: ['web', 'mobile', 'admin'],
      default: 'web'
    }
  },
  failureReason: {
    type: String,
    maxlength: [200, 'Failure reason cannot exceed 200 characters']
  },
  retryCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  ticketNumber: {
    type: String,
    sparse: true
  },
  invoiceNumber: {
    type: String,
    sparse: true
  },
  documentType: {
    type: String,
    enum: ['ticket', 'factura'],
    default: 'ticket'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
paymentSchema.index({ therapistId: 1, status: 1 });
paymentSchema.index({ clientId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, paymentDate: -1 });
paymentSchema.index({ transactionId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ bookingId: 1 });
paymentSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });

// Virtual for client details
paymentSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for therapist details
paymentSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for booking details
paymentSchema.virtual('booking', {
  ref: 'Booking',
  localField: 'bookingId',
  foreignField: '_id',
  justOne: true
});

// Method to calculate net amount after fees
paymentSchema.methods.calculateNetAmount = function() {
  this.netAmount = this.amount - this.fees;
  return this.netAmount;
};

// Method to process refund
paymentSchema.methods.processRefund = async function(refundAmount, reason) {
  if (this.status !== 'completed') {
    throw new Error('Can only refund completed payments');
  }

  if (refundAmount > this.amount) {
    throw new Error('Refund amount cannot exceed payment amount');
  }

  this.status = 'refunded';
  this.refundAmount = refundAmount;
  this.refundReason = reason;
  this.refundDate = new Date();

  await this.save();

  // Update related booking payment status
  if (this.bookingId) {
    const Booking = mongoose.model('Booking');
    await Booking.findByIdAndUpdate(this.bookingId, {
      paymentStatus: 'refunded'
    });
  }

  return this;
};

// Method to generate invoice number
paymentSchema.methods.generateInvoiceNumber = function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const sequence = this._id.toString().slice(-4).toUpperCase();

  return `INV-${year}${month}${day}-${sequence}`;
};

// Static method to get payment statistics
paymentSchema.statics.getStats = function(therapistId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        therapistId: new mongoose.Types.ObjectId(therapistId),
        status: 'completed',
        paymentDate: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalNetAmount: { $sum: '$netAmount' },
        totalFees: { $sum: '$fees' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    }
  ]);
};

// Static method to get monthly revenue
paymentSchema.statics.getMonthlyRevenue = function(therapistId, year) {
  return this.aggregate([
    {
      $match: {
        therapistId: new mongoose.Types.ObjectId(therapistId),
        status: 'completed',
        paymentDate: {
          $gte: new Date(year, 0, 1),
          $lt: new Date(year + 1, 0, 1)
        }
      }
    },
    {
      $group: {
        _id: { $month: '$paymentDate' },
        totalAmount: { $sum: '$amount' },
        totalNetAmount: { $sum: '$netAmount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);
};

// Pre-save middleware
paymentSchema.pre('save', function(next) {
  // Calculate net amount if not set
  if (this.isModified('amount') || this.isModified('fees')) {
    this.calculateNetAmount();
  }

  // Set payment date when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.paymentDate) {
    this.paymentDate = new Date();
  }

  // Generate transaction ID if not present
  if (this.isNew && !this.transactionId) {
    this.transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  next();
});

// Post-save middleware to update booking payment status
paymentSchema.post('save', async function() {
  if (this.bookingId && this.isModified('status')) {
    const Booking = mongoose.model('Booking');
    await Booking.findByIdAndUpdate(this.bookingId, {
      paymentStatus: this.status === 'completed' ? 'paid' :
                    this.status === 'refunded' ? 'refunded' : 'unpaid'
    });
  }
});

module.exports = mongoose.model('Payment', paymentSchema);