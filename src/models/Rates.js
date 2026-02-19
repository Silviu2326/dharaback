const mongoose = require('mongoose');

const ratesSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  sessionPrice: {
    type: Number,
    required: [true, 'Session price is required'],
    min: [0, 'Session price cannot be negative'],
    max: [10000, 'Session price cannot exceed 10,000']
  },
  followUpPrice: {
    type: Number,
    min: [0, 'Follow-up price cannot be negative'],
    max: [10000, 'Follow-up price cannot exceed 10,000'],
    default: null
  },
  packagePrice: {
    type: Number,
    min: [0, 'Package price cannot be negative'],
    max: [100000, 'Package price cannot exceed 100,000'],
    default: null
  },
  coupleSessionPrice: {
    type: Number,
    min: [0, 'Couple session price cannot be negative'],
    max: [10000, 'Couple session price cannot exceed 10,000'],
    default: null
  },
  currency: {
    type: String,
    enum: ['EUR', 'USD', 'GBP'],
    default: 'EUR',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  validFrom: {
    type: Date,
    required: [true, 'Valid from date is required'],
    default: Date.now
  },
  validUntil: {
    type: Date,
    default: null
  },
  // Extended pricing options
  sessionTypes: [{
    type: {
      type: String,
      enum: ['individual', 'couple', 'family', 'group', 'consultation', 'emergency', 'online', 'phone'],
      required: true
    },
    duration: {
      type: Number, // in minutes
      required: true,
      min: 15,
      max: 300
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      max: 10000
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    }
  }],
  // Discount and promotional pricing
  discounts: [{
    name: {
      type: String,
      required: true,
      maxlength: [100, 'Discount name cannot exceed 100 characters']
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed_amount'],
      required: true
    },
    value: {
      type: Number,
      required: true,
      min: 0
    },
    applicableTypes: [{
      type: String,
      enum: ['individual', 'couple', 'family', 'group', 'package']
    }],
    validFrom: Date,
    validUntil: Date,
    isActive: {
      type: Boolean,
      default: true
    },
    conditions: {
      minSessions: Number,
      newClientsOnly: Boolean,
      requiresCode: Boolean,
      promoCode: String
    }
  }],
  // Package deals
  packages: [{
    name: {
      type: String,
      required: true,
      maxlength: [100, 'Package name cannot exceed 100 characters']
    },
    sessions: {
      type: Number,
      required: true,
      min: 1,
      max: 100
    },
    sessionType: {
      type: String,
      enum: ['individual', 'couple', 'family', 'group'],
      default: 'individual'
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    pricePerSession: {
      type: Number,
      min: 0
    },
    validityDays: {
      type: Number,
      default: 365,
      min: 1,
      max: 1095 // 3 years
    },
    description: {
      type: String,
      maxlength: [500, 'Package description cannot exceed 500 characters']
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  // Payment options
  paymentMethods: [{
    type: String,
    enum: ['cash', 'card', 'transfer', 'paypal', 'bizum', 'insurance'],
    required: true
  }],
  acceptsInsurance: {
    type: Boolean,
    default: false
  },
  insuranceProviders: [{
    name: String,
    coverage: Number, // percentage covered
    directBilling: Boolean
  }],
  // Cancellation and modification policies
  cancellationPolicy: {
    freeWithin: {
      type: Number, // hours before session
      default: 24,
      min: 0,
      max: 168 // 1 week
    },
    chargePercentage: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },
    noShowCharge: {
      type: Number,
      default: 100,
      min: 0,
      max: 100
    }
  },
  modificationPolicy: {
    freeWithin: {
      type: Number, // hours before session
      default: 24,
      min: 0,
      max: 168
    },
    maxModifications: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    }
  },
  // Location-based pricing
  locationPricing: [{
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkLocation'
    },
    additionalCharge: {
      type: Number,
      default: 0,
      min: 0
    },
    travelFee: {
      type: Number,
      default: 0,
      min: 0
    }
  }],
  // Special rates
  specialRates: [{
    category: {
      type: String,
      enum: ['student', 'senior', 'unemployed', 'low_income', 'healthcare_worker', 'referral'],
      required: true
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed_amount'],
      default: 'percentage'
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0
    },
    requiresVerification: {
      type: Boolean,
      default: true
    },
    description: String
  }],
  // Professional notes
  notes: {
    internal: {
      type: String,
      maxlength: [1000, 'Internal notes cannot exceed 1000 characters']
    },
    public: {
      type: String,
      maxlength: [500, 'Public notes cannot exceed 500 characters']
    }
  },
  // Version control
  version: {
    type: Number,
    default: 1,
    min: 1
  },
  previousVersions: [{
    versionNumber: Number,
    changes: String,
    modifiedAt: Date,
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rateData: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
ratesSchema.index({ therapistId: 1, isActive: 1 });
ratesSchema.index({ validFrom: 1, validUntil: 1 });
ratesSchema.index({ currency: 1, isActive: 1 });
ratesSchema.index({ 'sessionTypes.type': 1 });

// Virtual for therapist details
ratesSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for current validity status
ratesSchema.virtual('isCurrentlyValid').get(function() {
  const now = new Date();
  const validFrom = this.validFrom || new Date(0);
  const validUntil = this.validUntil || new Date('2099-12-31');

  return now >= validFrom && now <= validUntil && this.isActive;
});

// Virtual for base session price per minute
ratesSchema.virtual('pricePerMinute').get(function() {
  return Math.round((this.sessionPrice / 60) * 100) / 100;
});

// Virtual for days until expiry
ratesSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.validUntil) return null;

  const now = new Date();
  const diffTime = this.validUntil - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Method to activate rate
ratesSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

// Method to deactivate rate
ratesSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Method to extend validity
ratesSchema.methods.extendValidity = function(newValidUntil) {
  this.validUntil = newValidUntil;
  return this.save();
};

// Method to calculate price for session type
ratesSchema.methods.calculatePrice = function(sessionType, duration = 60, discountCode = null) {
  // Find session type pricing
  const sessionTypeConfig = this.sessionTypes.find(st => st.type === sessionType);

  let basePrice;
  if (sessionTypeConfig) {
    // Calculate based on duration ratio
    basePrice = (sessionTypeConfig.price / sessionTypeConfig.duration) * duration;
  } else {
    // Use default session price
    basePrice = (this.sessionPrice / 60) * duration;
  }

  // Apply discounts if applicable
  let finalPrice = basePrice;
  if (discountCode) {
    const discount = this.discounts.find(d =>
      d.promoCode === discountCode &&
      d.isActive &&
      d.validFrom <= new Date() &&
      (!d.validUntil || d.validUntil >= new Date())
    );

    if (discount) {
      if (discount.type === 'percentage') {
        finalPrice = basePrice * (1 - discount.value / 100);
      } else {
        finalPrice = Math.max(0, basePrice - discount.value);
      }
    }
  }

  return Math.round(finalPrice * 100) / 100;
};

// Method to create new version
ratesSchema.methods.createVersion = function(changes, modifiedBy) {
  this.previousVersions.push({
    versionNumber: this.version,
    changes,
    modifiedAt: new Date(),
    modifiedBy,
    rateData: this.toObject()
  });

  this.version += 1;
  return this.save();
};

// Method to add session type
ratesSchema.methods.addSessionType = function(sessionType) {
  this.sessionTypes.push(sessionType);
  return this.save();
};

// Method to update session type
ratesSchema.methods.updateSessionType = function(typeId, updates) {
  const sessionType = this.sessionTypes.id(typeId);
  if (sessionType) {
    Object.assign(sessionType, updates);
    return this.save();
  }
  throw new Error('Session type not found');
};

// Method to remove session type
ratesSchema.methods.removeSessionType = function(typeId) {
  this.sessionTypes.pull(typeId);
  return this.save();
};

// Static method to get current rates for therapist
ratesSchema.statics.getCurrentRates = function(therapistId) {
  const now = new Date();
  return this.findOne({
    therapistId,
    isActive: true,
    validFrom: { $lte: now },
    $or: [
      { validUntil: null },
      { validUntil: { $gte: now } }
    ]
  }).populate('therapist', 'name profile.firstName profile.lastName');
};

// Static method to get rate history
ratesSchema.statics.getRateHistory = function(therapistId) {
  return this.find({ therapistId })
    .sort({ validFrom: -1 })
    .populate('therapist', 'name profile.firstName profile.lastName');
};

// Static method to get pricing statistics
ratesSchema.statics.getPricingStats = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$currency',
        avgSessionPrice: { $avg: '$sessionPrice' },
        minSessionPrice: { $min: '$sessionPrice' },
        maxSessionPrice: { $max: '$sessionPrice' },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Pre-save middleware
ratesSchema.pre('save', function(next) {
  // Calculate price per session for packages
  this.packages.forEach(pkg => {
    if (pkg.totalPrice && pkg.sessions) {
      pkg.pricePerSession = Math.round((pkg.totalPrice / pkg.sessions) * 100) / 100;
    }
  });

  // Validate discount values
  this.discounts.forEach(discount => {
    if (discount.type === 'percentage' && discount.value > 100) {
      return next(new Error('Percentage discount cannot exceed 100%'));
    }
  });

  // Ensure only one active rate per therapist
  if (this.isNew && this.isActive) {
    this.constructor.updateMany(
      { therapistId: this.therapistId, _id: { $ne: this._id } },
      { isActive: false }
    ).exec();
  }

  next();
});

// Pre-validate middleware
ratesSchema.pre('validate', function(next) {
  // Ensure validUntil is after validFrom
  if (this.validUntil && this.validFrom && this.validUntil <= this.validFrom) {
    return next(new Error('Valid until date must be after valid from date'));
  }

  next();
});

module.exports = mongoose.model('Rates', ratesSchema);