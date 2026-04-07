const mongoose = require('mongoose');

const professionalProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true
  },
  about: {
    type: String,
    maxlength: [2000, 'About section cannot exceed 2000 characters'],
    trim: true
  },
  therapies: [{
    type: String,
    trim: true,
    maxlength: [100, 'Therapy name cannot exceed 100 characters']
  }],
  isAvailable: {
    type: Boolean,
    default: true
  },
  videoPresentation: {
    url: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true; // Allow empty values
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Video URL must be a valid URL'
      }
    },
    title: {
      type: String,
      maxlength: [200, 'Video title cannot exceed 200 characters'],
      trim: true
    },
    description: {
      type: String,
      maxlength: [500, 'Video description cannot exceed 500 characters'],
      trim: true
    }
  },
  stats: {
    totalSessions: {
      type: Number,
      default: 0,
      min: 0
    },
    activeClients: {
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
    totalClients: {
      type: Number,
      default: 0,
      min: 0
    },
    responseTime: {
      type: Number, // en horas
      default: 24,
      min: 0
    },
    completionRate: {
      type: Number, // porcentaje
      default: 0,
      min: 0,
      max: 100
    },
    satisfactionRate: {
      type: Number, // porcentaje
      default: 0,
      min: 0,
      max: 100
    }
  },
  specializations: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    certification: {
      type: String,
      trim: true
    },
    yearObtained: {
      type: Number,
      min: 1950,
      max: new Date().getFullYear()
    }
  }],
  languages: [{
    language: {
      type: String,
      required: true,
      trim: true
    },
    level: {
      type: String,
      enum: ['basic', 'intermediate', 'advanced', 'native'],
      required: true
    }
  }],
  education: [{
    degree: {
      type: String,
      required: true,
      trim: true
    },
    institution: {
      type: String,
      required: true,
      trim: true
    },
    year: {
      type: Number,
      min: 1950,
      max: new Date().getFullYear()
    },
    description: {
      type: String,
      maxlength: [500, 'Education description cannot exceed 500 characters']
    },
    therapy: {
      type: String,
      trim: true
    }
  }],
  experience: [{
    id: {
      type: String,
      required: true
    },
    position: {
      type: String,
      required: true,
      trim: true
    },
    company: {
      type: String,
      required: true,
      trim: true
    },
    location: {
      type: String,
      trim: true
    },
    startDate: {
      type: String,
      required: true
    },
    endDate: {
      type: String
    },
    isCurrent: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      maxlength: [1000, 'Experience description cannot exceed 1000 characters']
    },
    achievements: [{
      type: String,
      maxlength: [200, 'Achievement cannot exceed 200 characters']
    }]
  }],
  rates: {
    // Campos legacy para compatibilidad hacia atrás
    sessionPrice: {
      type: Number,
      min: 0,
      default: 60
    },
    followUpPrice: {
      type: Number,
      min: 0,
      default: 50
    },
    packagePrice: {
      type: Number,
      min: 0,
      default: 200
    },
    coupleSessionPrice: {
      type: Number,
      min: 0,
      default: 80
    },
    currency: {
      type: String,
      default: 'EUR',
      enum: ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'COP']
    },
    // Nueva estructura personalizable
    customRates: {
      currency: {
        type: String,
        default: 'EUR',
        enum: ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'COP']
      },
      sessions: [{
        id: {
          type: String,
          required: true
        },
        type: {
          type: String,
          required: true,
          enum: ['individual', 'couple', 'group', 'consultation', 'followup', 'online']
        },
        name: {
          type: String,
          required: true,
          maxlength: [100, 'Session name cannot exceed 100 characters']
        },
        duration: {
          type: Number,
          required: true,
          min: [15, 'Session duration must be at least 15 minutes'],
          max: [240, 'Session duration cannot exceed 240 minutes']
        },
        price: {
          type: Number,
          required: true,
          min: [0, 'Price must be positive']
        },
        description: {
          type: String,
          maxlength: [500, 'Description cannot exceed 500 characters']
        }
      }],
      packages: [{
        id: {
          type: String,
          required: true
        },
        name: {
          type: String,
          required: true,
          maxlength: [100, 'Package name cannot exceed 100 characters']
        },
        sessions: {
          type: Number,
          required: true,
          min: [2, 'Package must include at least 2 sessions'],
          max: [20, 'Package cannot exceed 20 sessions']
        },
        sessionType: {
          type: String,
          required: true,
          enum: ['individual', 'couple', 'group', 'consultation', 'followup', 'online']
        },
        price: {
          type: Number,
          required: true,
          min: [0, 'Price must be positive']
        },
        description: {
          type: String,
          maxlength: [500, 'Description cannot exceed 500 characters']
        }
      }]
    }
  },
  workLocations: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    postalCode: {
      type: String,
      required: true,
      trim: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    offersOnline: {
      type: Boolean,
      default: false
    }
  }],
  socialMedia: {
    website: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Website must be a valid URL'
      }
    },
    linkedin: String,
    instagram: String,
    facebook: String
  },
  externalLinks: [{
    id: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['website', 'blog', 'linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'other'],
      required: true
    },
    label: {
      type: String,
      required: true,
      maxlength: [100, 'Link label cannot exceed 100 characters'],
      trim: true
    },
    url: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: 'URL must be a valid URL with http:// or https://'
      }
    }
  }],
  pricingPackages: {
    packages: [{
      id: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: [100, 'Package name cannot exceed 100 characters']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [500, 'Package description cannot exceed 500 characters']
      },
      sessions: {
        type: Number,
        required: true,
        min: [1, 'Package must include at least 1 session']
      },
      originalPrice: {
        type: Number,
        required: true,
        min: [0, 'Original price must be positive']
      },
      discountedPrice: {
        type: Number,
        required: true,
        min: [0, 'Discounted price must be positive']
      },
      validityDays: {
        type: Number,
        default: 90,
        min: [1, 'Validity must be at least 1 day']
      },
      isActive: {
        type: Boolean,
        default: true
      },
      features: [{
        type: String,
        trim: true,
        maxlength: [200, 'Feature cannot exceed 200 characters']
      }]
    }],
    coupons: [{
      id: {
        type: String,
        required: true
      },
      code: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        maxlength: [20, 'Coupon code cannot exceed 20 characters']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [200, 'Coupon description cannot exceed 200 characters']
      },
      discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
      },
      discountValue: {
        type: Number,
        required: true,
        min: [0, 'Discount value must be positive']
      },
      minAmount: {
        type: Number,
        min: [0, 'Minimum amount must be positive']
      },
      maxUses: {
        type: Number,
        min: [1, 'Maximum uses must be at least 1']
      },
      usedCount: {
        type: Number,
        default: 0,
        min: [0, 'Used count cannot be negative']
      },
      validFrom: {
        type: Date
      },
      validUntil: {
        type: Date
      },
      isActive: {
        type: Boolean,
        default: true
      },
      applicableServices: [{
        type: String,
        enum: ['individual', 'couple', 'followup', 'package']
      }]
    }]
  },
  preferences: {
    preferredContactMethod: {
      type: String,
      enum: ['email', 'phone', 'whatsapp', 'platform'],
      default: 'platform'
    },
    autoAcceptBookings: {
      type: Boolean,
      default: false
    },
    requireDeposit: {
      type: Boolean,
      default: false
    },
    cancellationPolicy: {
      type: String,
      maxlength: [500, 'Cancellation policy cannot exceed 500 characters']
    }
  },
  legalInfo: {
    licenses: [{
      id: {
        type: String,
        required: true
      },
      type: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'License type cannot exceed 200 characters']
      },
      number: {
        type: String,
        required: true,
        trim: true,
        maxlength: [100, 'License number cannot exceed 100 characters']
      },
      issuingBody: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Issuing body cannot exceed 200 characters']
      },
      expiryDate: {
        type: String,
        validate: {
          validator: function(v) {
            if (!v) return true; // Allow empty values
            return /^\d{4}-\d{2}-\d{2}$/.test(v);
          },
          message: 'Expiry date must be in YYYY-MM-DD format'
        }
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'pending'],
        default: 'active'
      }
    }],
    professionalRegistration: {
      type: String,
      trim: true,
      maxlength: [1000, 'Professional registration cannot exceed 1000 characters']
    },
    ethicsCode: {
      type: String,
      trim: true,
      maxlength: [1000, 'Ethics code cannot exceed 1000 characters']
    },
    insuranceCoverage: {
      type: String,
      trim: true,
      maxlength: [500, 'Insurance coverage cannot exceed 500 characters']
    },
    dataProtectionCompliance: {
      type: Boolean,
      default: false
    }
  },
  telefono: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters']
  },
  datosFacturacion: {
    nif: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [10, 'NIF/NIE no puede superar 10 caracteres']
    },
    nombreFiscal: {
      type: String,
      trim: true,
      maxlength: [200, 'Nombre fiscal no puede superar 200 caracteres']
    },
    direccionFiscal: {
      calle: { type: String, trim: true },
      codigoPostal: { type: String, trim: true },
      ciudad: { type: String, trim: true },
      provincia: { type: String, trim: true }
    },
    contadorTickets: {
      type: Number,
      default: 0,
      min: 0
    },
    contadorFacturas: {
      type: Number,
      default: 0,
      min: 0
    },
    serieActual: {
      type: String,
      default: () => new Date().getFullYear().toString()
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
professionalProfileSchema.index({ userId: 1 });
professionalProfileSchema.index({ therapies: 1 });
professionalProfileSchema.index({ 'stats.averageRating': -1 });
professionalProfileSchema.index({ isAvailable: 1 });
professionalProfileSchema.index({ 'datosFacturacion.nif': 1 }, { sparse: true });

// Virtual for user details
professionalProfileSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for total years of experience
professionalProfileSchema.virtual('totalExperience').get(function() {
  if (!this.experience || this.experience.length === 0) return 0;

  const totalMonths = this.experience.reduce((total, exp) => {
    const startDate = new Date(exp.startDate);
    const endDate = exp.endDate ? new Date(exp.endDate) : new Date();
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                   (endDate.getMonth() - startDate.getMonth());
    return total + Math.max(0, months);
  }, 0);

  return Math.round(totalMonths / 12 * 10) / 10; // Round to 1 decimal place
});

// Method to update stats
professionalProfileSchema.methods.updateStats = async function() {
  const Client = mongoose.model('Client');
  const Booking = mongoose.model('Booking');
  const Review = mongoose.model('Review');

  const [
    activeClientsCount,
    totalClientsCount,
    completedBookingsCount,
    averageRatingResult,
    totalBookingsCount
  ] = await Promise.all([
    Client.countDocuments({ therapistId: this.userId, status: 'active' }),
    Client.countDocuments({ therapistId: this.userId }),
    Booking.countDocuments({ therapistId: this.userId, status: 'completed' }),
    Review.aggregate([
      { $match: { therapistId: this.userId } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]),
    Booking.countDocuments({ therapistId: this.userId })
  ]);

  // Calculate completion rate
  const completionRate = totalBookingsCount > 0 ?
    (completedBookingsCount / totalBookingsCount) * 100 : 0;

  // Calculate satisfaction rate (ratings >= 4)
  const satisfactionCount = await Review.countDocuments({
    therapistId: this.userId,
    rating: { $gte: 4 }
  });
  const satisfactionRate = averageRatingResult[0]?.count > 0 ?
    (satisfactionCount / averageRatingResult[0].count) * 100 : 0;

  this.stats = {
    totalSessions: completedBookingsCount,
    activeClients: activeClientsCount,
    averageRating: averageRatingResult[0]?.avgRating || 0,
    totalClients: totalClientsCount,
    responseTime: this.stats.responseTime || 24,
    completionRate: Math.round(completionRate),
    satisfactionRate: Math.round(satisfactionRate)
  };

  await this.save();
  return this.stats;
};

// Method to get profile completeness percentage
professionalProfileSchema.methods.getCompletenessPercentage = function() {
  let completed = 0;
  const total = 10;

  if (this.about && this.about.length > 50) completed++;
  if (this.therapies && this.therapies.length > 0) completed++;
  if (this.specializations && this.specializations.length > 0) completed++;
  if (this.languages && this.languages.length > 0) completed++;
  if (this.education && this.education.length > 0) completed++;
  if (this.experience && this.experience.length > 0) completed++;
  if (this.workLocations && this.workLocations.length > 0) completed++;
  if (this.rates && this.rates.sessionPrice > 0) completed++;
  if (this.videoPresentation && this.videoPresentation.url) completed++;
  if (this.socialMedia && this.socialMedia.website) completed++;

  return Math.round((completed / total) * 100);
};

// Pre-save middleware
professionalProfileSchema.pre('save', function(next) {
  // Ensure only one primary work location
  if (this.workLocations && this.workLocations.length > 0) {
    let primaryCount = 0;
    this.workLocations.forEach((location, index) => {
      if (location.isPrimary) {
        primaryCount++;
        if (primaryCount > 1) {
          location.isPrimary = false;
        }
      }
    });

    // If no primary location, make the first one primary
    if (primaryCount === 0 && this.workLocations.length > 0) {
      this.workLocations[0].isPrimary = true;
    }
  }

  next();
});

module.exports = mongoose.model('ProfessionalProfile', professionalProfileSchema);