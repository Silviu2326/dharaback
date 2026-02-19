const mongoose = require('mongoose');

const pricingPackageSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  name: {
    type: String,
    required: [true, 'Package name is required'],
    trim: true,
    maxlength: [100, 'Package name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  sessions: {
    type: Number,
    required: [true, 'Number of sessions is required'],
    min: [1, 'Package must include at least 1 session'],
    max: [100, 'Package cannot exceed 100 sessions']
  },
  originalPrice: {
    type: Number,
    required: [true, 'Original price is required'],
    min: [0, 'Original price cannot be negative'],
    max: [100000, 'Original price cannot exceed 100,000']
  },
  discountedPrice: {
    type: Number,
    required: [true, 'Discounted price is required'],
    min: [0, 'Discounted price cannot be negative'],
    max: [100000, 'Discounted price cannot exceed 100,000']
  },
  validityDays: {
    type: Number,
    required: [true, 'Validity period is required'],
    min: [1, 'Validity must be at least 1 day'],
    max: [1095, 'Validity cannot exceed 3 years (1095 days)'],
    default: 365
  },
  isActive: {
    type: Boolean,
    default: true
  },
  features: [{
    type: String,
    trim: true,
    maxlength: [200, 'Feature description cannot exceed 200 characters']
  }],
  // Extended package details
  packageType: {
    type: String,
    enum: ['therapy', 'consultation', 'wellness', 'specialized', 'intensive', 'maintenance'],
    default: 'therapy'
  },
  sessionType: {
    type: String,
    enum: ['individual', 'couple', 'family', 'group', 'mixed'],
    default: 'individual'
  },
  sessionDuration: {
    type: Number, // in minutes
    default: 60,
    min: 15,
    max: 300
  },
  currency: {
    type: String,
    enum: ['EUR', 'USD', 'GBP'],
    default: 'EUR'
  },
  // Scheduling and availability
  scheduling: {
    flexibleScheduling: {
      type: Boolean,
      default: true
    },
    advanceBookingRequired: {
      type: Number, // days
      default: 1,
      min: 0,
      max: 30
    },
    cancellationPolicy: {
      freeWithin: {
        type: Number, // hours
        default: 24,
        min: 0,
        max: 168
      },
      penaltyPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      }
    },
    sessionSpacing: {
      minDaysBetween: {
        type: Number,
        default: 1,
        min: 0,
        max: 30
      },
      maxDaysBetween: {
        type: Number,
        default: 14,
        min: 1,
        max: 90
      }
    }
  },
  // Target audience and conditions
  targetAudience: {
    ageGroups: [{
      type: String,
      enum: ['child', 'adolescent', 'adult', 'elderly']
    }],
    conditions: [{
      type: String,
      enum: ['anxiety', 'depression', 'couples', 'trauma', 'addiction', 'self_esteem', 'stress', 'eating_disorders', 'grief', 'ocd', 'other']
    }],
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe', 'any'],
      default: 'any'
    }
  },
  // Promotional and discount settings
  promotions: [{
    name: {
      type: String,
      maxlength: [100, 'Promotion name cannot exceed 100 characters']
    },
    additionalDiscount: {
      type: Number,
      min: 0,
      max: 50 // max 50% additional discount
    },
    validFrom: Date,
    validUntil: Date,
    conditions: {
      newClientsOnly: Boolean,
      requiresCode: Boolean,
      promoCode: String,
      maxUses: Number,
      usedCount: {
        type: Number,
        default: 0
      }
    }
  }],
  // Package restrictions and requirements
  restrictions: {
    newClientsOnly: {
      type: Boolean,
      default: false
    },
    maxPurchasesPerClient: {
      type: Number,
      default: null,
      min: 1
    },
    requiresAssessment: {
      type: Boolean,
      default: false
    },
    minimumCommitment: {
      type: Boolean,
      default: false
    }
  },
  // Payment options
  paymentOptions: {
    allowsInstallments: {
      type: Boolean,
      default: false
    },
    installmentPlans: [{
      numberOfPayments: {
        type: Number,
        min: 2,
        max: 12
      },
      paymentInterval: {
        type: String,
        enum: ['weekly', 'biweekly', 'monthly'],
        default: 'monthly'
      },
      downPaymentPercentage: {
        type: Number,
        min: 10,
        max: 50,
        default: 25
      }
    }],
    acceptedMethods: [{
      type: String,
      enum: ['cash', 'card', 'transfer', 'paypal', 'bizum', 'insurance']
    }]
  },
  // Analytics and tracking
  analytics: {
    totalPurchases: {
      type: Number,
      default: 0,
      min: 0
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    completionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    conversionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  // Included services
  includedServices: [{
    service: {
      type: String,
      enum: ['initial_assessment', 'progress_tracking', 'homework_assignments', 'emergency_support', 'family_sessions', 'online_resources', 'follow_up_calls'],
      required: true
    },
    description: String,
    value: Number // monetary value if applicable
  }],
  // Marketing and presentation
  marketing: {
    isPromoted: {
      type: Boolean,
      default: false
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: 0
    },
    badge: {
      type: String,
      enum: ['bestseller', 'new', 'popular', 'limited_time', 'recommended'],
      default: null
    },
    testimonials: [{
      clientInitials: String,
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: {
        type: String,
        maxlength: [500, 'Testimonial cannot exceed 500 characters']
      },
      date: {
        type: Date,
        default: Date.now
      }
    }]
  },
  // Lifecycle management
  lifecycle: {
    launchDate: {
      type: Date,
      default: Date.now
    },
    retirementDate: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'retired'],
      default: 'draft'
    },
    autoRenew: {
      type: Boolean,
      default: false
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
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
pricingPackageSchema.index({ therapistId: 1, isActive: 1 });
pricingPackageSchema.index({ packageType: 1, isActive: 1 });
pricingPackageSchema.index({ 'lifecycle.status': 1 });
pricingPackageSchema.index({ 'marketing.isPromoted': 1, 'marketing.displayOrder': 1 });
pricingPackageSchema.index({ 'analytics.totalPurchases': -1 });

// Virtual for therapist details
pricingPackageSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for savings calculation
pricingPackageSchema.virtual('savings').get(function() {
  return this.originalPrice - this.discountedPrice;
});

// Virtual for discount percentage
pricingPackageSchema.virtual('discountPercentage').get(function() {
  if (this.originalPrice === 0) return 0;
  return Math.round(((this.originalPrice - this.discountedPrice) / this.originalPrice) * 100);
});

// Virtual for price per session
pricingPackageSchema.virtual('pricePerSession').get(function() {
  return Math.round((this.discountedPrice / this.sessions) * 100) / 100;
});

// Virtual for original price per session
pricingPackageSchema.virtual('originalPricePerSession').get(function() {
  return Math.round((this.originalPrice / this.sessions) * 100) / 100;
});

// Virtual for package value score
pricingPackageSchema.virtual('valueScore').get(function() {
  const discountWeight = this.discountPercentage * 0.3;
  const sessionWeight = (this.sessions / 20) * 0.3; // normalized for 20 sessions
  const featuresWeight = (this.features.length / 10) * 0.2; // normalized for 10 features
  const ratingWeight = (this.analytics.averageRating / 5) * 0.2;

  return Math.min(100, Math.round((discountWeight + sessionWeight + featuresWeight + ratingWeight) * 10) / 10);
});

// Virtual for is currently active
pricingPackageSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  const isWithinLifecycle = !this.lifecycle.retirementDate || this.lifecycle.retirementDate > now;
  return this.isActive && this.lifecycle.status === 'active' && isWithinLifecycle;
});

// Method to activate package
pricingPackageSchema.methods.activate = function() {
  this.isActive = true;
  this.lifecycle.status = 'active';
  if (!this.lifecycle.launchDate) {
    this.lifecycle.launchDate = new Date();
  }
  return this.save();
};

// Method to deactivate package
pricingPackageSchema.methods.deactivate = function() {
  this.isActive = false;
  this.lifecycle.status = 'paused';
  return this.save();
};

// Method to retire package
pricingPackageSchema.methods.retire = function() {
  this.isActive = false;
  this.lifecycle.status = 'retired';
  this.lifecycle.retirementDate = new Date();
  return this.save();
};

// Method to calculate final price with promotions
pricingPackageSchema.methods.calculateFinalPrice = function(promoCode = null) {
  let finalPrice = this.discountedPrice;

  if (promoCode) {
    const promotion = this.promotions.find(p =>
      p.conditions.promoCode === promoCode &&
      p.validFrom <= new Date() &&
      (!p.validUntil || p.validUntil >= new Date()) &&
      (!p.conditions.maxUses || p.conditions.usedCount < p.conditions.maxUses)
    );

    if (promotion) {
      const additionalDiscount = (finalPrice * promotion.additionalDiscount) / 100;
      finalPrice -= additionalDiscount;
    }
  }

  return Math.round(finalPrice * 100) / 100;
};

// Method to add testimonial
pricingPackageSchema.methods.addTestimonial = function(testimonial) {
  this.marketing.testimonials.push(testimonial);

  // Update average rating
  const ratings = this.marketing.testimonials.map(t => t.rating).filter(r => r);
  if (ratings.length > 0) {
    this.analytics.averageRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  }

  return this.save();
};

// Method to update analytics
pricingPackageSchema.methods.updateAnalytics = function(purchaseData) {
  this.analytics.totalPurchases += 1;
  this.analytics.totalRevenue += purchaseData.amount || this.discountedPrice;

  // Update conversion rate if view data is available
  if (purchaseData.views) {
    this.analytics.conversionRate = Math.round((this.analytics.totalPurchases / purchaseData.views) * 100 * 10) / 10;
  }

  return this.save();
};

// Method to create new version
pricingPackageSchema.methods.createVersion = function(changes, modifiedBy) {
  this.previousVersions.push({
    versionNumber: this.version,
    changes,
    modifiedAt: new Date(),
    modifiedBy
  });

  this.version += 1;
  return this.save();
};

// Method to apply promotion
pricingPackageSchema.methods.applyPromotion = function(promoCode) {
  const promotion = this.promotions.find(p => p.conditions.promoCode === promoCode);
  if (promotion && promotion.conditions.maxUses && promotion.conditions.usedCount < promotion.conditions.maxUses) {
    promotion.conditions.usedCount += 1;
    return this.save();
  }
  throw new Error('Invalid or expired promotion code');
};

// Static method to get active packages by therapist
pricingPackageSchema.statics.getActiveByTherapist = function(therapistId) {
  return this.find({
    therapistId,
    isActive: true,
    'lifecycle.status': 'active'
  })
  .sort({ 'marketing.displayOrder': 1, 'analytics.totalPurchases': -1 })
  .populate('therapist', 'name profile.firstName profile.lastName');
};

// Static method to get popular packages
pricingPackageSchema.statics.getPopularPackages = function(limit = 10) {
  return this.find({
    isActive: true,
    'lifecycle.status': 'active'
  })
  .sort({ 'analytics.totalPurchases': -1, 'analytics.averageRating': -1 })
  .limit(limit)
  .populate('therapist', 'name profile.firstName profile.lastName profile.specialties');
};

// Static method to search packages
pricingPackageSchema.statics.searchPackages = function(filters = {}) {
  const {
    packageType,
    sessionType,
    minSessions,
    maxSessions,
    maxPrice,
    targetConditions,
    ageGroup
  } = filters;

  const query = {
    isActive: true,
    'lifecycle.status': 'active'
  };

  if (packageType) query.packageType = packageType;
  if (sessionType) query.sessionType = sessionType;
  if (minSessions) query.sessions = { ...query.sessions, $gte: minSessions };
  if (maxSessions) query.sessions = { ...query.sessions, $lte: maxSessions };
  if (maxPrice) query.discountedPrice = { $lte: maxPrice };
  if (targetConditions) query['targetAudience.conditions'] = { $in: targetConditions };
  if (ageGroup) query['targetAudience.ageGroups'] = ageGroup;

  return this.find(query)
    .sort({ 'marketing.isPromoted': -1, 'analytics.averageRating': -1 })
    .populate('therapist', 'name profile.firstName profile.lastName profile.specialties');
};

// Static method to get package statistics
pricingPackageSchema.statics.getPackageStats = function(therapistId = null) {
  const matchQuery = therapistId ? { therapistId: new mongoose.Types.ObjectId(therapistId) } : {};

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$packageType',
        count: { $sum: 1 },
        avgPrice: { $avg: '$discountedPrice' },
        avgSessions: { $avg: '$sessions' },
        totalRevenue: { $sum: '$analytics.totalRevenue' },
        avgRating: { $avg: '$analytics.averageRating' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Pre-save middleware
pricingPackageSchema.pre('save', function(next) {
  // Ensure discounted price is not higher than original price
  if (this.discountedPrice > this.originalPrice) {
    return next(new Error('Discounted price cannot be higher than original price'));
  }

  // Auto-activate if status is active but isActive is false
  if (this.lifecycle.status === 'active' && !this.isActive) {
    this.isActive = true;
  }

  next();
});

// Pre-validate middleware
pricingPackageSchema.pre('validate', function(next) {
  // Validate installment plans
  this.paymentOptions.installmentPlans.forEach(plan => {
    if (plan.numberOfPayments && plan.downPaymentPercentage) {
      const remainingAmount = this.discountedPrice * (1 - plan.downPaymentPercentage / 100);
      const paymentAmount = remainingAmount / (plan.numberOfPayments - 1);

      if (paymentAmount < 10) { // Minimum payment amount
        return next(new Error('Installment payments must be at least 10 EUR'));
      }
    }
  });

  next();
});

module.exports = mongoose.model('PricingPackage', pricingPackageSchema);