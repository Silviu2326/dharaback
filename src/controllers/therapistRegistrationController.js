const asyncHandler = require('../middleware/asyncHandler');
const stripeService = require('../services/stripeService');
const fs = require('fs').promises;
const path = require('path');
const { supabase } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const VerificationDocument = require('../models/VerificationDocument');
const crypto = require('crypto');

/**
 * @desc    Registrar terapeuta completo (Auth + Perfil + Stripe)
 * @route   POST /api/terapeutas/registrar
 * @access  Public
 */
const registerTherapist = asyncHandler(async (req, res) => {
  const {
    email,
    password,
    nombre,
    apellidos,
    telefono,
    especialidades,
    titulacion,
    numeroColegiado,
    experiencia,
    sobreMi,
    plan = 'avanzado',
    documentos = [] // Array de documentos con tempId, aiAnalysis, etc.
  } = req.body;

  // Validaciones
  if (!email || !password || !nombre || !apellidos) {
    return res.status(400).json({
      success: false,
      message: 'Email, contraseña, nombre y apellidos son requeridos'
    });
  }

  if (!especialidades || especialidades.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Debes seleccionar al menos una especialidad'
    });
  }

  if (!titulacion || !sobreMi) {
    return res.status(400).json({
      success: false,
      message: 'Titulación y descripción son requeridos'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Email inválido'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'La contraseña debe tener al menos 8 caracteres'
    });
  }

  let authUser = null;

  try {
    // 1. Verificar si el email ya está registrado
    const { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Este email ya está registrado. Por favor, inicia sesión o usa otro email.'
      });
    }

    // 2. Crear usuario en Supabase Auth (como admin)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // El usuario debe confirmar su email
      user_metadata: {
        nombre: `${nombre} ${apellidos}`,
        telefono,
        tipo_usuario: 'terapeuta'
      }
    });

    if (authError) {
      console.error('❌ Error creating Supabase Auth user:', authError);
      
      if (authError.message?.includes('already been registered')) {
        return res.status(409).json({
          success: false,
          message: 'Este email ya está registrado. Por favor, inicia sesión o usa otro email.'
        });
      }
      
      throw new Error('Error al crear el usuario: ' + authError.message);
    }

    authUser = authData.user;
    console.log('✅ Supabase Auth user created:', authUser.id);

    // 3. Hashear el password para guardarlo en la tabla users
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Crear usuario en la tabla users
    const { error: profileError } = await supabase.from('users').insert([
      {
        id: authUser.id,
        email,
        password: hashedPassword,
        name: `${nombre} ${apellidos}`,
        supabase_id: authUser.id,
        verification_status: 'pending',
        role: 'therapist',
        subscription_status: plan === 'avanzado-pro' ? 'active' : 'trial',
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]);

    if (profileError) {
      console.error('❌ Error creating user profile:', profileError);
      throw new Error('Error al crear el perfil de usuario: ' + profileError.message);
    }

    console.log('✅ User profile created');

    // 4. Crear perfil profesional
    const { error: professionalError } = await supabase
      .from('professional_profiles')
      .insert([
        {
          user_id: authUser.id,
          about: sobreMi,
          therapies: especialidades,
          specializations: especialidades.map((esp) => ({
            name: esp,
            verified: false
          })),
          education: [
            {
              degree: titulacion,
              institution: '',
              license_number: numeroColegiado || null,
              verified: false
            }
          ],
          experience: experiencia
            ? [
                {
                  years: experiencia,
                  description: ''
                }
              ]
            : [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

    if (professionalError) {
      console.error('❌ Error creating professional profile:', professionalError);
      throw new Error('Error al crear el perfil profesional: ' + professionalError.message);
    }

    console.log('✅ Professional profile created');

    // 5. Procesar y guardar documentos de titulación en Supabase Storage
    if (documentos && documentos.length > 0) {
      const bucketName = 'documents';
      
      for (const doc of documentos) {
        try {
          const { tempId, aiAnalysis, originalName } = doc;
          
          if (!tempId) {
            console.warn('⚠️ Document without tempId, skipping');
            continue;
          }

          // El tempId ahora es la ruta en el bucket (ej: temp-analysis/analysis-123.pdf)
          const tempPath = tempId;
          const fileExt = path.extname(originalName || tempId) || '.pdf';
          const mimeType = fileExt === '.pdf' ? 'application/pdf' : 'image/jpeg';

          // Descargar archivo temporal del bucket
          const { data: fileData, error: downloadError } = await supabase.storage
            .from(bucketName)
            .download(tempPath);

          if (downloadError) {
            console.error('❌ Error downloading temp file from bucket:', downloadError);
            continue;
          }

          const fileBuffer = Buffer.from(await fileData.arrayBuffer());

          // Generar nombre único para el archivo final
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const newFilename = `degree-${authUser.id}-${uniqueSuffix}${fileExt}`;
          const storagePath = `therapists/${authUser.id}/verification/${newFilename}`;

          // Subir archivo a la ubicación final en el bucket
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(storagePath, fileBuffer, {
              contentType: mimeType,
              upsert: false
            });

          if (uploadError) {
            console.error('❌ Error uploading to Supabase Storage:', uploadError);
            continue;
          }

          // Obtener URL pública del archivo
          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(storagePath);

          const fileUrl = publicUrlData.publicUrl;

          // Eliminar archivo temporal del bucket
          const { error: deleteError } = await supabase.storage
            .from(bucketName)
            .remove([tempPath]);

          if (deleteError) {
            console.warn('⚠️ Could not delete temp file from bucket:', deleteError.message);
          }

          console.log(`✅ Document moved in bucket: ${tempPath} → ${storagePath}`);

          // Crear registro en verification_documents usando MongoDB
          // Extraer terapias detectadas del análisis AI
          const terapiasDetectadas = doc.aiAnalysis?.terapiasDetectadas || [];
          const terapiasCoinciden = doc.aiAnalysis?.terapiasCoincidenConDeclaradas || false;
          
          // Calcular checksum del archivo
          const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          
          // Verificar si ya existe un documento con el mismo checksum
          const existingDoc = await VerificationDocument.findOne({
            checksum: fileChecksum
          });
          
          if (existingDoc) {
            console.log(`⚠️ Document already exists with checksum: ${fileChecksum.substring(0, 16)}...`);
            continue;
          }
          
          // Crear el documento en MongoDB
          const documentData = {
            therapistId: authUser.id, // MongoDB usará el string ID de Supabase
            type: 'diploma', // 'degree' no está en el enum, usar 'diploma'
            name: originalName || `Documento de titulación - ${newFilename}`,
            filename: newFilename,
            originalName: originalName || tempId,
            url: fileUrl,
            status: 'pending',
            mimeType: mimeType,
            fileSize: fileBuffer.length,
            documentNumber: numeroColegiado || null,
            issuingAuthority: aiAnalysis?.entidadEmisora || '',
            priority: 'high', // Documentos de titulación son alta prioridad
            verificationLevel: 'enhanced', // Verificación mejorada para títulos
            complianceNotes: `Documento: ${originalName || 'Documento de titulación'}\nTerapias detectadas: ${terapiasDetectadas.join(', ') || 'Ninguna'}\nCoinciden con declaradas: ${terapiasCoinciden ? 'Sí' : 'No'}\nAI Analysis: ${aiAnalysis ? JSON.stringify(aiAnalysis) : 'N/A'}`,
            checksum: fileChecksum,
            reviewHistory: [{
              action: 'submitted',
              date: new Date(),
              previousStatus: null,
              newStatus: 'pending'
            }],
            metadata: {
              uploadedFrom: 'web',
              batchId: `registration-${authUser.id}`
            }
          };

          console.log('📝 Intentando guardar documento en MongoDB:', {
            therapistId: documentData.therapistId,
            type: documentData.type,
            name: documentData.name,
            checksum: documentData.checksum.substring(0, 16) + '...'
          });
          console.log('🔍 Terapias detectadas en documento:', terapiasDetectadas);
          console.log('✅ Coinciden con especialidad declarada:', terapiasCoinciden);

          try {
            const newDocument = new VerificationDocument(documentData);
            await newDocument.save();
            console.log(`✅ Verification document saved to MongoDB: ${newDocument._id}`);
          } catch (docError) {
            console.error('❌ Error saving verification document to MongoDB:', docError);
            console.error('❌ Error details:', JSON.stringify(docError, null, 2));
          }
        } catch (docProcessError) {
          console.error('❌ Error processing document:', docProcessError);
          // Continuar con el siguiente documento
        }
      }
    }

    // 6. Crear suscripción en Stripe
    const trialDays = plan === 'avanzado-pro' ? 0 : 90;
    
    const planConfig = {
      basico: {
        priceId: process.env.STRIPE_PLAN_BASICO_PRICE_ID || 'price_basico_placeholder',
        defaultTrialDays: 90
      },
      avanzado: {
        priceId: process.env.STRIPE_PLAN_AVANZADO_PRICE_ID || 'price_1T1BngECp38q24a3IczRTdHW',
        defaultTrialDays: 90
      },
      'avanzado-pro': {
        priceId: process.env.STRIPE_PLAN_AVANZADO_PRO_PRICE_ID || 'price_avanzado_pro_placeholder',
        defaultTrialDays: 0
      }
    };

    const selectedPlan = planConfig[plan] || planConfig['avanzado'];
    const finalTrialDays = trialDays !== undefined ? trialDays : selectedPlan.defaultTrialDays;
    const frontendUrl = process.env.FRONTEND_URL || 'https://dhara-peach.vercel.app';

    const session = await stripeService.createSubscriptionCheckout({
      priceId: selectedPlan.priceId,
      email,
      name: `${nombre} ${apellidos}`,
      trialDays: finalTrialDays,
      successUrl: `${frontendUrl}/registro-exitoso?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/registro-terapeuta?cancelled=true`,
      metadata: {
        userId: authUser.id,
        email,
        nombre: `${nombre} ${apellidos}`,
        plan: plan,
        tipo: 'registro_terapeuta',
        trialDays: finalTrialDays.toString()
      }
    });

    // Guardar el stripe_customer_id en la tabla users
    if (session.customerId) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          stripe_customer_id: session.customerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', authUser.id);

      if (updateError) {
        console.error('❌ Error saving stripe_customer_id:', updateError);
        // No lanzamos error para no interrumpir el flujo, pero logueamos
      } else {
        console.log('✅ Stripe customer ID saved:', session.customerId);
      }
    }

    console.log('✅ Therapist registration complete:', {
      userId: authUser.id,
      email,
      plan,
      stripeSessionId: session.id,
      stripeCustomerId: session.customerId
    });

    res.status(201).json({
      success: true,
      message: 'Usuario registrado correctamente',
      data: {
        userId: authUser.id,
        email,
        checkoutUrl: session.url,
        sessionId: session.id
      }
    });

  } catch (error) {
    console.error('❌ Error in therapist registration:', error);
    
    // Rollback: eliminar usuario de Auth si se creó
    if (authUser) {
      try {
        await supabase.auth.admin.deleteUser(authUser.id);
        console.log('✅ Rollback: Auth user deleted');
      } catch (deleteError) {
        console.error('❌ Error deleting auth user during rollback:', deleteError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Error al registrar el terapeuta'
    });
  }
});

/**
 * @desc    Crear sesión de checkout para registro de terapeuta con trial
 * @route   POST /api/terapeutas/suscribir
 * @access  Public
 */
const createTherapistSubscription = asyncHandler(async (req, res) => {
  // Este endpoint ahora es solo para casos donde el usuario ya existe
  // y solo necesita crear/actualizar la suscripción
  const { email, nombre, userId, plan = 'avanzado', trialDays } = req.body;

  if (!email || !nombre) {
    return res.status(400).json({
      success: false,
      message: 'Email y nombre son requeridos'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Email inválido'
    });
  }

  // Configuración de planes
  const planConfig = {
    basico: {
      priceId: process.env.STRIPE_PLAN_BASICO_PRICE_ID || 'price_basico_placeholder',
      defaultTrialDays: 90,
      nombre: 'Básico'
    },
    avanzado: {
      priceId: process.env.STRIPE_PLAN_AVANZADO_PRICE_ID || 'price_1T1BngECp38q24a3IczRTdHW',
      defaultTrialDays: 90,
      nombre: 'Avanzado'
    },
    'avanzado-pro': {
      priceId: process.env.STRIPE_PLAN_AVANZADO_PRO_PRICE_ID || 'price_avanzado_pro_placeholder',
      defaultTrialDays: 0,
      nombre: 'Avanzado Pro'
    }
  };

  const selectedPlan = planConfig[plan] || planConfig['avanzado'];
  const finalTrialDays = trialDays !== undefined ? trialDays : selectedPlan.defaultTrialDays;

  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://dhara-peach.vercel.app';

    const session = await stripeService.createSubscriptionCheckout({
      priceId: selectedPlan.priceId,
      email,
      name: nombre,
      trialDays: finalTrialDays,
      successUrl: `${frontendUrl}/registro-exitoso?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/registro-terapeuta?cancelled=true`,
      metadata: {
        userId: userId || '',
        email,
        nombre,
        plan: plan,
        tipo: 'registro_terapeuta',
        trialDays: finalTrialDays.toString()
      }
    });

    console.log('✅ Therapist subscription checkout created:', {
      sessionId: session.id,
      email,
      plan: plan,
      trialDays: finalTrialDays
    });

    res.status(200).json({
      success: true,
      message: 'Sesión de checkout creada correctamente',
      data: {
        url: session.url,
        sessionId: session.id,
        customerId: session.customerId
      }
    });

  } catch (error) {
    console.error('❌ Error creating therapist subscription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al crear la suscripción'
    });
  }
});

/**
 * @desc    Verificar estado de registro después del checkout
 * @route   GET /api/terapeutas/verificar-registro
 * @access  Public
 */
const verifyRegistration = asyncHandler(async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({
      success: false,
      message: 'Session ID es requerido'
    });
  }

  try {
    const session = await stripeService.getCheckoutSession(session_id);

    console.log('✅ Session verified:', {
      sessionId: session.id,
      paymentStatus: session.paymentStatus,
      subscriptionId: session.subscriptionId
    });

    // Verificar que el usuario existe en la base de datos
    const userId = session.metadata?.userId;
    let userExists = false;
    let userData = null;

    if (userId) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (!userError && user) {
        userExists = true;
        userData = user;
        console.log('✅ User found in database:', user.id);
      } else {
        console.error('❌ User not found in database:', userId);
      }
    }

    // Si el pago fue exitoso pero el usuario no existe, retornar error
    if (session.paymentStatus === 'paid' && !userExists) {
      console.error('❌ Payment succeeded but user does not exist in database');
      return res.status(404).json({
        success: false,
        message: 'El pago se procesó correctamente pero no se encontró el usuario. Por favor, contacta con soporte.'
      });
    }

    // Guardar el stripe_customer_id en la tabla users si no existe
    if (userExists && session.customerId && userData) {
      if (!userData.stripe_customer_id) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            stripe_customer_id: session.customerId,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (updateError) {
          console.error('❌ Error saving stripe_customer_id during verification:', updateError);
        } else {
          console.log('✅ Stripe customer ID saved during verification:', session.customerId);
          userData.stripe_customer_id = session.customerId;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        status: session.status,
        paymentStatus: session.paymentStatus,
        subscriptionId: session.subscriptionId,
        customerId: session.customerId,
        email: session.customerEmail,
        nombre: session.customerName,
        userExists,
        user: userData ? { id: userData.id, email: userData.email, name: userData.name } : null,
        plan: session.metadata?.plan || 'avanzado',
        trialDays: parseInt(session.metadata?.trialDays || '90')
      }
    });

  } catch (error) {
    console.error('❌ Error verifying registration:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al verificar el registro'
    });
  }
});

/**
 * @desc    Procesar documentos de titulación temporales al completar registro
 * @route   POST /api/terapeutas/procesar-documentos
 * @access  Public
 */
const processDegreeDocuments = asyncHandler(async (req, res) => {
  const { tempIds, userId, email } = req.body;

  if (!tempIds || !Array.isArray(tempIds) || tempIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Se requieren IDs de documentos temporales'
    });
  }

  try {
    const processedDocs = [];
    const tempDir = path.join(__dirname, '../../uploads/temp');
    const verificationDir = path.join(__dirname, '../../uploads/verification');

    await fs.mkdir(verificationDir, { recursive: true });

    for (const tempId of tempIds) {
      const tempPath = path.join(tempDir, tempId);
      
      try {
        await fs.access(tempPath);

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const newFilename = 'degree-' + uniqueSuffix + path.extname(tempId);
        const newPath = path.join(verificationDir, newFilename);

        await fs.rename(tempPath, newPath);
        const stats = await fs.stat(newPath);

        processedDocs.push({
          id: uniqueSuffix,
          status: 'pending',
          url: `/uploads/verification/${newFilename}`,
          originalName: tempId,
          fileSize: stats.size
        });

        console.log('✅ Documento procesado:', newFilename);

      } catch (fileError) {
        console.error(`❌ Error procesando documento temporal ${tempId}:`, fileError);
      }
    }

    console.log(`✅ ${processedDocs.length} documentos procesados para ${email}`);

    res.status(200).json({
      success: true,
      message: `${processedDocs.length} documentos procesados correctamente`,
      data: {
        processedCount: processedDocs.length,
        documents: processedDocs
      }
    });

  } catch (error) {
    console.error('❌ Error procesando documentos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al procesar documentos'
    });
  }
});

module.exports = {
  registerTherapist,
  createTherapistSubscription,
  verifyRegistration,
  processDegreeDocuments
};
