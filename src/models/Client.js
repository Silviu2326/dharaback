const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const bcrypt = require('bcryptjs');

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in queries by default
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(v) {
        // Spanish phone number validation
        return /^(\+34|0034|34)?[6-9]\d{8}$/.test(v.replace(/\s/g, ''));
      },
      message: 'Please enter a valid Spanish phone number'
    }
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
  status: {
    type: String,
    enum: ['active', 'inactive', 'demo'],
    default: 'active'
  },
  age: {
    type: Number,
    min: [16, 'Minimum age is 16'],
    max: [120, 'Maximum age is 120'],
    validate: {
      validator: Number.isInteger,
      message: 'Age must be a whole number'
    }
  },
  address: {
    type: String,
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  emergencyContact: {
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Allow empty values
          return /^(\+34|0034|34)?[6-9]\d{8}$/.test(v.replace(/\s/g, ''));
        },
        message: 'Emergency contact phone must be a valid Spanish phone number'
      }
    },
    relationship: {
      type: String,
      trim: true,
      maxlength: [50, 'Relationship cannot exceed 50 characters']
    }
  },
  notes: {
    type: String,
    maxlength: [2000, 'Notes cannot exceed 2000 characters']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  lastSession: {
    type: Date,
    default: null
  },
  sessionsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  paymentsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  documentsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  messagesCount: {
    type: Number,
    default: 0,
    min: 0
  },
  preferences: {
    preferredTime: {
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'any'],
      default: 'any'
    },
    preferredLocation: {
      type: String,
      enum: ['office', 'online', 'both'],
      default: 'both'
    },
    reminderEnabled: {
      type: Boolean,
      default: true
    },
    reminderTime: {
      type: Number, // hours before appointment
      default: 24,
      min: 1,
      max: 168 // 1 week
    }
  },
  gdprConsent: {
    given: {
      type: Boolean,
      required: true,
      default: false
    },
    date: {
      type: Date,
      default: Date.now
    },
    ipAddress: String
  },
  datosFiscales: {
    nif: { type: String, trim: true, uppercase: true },
    nombreFiscal: { type: String, trim: true },
    direccionFiscal: {
      calle: { type: String, trim: true },
      codigoPostal: { type: String, trim: true },
      ciudad: { type: String, trim: true }
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
clientSchema.index({ therapistId: 1, status: 1 });
clientSchema.index({ therapistId: 1, createdAt: -1 });
clientSchema.index({ email: 1, therapistId: 1 }, { unique: true });
clientSchema.index({ tags: 1 });

// Virtual for bookings
clientSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'clientId'
});

// Virtual for conversation
clientSchema.virtual('conversation', {
  ref: 'Conversation',
  localField: '_id',
  foreignField: 'clientId',
  justOne: true
});

// Virtual for assigned plans
clientSchema.virtual('assignedPlans', {
  ref: 'PlanAssignment',
  localField: '_id',
  foreignField: 'clientId'
});

// Method to update session count
clientSchema.methods.updateSessionStats = async function() {
  const Booking = mongoose.model('Booking');

  const lastBooking = await Booking
    .findOne({ clientId: this._id, status: 'completed' })
    .sort({ date: -1 });

  const sessionCount = await Booking.countDocuments({
    clientId: this._id,
    status: 'completed'
  });

  this.lastSession = lastBooking?.date || null;
  this.sessionsCount = sessionCount;

  await this.save();
};

// Method to calculate average rating from reviews
clientSchema.methods.updateRating = async function() {
  const Review = mongoose.model('Review');

  const ratingStats = await Review.aggregate([
    { $match: { clientId: this._id } },
    { $group: { _id: null, avgRating: { $avg: '$rating' } } }
  ]);

  this.rating = ratingStats[0]?.avgRating || null;
  await this.save();
};

// Method to get client summary
clientSchema.methods.getSummary = async function() {
  await this.populate([
    { path: 'bookings', match: { status: 'completed' }, options: { limit: 5, sort: { date: -1 } } },
    { path: 'assignedPlans', populate: { path: 'planId', select: 'name type' } }
  ]);

  return {
    id: this._id,
    name: this.name,
    email: this.email,
    status: this.status,
    sessionsCount: this.sessionsCount,
    lastSession: this.lastSession,
    rating: this.rating,
    recentBookings: this.bookings,
    activePlans: this.assignedPlans.filter(ap => ap.status === 'active')
  };
};

// Method to compare password for login
clientSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Pre-save middleware to hash password and update counts
clientSchema.pre('save', async function(next) {
  try {
    // Hash password if it was modified
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }

    if (this.isNew) {
      // Set initial values for new clients
      this.messagesCount = 0;
      this.paymentsCount = 0;
      this.documentsCount = 0;
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Add pagination plugin
clientSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Client', clientSchema);