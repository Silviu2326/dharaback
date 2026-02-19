const mongoose = require('mongoose');

const absenceSchema = new mongoose.Schema({
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
  allDay: {
    type: Boolean,
    default: true
  },
  startTime: {
    type: String,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:mm format'],
    validate: {
      validator: function(value) {
        // If allDay is true, times are not required
        if (this.allDay) return true;
        // If not allDay, start time is required
        return value != null && value !== '';
      },
      message: 'Start time is required when not all day'
    }
  },
  endTime: {
    type: String,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:mm format'],
    validate: {
      validator: function(value) {
        // If allDay is true, times are not required
        if (this.allDay) return true;
        // If not allDay, end time is required and must be after start time
        if (!value) return false;

        if (this.startTime) {
          const startMinutes = parseInt(this.startTime.split(':')[0]) * 60 + parseInt(this.startTime.split(':')[1]);
          const endMinutes = parseInt(value.split(':')[0]) * 60 + parseInt(value.split(':')[1]);
          return endMinutes > startMinutes;
        }
        return true;
      },
      message: 'End time is required when not all day and must be after start time'
    }
  },
  absenceType: {
    type: String,
    enum: ['vacation', 'sick_leave', 'conference', 'personal', 'emergency', 'training', 'other'],
    required: [true, 'Absence type is required']
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    trim: true
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  // Additional fields for better absence management
  isApproved: {
    type: Boolean,
    default: true // Auto-approve for self-managed therapists
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['weekly', 'monthly', 'yearly'],
      default: null
    },
    interval: {
      type: Number,
      min: 1,
      default: 1
    },
    daysOfWeek: [{
      type: Number,
      min: 0, // Sunday
      max: 6  // Saturday
    }],
    endRecurrence: {
      type: Date
    }
  },
  parentAbsenceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Absence',
    default: null
  },
  affectedBookings: [{
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking'
    },
    action: {
      type: String,
      enum: ['cancelled', 'rescheduled', 'maintained'],
      default: 'cancelled'
    },
    newDate: Date,
    newTime: String
  }],
  notificationsSent: {
    type: Boolean,
    default: false
  },
  color: {
    type: String,
    default: 'red',
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v) ||
               ['red', 'orange', 'yellow', 'blue', 'purple', 'gray'].includes(v);
      },
      message: 'Color must be a valid hex color or predefined color name'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
absenceSchema.index({ therapistId: 1, startDate: 1, endDate: 1 });
absenceSchema.index({ therapistId: 1, absenceType: 1 });
absenceSchema.index({ therapistId: 1, isApproved: 1 });
absenceSchema.index({ startDate: 1, endDate: 1 });
absenceSchema.index({ parentAbsenceId: 1 });

// Virtual for therapist details
absenceSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for approver details
absenceSchema.virtual('approver', {
  ref: 'User',
  localField: 'approvedBy',
  foreignField: '_id',
  justOne: true
});

// Virtual for duration in days
absenceSchema.virtual('durationDays').get(function() {
  const startDate = new Date(this.startDate);
  const endDate = new Date(this.endDate);
  const diffTime = Math.abs(endDate - startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
});

// Virtual for formatted date range
absenceSchema.virtual('dateRange').get(function() {
  const startDate = this.startDate.toLocaleDateString('es-ES');
  const endDate = this.endDate.toLocaleDateString('es-ES');

  if (startDate === endDate) {
    return startDate;
  }
  return `${startDate} - ${endDate}`;
});

// Method to check for conflicting bookings
absenceSchema.methods.getConflictingBookings = async function() {
  const Booking = mongoose.model('Booking');

  const query = {
    therapistId: this.therapistId,
    date: { $gte: this.startDate, $lte: this.endDate },
    status: { $in: ['upcoming', 'pending'] }
  };

  // If not all day, also check time conflicts
  if (!this.allDay && this.startTime && this.endTime) {
    query.$or = [
      {
        $and: [
          { startTime: { $lt: this.endTime } },
          { endTime: { $gt: this.startTime } }
        ]
      }
    ];
  }

  return await Booking.find(query).populate('clientId', 'name email phone');
};

// Method to handle affected bookings
absenceSchema.methods.handleAffectedBookings = async function(action = 'cancel') {
  const conflictingBookings = await this.getConflictingBookings();

  for (const booking of conflictingBookings) {
    switch (action) {
      case 'cancel':
        booking.status = 'cancelled';
        booking.cancellationReason = `Therapist absence: ${this.title}`;
        booking.cancelledBy = 'therapist';
        await booking.save();
        break;
      case 'reschedule':
        // This would require additional logic to find available slots
        // For now, just mark as needing rescheduling
        booking.notes = `${booking.notes || ''}\n[NEEDS RESCHEDULING - Therapist absence: ${this.title}]`;
        await booking.save();
        break;
      default:
        // Do nothing, maintain booking
        break;
    }

    this.affectedBookings.push({
      bookingId: booking._id,
      action: action === 'cancel' ? 'cancelled' : 'rescheduled'
    });
  }

  await this.save();
  return conflictingBookings;
};

// Method to generate recurring absence instances
absenceSchema.methods.generateRecurringInstances = function() {
  if (!this.isRecurring || !this.recurringPattern.frequency) return [];

  const instances = [];
  const pattern = this.recurringPattern;
  let currentStartDate = new Date(this.startDate);
  let currentEndDate = new Date(this.endDate);
  const endRecurrence = pattern.endRecurrence || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  let count = 0;
  const maxInstances = 50; // Prevent infinite loops

  while (currentStartDate <= endRecurrence && count < maxInstances) {
    // Calculate next occurrence based on frequency
    switch (pattern.frequency) {
      case 'weekly':
        currentStartDate.setDate(currentStartDate.getDate() + (7 * pattern.interval));
        currentEndDate.setDate(currentEndDate.getDate() + (7 * pattern.interval));
        break;
      case 'monthly':
        currentStartDate.setMonth(currentStartDate.getMonth() + pattern.interval);
        currentEndDate.setMonth(currentEndDate.getMonth() + pattern.interval);
        break;
      case 'yearly':
        currentStartDate.setFullYear(currentStartDate.getFullYear() + pattern.interval);
        currentEndDate.setFullYear(currentEndDate.getFullYear() + pattern.interval);
        break;
    }

    if (currentStartDate > this.startDate && currentStartDate <= endRecurrence) {
      instances.push({
        ...this.toObject(),
        _id: undefined,
        startDate: new Date(currentStartDate),
        endDate: new Date(currentEndDate),
        parentAbsenceId: this._id,
        isRecurring: false, // Instances are not recurring themselves
        createdAt: undefined,
        updatedAt: undefined
      });
      count++;
    }
  }

  return instances;
};

// Static method to find absence conflicts
absenceSchema.statics.findConflicts = function(therapistId, startDate, endDate, excludeId = null) {
  const query = {
    therapistId,
    isApproved: true,
    $or: [
      {
        $and: [
          { startDate: { $lte: endDate } },
          { endDate: { $gte: startDate } }
        ]
      }
    ]
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return this.find(query);
};

// Static method to get therapist absences for a date range
absenceSchema.statics.getTherapistAbsences = function(therapistId, startDate, endDate) {
  return this.find({
    therapistId,
    isApproved: true,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  }).sort({ startDate: 1 });
};

// Static method to get absence statistics
absenceSchema.statics.getAbsenceStats = function(therapistId, year) {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31);

  return this.aggregate([
    {
      $match: {
        therapistId: new mongoose.Types.ObjectId(therapistId),
        isApproved: true,
        startDate: { $gte: startOfYear, $lte: endOfYear }
      }
    },
    {
      $group: {
        _id: '$absenceType',
        count: { $sum: 1 },
        totalDays: {
          $sum: {
            $add: [
              {
                $divide: [
                  { $subtract: ['$endDate', '$startDate'] },
                  1000 * 60 * 60 * 24
                ]
              },
              1
            ]
          }
        }
      }
    }
  ]);
};

// Pre-save middleware
absenceSchema.pre('save', function(next) {
  // Auto-approve if no approval workflow
  if (this.isNew && this.isApproved && !this.approvedBy) {
    this.approvedAt = new Date();
  }

  // Clear time fields if all day
  if (this.allDay) {
    this.startTime = undefined;
    this.endTime = undefined;
  }

  next();
});

// Post-save middleware for recurring instances
absenceSchema.post('save', async function() {
  if (this.isRecurring && !this.parentAbsenceId && this.isNew) {
    try {
      const instances = this.generateRecurringInstances();
      if (instances.length > 0) {
        await this.constructor.insertMany(instances);
      }
    } catch (error) {
      console.error('Error generating recurring absence instances:', error);
    }
  }
});

module.exports = mongoose.model('Absence', absenceSchema);