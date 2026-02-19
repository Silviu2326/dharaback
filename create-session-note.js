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

async function createSessionNote() {
  try {
    const clientId = '68cfc617bc117d557a0fde4e';

    console.log('🔍 Buscando cliente...');
    const client = await Client.findById(clientId);
    if (!client) {
      console.log('❌ Cliente no encontrado');
      return;
    }
    console.log('✅ Cliente encontrado:', client.name);

    console.log('🔍 Buscando bookings para el cliente...');
    const bookings = await Booking.find({ clientId }).sort({ date: -1 }).limit(5);
    console.log(`📅 Encontrados ${bookings.length} bookings`);

    if (bookings.length === 0) {
      console.log('⚠️ No hay bookings para este cliente. Creando uno primero...');

      // Buscar un terapeuta para asignar
      const therapist = await User.findOne({ role: 'therapist' });
      if (!therapist) {
        console.log('❌ No se encontró ningún terapeuta');
        return;
      }

      // Crear un booking de ejemplo
      const newBooking = new Booking({
        clientId: clientId,
        therapistId: therapist._id,
        date: new Date(),
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

      await newBooking.save();
      console.log('✅ Booking creado:', newBooking._id);
      bookings.push(newBooking);
    }

    // Usar el booking más reciente
    const latestBooking = bookings[0];
    console.log('📝 Usando booking:', latestBooking._id);

    // Verificar si ya existe una nota para este booking
    const existingNote = await SessionNote.findOne({ bookingId: latestBooking._id });
    if (existingNote) {
      console.log('⚠️ Ya existe una nota para este booking');
      console.log('📄 Nota existente:', existingNote._id);
      return;
    }

    // Crear la nota de sesión
    const sessionNote = new SessionNote({
      bookingId: latestBooking._id,
      therapistId: latestBooking.therapistId,
      clientId: clientId,
      notes: `Sesión muy productiva con ${client.name}. El cliente mostró una actitud positiva y colaborativa durante toda la sesión. Se trabajaron técnicas de relajación y manejo de ansiedad. El cliente expresó sentirse más optimista y con herramientas para gestionar sus emociones.`,
      objectives: [
        'Practicar técnicas de respiración diafragmática',
        'Identificar pensamientos negativos automáticos',
        'Desarrollar estrategias de afrontamiento saludables'
      ],
      homework: [
        'Realizar ejercicios de respiración 10 minutos diarios',
        'Llevar un diario de pensamientos y emociones',
        'Practicar mindfulness antes de dormir'
      ],
      nextSteps: 'Continuar trabajando con técnicas cognitivo-conductuales. Evaluar progreso en la siguiente sesión y ajustar plan terapéutico según necesidad.',
      mood: 'good',
      progress: 'moderate',
      sessionType: 'follow_up',
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
        level: 'low',
        notes: 'Cliente estable, sin indicadores de riesgo actual',
        flagged: false
      },
      clinicalMeasures: {
        anxiety: 4,
        depression: 3,
        stress: 5,
        functioning: 7
      },
      sessionDuration: latestBooking.therapyDuration || 60,
      tags: ['ansiedad', 'tcc', 'progreso-positivo', 'colaborativo'],
      isConfidential: true
    });

    await sessionNote.save();
    console.log('✅ Nota de sesión creada exitosamente!');
    console.log('📋 ID de la nota:', sessionNote._id);
    console.log('🎯 Puntuación de bienestar:', sessionNote.wellnessScore);
    console.log('📊 Resumen de sesión:', sessionNote.sessionSummary);

  } catch (error) {
    console.error('❌ Error creando nota de sesión:', error);
  } finally {
    mongoose.connection.close();
  }
}

createSessionNote();