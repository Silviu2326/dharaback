const { validationResult } = require('express-validator');
const fs = require('fs');
const { Document, Client, User } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');
const { uploadToSupabaseStorage } = require('../../helpers/documentStorage');
const { supabase } = require('../../config/supabase');
const emailService = require('../../services/emailService');

const uploadController = {
  // Upload a new document
  async uploadDocument(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }

      const therapistId = req.user.id;
      console.log(`\n📄 [UPLOAD] =========================================`);
      console.log(`📄 [UPLOAD] INICIANDO SUBIDA DE DOCUMENTO`);
      console.log(`📄 [UPLOAD] =========================================`);
      console.log(`📄 [UPLOAD] Terapeuta ID: ${therapistId}`);
      console.log(`📄 [UPLOAD] Archivo recibido: ${req.file.originalname} (${req.file.size} bytes)`);
      console.log(`📄 [UPLOAD] MIME Type: ${req.file.mimetype}`);
      console.log(`📄 [UPLOAD] req.body completo:`, JSON.stringify(req.body, null, 2));
      
      const {
        title,
        category = 'other',
        clientId,  // Legacy single client support
        clientIds, // Array of client IDs for multi-client support
        session,
        tags = [],
        visibility = 'therapist_only',
        isConfidential = true,
        notifyClients = 'false'
      } = req.body;

      // Parse notifyClients (could be string 'true'/'false' or boolean)
      const shouldNotifyClients = notifyClients === 'true' || notifyClients === true;

      console.log(`📄 [UPLOAD] Datos recibidos - Title: "${title}", Category: ${category}`);
      console.log(`📄 [UPLOAD] ClientId (legacy): ${clientId || 'N/A'}`);
      console.log(`📄 [UPLOAD] ClientIds (raw): ${clientIds || 'N/A'}`);

      // Parse clientIds if it's a string (from form-data)
      let parsedClientIds = [];
      if (clientIds) {
        try {
          parsedClientIds = typeof clientIds === 'string' ? JSON.parse(clientIds) : clientIds;
          if (!Array.isArray(parsedClientIds)) {
            parsedClientIds = [parsedClientIds];
          }
          console.log(`📄 [UPLOAD] ClientIds parseados (JSON): ${JSON.stringify(parsedClientIds)}`);
        } catch (e) {
          parsedClientIds = clientIds.split(',').map(id => id.trim()).filter(Boolean);
          console.log(`📄 [UPLOAD] ClientIds parseados (split): ${JSON.stringify(parsedClientIds)}`);
        }
      } else if (clientId) {
        // Legacy support: if only clientId is provided
        parsedClientIds = [clientId];
        console.log(`📄 [UPLOAD] Usando clientId legacy: ${clientId}`);
      } else {
        console.log(`📄 [UPLOAD] No se recibieron clientIds - documento sin asignar a clientes`);
      }

      // Parse tags if it's a string (from form-data)
      let parsedTags = [];
      if (tags) {
        try {
          parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
          if (!Array.isArray(parsedTags)) {
            parsedTags = [parsedTags];
          }
          console.log(`📄 [UPLOAD] Tags parseados: ${JSON.stringify(parsedTags)}`);
        } catch (e) {
          parsedTags = tags.split(',').map(tag => tag.trim()).filter(Boolean);
          console.log(`📄 [UPLOAD] Tags parseados (split): ${JSON.stringify(parsedTags)}`);
        }
      }

      console.log(`📄 [UPLOAD] Total clientIds a procesar: ${parsedClientIds.length}`);

      // Verify all clients exist
      const validClientIds = [];
      if (parsedClientIds.length > 0) {
        console.log(`📄 [UPLOAD] Verificando ${parsedClientIds.length} clientes en la base de datos...`);
        
        for (const id of parsedClientIds) {
          console.log(`📄 [UPLOAD] Buscando cliente: ${id}`);
          const client = await Client.findById(id);
          if (client) {
            console.log(`✅ [UPLOAD] Cliente encontrado: ${client.name} (${id})`);
            validClientIds.push(id);
          } else {
            console.warn(`⚠️ [UPLOAD] Cliente NO encontrado: ${id}`);
          }
        }
        
        console.log(`📄 [UPLOAD] Clientes válidos: ${validClientIds.length}/${parsedClientIds.length}`);
        
        if (validClientIds.length === 0 && parsedClientIds.length > 0) {
          console.error(`❌ [UPLOAD] Ningún cliente válido encontrado. Abortando subida.`);
          return next(new AppError('No valid clients found', 404));
        }
      } else {
        console.log(`📄 [UPLOAD] Sin clientes especificados - documento se guardará sin asignación`);
      }

      // Determine document type based on mime type
      const getDocumentType = (mimeType) => {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType === 'application/pdf') return 'pdf';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel';
        if (mimeType.startsWith('text/')) return 'text';
        return 'other';
      };

      // Upload file to Supabase Storage
      let supabaseUrl = null;
      let supabasePath = null;
      try {
        console.log('📤 Uploading file to Supabase Storage...');
        const uploadResult = await uploadToSupabaseStorage(
          req.file.path,
          req.file.originalname,
          therapistId
        );
        supabaseUrl = uploadResult.publicUrl;
        supabasePath = uploadResult.path;
        console.log('✅ File uploaded to Supabase:', supabaseUrl);
        
        // Delete local file after successful Supabase upload
        try {
          fs.unlinkSync(req.file.path);
          console.log('🗑️ Local file deleted');
        } catch (unlinkError) {
          console.warn('⚠️ Could not delete local file:', unlinkError.message);
        }
      } catch (storageError) {
        console.error('❌ Supabase Storage upload failed:', storageError);
        // Continue with local storage as fallback
        console.log('⚠️ Falling back to local storage');
      }

      const documentData = {
        userId: therapistId,
        clientId: validClientIds.length > 0 ? validClientIds[0] : null, // Keep first client for backward compatibility
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        type: getDocumentType(req.file.mimetype),
        size: req.file.size,
        path: supabasePath || `/uploads/documents/${req.file.filename}`,
        supabaseUrl: supabaseUrl,
        category,
        title: title || req.file.originalname.split('.')[0], // Use title or fallback to filename
        tags: parsedTags, // Now as separate field
        isPublic: visibility === 'public' || shouldNotifyClients,
        metadata: {
          session,
          visibility,
          isConfidential,
          uploadedBy: therapistId,
          uploadSource: 'web',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          storageType: supabaseUrl ? 'supabase' : 'local'
        },
        accessLog: [{
          userId: therapistId,
          action: 'upload',
          timestamp: new Date().toISOString(),
          ip: req.ip
        }]
      };

      console.log(`📄 [UPLOAD] Creando documento en la base de datos...`);
      const document = await Document.create(documentData);
      console.log(`✅ [UPLOAD] Documento creado exitosamente - ID: ${document.id}`);
      console.log(`📄 [UPLOAD] Documento data:`, {
        id: document.id,
        userId: document.userId,
        clientId: document.clientId,
        filename: document.filename
      });

      // Create associations with all clients in the junction table
      if (validClientIds.length > 0) {
        console.log(`📄 [UPLOAD] Creando asociaciones en tabla document_clients...`);
        console.log(`📄 [UPLOAD] Insertando ${validClientIds.length} registros para documento ${document.id}`);
        
        const documentClientRecords = validClientIds.map(clientId => ({
          document_id: document.id,
          client_id: clientId
        }));
        
        console.log(`📄 [UPLOAD] Registros a insertar:`, JSON.stringify(documentClientRecords, null, 2));

        const { data: insertData, error: junctionError } = await supabase
          .from('document_clients')
          .insert(documentClientRecords)
          .select();

        if (junctionError) {
          console.error(`❌ [UPLOAD] Error creando asociaciones documento-cliente:`, junctionError);
          console.error(`❌ [UPLOAD] Detalle del error: ${junctionError.message}`);
          console.error(`❌ [UPLOAD] Código de error: ${junctionError.code}`);
          // Don't fail the upload, just log the error
        } else {
          console.log(`✅ [UPLOAD] Asociaciones creadas exitosamente`);
          console.log(`✅ [UPLOAD] Registros insertados: ${insertData ? insertData.length : 0}`);
          if (insertData) {
            console.log(`📄 [UPLOAD] Datos insertados:`, JSON.stringify(insertData, null, 2));
          }
        }
      } else {
        console.log(`📄 [UPLOAD] No hay clientes válidos - omitiendo creación de asociaciones`);
      }

      // Enviar notificaciones por email si está habilitado y hay clientes asociados
      if (shouldNotifyClients && validClientIds.length > 0) {
        console.log(`📧 [UPLOAD] Enviando notificaciones por email a ${validClientIds.length} clientes...`);

        try {
          // Obtener datos del terapeuta
          const uploaderForEmail = await User.findById(therapistId);
          const therapistName = uploaderForEmail ? uploaderForEmail.name : 'Tu terapeuta';

          // Obtener datos completos de los clientes
          const clientsForEmail = await Promise.all(
            validClientIds.map(id => Client.findById(id))
          );

          // Enviar email a cada cliente
          const documentType = getDocumentType(req.file.mimetype);
          const emailPromises = clientsForEmail
            .filter(client => client && client.email)
            .map(client => {
              console.log(`📧 [UPLOAD] Enviando email a ${client.email} (${client.name})`);
              return emailService.sendDocumentSharedNotification({
                to: client.email,
                clientName: client.name,
                documentTitle: title || req.file.originalname.split('.')[0],
                therapistName: therapistName,
                documentType: documentType,
                description: req.body.description || ''
              });
            });

          const emailResults = await Promise.allSettled(emailPromises);
          const successfulEmails = emailResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
          const failedEmails = emailResults.filter(r => r.status === 'rejected' || !r.value.success).length;

          console.log(`✅ [UPLOAD] Emails enviados: ${successfulEmails} exitosos, ${failedEmails} fallidos`);
        } catch (emailError) {
          console.error(`❌ [UPLOAD] Error enviando notificaciones por email:`, emailError);
          // No fallamos la subida del documento si los emails fallan
        }
      } else {
        console.log(`📧 [UPLOAD] Notificaciones por email: ${shouldNotifyClients ? 'Sí, pero no hay clientes' : 'No habilitadas'}`);
      }

      // Fetch related data for response
      console.log(`📄 [UPLOAD] Recuperando datos de clientes para la respuesta...`);
      const [clients, uploader] = await Promise.all([
        // Fetch all associated clients from the junction table
        validClientIds.length > 0
          ? Promise.all(validClientIds.map(id => Client.findById(id)))
          : Promise.resolve([]),
        User.findById(document.userId)
      ]);

      // Filter out any null clients (in case one was deleted)
      const validClients = clients.filter(c => c !== null);
      console.log(`✅ [UPLOAD] Clientes recuperados para respuesta: ${validClients.length}`);
      validClients.forEach((client, idx) => {
        console.log(`   - Cliente ${idx + 1}: ${client.name} (${client.id})`);
      });

      const responseData = document.toJSON();
      responseData.clients = validClients.map(client => ({
        id: client.id,
        name: client.name,
        avatar: client.avatar
      }));
      // Keep single client for backward compatibility
      responseData.client = validClients.length > 0 ? responseData.clients[0] : null;
      responseData.uploader = uploader ? {
        id: uploader.id,
        name: uploader.name,
        avatar: uploader.avatar
      } : null;
      responseData.isShared = shouldNotifyClients;

      console.log(`✅ [UPLOAD] =========================================`);
      console.log(`✅ [UPLOAD] SUBIDA COMPLETADA EXITOSAMENTE`);
      console.log(`✅ [UPLOAD] Documento ID: ${document.id}`);
      console.log(`✅ [UPLOAD] Archivo: ${req.file.originalname}`);
      console.log(`✅ [UPLOAD] Clientes asociados: ${validClients.length}`);
      console.log(`✅ [UPLOAD] =========================================\n`);

      res.status(201).json({
        success: true,
        data: responseData
      });
    } catch (error) {
      console.error(`❌ [UPLOAD] =========================================`);
      console.error(`❌ [UPLOAD] ERROR EN LA SUBIDA DEL DOCUMENTO`);
      console.error(`❌ [UPLOAD] Mensaje: ${error.message}`);
      console.error(`❌ [UPLOAD] Stack:`, error.stack);
      console.error(`❌ [UPLOAD] =========================================\n`);
      next(error);
    }
  },

  // Create new version of document
  async createVersion(req, res, next) {
    try {
      const { documentId } = req.params;
      const { changes = '' } = req.body;
      const therapistId = req.user.id;

      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Create version info in metadata
      const versions = document.metadata?.versions || [];
      versions.push({
        version: versions.length + 1,
        filename: req.file.filename,
        size: req.file.size,
        url: `/uploads/documents/${req.file.filename}`,
        createdBy: therapistId,
        createdAt: new Date().toISOString(),
        changes
      });

      const updatedDocument = await Document.findByIdAndUpdate(documentId, {
        filename: req.file.filename,
        size: req.file.size,
        path: `/uploads/documents/${req.file.filename}`,
        metadata: {
          ...document.metadata,
          versions
        }
      }, { new: true });

      res.json({
        success: true,
        message: 'New version created successfully',
        data: updatedDocument.toJSON()
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = uploadController;
