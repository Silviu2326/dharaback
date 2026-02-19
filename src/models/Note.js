const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  // Identificación básica
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author ID is required'],
    index: true
  },
  authorType: {
    type: String,
    enum: ['therapist', 'client'],
    required: [true, 'Author type is required'],
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client ID is required'],
    index: true
  },
  therapistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Therapist ID is required'],
    index: true
  },

  // Contenido de la nota
  title: {
    type: String,
    required: [true, 'Note title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Note content is required'],
    trim: true,
    minlength: [5, 'Content must be at least 5 characters long'],
    maxlength: [5000, 'Content cannot exceed 5000 characters']
  },

  // Tipo y categoría
  noteType: {
    type: String,
    enum: [
      'general',           // Nota general
      'progress',          // Progreso del cliente
      'concern',           // Preocupación o alerta
      'achievement',       // Logro o milestone
      'reminder',          // Recordatorio
      'homework',          // Tarea para casa
      'reflection',        // Reflexión personal
      'goal',              // Objetivo
      'question',          // Pregunta
      'feedback'           // Retroalimentación
    ],
    default: 'general',
    index: true
  },
  category: {
    type: String,
    enum: [
      'therapy',
      'personal',
      'medication',
      'lifestyle',
      'relationships',
      'work',
      'family',
      'emotions',
      'symptoms',
      'goals',
      'other'
    ],
    default: 'therapy',
    index: true
  },

  // Controles de visibilidad
  visibility: {
    type: String,
    enum: [
      'private',           // Solo visible para el autor
      'therapist_only',    // Solo visible para el terapeuta
      'client_only',       // Solo visible para el cliente
      'shared',            // Visible para ambos (terapeuta y cliente)
      'restricted'         // Acceso restringido (solo admin/supervisor)
    ],
    required: [true, 'Visibility setting is required'],
    default: function() {
      return this.authorType === 'therapist' ? 'therapist_only' : 'shared';
    },
    index: true
  },
  isVisible: {
    type: Boolean,
    default: true,
    index: true
  },
  hiddenFrom: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    hiddenAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Prioridad y estado
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'archived', 'draft'],
    default: 'active',
    index: true
  },

  // Relaciones opcionales
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionNote',
    default: null,
    index: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TherapyPlan',
    default: null,
    index: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null,
    index: true
  },

  // Metadata adicional
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Configuraciones especiales
  isEmergency: {
    type: Boolean,
    default: false,
    index: true
  },
  requiresResponse: {
    type: Boolean,
    default: false
  },
  responseDeadline: {
    type: Date,
    default: null
  },
  isConfidential: {
    type: Boolean,
    default: function() {
      return this.authorType === 'therapist';
    }
  },

  // Fechas importantes
  scheduledFor: {
    type: Date,
    default: null,
    index: true
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },

  // Respuestas y comentarios
  responses: [{
    responderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    responderType: {
      type: String,
      enum: ['therapist', 'client'],
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, 'Response cannot exceed 2000 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isRead: {
      type: Boolean,
      default: false
    }
  }],

  // Historial de cambios
  editHistory: [{
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    editedAt: {
      type: Date,
      default: Date.now
    },
    changes: {
      type: String,
      maxlength: [500, 'Change description cannot exceed 500 characters']
    },
    previousContent: String,
    ipAddress: String
  }],

  // Campos de auditoría
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices compuestos para optimización
noteSchema.index({ clientId: 1, therapistId: 1 });
noteSchema.index({ authorId: 1, createdAt: -1 });
noteSchema.index({ clientId: 1, visibility: 1, isVisible: 1 });
noteSchema.index({ noteType: 1, category: 1 });
noteSchema.index({ isEmergency: 1, priority: 1 });
noteSchema.index({ status: 1, createdAt: -1 });
noteSchema.index({ scheduledFor: 1, isVisible: 1 });
noteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
noteSchema.index({ tags: 1 });

// Virtuales para relaciones
noteSchema.virtual('author', {
  ref: 'User',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

noteSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true
});

noteSchema.virtual('therapist', {
  ref: 'User',
  localField: 'therapistId',
  foreignField: '_id',
  justOne: true
});

noteSchema.virtual('session', {
  ref: 'SessionNote',
  localField: 'sessionId',
  foreignField: '_id',
  justOne: true
});

noteSchema.virtual('plan', {
  ref: 'TherapyPlan',
  localField: 'planId',
  foreignField: '_id',
  justOne: true
});

noteSchema.virtual('booking', {
  ref: 'Booking',
  localField: 'bookingId',
  foreignField: '_id',
  justOne: true
});

// Virtual para contar respuestas
noteSchema.virtual('responseCount').get(function() {
  return this.responses ? this.responses.length : 0;
});

// Virtual para verificar si tiene respuestas sin leer
noteSchema.virtual('hasUnreadResponses').get(function() {
  return this.responses ? this.responses.some(response => !response.isRead) : false;
});

// Virtual para determinar si está vencida
noteSchema.virtual('isExpired').get(function() {
  return this.expiresAt ? new Date() > this.expiresAt : false;
});

// Virtual para determinar si está programada
noteSchema.virtual('isScheduled').get(function() {
  return this.scheduledFor ? new Date() < this.scheduledFor : false;
});

// Métodos de instancia
noteSchema.methods.canBeViewedBy = function(userId, userType) {
  // Si la nota no es visible, solo el autor puede verla
  if (!this.isVisible && this.authorId.toString() !== userId.toString()) {
    return false;
  }

  // Verificar si está oculta específicamente para este usuario
  if (this.hiddenFrom.some(hidden => hidden.userId.toString() === userId.toString())) {
    return false;
  }

  // Verificar permisos según visibilidad
  switch (this.visibility) {
    case 'private':
      return this.authorId.toString() === userId.toString();

    case 'therapist_only':
      return userType === 'therapist' && this.therapistId.toString() === userId.toString();

    case 'client_only':
      return userType === 'client' && this.clientId.toString() === userId.toString();

    case 'shared':
      return (userType === 'therapist' && this.therapistId.toString() === userId.toString()) ||
             (userType === 'client' && this.clientId.toString() === userId.toString());

    case 'restricted':
      return userType === 'admin' || userType === 'supervisor';

    default:
      return false;
  }
};

noteSchema.methods.addResponse = function(responderId, responderType, content) {
  this.responses.push({
    responderId,
    responderType,
    content,
    createdAt: new Date(),
    isRead: false
  });
  return this.save();
};

noteSchema.methods.markResponseAsRead = function(responseId) {
  const response = this.responses.id(responseId);
  if (response) {
    response.isRead = true;
    return this.save();
  }
  return Promise.reject(new Error('Response not found'));
};

noteSchema.methods.hideFromUser = function(userId, reason = 'Hidden by user') {
  // Remover si ya existe
  this.hiddenFrom = this.hiddenFrom.filter(
    hidden => hidden.userId.toString() !== userId.toString()
  );

  // Agregar nueva entrada
  this.hiddenFrom.push({
    userId,
    reason,
    hiddenAt: new Date()
  });

  return this.save();
};

noteSchema.methods.addEditHistory = function(editedBy, changes, previousContent, ipAddress = null) {
  this.editHistory.push({
    editedBy,
    editedAt: new Date(),
    changes,
    previousContent,
    ipAddress
  });

  this.lastModifiedBy = editedBy;
  this.version += 1;

  return this.save();
};

// Métodos estáticos
noteSchema.statics.getVisibleNotes = function(userId, userType, clientId = null, filters = {}) {
  const baseQuery = {
    isVisible: true,
    'hiddenFrom.userId': { $ne: userId }
  };

  // Filtros de visibilidad según tipo de usuario
  if (userType === 'therapist') {
    baseQuery.$or = [
      { visibility: 'therapist_only', therapistId: userId },
      { visibility: 'shared', therapistId: userId }
    ];
  } else if (userType === 'client') {
    baseQuery.$or = [
      { visibility: 'client_only', clientId: userId },
      { visibility: 'shared', clientId: userId }
    ];
  }

  // Filtro por cliente específico
  if (clientId) {
    baseQuery.clientId = clientId;
  }

  // Aplicar filtros adicionales
  const finalQuery = { ...baseQuery, ...filters };

  return this.find(finalQuery)
    .populate('authorId', 'name email')
    .populate('clientId', 'name email')
    .populate('therapistId', 'name email')
    .sort({ createdAt: -1 });
};

noteSchema.statics.getEmergencyNotes = function(therapistId) {
  return this.find({
    therapistId,
    isEmergency: true,
    status: 'active',
    isVisible: true
  })
  .populate('clientId', 'name email phone')
  .populate('authorId', 'name email')
  .sort({ createdAt: -1 });
};

noteSchema.statics.getPendingResponses = function(userId, userType) {
  const query = {
    requiresResponse: true,
    status: 'active',
    isVisible: true
  };

  if (userType === 'therapist') {
    query.therapistId = userId;
    query.authorType = 'client'; // Respuestas pendientes de clientes
  } else {
    query.clientId = userId;
    query.authorType = 'therapist'; // Respuestas pendientes de terapeuta
  }

  return this.find(query)
    .populate('authorId', 'name email')
    .populate('clientId', 'name email')
    .sort({ createdAt: -1 });
};

// Middleware pre-save
noteSchema.pre('save', async function(next) {
  try {
    // Validar que el autor sea parte de la relación terapéutica
    if (this.isNew) {
      if (this.authorType === 'therapist' && this.authorId.toString() !== this.therapistId.toString()) {
        return next(new Error('Therapist author must match therapist ID'));
      }

      if (this.authorType === 'client') {
        // Verificar que el cliente existe y está relacionado con el terapeuta
        const Client = mongoose.model('Client');
        const client = await Client.findById(this.clientId);
        if (!client) {
          return next(new Error('Client not found'));
        }
      }
    }

    // Auto-marcar como emergency si tiene prioridad urgent
    if (this.priority === 'urgent') {
      this.isEmergency = true;
    }

    // Limpiar tags
    if (this.tags) {
      this.tags = this.tags.filter(tag => tag && tag.trim().length > 0);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Middleware post-save
noteSchema.post('save', async function() {
  // Crear notificación si es necesario
  if (this.isEmergency || this.requiresResponse) {
    try {
      const Notification = mongoose.model('Notification');

      const targetUserId = this.authorType === 'therapist' ? this.clientId : this.therapistId;

      await Notification.create({
        userId: targetUserId,
        type: this.isEmergency ? 'emergency_note' : 'note_response_required',
        title: this.isEmergency ? 'Nota de emergencia' : 'Respuesta requerida',
        message: `Nueva nota: ${this.title}`,
        data: {
          noteId: this._id,
          authorType: this.authorType,
          priority: this.priority
        }
      });
    } catch (error) {
      console.error('Error creating notification for note:', error);
    }
  }
});

module.exports = mongoose.model('Note', noteSchema);