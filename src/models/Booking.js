const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Booking date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)']
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
  therapyType: {
    type: String,
    required: [true, 'Therapy type is required'],
    trim: true,
    maxlength: [100, 'Therapy type cannot exceed 100 characters']
  },
  therapyDuration: {
    type: Number,
    required: [true, 'Therapy duration is required'],
    min: [15, 'Minimum duration is 15 minutes'],
    max: [240, 'Maximum duration is 240 minutes'],
    default: 60
  },
  status: {
    type: String,
    enum: ['upcoming', 'pending', 'completed', 'cancelled', 'no_show', 'client_arrived'],
    default: 'upcoming'
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  currency: {
    type: String,
    default: 'EUR',
    enum: ['EUR', 'USD', 'GBP']
  },
  paymentStatus: {
    type: String,
    enum: ['paid', 'unpaid', 'refunded', 'partial'],
    default: 'unpaid'
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'transfer', 'cash', 'online', 'other'],
    default: null
  },
  location: {
    type: String,
    required: [true, 'Location is required']
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  meetingLink: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty values
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Meeting link must be a valid URL'
    }
  },
  sessionDocument: {
    type: String,
    default: null
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TherapyPlan',
    default: null
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  cancellationReason: {
    type: String,
    maxlength: [500, 'Cancellation reason cannot exceed 500 characters']
  },
  cancelledBy: {
    type: String,
    enum: ['client', 'therapist', 'system'],
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  lastStatusChange: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
bookingSchema.index({ therapistId: 1, date: 1 });
bookingSchema.index({ clientId: 1, status: 1 });
bookingSchema.index({ therapistId: 1, status: 1 });
bookingSchema.index({ date: 1, startTime: 1 });
bookingSchema.index({ status: 1, date: 1 });

// Virtual for client details
bookingSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for therapist details
bookingSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for session notes
bookingSchema.virtual('sessionNotes', {
  ref: 'SessionNote',
  localField: '_id',
  foreignField: 'bookingId',
  justOne: true
});

// Virtual for payment
bookingSchema.virtual('payment', {
  ref: 'Payment',
  localField: '_id',
  foreignField: 'bookingId',
  justOne: true
});

// Method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
  const now = new Date();
  const bookingDateTime = new Date(`${this.date.toISOString().split('T')[0]}T${this.startTime}`);
  const hoursDifference = (bookingDateTime - now) / (1000 * 60 * 60);

  return ['upcoming', 'pending'].includes(this.status) && hoursDifference > 24;
};

// Method to check if booking can be rescheduled
bookingSchema.methods.canBeRescheduled = function() {
  const now = new Date();
  const bookingDateTime = new Date(`${this.date.toISOString().split('T')[0]}T${this.startTime}`);
  const hoursDifference = (bookingDateTime - now) / (1000 * 60 * 60);

  return ['upcoming', 'pending'].includes(this.status) && hoursDifference > 48;
};

// Method to get booking duration in minutes
bookingSchema.methods.getDurationMinutes = function() {
  const [startHour, startMin] = this.startTime.split(':').map(Number);
  const [endHour, endMin] = this.endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return endMinutes - startMinutes;
};

// Pre-save middleware to update lastStatusChange
bookingSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.lastStatusChange = new Date();

    // Set cancellation timestamp
    if (['cancelled', 'no_show'].includes(this.status) && !this.cancelledAt) {
      this.cancelledAt = new Date();
    }
  }
  next();
});

// Post-save middleware to update client stats
bookingSchema.post('save', async function() {
  if (this.status === 'completed') {
    const Client = mongoose.model('Client');
    const client = await Client.findById(this.clientId);
    if (client) {
      await client.updateSessionStats();
    }
  }
});

// Static method to find conflicting bookings
bookingSchema.statics.findConflicts = function(therapistId, date, startTime, endTime, excludeId = null) {
  const query = {
    therapistId,
    date,
    status: { $in: ['upcoming', 'pending', 'completed'] },
    $or: [
      {
        $and: [
          { startTime: { $lt: endTime } },
          { endTime: { $gt: startTime } }
        ]
      }
    ]
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return this.find(query);
};

// Static method to get booking statistics
bookingSchema.statics.getStats = function(therapistId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        therapistId: new mongoose.Types.ObjectId(therapistId),
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
};

module.exports = mongoose.model('Booking', bookingSchema);