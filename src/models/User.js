const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      // Password is required only for local auth, not for OAuth
      return this.authProvider === 'local';
    },
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  supabaseId: {
    type: String,
    unique: true,
    sparse: true, // Allows null and duplicate nulls
    index: true
  },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  avatar: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow null/empty values
        return /^https?:\/\/.+/.test(v) || v.startsWith('/uploads/');
      },
      message: 'Avatar must be a valid URL or file path'
    }
  },
  banner: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow null/empty values
        return /^https?:\/\/.+/.test(v) || v.startsWith('/uploads/');
      },
      message: 'Banner must be a valid URL or file path'
    }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'not_submitted'],
    default: 'not_submitted'
  },
  role: {
    type: String,
    enum: ['therapist', 'admin', 'cliente'],
    default: 'therapist'
  },
  phone: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  preferences: {
    language: {
      type: String,
      default: 'es',
      enum: ['es', 'en', 'ca']
    },
    timezone: {
      type: String,
      default: 'Europe/Madrid'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      showProfile: {
        type: Boolean,
        default: true
      },
      allowMessages: {
        type: Boolean,
        default: true
      }
    }
  },
  // Stripe integration fields
  stripeCustomerId: {
    type: String,
    default: null,
    sparse: true,
    index: true
  },
  stripeSubscriptionId: {
    type: String,
    default: null
  },
  subscriptionStatus: {
    type: String,
    enum: ['none', 'trial', 'active', 'past_due', 'canceled', 'unpaid'],
    default: 'none'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ verificationStatus: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ supabaseId: 1 });
userSchema.index({ authProvider: 1 });

// Virtual for professional profile
userSchema.virtual('professionalProfile', {
  ref: 'ProfessionalProfile',
  localField: '_id',
  foreignField: 'userId',
  justOne: true,
  match: { role: { $in: ['therapist', 'admin'] } }
});

// Virtual for subscription
userSchema.virtual('subscription', {
  ref: 'Subscription',
  localField: '_id',
  foreignField: 'therapistId',
  justOne: true
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Skip password hashing if using OAuth providers
  if (this.authProvider !== 'local') {
    return next();
  }

  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate password reset token
userSchema.methods.getResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Method to get user stats
userSchema.methods.getStats = async function() {
  const Client = mongoose.model('Client');
  const Booking = mongoose.model('Booking');
  const Payment = mongoose.model('Payment');
  const Review = mongoose.model('Review');

  const [clientsCount, bookingsCount, paymentsSum, reviewsStats] = await Promise.all([
    Client.countDocuments({ therapistId: this._id, status: 'active' }),
    Booking.countDocuments({ therapistId: this._id, status: 'completed' }),
    Payment.aggregate([
      { $match: { therapistId: this._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$netAmount' } } }
    ]),
    Review.aggregate([
      { $match: { therapistId: this._id } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ])
  ]);

  return {
    totalClients: clientsCount,
    totalSessions: bookingsCount,
    totalRevenue: paymentsSum[0]?.total || 0,
    averageRating: reviewsStats[0]?.avgRating || 0,
    totalReviews: reviewsStats[0]?.count || 0
  };
};

module.exports = mongoose.model('User', userSchema);