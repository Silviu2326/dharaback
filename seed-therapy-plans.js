const mongoose = require('mongoose');
const TherapyPlan = require('./src/models/TherapyPlan');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dharaterapeutas');
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const therapyPlans = [
  {
    name: 'Plan de Ansiedad Generalizada',
    type: 'ansiedad',
    description: 'Plan terapéutico integral para el tratamiento de la ansiedad generalizada utilizando técnicas cognitivo-conductuales y mindfulness.',
    duration: 12,
    sessionsPerWeek: 1,
    totalSessions: 12,
    status: 'active',
    objectives: [
      'Reducir los niveles de ansiedad generalizada',
      'Desarrollar técnicas de relajación y respiración',
      'Identificar y modificar pensamientos negativos automáticos',
      'Mejorar la calidad del sueño',
      'Aumentar la tolerancia a la incertidumbre'
    ],
    techniques: [
      {
        name: 'Técnicas de respiración diafragmática',
        description: 'Ejercicios de respiración para reducir la activación fisiológica',
        sessionNumbers: [1, 2, 3]
      },
      {
        name: 'Reestructuración cognitiva',
        description: 'Identificación y modificación de pensamientos disfuncionales',
        sessionNumbers: [3, 4, 5, 6]
      },
      {
        name: 'Relajación muscular progresiva',
        description: 'Técnica de relajación muscular para reducir tensión',
        sessionNumbers: [2, 3, 4]
      },
      {
        name: 'Mindfulness y atención plena',
        description: 'Práctica de mindfulness para la gestión de la ansiedad',
        sessionNumbers: [5, 6, 7, 8]
      }
    ],
    homework: [
      {
        title: 'Registro de pensamientos ansiosos',
        description: 'Llevar un diario de situaciones que generan ansiedad y los pensamientos asociados',
        sessionNumber: 1,
        estimatedTime: 15,
        resources: ['Formato de registro', 'Guía de identificación de pensamientos']
      },
      {
        title: 'Práctica diaria de respiración',
        description: 'Realizar ejercicios de respiración diafragmática 2 veces al día durante 10 minutos',
        sessionNumber: 2,
        estimatedTime: 20,
        resources: ['Audio guiado de respiración']
      },
      {
        title: 'Ejercicios de relajación muscular',
        description: 'Practicar la relajación muscular progresiva antes de dormir',
        sessionNumber: 3,
        estimatedTime: 25,
        resources: ['Audio de relajación muscular']
      }
    ],
    therapistId: new mongoose.Types.ObjectId('68ce20c17931a40b74af366a'),
    category: 'individual',
    ageGroup: 'adult',
    difficulty: 'intermediate',
    tags: ['ansiedad', 'cbt', 'mindfulness', 'relajacion'],
    assessmentTools: [
      {
        name: 'Inventario de Ansiedad de Beck (BAI)',
        description: 'Evaluación del nivel de ansiedad',
        frequency: 'initial'
      },
      {
        name: 'Escala de Ansiedad y Depresión Hospitalaria',
        description: 'Medición del progreso semanal',
        frequency: 'weekly'
      }
    ],
    pricing: {
      sessionPrice: 60,
      packagePrice: 650,
      currency: 'EUR'
    }
  },
  {
    name: 'Terapia Cognitivo-Conductual para Depresión',
    type: 'depresion',
    description: 'Programa estructurado de TCC para el tratamiento de episodios depresivos mayores y distimia.',
    duration: 16,
    sessionsPerWeek: 1,
    totalSessions: 16,
    status: 'active',
    objectives: [
      'Reducir los síntomas depresivos',
      'Incrementar actividades placenteras y significativas',
      'Mejorar el estado de ánimo y la motivación',
      'Desarrollar estrategias de afrontamiento efectivas',
      'Prevenir recaídas futuras'
    ],
    techniques: [
      {
        name: 'Activación conductual',
        description: 'Programación de actividades placenteras y significativas',
        sessionNumbers: [1, 2, 3, 4]
      },
      {
        name: 'Técnicas cognitivas',
        description: 'Identificación y modificación de pensamientos depresivos',
        sessionNumbers: [4, 5, 6, 7, 8]
      },
      {
        name: 'Prevención de recaídas',
        description: 'Desarrollo de plan de prevención y manejo de crisis',
        sessionNumbers: [14, 15, 16]
      }
    ],
    homework: [
      {
        title: 'Registro de actividades y estado de ánimo',
        description: 'Monitorear actividades diarias y su impacto en el estado de ánimo',
        sessionNumber: 1,
        estimatedTime: 10,
        resources: ['Formato de registro de actividades']
      },
      {
        title: 'Programación de actividades placenteras',
        description: 'Planificar y realizar al menos 2 actividades placenteras por semana',
        sessionNumber: 2,
        estimatedTime: 30,
        resources: ['Lista de actividades placenteras']
      }
    ],
    therapistId: new mongoose.Types.ObjectId('68ce20c17931a40b74af366a'),
    category: 'individual',
    ageGroup: 'adult',
    difficulty: 'intermediate',
    tags: ['depresion', 'cbt', 'activacion-conductual'],
    assessmentTools: [
      {
        name: 'Inventario de Depresión de Beck (BDI-II)',
        description: 'Evaluación del nivel de depresión',
        frequency: 'initial'
      }
    ],
    pricing: {
      sessionPrice: 65,
      packagePrice: 980,
      currency: 'EUR'
    }
  },
  {
    name: 'Terapia de Pareja - Enfoque Sistémico',
    type: 'pareja',
    description: 'Intervención terapéutica para parejas con dificultades de comunicación y conflictos relacionales.',
    duration: 20,
    sessionsPerWeek: 1,
    totalSessions: 20,
    status: 'active',
    objectives: [
      'Mejorar la comunicación en la pareja',
      'Resolver conflictos de manera constructiva',
      'Fortalecer la intimidad emocional',
      'Desarrollar acuerdos y compromisos mutuos',
      'Reconstruir la confianza'
    ],
    techniques: [
      {
        name: 'Técnicas de comunicación asertiva',
        description: 'Entrenamiento en habilidades de comunicación efectiva',
        sessionNumbers: [2, 3, 4, 5]
      },
      {
        name: 'Resolución de conflictos',
        description: 'Estrategias para la resolución constructiva de disputas',
        sessionNumbers: [6, 7, 8]
      },
      {
        name: 'Ejercicios de intimidad',
        description: 'Actividades para fortalecer la conexión emocional',
        sessionNumbers: [10, 11, 12]
      }
    ],
    homework: [
      {
        title: 'Tiempo de calidad diario',
        description: 'Dedicar 30 minutos diarios a conversación sin dispositivos',
        sessionNumber: 3,
        estimatedTime: 30,
        resources: ['Guía de temas de conversación']
      },
      {
        title: 'Registro de conflictos',
        description: 'Documentar situaciones conflictivas y las estrategias utilizadas',
        sessionNumber: 6,
        estimatedTime: 15,
        resources: ['Formato de registro de conflictos']
      }
    ],
    therapistId: new mongoose.Types.ObjectId('68ce20c17931a40b74af366a'),
    category: 'couple',
    ageGroup: 'adult',
    difficulty: 'advanced',
    tags: ['pareja', 'comunicacion', 'sistemico', 'conflictos'],
    assessmentTools: [
      {
        name: 'Escala de Ajuste Diádico',
        description: 'Evaluación de la satisfacción en la relación',
        frequency: 'initial'
      }
    ],
    pricing: {
      sessionPrice: 80,
      packagePrice: 1500,
      currency: 'EUR'
    }
  },
  {
    name: 'Tratamiento EMDR para Trauma',
    type: 'trauma',
    description: 'Protocolo EMDR para el procesamiento de experiencias traumáticas y reducción de síntomas de TEPT.',
    duration: 15,
    sessionsPerWeek: 1,
    totalSessions: 15,
    status: 'active',
    objectives: [
      'Procesar memorias traumáticas',
      'Reducir síntomas de TEPT',
      'Desarrollar recursos internos de afrontamiento',
      'Mejorar la regulación emocional',
      'Restaurar el sentido de seguridad'
    ],
    techniques: [
      {
        name: 'Preparación y estabilización',
        description: 'Desarrollo de recursos y técnicas de autorregulación',
        sessionNumbers: [1, 2, 3]
      },
      {
        name: 'Procesamiento EMDR',
        description: 'Procesamiento bilateral de memorias traumáticas',
        sessionNumbers: [4, 5, 6, 7, 8, 9, 10]
      },
      {
        name: 'Integración y cierre',
        description: 'Consolidación del procesamiento y prevención de recaídas',
        sessionNumbers: [11, 12, 13, 14, 15]
      }
    ],
    homework: [
      {
        title: 'Práctica de lugar seguro',
        description: 'Visualización diaria del lugar seguro por 10 minutos',
        sessionNumber: 2,
        estimatedTime: 10,
        resources: ['Audio guiado de lugar seguro']
      },
      {
        title: 'Registro de síntomas',
        description: 'Monitorear síntomas de trauma entre sesiones',
        sessionNumber: 4,
        estimatedTime: 5,
        resources: ['Escala de síntomas de trauma']
      }
    ],
    therapistId: new mongoose.Types.ObjectId('68ce20c17931a40b74af366a'),
    category: 'individual',
    ageGroup: 'adult',
    difficulty: 'advanced',
    tags: ['trauma', 'emdr', 'tept', 'regulacion-emocional'],
    assessmentTools: [
      {
        name: 'Escala de Impacto de Eventos (IES-R)',
        description: 'Evaluación de síntomas de trauma',
        frequency: 'initial'
      }
    ],
    pricing: {
      sessionPrice: 75,
      packagePrice: 1050,
      currency: 'EUR'
    }
  },
  {
    name: 'Programa de Autoestima y Confianza',
    type: 'autoestima',
    description: 'Plan integral para fortalecer la autoestima, desarrollar la confianza personal y mejorar la autoimagen.',
    duration: 10,
    sessionsPerWeek: 1,
    totalSessions: 10,
    status: 'active',
    objectives: [
      'Incrementar la autoestima y autoaceptación',
      'Desarrollar una autoimagen positiva',
      'Fortalecer la confianza en las propias capacidades',
      'Reducir la autocrítica destructiva',
      'Establecer límites saludables'
    ],
    techniques: [
      {
        name: 'Reestructuración cognitiva',
        description: 'Modificación de pensamientos negativos sobre uno mismo',
        sessionNumbers: [2, 3, 4]
      },
      {
        name: 'Técnicas de autoaceptación',
        description: 'Ejercicios para desarrollar compasión hacia uno mismo',
        sessionNumbers: [5, 6, 7]
      },
      {
        name: 'Entrenamiento en asertividad',
        description: 'Desarrollo de habilidades para expresar necesidades',
        sessionNumbers: [7, 8, 9]
      }
    ],
    homework: [
      {
        title: 'Diario de logros diarios',
        description: 'Registrar al menos 3 logros o aspectos positivos cada día',
        sessionNumber: 1,
        estimatedTime: 10,
        resources: ['Formato de diario de logros']
      },
      {
        title: 'Ejercicios de autocompasión',
        description: 'Practicar técnicas de autocompasión cuando surja autocrítica',
        sessionNumber: 5,
        estimatedTime: 15,
        resources: ['Guía de autocompasión']
      }
    ],
    therapistId: new mongoose.Types.ObjectId('68ce20c17931a40b74af366a'),
    category: 'individual',
    ageGroup: 'adult',
    difficulty: 'beginner',
    tags: ['autoestima', 'confianza', 'asertividad', 'autocompasion'],
    assessmentTools: [
      {
        name: 'Escala de Autoestima de Rosenberg',
        description: 'Evaluación del nivel de autoestima',
        frequency: 'initial'
      }
    ],
    pricing: {
      sessionPrice: 55,
      packagePrice: 500,
      currency: 'EUR'
    }
  }
];

const seedTherapyPlans = async () => {
  try {
    console.log('🌱 Starting therapy plans seeding...');

    // Clear existing therapy plans
    await TherapyPlan.deleteMany({});
    console.log('🧹 Cleared existing therapy plans');

    // Insert new therapy plans
    const insertedPlans = await TherapyPlan.insertMany(therapyPlans);
    console.log(`✅ Successfully created ${insertedPlans.length} therapy plans`);

    // Display created plans
    insertedPlans.forEach((plan, index) => {
      console.log(`${index + 1}. ${plan.name} (${plan.type}) - ${plan.totalSessions} sessions`);
    });

    console.log('\n🎉 Therapy plans seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding therapy plans:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔐 Database connection closed');
  }
};

const main = async () => {
  await connectDB();
  await seedTherapyPlans();
};

if (require.main === module) {
  main();
}

module.exports = { seedTherapyPlans, therapyPlans };