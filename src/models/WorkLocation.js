const mongoose = require('mongoose');

const workLocationSchema = new mongoose.Schema({
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required']
  },
  name: {
    type: String,
    required: [true, 'Location name is required'],
    trim: true,
    maxlength: [100, 'Location name cannot exceed 100 characters']
  },
  address: {
    street: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true,
      maxlength: [200, 'Street address cannot exceed 200 characters']
    },
    number: {
      type: String,
      trim: true,
      maxlength: [20, 'Street number cannot exceed 20 characters']
    },
    floor: {
      type: String,
      trim: true,
      maxlength: [10, 'Floor cannot exceed 10 characters']
    },
    apartment: {
      type: String,
      trim: true,
      maxlength: [10, 'Apartment cannot exceed 10 characters']
    }
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: [100, 'City cannot exceed 100 characters']
  },
  state: {
    type: String,
    trim: true,
    maxlength: [100, 'State cannot exceed 100 characters']
  },
  postalCode: {
    type: String,
    required: [true, 'Postal code is required'],
    trim: true,
    validate: {
      validator: function(v) {
        // Spanish postal code validation
        return /^[0-5]\d{4}$/.test(v);
      },
      message: 'Please enter a valid Spanish postal code'
    }
  },
  country: {
    type: String,
    default: 'España',
    trim: true,
    maxlength: [50, 'Country cannot exceed 50 characters']
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        // Spanish phone number validation
        return /^(\+34|0034|34)?[6-9]\d{8}$/.test(v.replace(/\s/g, ''));
      },
      message: 'Please enter a valid Spanish phone number'
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  // Location type and characteristics
  locationType: {
    type: String,
    enum: ['office', 'clinic', 'hospital', 'home', 'virtual', 'hybrid'],
    default: 'office'
  },
  accessibility: {
    wheelchairAccess: {
      type: Boolean,
      default: false
    },
    elevator: {
      type: Boolean,
      default: false
    },
    parking: {
      available: {
        type: Boolean,
        default: false
      },
      type: {
        type: String,
        enum: ['free', 'paid', 'street'],
        default: 'street'
      },
      notes: String
    },
    publicTransport: {
      nearby: {
        type: Boolean,
        default: false
      },
      lines: [String],
      walkingDistance: Number // in minutes
    }
  },
  // Schedule for this location
  schedule: {
    monday: {
      enabled: {
        type: Boolean,
        default: false
      },
      start: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      end: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      breaks: [{
        start: String,
        end: String,
        description: String
      }]
    },
    tuesday: {
      enabled: {
        type: Boolean,
        default: false
      },
      start: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      end: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      breaks: [{
        start: String,
        end: String,
        description: String
      }]
    },
    wednesday: {
      enabled: {
        type: Boolean,
        default: false
      },
      start: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      end: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      breaks: [{
        start: String,
        end: String,
        description: String
      }]
    },
    thursday: {
      enabled: {
        type: Boolean,
        default: false
      },
      start: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      end: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      breaks: [{
        start: String,
        end: String,
        description: String
      }]
    },
    friday: {
      enabled: {
        type: Boolean,
        default: false
      },
      start: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      end: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      breaks: [{
        start: String,
        end: String,
        description: String
      }]
    },
    saturday: {
      enabled: {
        type: Boolean,
        default: false
      },
      start: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      end: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      breaks: [{
        start: String,
        end: String,
        description: String
      }]
    },
    sunday: {
      enabled: {
        type: Boolean,
        default: false
      },
      start: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      end: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      breaks: [{
        start: String,
        end: String,
        description: String
      }]
    }
  },
  // Facilities and amenities
  facilities: {
    roomCount: {
      type: Number,
      min: 1,
      default: 1
    },
    waitingArea: {
      type: Boolean,
      default: false
    },
    privateEntrance: {
      type: Boolean,
      default: false
    },
    soundproofing: {
      type: Boolean,
      default: false
    },
    airConditioning: {
      type: Boolean,
      default: false
    },
    wifi: {
      type: Boolean,
      default: false
    },
    bathroom: {
      type: Boolean,
      default: false
    },
    kitchen: {
      type: Boolean,
      default: false
    },
    equipment: [String]
  },
  // Geographic coordinates
  coordinates: {
    latitude: {
      type: Number,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180
    }
  },
  // Operating status
  status: {
    type: String,
    enum: ['active', 'inactive', 'temporarily_closed', 'under_renovation'],
    default: 'active'
  },
  // Pricing for this location
  pricing: {
    baseRate: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'EUR',
      enum: ['EUR', 'USD', 'GBP']
    },
    locationSurcharge: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  // Location images
  images: [{
    url: {
      type: String,
      required: true
    },
    caption: String,
    isMain: {
      type: Boolean,
      default: false
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Emergency information
  emergency: {
    nearestHospital: {
      name: String,
      address: String,
      phone: String,
      distance: Number // in kilometers
    },
    evacuationPlan: String,
    emergencyContacts: [{
      name: String,
      phone: String,
      relationship: String
    }]
  },
  // Insurance and legal
  insurance: {
    covered: {
      type: Boolean,
      default: false
    },
    provider: String,
    policyNumber: String,
    expiryDate: Date
  },
  // Virtual location settings (for online sessions)
  virtualSettings: {
    platform: {
      type: String,
      enum: ['zoom', 'teams', 'meet', 'skype', 'custom'],
      default: null
    },
    meetingRoomId: String,
    accessInstructions: String,
    technicalRequirements: [String],
    backupPlatform: String
  },
  // Booking preferences for this location
  bookingSettings: {
    advanceBookingRequired: {
      type: Number, // hours
      default: 24,
      min: 1,
      max: 168 // 1 week
    },
    maxBookingsPerDay: {
      type: Number,
      default: 8,
      min: 1,
      max: 24
    },
    sessionDurations: [{
      type: Number, // in minutes
      default: [45, 60, 90]
    }],
    bufferTime: {
      type: Number, // minutes between sessions
      default: 15,
      min: 0,
      max: 60
    }
  },
  // Special dates and exceptions
  specialDates: [{
    date: {
      type: Date,
      required: true
    },
    type: {
      type: String,
      enum: ['closed', 'special_hours', 'holiday'],
      required: true
    },
    reason: String,
    alternativeHours: {
      start: String,
      end: String
    }
  }],
  // Notes and additional information
  notes: {
    public: {
      type: String,
      maxlength: [500, 'Public notes cannot exceed 500 characters']
    },
    private: {
      type: String,
      maxlength: [1000, 'Private notes cannot exceed 1000 characters']
    },
    directions: {
      type: String,
      maxlength: [1000, 'Directions cannot exceed 1000 characters']
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
workLocationSchema.index({ therapistId: 1, status: 1 });
workLocationSchema.index({ therapistId: 1, isPrimary: 1 });
workLocationSchema.index({ city: 1, status: 1 });
workLocationSchema.index({ postalCode: 1 });
workLocationSchema.index({ locationType: 1, status: 1 });
workLocationSchema.index({ coordinates: '2dsphere' });

// Virtual for therapist details
workLocationSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

// Virtual for full address
workLocationSchema.virtual('fullAddress').get(function() {
  let address = this.address.street;
  if (this.address.number) address += ` ${this.address.number}`;
  if (this.address.floor) address += `, ${this.address.floor}`;
  if (this.address.apartment) address += ` ${this.address.apartment}`;
  address += `, ${this.city}`;
  if (this.state) address += `, ${this.state}`;
  address += ` ${this.postalCode}`;
  if (this.country !== 'España') address += `, ${this.country}`;
  return address;
});

// Virtual for working days
workLocationSchema.virtual('workingDays').get(function() {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.filter(day => this.schedule[day] && this.schedule[day].enabled);
});

// Virtual for weekly hours
workLocationSchema.virtual('weeklyHours').get(function() {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  let totalMinutes = 0;

  days.forEach(day => {
    const daySchedule = this.schedule[day];
    if (daySchedule && daySchedule.enabled && daySchedule.start && daySchedule.end) {
      const startMinutes = this.timeToMinutes(daySchedule.start);
      const endMinutes = this.timeToMinutes(daySchedule.end);
      totalMinutes += endMinutes - startMinutes;

      // Subtract break time
      if (daySchedule.breaks) {
        daySchedule.breaks.forEach(breakTime => {
          if (breakTime.start && breakTime.end) {
            const breakStart = this.timeToMinutes(breakTime.start);
            const breakEnd = this.timeToMinutes(breakTime.end);
            totalMinutes -= breakEnd - breakStart;
          }
        });
      }
    }
  });

  return Math.round(totalMinutes / 60 * 100) / 100; // Convert to hours with 2 decimal places
});

// Method to convert time string to minutes
workLocationSchema.methods.timeToMinutes = function(timeString) {
  if (!timeString) return 0;
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

// Method to check if location is open at specific date/time
workLocationSchema.methods.isOpenAt = function(dateTime) {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dateTime.getDay()];
  const daySchedule = this.schedule[dayName];

  if (!daySchedule || !daySchedule.enabled) return false;

  const currentTime = `${dateTime.getHours().toString().padStart(2, '0')}:${dateTime.getMinutes().toString().padStart(2, '0')}`;
  const currentMinutes = this.timeToMinutes(currentTime);
  const startMinutes = this.timeToMinutes(daySchedule.start);
  const endMinutes = this.timeToMinutes(daySchedule.end);

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) return false;

  // Check if it's during a break
  if (daySchedule.breaks) {
    for (const breakTime of daySchedule.breaks) {
      const breakStart = this.timeToMinutes(breakTime.start);
      const breakEnd = this.timeToMinutes(breakTime.end);
      if (currentMinutes >= breakStart && currentMinutes <= breakEnd) {
        return false;
      }
    }
  }

  // Check special dates
  const dateString = dateTime.toISOString().split('T')[0];
  const specialDate = this.specialDates.find(sd =>
    sd.date.toISOString().split('T')[0] === dateString
  );

  if (specialDate) {
    if (specialDate.type === 'closed') return false;
    if (specialDate.type === 'special_hours') {
      const altStart = this.timeToMinutes(specialDate.alternativeHours.start);
      const altEnd = this.timeToMinutes(specialDate.alternativeHours.end);
      return currentMinutes >= altStart && currentMinutes <= altEnd;
    }
  }

  return true;
};

// Method to get available slots for a date
workLocationSchema.methods.getAvailableSlots = function(date, sessionDuration = 60) {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[date.getDay()];
  const daySchedule = this.schedule[dayName];

  if (!daySchedule || !daySchedule.enabled) return [];

  const slots = [];
  const startMinutes = this.timeToMinutes(daySchedule.start);
  const endMinutes = this.timeToMinutes(daySchedule.end);
  const bufferTime = this.bookingSettings.bufferTime || 15;

  // Generate slots with buffer time
  for (let time = startMinutes; time + sessionDuration <= endMinutes; time += sessionDuration + bufferTime) {
    const slotStart = this.minutesToTime(time);
    const slotEnd = this.minutesToTime(time + sessionDuration);

    // Check if slot conflicts with breaks
    let conflictsWithBreak = false;
    if (daySchedule.breaks) {
      for (const breakTime of daySchedule.breaks) {
        const breakStart = this.timeToMinutes(breakTime.start);
        const breakEnd = this.timeToMinutes(breakTime.end);
        if (time < breakEnd && time + sessionDuration > breakStart) {
          conflictsWithBreak = true;
          break;
        }
      }
    }

    if (!conflictsWithBreak) {
      slots.push({
        start: slotStart,
        end: slotEnd,
        duration: sessionDuration
      });
    }
  }

  return slots;
};

// Method to convert minutes to time string
workLocationSchema.methods.minutesToTime = function(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Method to set as primary location
workLocationSchema.methods.setPrimary = async function() {
  // Remove primary flag from other locations
  await this.constructor.updateMany(
    { therapistId: this.therapistId, _id: { $ne: this._id } },
    { isPrimary: false }
  );

  this.isPrimary = true;
  return this.save();
};

// Method to calculate distance to coordinates
workLocationSchema.methods.distanceTo = function(latitude, longitude) {
  if (!this.coordinates.latitude || !this.coordinates.longitude) return null;

  const R = 6371; // Earth's radius in kilometers
  const dLat = this.degreesToRadians(latitude - this.coordinates.latitude);
  const dLon = this.degreesToRadians(longitude - this.coordinates.longitude);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(this.degreesToRadians(this.coordinates.latitude)) *
    Math.cos(this.degreesToRadians(latitude)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

// Helper method to convert degrees to radians
workLocationSchema.methods.degreesToRadians = function(degrees) {
  return degrees * (Math.PI / 180);
};

// Static method to find nearby locations
workLocationSchema.statics.findNearby = function(latitude, longitude, maxDistance = 50) {
  return this.find({
    coordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance * 1000 // Convert km to meters
      }
    },
    status: 'active'
  }).populate('therapist', 'name specialties avatar');
};

// Static method to get locations by therapist
workLocationSchema.statics.getByTherapist = function(therapistId, status = 'active') {
  return this.find({ therapistId, status })
    .sort({ isPrimary: -1, createdAt: -1 });
};

// Pre-save middleware
workLocationSchema.pre('save', async function(next) {
  // Ensure only one primary location per therapist
  if (this.isPrimary && this.isModified('isPrimary')) {
    await this.constructor.updateMany(
      { therapistId: this.therapistId, _id: { $ne: this._id } },
      { isPrimary: false }
    );
  }

  // If this is the first location, make it primary
  if (this.isNew) {
    const existingLocations = await this.constructor.countDocuments({
      therapistId: this.therapistId
    });
    if (existingLocations === 0) {
      this.isPrimary = true;
    }
  }

  next();
});

// Pre-validate middleware for schedule times
workLocationSchema.pre('validate', function(next) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  days.forEach(day => {
    const daySchedule = this.schedule[day];
    if (daySchedule && daySchedule.enabled && daySchedule.start && daySchedule.end) {
      const startMinutes = this.timeToMinutes(daySchedule.start);
      const endMinutes = this.timeToMinutes(daySchedule.end);

      if (startMinutes >= endMinutes) {
        return next(new Error(`Invalid schedule for ${day}: end time must be after start time`));
      }
    }
  });

  next();
});

module.exports = mongoose.model('WorkLocation', workLocationSchema);