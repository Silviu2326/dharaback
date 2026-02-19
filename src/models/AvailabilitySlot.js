const mongoose = require('mongoose');

const availabilitySlotSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return value >= this.startDate;
      },
      message: 'End date must be after or equal to start date'
    }
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:mm format']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:mm format'],
    validate: {
      validator: function(value) {
        // Convert times to minutes for comparison
        const startMinutes = this.startTime ?
          parseInt(this.startTime.split(':')[0]) * 60 + parseInt(this.startTime.split(':')[1]) : 0;
        const endMinutes = parseInt(value.split(':')[0]) * 60 + parseInt(value.split(':')[1]);
        return endMinutes > startMinutes;
      },
      message: 'End time must be after start time'
    }
  },
  repeat: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none'
  },
  color: {
    type: String,
    default: 'blue',
    validate: {
      validator: function(v) {
        // Allow hex colors or predefined color names
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v) ||
               ['blue', 'green', 'red', 'yellow', 'purple', 'orange', 'pink', 'gray', 'sage'].includes(v);
      },
      message: 'Color must be a valid hex color or predefined color name'
    }
  },
  type: {
    type: String,
    enum: ['availability', 'unavailable'],
    default: 'availability'
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  timezone: {
    type: String,
    default: 'Europe/Madrid',
    validate: {
      validator: function(v) {
        // Basic timezone validation (you might want to use a library for full validation)
        return /^[A-Z][a-z]+\/[A-Z][a-z_]+$/.test(v);
      },
      message: 'Invalid timezone format'
    }
  },
  // Additional fields for recurring slots
  recurringSettings: {
    interval: {
      type: Number,
      default: 1,
      min: 1,
      max: 52 // Max 52 weeks
    },
    daysOfWeek: [{
      type: Number,
      min: 0, // Sunday
      max: 6  // Saturday
    }],
    endRecurrence: {
      type: Date
    },
    maxOccurrences: {
      type: Number,
      min: 1,
      max: 365
    }
  },
  // Original slot reference for recurring instances
  parentSlotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AvailabilitySlot',
    default: null
  },
  isRecurringInstance: {
    type: Boolean,
    default: false
  },
  // Exclusion dates for recurring slots
  excludedDates: [{
    type: Date
  }],
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
availabilitySlotSchema.index({ therapistId: 1, startDate: 1, endDate: 1 });
availabilitySlotSchema.index({ therapistId: 1, type: 1 });
availabilitySlotSchema.index({ therapistId: 1, isActive: 1 });
availabilitySlotSchema.index({ startDate: 1, endDate: 1 });

// Virtual for therapist details
availabilitySlotSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for duration in minutes
availabilitySlotSchema.virtual('durationMinutes').get(function() {
  const [startHour, startMin] = this.startTime.split(':').map(Number);
  const [endHour, endMin] = this.endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return endMinutes - startMinutes;
});

// Method to check if slot conflicts with existing bookings
availabilitySlotSchema.methods.hasConflictingBookings = async function() {
  const Booking = mongoose.model('Booking');

  const conflictingBookings = await Booking.find({
    therapistId: this.therapistId,
    date: { $gte: this.startDate, $lte: this.endDate },
    status: { $in: ['upcoming', 'pending', 'completed'] },
    $or: [
      {
        $and: [
          { startTime: { $lt: this.endTime } },
          { endTime: { $gt: this.startTime } }
        ]
      }
    ]
  });

  return conflictingBookings.length > 0;
};

// Method to generate recurring slot instances
availabilitySlotSchema.methods.generateRecurringInstances = function() {
  if (this.repeat === 'none') return [];

  const instances = [];
  const settings = this.recurringSettings;
  let currentDate = new Date(this.startDate);
  const endRecurrence = settings.endRecurrence || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default

  let count = 0;
  const maxCount = settings.maxOccurrences || 52;

  while (currentDate <= endRecurrence && count < maxCount) {
    // Skip excluded dates
    if (!this.excludedDates.some(excludedDate =>
      excludedDate.toDateString() === currentDate.toDateString()
    )) {

      let shouldInclude = false;

      switch (this.repeat) {
        case 'daily':
          shouldInclude = true;
          currentDate.setDate(currentDate.getDate() + settings.interval);
          break;
        case 'weekly':
          if (settings.daysOfWeek.length > 0) {
            shouldInclude = settings.daysOfWeek.includes(currentDate.getDay());
          } else {
            shouldInclude = true;
          }
          currentDate.setDate(currentDate.getDate() + (settings.interval * 7));
          break;
        case 'monthly':
          shouldInclude = true;
          currentDate.setMonth(currentDate.getMonth() + settings.interval);
          break;
      }

      if (shouldInclude && currentDate > this.startDate) {
        instances.push({
          ...this.toObject(),
          _id: undefined,
          startDate: new Date(currentDate),
          endDate: new Date(currentDate),
          parentSlotId: this._id,
          isRecurringInstance: true,
          createdAt: undefined,
          updatedAt: undefined
        });
        count++;
      }
    }

    // Advance date if not already advanced
    if (this.repeat === 'daily' || this.repeat === 'weekly' || this.repeat === 'monthly') {
      // Date already advanced in switch statement
    } else {
      break;
    }
  }

  return instances;
};

// Static method to find availability conflicts
availabilitySlotSchema.statics.findConflicts = function(therapistId, startDate, endDate, startTime, endTime, excludeId = null) {
  const query = {
    therapistId,
    isActive: true,
    $or: [
      {
        $and: [
          { startDate: { $lte: endDate } },
          { endDate: { $gte: startDate } }
        ]
      }
    ],
    $and: [
      {
        $or: [
          {
            $and: [
              { startTime: { $lt: endTime } },
              { endTime: { $gt: startTime } }
            ]
          }
        ]
      }
    ]
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return this.find(query);
};

// Static method to get therapist availability for a specific date range
availabilitySlotSchema.statics.getTherapistAvailability = function(therapistId, startDate, endDate) {
  return this.find({
    therapistId,
    type: 'availability',
    isActive: true,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  }).sort({ startDate: 1, startTime: 1 });
};

// Pre-save middleware
availabilitySlotSchema.pre('save', function(next) {
  // Ensure end date is not before start date
  if (this.endDate < this.startDate) {
    this.endDate = this.startDate;
  }

  next();
});

// Post-save middleware to generate recurring instances
availabilitySlotSchema.post('save', async function() {
  if (this.repeat !== 'none' && !this.isRecurringInstance) {
    try {
      const instances = this.generateRecurringInstances();
      if (instances.length > 0) {
        await this.constructor.insertMany(instances);
      }
    } catch (error) {
      console.error('Error generating recurring instances:', error);
    }
  }
});

module.exports = mongoose.model('AvailabilitySlot', availabilitySlotSchema);