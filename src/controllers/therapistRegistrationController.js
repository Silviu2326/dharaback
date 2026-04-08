const asyncHandler = require('../middleware/asyncHandler');
const stripeService = require('../services/stripeService');
const emailService = require('../services/emailService');
const fs = require('fs').promises;
const path = require('path');
const { supabase } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const VerificationDocument = require('../models/VerificationDocument');
const crypto = require('crypto');
const { validarNIF } = require('../services/billingService');

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
    documentos = [], // Array de documentos con tempId, aiAnalysis, etc.
    // NUEVOS CAMPOS
    ciudad,
    direccion,
    modalidad,
    zonasAtencion,
    idiomas,
    // CAMPOS FACTURACIÓN
    nif,
    codigoPostal,
    provincia
  } = req.body;

  // Validaciones
  if (!email || !password || !nombre || !apellidos) {
    return res.status(400).json({
      success: false,
      message: 'Email, contraseña, nombre y apellidos son requeridos'
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

  if (!nif || !validarNIF(nif)) {
    return res.status(400).json({
      success: false,
      message: 'NIF/NIE obligatorio y debe tener un formato válido (ej: 12345678A o X1234567A)'
    });
  }

  if (!direccion || !codigoPostal || !ciudad || !provincia) {
    return res.status(400).json({
      success: false,
      message: 'Dirección fiscal, código postal, ciudad y provincia son requeridos'
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
          // NUEVOS CAMPOS DE UBICACIÓN
          telefono: telefono || null,
          ciudad: ciudad || 'Madrid',
          direccion: direccion || null,
          direccion_fiscal: direccion || null,
          modalidad: modalidad || 'hibrido',
          zonas_atencion: zonasAtencion?.length > 0 ? zonasAtencion : [ciudad || 'Madrid'],
          // IDIOMAS
          languages: idiomas?.length > 0
            ? idiomas.map(lang => ({ language: lang, level: 'nativo' }))
            : [{ language: 'Español', level: 'nativo' }],
          // DATOS FACTURACIÓN
          datos_facturacion: {
            nif: nif.trim().toUpperCase(),
            nombreFiscal: `${nombre} ${apellidos}`.trim(),
            direccionFiscal: {
              calle: direccion || null,
              codigoPostal: codigoPostal || null,
              ciudad: ciudad || null,
              provincia: provincia || null
            },
            contadorTickets: 0,
            contadorFacturas: 0,
            serieActual: new Date().getFullYear().toString()
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

    if (professionalError) {
      console.error('❌ Error creating professional profile:', professionalError);
      throw new Error('Error al crear el perfil profesional: ' + professionalError.message);
    }

    console.log('✅ Professional profile created');

    // 5a. Crear therapist_payment_settings con el plan correcto desde el inicio
    const { error: paymentSettingsError } = await supabase
      .from('therapist_payment_settings')
      .insert({
        therapist_id: authUser.id,
        subscription_plan: plan,
        can_accept_online_payments: plan === 'avanzado-pro',
        platform_fee_percent: 10.00,
        default_payment_method: 'manual'
      });

    if (paymentSettingsError) {
      console.error('❌ Error creating therapist_payment_settings:', paymentSettingsError);
      // No es un error fatal, continuamos
    } else {
      console.log('✅ therapist_payment_settings created with plan:', plan);
    }

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

          // Buscar coincidencia en terapias_diccionario con las terapias detectadas por la IA
          const terapiasDetectadasIA = doc.aiAnalysis?.terapiasDetectadas || [];
          let terapiaId = null;

          if (terapiasDetectadasIA.length > 0) {
            const { data: terapiaMatch } = await supabase
              .from('terapias_diccionario')
              .select('id, nombre')
              .in('nombre', terapiasDetectadasIA)
              .limit(1)
              .maybeSingle();

            if (terapiaMatch) {
              terapiaId = terapiaMatch.id;
              console.log(`✅ Terapia encontrada en diccionario: ${terapiaMatch.nombre} (id: ${terapiaId})`);
            } else {
              console.log(`⚠️ Ninguna terapia detectada coincide con terapias_diccionario:`, terapiasDetectadasIA);
            }
          }

          // Guardar registro en verification_documents (Supabase)
          // Si hay terapia asociada → aprobado automáticamente; si no → pendiente de verificación manual
          const { error: docInsertError } = await supabase
            .from('verification_documents')
            .insert({
              user_id: authUser.id,
              type: 'degree',
              document_number: numeroColegiado || null,
              issuing_body: doc.aiAnalysis?.entidadEmisora || null,
              status: terapiaId ? 'approved' : 'pending',
              file_url: fileUrl,
              notes: JSON.stringify({ originalName: originalName || null, fileSize: fileBuffer.length }),
              terapia_id: terapiaId,
            });

          if (docInsertError) {
            console.error('❌ Error saving document to Supabase verification_documents:', docInsertError.message);
          } else {
            console.log(`✅ Document saved to Supabase verification_documents (status: ${terapiaId ? 'approved' : 'pending'})`);
          }

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
        priceId: process.env.STRIPE_PLAN_BASICO_PRICE_ID || 'price_1TF520CWwvC7shbledurltKN',
        defaultTrialDays: 90
      },
      avanzado: {
        priceId: process.env.STRIPE_PLAN_AVANZADO_PRICE_ID || 'price_1TF4zwCWwvC7shblu5YwRnTt',
        defaultTrialDays: 90
      },
      'avanzado-pro': {
        priceId: process.env.STRIPE_PLAN_AVANZADO_PRO_PRICE_ID || 'price_1TEsH1CWwvC7shbl6iDqFFck',
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

    // Email de bienvenida al terapeuta
    emailService.sendTherapistWelcomeEmail({ email, nombre, apellidos, plan })
      .catch(err => console.error('❌ Error sending welcome email to therapist:', err));

    // Notificación al admin
    emailService.sendNewTherapistAdminNotification({
      nombre,
      apellidos,
      email,
      telefono,
      plan,
      especialidades,
      ciudad
    }).catch(err => console.error('❌ Error sending admin notification email:', err));

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
  const { email, nombre, userId, plan = 'avanzado', trialDays, successUrl: customSuccessUrl, cancelUrl: customCancelUrl, context = 'registration' } = req.body;

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
      priceId: process.env.STRIPE_PLAN_BASICO_PRICE_ID || 'price_1TF520CWwvC7shbledurltKN',
      defaultTrialDays: 90,
      nombre: 'Básico'
    },
    avanzado: {
      priceId: process.env.STRIPE_PLAN_AVANZADO_PRICE_ID || 'price_1TF4zwCWwvC7shblu5YwRnTt',
      defaultTrialDays: 90,
      nombre: 'Avanzado'
    },
    'avanzado-pro': {
      priceId: process.env.STRIPE_PLAN_AVANZADO_PRO_PRICE_ID || 'price_1TEsH1CWwvC7shbl6iDqFFck',
      defaultTrialDays: 0,
      nombre: 'Avanzado Pro'
    }
  };

  const selectedPlan = planConfig[plan] || planConfig['avanzado'];

  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://dhara-peach.vercel.app';

    // --- Protección contra abuso del trial gratuito ---
    // 1. Los cambios de plan NUNCA tienen trial.
    // 2. No confiamos en el trialDays que envía el frontend; lo calculamos aquí.
    // 3. Comprobamos si el usuario (por userId o email) ya usó un trial anteriormente.
    let finalTrialDays = 0;

    if (context !== 'plan_change') {
      // Determinar días de trial basado en el plan (nunca confiar en el valor del frontend)
      const serverTrialDays = selectedPlan.defaultTrialDays;

      if (serverTrialDays > 0) {
        // Verificar si el usuario ya tiene o tuvo suscripción (por userId o email)
        let hasUsedTrial = false;

        if (userId) {
          const { data: existingUser } = await supabase
            .from('users')
            .select('subscription_status, has_used_trial')
            .eq('id', userId)
            .single();

          if (existingUser) {
            hasUsedTrial =
              existingUser.has_used_trial === true ||
              ['trial', 'active', 'past_due', 'canceled', 'unpaid'].includes(existingUser.subscription_status);
          }
        }

        if (!hasUsedTrial && email) {
          // Segunda comprobación por email (cubre cuentas recién creadas con el mismo email)
          const { data: emailUser } = await supabase
            .from('users')
            .select('subscription_status, has_used_trial')
            .eq('email', email.toLowerCase().trim())
            .neq('id', userId || '')
            .maybeSingle();

          if (emailUser) {
            hasUsedTrial =
              emailUser.has_used_trial === true ||
              ['trial', 'active', 'past_due', 'canceled', 'unpaid'].includes(emailUser.subscription_status);
          }
        }

        finalTrialDays = hasUsedTrial ? 0 : serverTrialDays;

        if (hasUsedTrial) {
          console.log(`⚠️ Trial denegado para ${email} — ya usó el período de prueba anteriormente`);
        }
      }
    }

    console.log(`📋 [createTherapistSubscription] context=${context} plan=${plan} trialDays=${finalTrialDays}`);

    const session = await stripeService.createSubscriptionCheckout({
      priceId: selectedPlan.priceId,
      email,
      name: nombre,
      trialDays: finalTrialDays,
      requirePaymentMethod: true,
      successUrl: customSuccessUrl || `${frontendUrl}/registro-exitoso?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: customCancelUrl || `${frontendUrl}/registro-terapeuta?cancelled=true`,
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

    // Actualizar el plan inmediatamente solo en registros nuevos.
    // Para cambios de plan, esperar confirmación del webhook para no actualizar si se cancela.
    if (userId && context !== 'plan_change') {
      // Actualizar subscription_status y stripe_customer_id en users
      const updateData = {
        subscription_status: plan === 'avanzado-pro' ? 'active' : 'trial',
        updated_at: new Date().toISOString()
      };
      
      if (session.customerId) {
        updateData.stripe_customer_id = session.customerId;
      }
      
      const { error: updateUserError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);

      if (updateUserError) {
        console.error('❌ Error updating user subscription_status:', updateUserError);
      } else {
        console.log('✅ User subscription_status updated to:', plan === 'avanzado-pro' ? 'active' : 'trial');
        if (session.customerId) {
          console.log('✅ stripe_customer_id saved:', session.customerId);
        }
      }

      // Actualizar o crear therapist_payment_settings
      const { data: existingSettings, error: settingsError } = await supabase
        .from('therapist_payment_settings')
        .select('*')
        .eq('therapist_id', userId)
        .single();

      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error('❌ Error checking therapist_payment_settings:', settingsError);
      } else if (existingSettings) {
        const { error: updatePlanError } = await supabase
          .from('therapist_payment_settings')
          .update({
            subscription_plan: plan,
            can_accept_online_payments: plan === 'avanzado-pro' || existingSettings.can_accept_online_payments,
            updated_at: new Date().toISOString()
          })
          .eq('therapist_id', userId);

        if (updatePlanError) {
          console.error('❌ Error updating subscription_plan:', updatePlanError);
        } else {
          console.log('✅ subscription_plan updated to:', plan);
        }
      } else {
        const { error: insertPlanError } = await supabase
          .from('therapist_payment_settings')
          .insert({
            therapist_id: userId,
            subscription_plan: plan,
            can_accept_online_payments: plan === 'avanzado-pro',
            platform_fee_percent: 10.00,
            default_payment_method: 'manual'
          });

        if (insertPlanError) {
          console.error('❌ Error inserting subscription_plan:', insertPlanError);
        } else {
          console.log('✅ subscription_plan created with plan:', plan);
        }
      }
    }

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

/**
 * @desc    Confirmar cambio de plan después del checkout de Stripe
 * @route   POST /api/terapeutas/confirmar-cambio-plan
 * @access  Private
 */
const confirmPlanChange = asyncHandler(async (req, res) => {
  const { session_id } = req.body;
  const userId = req.user?.id;

  if (!session_id) {
    return res.status(400).json({ success: false, message: 'session_id es requerido' });
  }

  try {
    const session = await stripeService.getCheckoutSession(session_id);

    // Verificar que la sesión pertenece a este usuario
    const sessionUserId = session.metadata?.userId;
    if (sessionUserId && sessionUserId !== userId) {
      return res.status(403).json({ success: false, message: 'La sesión no pertenece a este usuario' });
    }

    // Verificar que el pago se completó
    if (session.paymentStatus !== 'paid' && session.status !== 'complete') {
      return res.status(400).json({
        success: false,
        message: 'El pago no se ha completado',
        paymentStatus: session.paymentStatus
      });
    }

    const plan = session.metadata?.plan;
    if (!plan) {
      return res.status(400).json({ success: false, message: 'No se encontró el plan en la sesión' });
    }

    // Actualizar subscription_plan en therapist_payment_settings
    const { data: existingSettings } = await supabase
      .from('therapist_payment_settings')
      .select('*')
      .eq('therapist_id', userId)
      .single();

    if (existingSettings) {
      await supabase
        .from('therapist_payment_settings')
        .update({
          subscription_plan: plan,
          can_accept_online_payments: plan === 'avanzado-pro' || existingSettings.can_accept_online_payments,
          updated_at: new Date().toISOString()
        })
        .eq('therapist_id', userId);
    } else {
      await supabase
        .from('therapist_payment_settings')
        .insert({
          therapist_id: userId,
          subscription_plan: plan,
          can_accept_online_payments: plan === 'avanzado-pro',
          platform_fee_percent: 10.00,
          default_payment_method: 'manual'
        });
    }

    // Actualizar subscription_status y stripe_subscription_id en users
    const updateData = {
      subscription_status: plan === 'avanzado-pro' ? 'active' : 'trial',
      updated_at: new Date().toISOString()
    };
    if (session.customerId) updateData.stripe_customer_id = session.customerId;
    if (session.subscriptionId) updateData.stripe_subscription_id = session.subscriptionId;

    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      console.error('❌ [confirmPlanChange] Error updating user in DB:', updateError);
    } else {
      console.log('✅ [confirmPlanChange] DB updated → subscription_status:', updateData.subscription_status, '| stripe_subscription_id:', updateData.stripe_subscription_id);
    }

    console.log('✅ Plan change confirmed for user:', userId, '→', plan);

    return res.status(200).json({
      success: true,
      message: `Plan actualizado a ${plan}`,
      data: { plan, sessionId: session_id }
    });

  } catch (error) {
    console.error('❌ Error confirming plan change:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error al confirmar el cambio de plan' });
  }
});

/**
 * @desc    Cancelar suscripción al final del período de facturación
 * @route   POST /api/terapeutas/cancelar-plan
 * @access  Private
 */
const cancelPlanAtPeriodEnd = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }

  try {
    // Obtener stripe_subscription_id del usuario
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('stripe_subscription_id, stripe_customer_id, subscription_status')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    if (!userData.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'No se encontró una suscripción activa de Stripe para este usuario'
      });
    }

    // Cancelar en Stripe al final del período
    const cancelled = await stripeService.cancelSubscriptionAtPeriodEnd(userData.stripe_subscription_id);

    // Marcar en la BD como pendiente de cancelación
    const { error: updateStatusError } = await supabase
      .from('users')
      .update({
        subscription_status: 'cancelling',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateStatusError) {
      console.error('❌ [cancelPlanAtPeriodEnd] Error updating subscription_status in DB:', updateStatusError);
    } else {
      console.log('✅ [cancelPlanAtPeriodEnd] subscription_status updated to cancelling for user:', userId);
    }

    // También actualizar therapist_payment_settings si existe
    await supabase
      .from('therapist_payment_settings')
      .update({ updated_at: new Date().toISOString() })
      .eq('therapist_id', userId);

    const periodEndDate = new Date(cancelled.current_period_end * 1000).toISOString().split('T')[0];

    console.log('✅ Subscription set to cancel at period end for user:', userId, '— ends:', periodEndDate);

    return res.status(200).json({
      success: true,
      message: `Suscripción cancelada. Tendrás acceso hasta el ${periodEndDate}.`,
      data: {
        cancelAtPeriodEnd: true,
        accessUntil: periodEndDate
      }
    });

  } catch (error) {
    console.error('❌ Error cancelling plan:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error al cancelar el plan' });
  }
});

module.exports = {
  registerTherapist,
  createTherapistSubscription,
  verifyRegistration,
  processDegreeDocuments,
  confirmPlanChange,
  cancelPlanAtPeriodEnd
};
