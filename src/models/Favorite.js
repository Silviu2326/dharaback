const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
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
  addedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
favoriteSchema.index({ clientId: 1, therapistId: 1 }, { unique: true }); // Prevent duplicate favorites
favoriteSchema.index({ clientId: 1, addedAt: -1 }); // For getting client's favorites ordered by date
favoriteSchema.index({ therapistId: 1 }); // For therapist analytics

// Virtual for therapist details
favoriteSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for client details
favoriteSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Static method to get favorite count for a therapist
favoriteSchema.statics.getFavoriteCount = async function(therapistId) {
  return await this.countDocuments({ therapistId });
};

// Static method to check if therapist is favorited by client
favoriteSchema.statics.isFavorite = async function(clientId, therapistId) {
  const favorite = await this.findOne({ clientId, therapistId });
  return !!favorite;
};

// Static method to get client's favorite therapists
favoriteSchema.statics.getClientFavorites = async function(clientId, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = 'addedAt',
    sortOrder = 'desc'
  } = options;

  const skip = (page - 1) * limit;
  const sortObj = {};
  sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const favorites = await this.find({ clientId })
    .populate({
      path: 'therapistId',
      select: 'name email avatar isVerified isActive',
      populate: {
        path: 'professionalProfile',
        select: 'about therapies rating isAvailable clientsCount yearsExperience'
      }
    })
    .sort(sortObj)
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({ clientId });

  return {
    favorites,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    }
  };
};

// Pre-save middleware to validate therapist exists and is active
favoriteSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('therapistId')) {
    const User = mongoose.model('User');
    const therapist = await User.findById(this.therapistId);

    if (!therapist) {
      return next(new Error('Therapist not found'));
    }

    if (therapist.role !== 'therapist') {
      return next(new Error('User is not a therapist'));
    }

    if (!therapist.isActive) {
      return next(new Error('Therapist is not active'));
    }
  }
  next();
});

// Pre-save middleware to validate client exists and is active
favoriteSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('clientId')) {
    const Client = mongoose.model('Client');
    const client = await Client.findById(this.clientId);

    if (!client) {
      return next(new Error('Client not found'));
    }

    if (client.status !== 'active') {
      return next(new Error('Client is not active'));
    }
  }
  next();
});

module.exports = mongoose.model('Favorite', favoriteSchema);