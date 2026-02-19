const mongoose = require('mongoose');

const payoutRequestSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  amount: {
    type: Number,
    required: [true, 'Payout amount is required'],
    min: [1, 'Minimum payout amount is €1'],
    validate: {
      validator: function(v) {
        return Number.isFinite(v) && v > 0;
      },
      message: 'Amount must be a valid positive number'
    }
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    uppercase: true,
    default: 'EUR',
    enum: ['EUR', 'USD', 'GBP'],
    minlength: 3,
    maxlength: 3
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    required: true
  },
  bankAccount: {
    accountNumber: {
      type: String,
      required: [true, 'Account number is required'],
      trim: true,
      minlength: [8, 'Account number must be at least 8 characters'],
      maxlength: [34, 'Account number cannot exceed 34 characters'] // IBAN max length
    },
    routingNumber: {
      type: String,
      required: [true, 'Routing number is required'],
      trim: true,
      minlength: [4, 'Routing number must be at least 4 characters'],
      maxlength: [11, 'Routing number cannot exceed 11 characters'] // SWIFT code max length
    },
    accountHolderName: {
      type: String,
      required: [true, 'Account holder name is required'],
      trim: true,
      maxlength: [100, 'Account holder name cannot exceed 100 characters'],
      validate: {
        validator: function(v) {
          return /^[a-zA-ZÀ-ÿ\s\-\.]+$/.test(v);
        },
        message: 'Account holder name can only contain letters, spaces, hyphens, and dots'
      }
    },
    bankName: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true,
      maxlength: [100, 'Bank name cannot exceed 100 characters']
    },
    iban: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          // Basic IBAN validation (simplified)
          return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$/.test(v);
        },
        message: 'Invalid IBAN format'
      }
    },
    swift: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v);
        },
        message: 'Invalid SWIFT code format'
      }
    }
  },
  requestDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  processedDate: {
    type: Date,
    default: null
  },
  completedDate: {
    type: Date,
    default: null
  },
  fees: {
    type: Number,
    default: 0,
    min: [0, 'Fees cannot be negative'],
    validate: {
      validator: function(v) {
        return Number.isFinite(v) && v >= 0;
      },
      message: 'Fees must be a valid non-negative number'
    }
  },
  netAmount: {
    type: Number,
    required: true,
    min: [0, 'Net amount cannot be negative']
  },
  // Processing information
  processorData: {
    transactionId: String,
    batchId: String,
    referenceNumber: String,
    processorResponse: String,
    failureCode: String,
    failureReason: String
  },
  // Administrative fields
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    trim: true
  },
  adminNotes: {
    type: String,
    maxlength: [1000, 'Admin notes cannot exceed 1000 characters'],
    trim: true
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Tax and compliance
  taxInfo: {
    taxWithheld: {
      type: Number,
      default: 0,
      min: 0
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    taxDocumentUrl: String
  },
  // Verification and compliance
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationDocuments: [{
    type: {
      type: String,
      enum: ['identity', 'bank_statement', 'tax_form', 'other'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    uploadDate: {
      type: Date,
      default: Date.now
    },
    verified: {
      type: Boolean,
      default: false
    }
  }],
  // Retry information
  retryCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  lastRetryDate: {
    type: Date,
    default: null
  },
  // Notification tracking
  notificationsSent: {
    requested: {
      type: Boolean,
      default: false
    },
    processing: {
      type: Boolean,
      default: false
    },
    completed: {
      type: Boolean,
      default: false
    },
    failed: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
payoutRequestSchema.index({ therapistId: 1, status: 1, requestDate: -1 });
payoutRequestSchema.index({ status: 1, requestDate: -1 });
payoutRequestSchema.index({ processedDate: -1 });
payoutRequestSchema.index({ 'processorData.transactionId': 1 });

// Virtual for therapist details
payoutRequestSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for processor details (admin who processed)
payoutRequestSchema.virtual('processor', {
  ref: 'User',
  localField: 'processedBy',
  foreignField: '_id',
  justOne: true
});

// Virtual for formatted amount
payoutRequestSchema.virtual('formattedAmount').get(function() {
  return `${this.amount.toFixed(2)} ${this.currency}`;
});

// Virtual for formatted net amount
payoutRequestSchema.virtual('formattedNetAmount').get(function() {
  return `${this.netAmount.toFixed(2)} ${this.currency}`;
});

// Virtual for processing time
payoutRequestSchema.virtual('processingTime').get(function() {
  if (!this.processedDate) return null;

  const diffMs = this.processedDate - this.requestDate;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} days`;
  if (diffHours > 0) return `${diffHours} hours`;
  return 'Less than 1 hour';
});

// Virtual for can retry
payoutRequestSchema.virtual('canRetry').get(function() {
  return this.status === 'failed' && this.retryCount < 3;
});

// Method to process payout request
payoutRequestSchema.methods.process = async function(processedBy, processorData = {}) {
  if (this.status !== 'pending') {
    throw new Error('Only pending payout requests can be processed');
  }

  this.status = 'processing';
  this.processedDate = new Date();
  this.processedBy = processedBy;
  this.processorData = { ...this.processorData, ...processorData };

  await this.save();
  return this;
};

// Method to complete payout request
payoutRequestSchema.methods.complete = async function(transactionData = {}) {
  if (this.status !== 'processing') {
    throw new Error('Only processing payout requests can be completed');
  }

  this.status = 'completed';
  this.completedDate = new Date();
  this.processorData = { ...this.processorData, ...transactionData };

  await this.save();
  return this;
};

// Method to fail payout request
payoutRequestSchema.methods.fail = async function(failureReason, failureCode = null) {
  this.status = 'failed';
  this.processorData.failureReason = failureReason;
  this.processorData.failureCode = failureCode;
  this.lastRetryDate = new Date();

  await this.save();
  return this;
};

// Method to retry payout request
payoutRequestSchema.methods.retry = async function() {
  if (!this.canRetry) {
    throw new Error('Payout request cannot be retried');
  }

  this.status = 'pending';
  this.retryCount += 1;
  this.lastRetryDate = new Date();

  // Clear previous failure data
  delete this.processorData.failureReason;
  delete this.processorData.failureCode;

  await this.save();
  return this;
};

// Method to cancel payout request
payoutRequestSchema.methods.cancel = async function(reason) {
  if (['completed', 'processing'].includes(this.status)) {
    throw new Error('Cannot cancel a completed or processing payout request');
  }

  this.status = 'cancelled';
  this.adminNotes = `${this.adminNotes || ''}\nCancelled: ${reason}`.trim();

  await this.save();
  return this;
};

// Method to validate bank account
payoutRequestSchema.methods.validateBankAccount = function() {
  const { accountNumber, routingNumber, accountHolderName, bankName } = this.bankAccount;

  if (!accountNumber || !routingNumber || !accountHolderName || !bankName) {
    return {
      isValid: false,
      errors: ['All bank account fields are required']
    };
  }

  const errors = [];

  // Basic IBAN validation for European accounts
  if (this.bankAccount.iban) {
    const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$/;
    if (!ibanRegex.test(this.bankAccount.iban)) {
      errors.push('Invalid IBAN format');
    }
  }

  // SWIFT code validation
  if (this.bankAccount.swift) {
    const swiftRegex = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
    if (!swiftRegex.test(this.bankAccount.swift)) {
      errors.push('Invalid SWIFT code format');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Static method to get payout statistics
payoutRequestSchema.statics.getPayoutStats = function(therapistId, period = 'month') {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter':
      startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const matchQuery = { requestDate: { $gte: startDate, $lte: now } };
  if (therapistId) {
    matchQuery.therapistId = new mongoose.Types.ObjectId(therapistId);
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        totalFees: { $sum: '$fees' },
        totalNet: { $sum: '$netAmount' }
      }
    }
  ]);
};

// Static method to get pending amount for therapist
payoutRequestSchema.statics.getPendingAmount = function(therapistId) {
  return this.aggregate([
    {
      $match: {
        therapistId: new mongoose.Types.ObjectId(therapistId),
        status: { $in: ['pending', 'processing'] }
      }
    },
    {
      $group: {
        _id: null,
        totalPending: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
};

// Pre-save middleware
payoutRequestSchema.pre('save', function(next) {
  // Calculate net amount
  if (this.isModified('amount') || this.isModified('fees')) {
    this.netAmount = Math.max(0, this.amount - this.fees);
  }

  // Set completion date when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedDate) {
    this.completedDate = new Date();
  }

  // Validate minimum payout amount
  if (this.amount < 1) {
    return next(new Error('Minimum payout amount is €1'));
  }

  next();
});

// Post-save middleware for notifications
payoutRequestSchema.post('save', async function() {
  // Here you would emit events for real-time notifications
  // Example: notificationService.emitPayoutUpdate(this);
});

module.exports = mongoose.model('PayoutRequest', payoutRequestSchema);