const { validationResult } = require('express-validator');
const { Document } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');

const updateController = {
  // Update document metadata
  async updateDocument(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { documentId } = req.params;
      const therapistId = req.user.id;
      const updateData = req.body;

      console.log('🔍 [updateController] ===== INICIO UPDATE =====');
      console.log('🔍 [updateController] documentId:', documentId);
      console.log('🔍 [updateController] therapistId:', therapistId);
      console.log('🔍 [updateController] updateData recibido:', JSON.stringify(updateData, null, 2));

      const document = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });

      if (!document) {
        console.log('🔍 [updateController] Documento no encontrado');
        return next(new AppError('Document not found', 404));
      }

      console.log('🔍 [updateController] Documento encontrado:', document.id);

      // Update only allowed fields
      const allowedUpdates = ['title', 'category', 'tags', 'visibility', 'isConfidential', 'session', 'clientIds', 'clientId', 'description'];
      const updates = {};

      console.log('🔍 [updateController] Campos permitidos:', allowedUpdates);

      allowedUpdates.forEach(field => {
        if (updateData[field] !== undefined) {
          console.log(`🔍 [updateController] Procesando campo: ${field} =`, updateData[field]);
          if (field === 'title') {
            updates.description = updateData[field];
          } else if (field === 'visibility') {
            updates.isPublic = updateData[field] === 'public';
            // Update metadata too
            updates.metadata = {
              ...document.metadata,
              visibility: updateData[field]
            };
          } else if (field === 'isConfidential') {
            updates.metadata = {
              ...document.metadata,
              isConfidential: updateData[field]
            };
          } else if (field === 'session') {
            updates.metadata = {
              ...document.metadata,
              session: updateData[field]
            };
          } else if (field === 'clientIds') {
            // Handle multiple clients - will be processed separately below
            console.log('🔍 [updateController] clientIds recibidos:', updateData[field]);
          } else if (field === 'clientId') {
            // Single clientId - use camelCase as expected by Document model
            if (updateData[field]) {
              updates.clientId = updateData[field];
              console.log('🔍 [updateController] Actualizando clientId:', updateData[field]);
            }
          } else if (field === 'description') {
            updates.description = updateData[field];
          } else {
            updates[field] = updateData[field];
          }
        }
      });

      console.log('🔍 [updateController] Updates a aplicar al documento:', JSON.stringify(updates, null, 2));

      // Update the document basic fields
      const updatedDocument = await Document.findByIdAndUpdate(documentId, updates, { new: true });
      console.log('🔍 [updateController] Documento actualizado:', updatedDocument.id);

      // Handle clientIds separately - update document_clients junction table
      if (updateData.clientIds !== undefined) {
        console.log('🔍 [updateController] Procesando actualización de clientes...');
        console.log('🔍 [updateController] clientIds a asignar:', updateData.clientIds);
        
        const supabase = require('../../config/supabase').supabase;
        
        // Step 1: Get current document clients
        const { data: currentClients, error: fetchError } = await supabase
          .from('document_clients')
          .select('client_id')
          .eq('document_id', documentId);
          
        if (fetchError) {
          console.error('🔍 [updateController] Error al obtener clientes actuales:', fetchError);
          throw fetchError;
        }
        
        console.log('🔍 [updateController] Clientes actuales:', currentClients?.map(c => c.client_id) || []);
        
        // Step 2: Delete all existing relationships for this document
        console.log('🔍 [updateController] Eliminando relaciones actuales...');
        const { error: deleteError } = await supabase
          .from('document_clients')
          .delete()
          .eq('document_id', documentId);
          
        if (deleteError) {
          console.error('🔍 [updateController] Error al eliminar relaciones:', deleteError);
          throw deleteError;
        }
        console.log('🔍 [updateController] Relaciones actuales eliminadas');
        
        // Step 3: Insert new relationships for each clientId (if there are any)
        if (updateData.clientIds && updateData.clientIds.length > 0) {
          console.log('🔍 [updateController] Insertando nuevas relaciones para', updateData.clientIds.length, 'clientes...');
          
          const newRelationships = updateData.clientIds.map(clientId => ({
            document_id: documentId,
            client_id: clientId,
            created_at: new Date().toISOString()
          }));
          
          console.log('🔍 [updateController] Relaciones a insertar:', newRelationships);
          
          const { data: insertedData, error: insertError } = await supabase
            .from('document_clients')
            .insert(newRelationships)
            .select();
            
          if (insertError) {
            console.error('🔍 [updateController] Error al insertar nuevas relaciones:', insertError);
            throw insertError;
          }
          
          console.log('🔍 [updateController] Nuevas relaciones insertadas:', insertedData?.length || 0);
        } else {
          console.log('🔍 [updateController] No hay clientIds para insertar (array vacío o null)');
        }
        
        // Step 4: Update the primary client_id field with the first client (for backward compatibility)
        // Note: We already included client_id in the first update, but if we need to update it separately
        // we should use the Document model's findByIdAndUpdate with proper field mapping
        if (updateData.clientIds && updateData.clientIds.length > 0) {
          console.log('🔍 [updateController] client_id principal ya actualizado en primer paso:', updateData.clientIds[0]);
        } else {
          console.log('🔍 [updateController] client_id principal ya limpiado en primer paso (no hay clientes)');
        }
      }

      // Fetch the document again to get updated data including clients
      const finalDocument = await Document.findOne({
        id: documentId,
        user_id: therapistId
      });
      
      // Get updated client list
      const documentClients = await Document.getDocumentClients(documentId);
      console.log('🔍 [updateController] Clientes finales del documento:', documentClients?.map(c => c.id) || []);

      console.log('🔍 [updateController] ===== FIN UPDATE =====');

      res.json({
        success: true,
        data: {
          ...finalDocument.toJSON(),
          clients: documentClients || []
        }
      });
    } catch (error) {
      console.error('🔍 [updateController] Error:', error);
      next(error);
    }
  }
};

module.exports = updateController;
