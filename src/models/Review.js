const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client ID is required']
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5'],
    validate: {
      validator: function(v) {
        return Number.isInteger(v) && v >= 1 && v <= 5;
      },
      message: 'Rating must be an integer between 1 and 5'
    }
  },
  title: {
    type: String,
    required: [true, 'Review title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
    minlength: [5, 'Title must be at least 5 characters']
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    minlength: [10, 'Comment must be at least 10 characters']
  },
  response: {
    type: String,
    default: null,
    trim: true,
    maxlength: [800, 'Response cannot exceed 800 characters']
  },
  responseDate: {
    type: Date,
    default: null
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  // Additional fields for better review management
  sentiment: {
    type: String,
    enum: ['positive', 'neutral', 'negative'],
    default: null
  },
  helpfulCount: {
    type: Number,
    default: 0,
    min: 0
  },
  reportCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isReported: {
    type: Boolean,
    default: false
  },
  reportReasons: [{
    reason: {
      type: String,
      enum: ['inappropriate', 'spam', 'fake', 'offensive', 'other']
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reportedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],
  // Review moderation
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  moderatedAt: {
    type: Date,
    default: null
  },
  moderationNotes: {
    type: String,
    maxlength: [500, 'Moderation notes cannot exceed 500 characters']
  },
  // Review metadata
  metadata: {
    clientDevice: String,
    clientPlatform: {
      type: String,
      enum: ['web', 'mobile', 'tablet'],
      default: 'web'
    },
    ipAddress: String,
    userAgent: String,
    sessionDuration: Number, // Duration of the therapy session in minutes
    sessionDate: Date
  },
  // Editing history
  editHistory: [{
    field: String,
    oldValue: String,
    newValue: String,
    editedAt: {
      type: Date,
      default: Date.now
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  lastEditedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
reviewSchema.index({ therapistId: 1, isPublic: 1, moderationStatus: 1 });
reviewSchema.index({ clientId: 1, createdAt: -1 });
reviewSchema.index({ rating: 1, createdAt: -1 });
reviewSchema.index({ bookingId: 1 });
reviewSchema.index({ isVerified: 1, isPublic: 1 });
reviewSchema.index({ tags: 1 });

// Compound index for therapist reviews
reviewSchema.index({
  therapistId: 1,
  isPublic: 1,
  moderationStatus: 1,
  createdAt: -1
});

// Virtual for client details
reviewSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for therapist details
reviewSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for booking details
reviewSchema.virtual('booking', {
  ref: 'Booking',
  localField: 'bookingId',
  foreignField: '_id',
  justOne: true
});

// Virtual for review age
reviewSchema.virtual('reviewAge').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
});

// Virtual for has response
reviewSchema.virtual('hasResponse').get(function() {
  return !!(this.response && this.response.trim().length > 0);
});

// Virtual for response time
reviewSchema.virtual('responseTime').get(function() {
  if (!this.responseDate || !this.createdAt) return null;

  const diffMs = this.responseDate - this.createdAt;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} days`;
  if (diffHours > 0) return `${diffHours} hours`;
  return 'Less than 1 hour';
});

// Method to add therapist response
reviewSchema.methods.addResponse = function(responseText, therapistId) {
  if (this.therapistId.toString() !== therapistId.toString()) {
    throw new Error('Only the review\'s therapist can respond');
  }

  if (this.response) {
    throw new Error('Review already has a response');
  }

  this.response = responseText.trim();
  this.responseDate = new Date();

  return this.save();
};

// Method to update response
reviewSchema.methods.updateResponse = function(responseText, therapistId) {
  if (this.therapistId.toString() !== therapistId.toString()) {
    throw new Error('Only the review\'s therapist can update the response');
  }

  if (!this.response) {
    throw new Error('Review does not have a response to update');
  }

  this.response = responseText.trim();
  this.responseDate = new Date();

  return this.save();
};

// Method to mark as helpful
reviewSchema.methods.markAsHelpful = function() {
  this.helpfulCount += 1;
  return this.save();
};

// Method to report review
reviewSchema.methods.reportReview = function(reason, reportedBy, notes = '') {
  this.reportCount += 1;
  this.isReported = true;

  this.reportReasons.push({
    reason,
    reportedBy,
    notes,
    reportedAt: new Date()
  });

  return this.save();
};

// Method to moderate review
reviewSchema.methods.moderate = function(status, moderatorId, notes = '') {
  this.moderationStatus = status;
  this.moderatedBy = moderatorId;
  this.moderatedAt = new Date();
  this.moderationNotes = notes;

  if (status === 'rejected') {
    this.isPublic = false;
  }

  return this.save();
};

// Method to analyze sentiment (basic implementation)
reviewSchema.methods.analyzeSentiment = function() {
  const text = `${this.title} ${this.comment}`.toLowerCase();

  const positiveWords = ['excellent', 'amazing', 'great', 'wonderful', 'fantastic', 'love', 'perfect', 'outstanding', 'exceptional', 'brilliant'];
  const negativeWords = ['terrible', 'awful', 'horrible', 'bad', 'worst', 'hate', 'disappointed', 'poor', 'useless', 'waste'];

  const positiveCount = positiveWords.filter(word => text.includes(word)).length;
  const negativeCount = negativeWords.filter(word => text.includes(word)).length;

  if (this.rating >= 4 && positiveCount > negativeCount) {
    this.sentiment = 'positive';
  } else if (this.rating <= 2 && negativeCount > positiveCount) {
    this.sentiment = 'negative';
  } else {
    this.sentiment = 'neutral';
  }

  return this.sentiment;
};

// Static method to get therapist rating summary
reviewSchema.statics.getTherapistRatingSummary = function(therapistId) {
  return this.aggregate([
    {
      $match: {
        therapistId: new mongoose.Types.ObjectId(therapistId),
        isPublic: true,
        moderationStatus: 'approved'
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        ratingDistribution: {
          $push: '$rating'
        }
      }
    },
    {
      $addFields: {
        ratingBreakdown: {
          $arrayToObject: {
            $map: {
              input: [1, 2, 3, 4, 5],
              as: 'rating',
              in: {
                k: { $toString: '$$rating' },
                v: {
                  $size: {
                    $filter: {
                      input: '$ratingDistribution',
                      cond: { $eq: ['$$this', '$$rating'] }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]);
};

// Static method to get recent reviews for therapist
reviewSchema.statics.getRecentReviews = function(therapistId, limit = 10) {
  return this.find({
    therapistId,
    isPublic: true,
    moderationStatus: 'approved'
  })
  .populate('client', 'name avatar')
  .sort({ createdAt: -1 })
  .limit(limit);
};

// Static method to search reviews
reviewSchema.statics.searchReviews = function(searchQuery, filters = {}) {
  const query = {
    isPublic: true,
    moderationStatus: 'approved',
    ...filters
  };

  if (searchQuery) {
    query.$or = [
      { title: { $regex: searchQuery, $options: 'i' } },
      { comment: { $regex: searchQuery, $options: 'i' } },
      { tags: { $in: [new RegExp(searchQuery, 'i')] } }
    ];
  }

  return this.find(query)
    .populate('client', 'name avatar')
    .populate('therapist', 'name specialties')
    .sort({ createdAt: -1 });
};

// Pre-save middleware
reviewSchema.pre('save', function(next) {
  // Analyze sentiment if this is a new review or content changed
  if (this.isNew || this.isModified('title') || this.isModified('comment') || this.isModified('rating')) {
    this.analyzeSentiment();
  }

  // Set verification based on booking
  if (this.isNew && this.bookingId) {
    this.isVerified = true;
  }

  // Update last edited date if content is modified
  if (this.isModified('title') || this.isModified('comment')) {
    this.lastEditedAt = new Date();
  }

  next();
});

// Post-save middleware to update therapist rating
reviewSchema.post('save', async function() {
  if (this.isNew || this.isModified('rating')) {
    try {
      const User = mongoose.model('User');
      const summary = await this.constructor.getTherapistRatingSummary(this.therapistId);

      if (summary.length > 0) {
        const { averageRating, totalReviews } = summary[0];
        await User.findByIdAndUpdate(this.therapistId, {
          'stats.averageRating': Math.round(averageRating * 10) / 10,
          'stats.totalReviews': totalReviews
        });
      }
    } catch (error) {
      console.error('Error updating therapist rating:', error);
    }
  }
});

// Ensure only one review per client-therapist-booking combination
reviewSchema.index(
  { clientId: 1, therapistId: 1, bookingId: 1 },
  {
    unique: true,
    partialFilterExpression: { bookingId: { $ne: null } }
  }
);

module.exports = mongoose.model('Review', reviewSchema);