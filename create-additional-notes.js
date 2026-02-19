const mongoose = require('mongoose');
const SessionNote = require('./src/models/SessionNote');
const Booking = require('./src/models/Booking');
const Client = require('./src/models/Client');
const User = require('./src/models/User');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/dharaterapeutas', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function createAdditionalNotes() {
  try {
    const clientId = '68cfc617bc117d557a0fde4e';

    // Buscar el terapeuta
    const therapist = await User.findOne({ role: 'therapist' });
    if (!therapist) {
      console.log('❌ No se encontró ningún terapeuta');
      return;
    }

    // Crear múltiples bookings y notas
    const notesData = [
      {
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Hace 1 semana
        notes: 'Primera sesión de seguimiento. El cliente muestra signos de mejora significativa en el manejo de la ansiedad. Ha estado practicando las técnicas de respiración con regularidad.',
        mood: 'good',
        progress: 'significant',
        objectives: [
          'Consolidar técnicas de respiración aprendidas',
          'Trabajar en la autoestima y autoconcepto',
          'Preparar estrategias para situaciones estresantes'
        ],
        homework: [
          'Continuar con ejercicios de respiración diarios',
          'Escribir 3 logros personales cada día',
          'Aplicar técnicas de relajación en situaciones de estrés'
        ],
        clinicalMeasures: { anxiety: 3, depression: 2, stress: 4, functioning: 8 },
        tags: ['mejora', 'respiracion', 'autoestima']
      },
      {
        date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // Hace 2 semanas
        notes: 'Sesión enfocada en identificar triggers de ansiedad. El cliente pudo identificar varios patrones de pensamiento negativo. Trabajamos en técnicas de reestructuración cognitiva.',
        mood: 'fair',
        progress: 'moderate',
        objectives: [
          'Identificar pensamientos automáticos negativos',
          'Practicar técnicas de cuestionamiento de pensamientos',
          'Desarrollar pensamientos alternativos más adaptativos'
        ],
        homework: [
          'Llevar registro de pensamientos automáticos durante la semana',
          'Practicar técnica de los 5 sentidos para grounding',
          'Leer material sobre distorsiones cognitivas'
        ],
        clinicalMeasures: { anxiety: 5, depression: 4, stress: 6, functioning: 6 },
        tags: ['triggers', 'pensamientos', 'reestructuracion']
      },
      {
        date: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), // Hace 3 semanas
        notes: 'Sesión inicial de evaluación. El cliente presenta síntomas de ansiedad generalizada con algunos episodios de pánico. Establecimos objetivos terapéuticos y plan de tratamiento.',
        mood: 'poor',
        progress: 'minimal',
        sessionType: 'initial',
        objectives: [
          'Establecer rapport terapéutico',
          'Completar evaluación inicial',
          'Psicoeducación sobre ansiedad y ataques de pánico'
        ],
        homework: [
          'Completar cuestionarios de evaluación en casa',
          'Observar y registrar síntomas de ansiedad',
          'Comenzar técnicas básicas de respiración'
        ],
        clinicalMeasures: { anxiety: 7, depression: 5, stress: 8, functioning: 4 },
        tags: ['evaluacion', 'inicial', 'establecimiento'],
        riskLevel: 'moderate'
      }
    ];

    for (let i = 0; i < notesData.length; i++) {
      const noteData = notesData[i];

      // Crear booking para esta nota
      const booking = new Booking({
        clientId: clientId,
        therapistId: therapist._id,
        date: noteData.date,
        startTime: '10:00',
        endTime: '11:00',
        status: 'completed',
        therapyType: 'Terapia Individual',
        therapyDuration: 60,
        amount: 75,
        location: 'Consulta Online',
        notes: 'Sesión completada satisfactoriamente',
        paymentStatus: 'paid',
        paymentMethod: 'card'
      });

      await booking.save();
      console.log(`✅ Booking ${i + 1} creado:`, booking._id);

      // Crear nota de sesión
      const sessionNote = new SessionNote({
        bookingId: booking._id,
        therapistId: therapist._id,
        clientId: clientId,
        notes: noteData.notes,
        objectives: noteData.objectives,
        homework: noteData.homework,
        nextSteps: 'Continuar con el plan terapéutico establecido. Revisar progreso en próxima sesión.',
        mood: noteData.mood,
        progress: noteData.progress,
        sessionType: noteData.sessionType || 'follow_up',
        treatmentPlan: {
          interventions: [
            'Terapia cognitivo-conductual',
            'Técnicas de relajación',
            'Mindfulness'
          ],
          techniques: [
            'Reestructuración cognitiva',
            'Respiración diafragmática',
            'Registro de pensamientos'
          ]
        },
        riskAssessment: {
          level: noteData.riskLevel || 'low',
          notes: 'Evaluación de riesgo dentro de parámetros normales',
          flagged: false
        },
        clinicalMeasures: noteData.clinicalMeasures,
        sessionDuration: 60,
        tags: noteData.tags,
        isConfidential: true
      });

      await sessionNote.save();
      console.log(`✅ Nota de sesión ${i + 1} creada:`, sessionNote._id);
      console.log(`🎯 Puntuación de bienestar: ${sessionNote.wellnessScore}`);
    }

    console.log('\n🎉 ¡Todas las notas adicionales han sido creadas exitosamente!');

  } catch (error) {
    console.error('❌ Error creando notas adicionales:', error);
  } finally {
    mongoose.connection.close();
  }
}

createAdditionalNotes();