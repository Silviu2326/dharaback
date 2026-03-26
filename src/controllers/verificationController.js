const { VerificationDocument, User } = require("../models");
const { validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const geminiService = require("../services/geminiService");
const multer = require("multer");

// Get verification documents with filters
const getVerificationDocuments = async (req, res) => {
  try {
    const { status, type } = req.query;
    const { supabase } = require('../config/supabase');
    const userId = req.user.id || req.user._id;

    let query = supabase
      .from('verification_documents')
      .select('*, terapias_diccionario(nombre)')
      .order('created_at', { ascending: false });

    // Terapeuta solo ve sus propios documentos
    if (req.user.role === 'therapist') {
      query = query.eq('user_id', userId);
    }

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);

    const { data, error } = await query;

    if (error) throw error;

    const documents = (data || []).map(doc => {
      let notesData = {};
      try { notesData = doc.notes ? JSON.parse(doc.notes) : {}; } catch { notesData = {}; }

      return {
        id: doc.id,
        name: notesData.originalName || doc.file_url?.split('/').pop() || 'Documento',
        type: doc.type,
        size: notesData.fileSize || 0,
        status: doc.status,
        url: doc.file_url,
        uploadDate: doc.created_at,
        issuingBody: doc.issuing_body,
        documentNumber: doc.document_number,
        terapia: doc.terapias_diccionario?.nombre || null,
      };
    });

    res.json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error("Error fetching verification documents:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching verification documents",
      error: error.message,
    });
  }
};

// Upload verification document
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No se recibió ningún archivo" });
    }

    const { supabase } = require('../config/supabase');
    const userId = req.user.id || req.user._id;
    const fileBuffer = req.file.buffer;
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;
    const fileExt = path.extname(originalName) || '.pdf';

    // Subir a Supabase Storage
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `verification-${userId}-${uniqueSuffix}${fileExt}`;
    const storagePath = `therapists/${userId}/verification/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    const fileUrl = publicUrlData.publicUrl;

    // Buscar coincidencia en terapias_diccionario si el frontend envía metadata
    let terapiaId = null;
    try {
      const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
      // No hay análisis IA aquí, terapia_id queda null (pendiente de verificación)
    } catch (_) {}

    // Insertar en verification_documents
    const { data: docData, error: insertError } = await supabase
      .from('verification_documents')
      .insert({
        user_id: userId,
        type: 'degree',
        issuing_body: req.body.issuingBody || null,
        document_number: req.body.documentNumber || null,
        status: 'pending',
        file_url: fileUrl,
        notes: JSON.stringify({ originalName, fileSize: fileBuffer.length }),
        terapia_id: terapiaId,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({
      success: true,
      message: "Documento subido correctamente",
      id: docData.id,
      url: fileUrl,
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    res.status(500).json({ success: false, message: "Error al subir el documento", error: error.message });
  }
};

// Get single verification document
const getDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === "therapist" && document.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: document.toJSON(),
    });
  } catch (error) {
    console.error("Error fetching document:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching document",
      error: error.message,
    });
  }
};

// Update document metadata
const updateDocument = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { documentId } = req.params;
    const updates = req.body;

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === "therapist" && document.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Only allow updating certain fields
    const allowedUpdates = [
      "name",
      "documentNumber",
      "issuingBody",
      "issueDate",
      "expiryDate",
    ];
    const filteredUpdates = {};

    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    const updatedDocument = await VerificationDocument.findByIdAndUpdate(
      documentId,
      filteredUpdates,
      { new: true },
    );

    res.json({
      success: true,
      message: "Document updated successfully",
      data: updatedDocument.toJSON(),
    });
  } catch (error) {
    console.error("Error updating document:", error);
    res.status(500).json({
      success: false,
      message: "Error updating document",
      error: error.message,
    });
  }
};

// Review document (admin only)
const reviewDocument = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required.",
      });
    }

    const { documentId } = req.params;
    const { action, comment } = req.body;

    if (!["approve", "reject", "request_changes"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be approve, reject, or request_changes",
      });
    }

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const reviewerId = req.user.id || req.user._id;

    // Perform review action
    switch (action) {
      case "approve":
        await document.approve(reviewerId);
        break;
      case "reject":
        await document.reject(reviewerId, comment);
        break;
      case "request_changes":
        await document.requestChanges(reviewerId, comment);
        break;
    }

    res.json({
      success: true,
      message: `Document ${action}d successfully`,
      data: document.toJSON(),
    });
  } catch (error) {
    console.error("Error reviewing document:", error);
    res.status(500).json({
      success: false,
      message: "Error reviewing document",
      error: error.message,
    });
  }
};

// Download document
const downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === "therapist" && document.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const filePath = path.join(
      __dirname,
      "../../uploads/verification",
      path.basename(document.fileUrl),
    );

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: "File not found on server",
      });
    }

    res.download(filePath, document.name || "document");
  } catch (error) {
    console.error("Error downloading document:", error);
    res.status(500).json({
      success: false,
      message: "Error downloading document",
      error: error.message,
    });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === "therapist" && document.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Don't allow deletion of approved documents
    if (document.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete approved documents",
      });
    }

    // Delete file from filesystem
    if (document.fileUrl) {
      const filePath = path.join(
        __dirname,
        "../../uploads/verification",
        path.basename(document.fileUrl),
      );
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.error("Error deleting file:", error);
      }
    }

    await VerificationDocument.findByIdAndDelete(documentId);

    res.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting document",
      error: error.message,
    });
  }
};

// Get verification statistics
const getVerificationStats = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const stats = await VerificationDocument.getVerificationStats(
      req.user.role === "therapist" ? userId : null,
    );

    // Get expiring documents
    const expiringDocuments = await VerificationDocument.getExpiringDocuments(
      30,
      {
        userId: req.user.role === "therapist" ? userId : null,
      },
    );

    res.json({
      success: true,
      data: {
        statusCounts: {
          pending: stats.pending || 0,
          approved: stats.approved || 0,
          rejected: stats.rejected || 0,
        },
        completionRate:
          stats.total > 0
            ? Math.round((stats.approved / stats.total) * 100)
            : 0,
        totalDocuments: stats.total,
        expiringCount: expiringDocuments.length,
        expiringDocuments: expiringDocuments
          .slice(0, 5)
          .map((doc) => doc.toJSON()),
      },
    });
  } catch (error) {
    console.error("Error fetching verification stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching verification statistics",
      error: error.message,
    });
  }
};

// Get expiring documents
const getExpiringDocuments = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const userId = req.user.id || req.user._id;

    const expiringDocs = await VerificationDocument.getExpiringDocuments(
      parseInt(days),
      {
        userId: req.user.role === "therapist" ? userId : null,
      },
    );

    res.json({
      success: true,
      data: expiringDocs.map((doc) => doc.toJSON()),
    });
  } catch (error) {
    console.error("Error fetching expiring documents:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching expiring documents",
      error: error.message,
    });
  }
};

// Bulk approve documents (admin only)
const bulkApprove = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required.",
      });
    }

    const { documentIds, comment = "" } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Document IDs array is required",
      });
    }

    const reviewerId = req.user.id || req.user._id;
    const results = [];

    for (const docId of documentIds) {
      try {
        const document = await VerificationDocument.findById(docId);
        if (document && document.status === "pending") {
          await document.approve(reviewerId);
          results.push({ id: docId, success: true });
        } else {
          results.push({
            id: docId,
            success: false,
            reason: "Document not found or not pending",
          });
        }
      } catch (error) {
        results.push({ id: docId, success: false, reason: error.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    res.json({
      success: true,
      message: `${successCount} documents approved successfully`,
      results,
    });
  } catch (error) {
    console.error("Error bulk approving documents:", error);
    res.status(500).json({
      success: false,
      message: "Error bulk approving documents",
      error: error.message,
    });
  }
};

// Get verification status for current user
const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Get all documents for the therapist
    const documents = await VerificationDocument.find({
      filters: { user_id: userId },
    });

    // Calculate overall status
    let overallStatus = "not_submitted";
    let rejectionFeedback = null;

    if (documents.length > 0) {
      const hasPending = documents.some((d) => d.status === "pending");
      const hasRejected = documents.some((d) => d.status === "rejected");
      const hasApproved = documents.some((d) => d.status === "approved");

      if (hasRejected) {
        overallStatus = "rejected";
        const rejectedDoc = documents.find((d) => d.status === "rejected");
        rejectionFeedback = {
          comment: rejectedDoc.rejectionReason,
          date: rejectedDoc.reviewedAt,
          reviewer: "Verification Team",
        };
      } else if (hasPending) {
        overallStatus = "pending";
      } else if (
        hasApproved &&
        documents.every((d) => d.status === "approved")
      ) {
        overallStatus = "approved";
      } else if (hasApproved) {
        overallStatus = "partially_approved";
      }
    }

    res.json({
      success: true,
      data: {
        overallStatus,
        totalDocuments: documents.length,
        documentsByStatus: {
          pending: documents.filter((d) => d.status === "pending").length,
          approved: documents.filter((d) => d.status === "approved").length,
          rejected: documents.filter((d) => d.status === "rejected").length,
        },
        rejectionFeedback,
        completedRequirements: documents.filter((d) => d.status === "approved")
          .length,
        allRequirementsMet:
          documents.every((d) => d.status === "approved") &&
          documents.length >= 2,
      },
    });
  } catch (error) {
    console.error("Error getting verification status:", error);
    res.status(500).json({
      success: false,
      message: "Error getting verification status",
      error: error.message,
    });
  }
};

// Get verification requirements
const getVerificationRequirements = async (req, res) => {
  try {
    const requirements = [
      {
        id: "education_certificate",
        type: "education_certificate",
        name: "Diploma or Professional Title",
        description: "University degree or valid professional certification",
        required: true,
        order: 1,
      },
      {
        id: "insurance_certificate",
        type: "insurance_certificate",
        name: "Professional Liability Insurance",
        description: "Valid insurance covering professional practice",
        required: true,
        order: 2,
      },
      {
        id: "professional_license",
        type: "professional_license",
        name: "Professional License (optional)",
        description: "Professional license number if applicable",
        required: false,
        order: 3,
      },
    ];

    res.json({
      success: true,
      data: {
        requirements,
      },
    });
  } catch (error) {
    console.error("Error getting verification requirements:", error);
    res.status(500).json({
      success: false,
      message: "Error getting verification requirements",
      error: error.message,
    });
  }
};

const { supabase } = require('../config/supabase');

const analizarTitulacion = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se ha proporcionado ningún documento",
      });
    }

    const { nombre, especialidad, titulacion } = req.body;
    const bucketName = 'documents';
    const tempFolder = 'temp-analysis';
    
    const fileBuffer = req.file.buffer || await fs.readFile(req.file.path);
    const mimeType = req.file.mimetype;
    const isPDF = mimeType === 'application/pdf';
    const fileExt = path.extname(req.file.originalname) || (isPDF ? '.pdf' : '.jpg');
    
    // Generar nombre único para el archivo temporal en el bucket
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const tempFilename = `${tempFolder}/analysis-${uniqueSuffix}${fileExt}`;

    console.log(`📄 Analizando documento: ${req.file.originalname} (${isPDF ? 'PDF' : 'Imagen'})`);

    // Subir archivo temporal al bucket de Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(tempFilename, fileBuffer, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('❌ Error uploading to Supabase Storage:', uploadError);
      return res.status(500).json({
        success: false,
        message: "Error al subir el documento para análisis",
        error: uploadError.message
      });
    }

    // Obtener URL pública del archivo temporal
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(tempFilename);

    const fileUrl = publicUrlData.publicUrl;

    // Si Gemini no está configurado, retornar análisis básico
    if (!geminiService.isConfigured()) {
      console.warn(
        "⚠️ Gemini no está configurado, usando modo de análisis básico",
      );
      return res.status(200).json({
        success: true,
        data: {
          tempId: tempFilename,
          originalName: req.file.originalname,
          fileUrl: fileUrl,
          fileType: isPDF ? 'pdf' : 'image',
          mimeType: mimeType,
          aiAnalysis: {
            esTitulacionValida: true,
            tipoDocumento: "pendiente_verificacion",
            nombreTitulo: titulacion || null,
            entidadEmisora: null,
            coincideEspecialidad: true,
            camposDetectados: {},
            nivelConfianza: "bajo",
            observaciones:
              "El análisis automático no está disponible. El documento será revisado manualmente por nuestro equipo.",
            recomendacion: "revisar_manualmente",
            analizadoPorAI: false,
          },
        },
      });
    }

    // Analizar el documento con Gemini
    const aiAnalysis = await geminiService.analyzeDegreeCertificate(
      fileBuffer,
      mimeType,
      {
        nombre,
        especialidad,
        titulacion,
      },
    );

    console.log("✅ Análisis de titulación completado:", {
      esValida: aiAnalysis.esTitulacionValida,
      recomendacion: aiAnalysis.recomendacion,
      tipoArchivo: isPDF ? 'PDF' : 'Imagen',
    });

    // Verificar si alguna terapia detectada existe en terapias_diccionario
    let terapiaEnDiccionario = false;
    let terapiaIdEncontrada = null;
    const terapiasDetectadas = aiAnalysis.terapiasDetectadas || [];

    if (terapiasDetectadas.length > 0) {
      const { data: terapiaMatch } = await supabase
        .from('terapias_diccionario')
        .select('id, nombre')
        .in('nombre', terapiasDetectadas)
        .limit(1)
        .maybeSingle();

      if (terapiaMatch) {
        terapiaEnDiccionario = true;
        terapiaIdEncontrada = terapiaMatch.id;
        console.log(`✅ Terapia en diccionario: ${terapiaMatch.nombre}`);
      } else {
        console.log(`⚠️ Terapias detectadas no están en terapias_diccionario:`, terapiasDetectadas);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        tempId: tempFilename,
        originalName: req.file.originalname,
        fileUrl: fileUrl,
        fileType: isPDF ? 'pdf' : 'image',
        mimeType: mimeType,
        aiAnalysis: {
          ...aiAnalysis,
          terapiaEnDiccionario,
          terapiaIdEncontrada,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error analizando titulación:", error);

    res.status(500).json({
      success: false,
      message: "Error al analizar el documento",
      error: error.message,
    });
  }
};

const submitVerification = async (req, res) => {
  // Los documentos ya están guardados en verification_documents al subirse.
  // Este endpoint simplemente confirma el envío.
  res.json({ success: true, message: 'Documentos enviados para verificación' });
};

const getVerificationTimeline = async (req, res) => {
  try {
    const { supabase } = require('../config/supabase');
    const userId = req.user.id || req.user._id;

    const { data, error } = await supabase
      .from('verification_documents')
      .select('id, status, created_at, updated_at, type, notes')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const events = (data || []).map(doc => ({
      id: doc.id,
      type: doc.status === 'approved' ? 'approved' : doc.status === 'rejected' ? 'rejected' : 'submitted',
      date: doc.updated_at || doc.created_at,
      description: doc.notes || 'Documento subido',
      documentType: doc.type,
    }));

    res.json({ success: true, events });
  } catch (error) {
    console.error('Error fetching verification timeline:', error);
    res.status(500).json({ success: false, message: 'Error fetching timeline', error: error.message });
  }
};

module.exports = {
  getVerificationDocuments,
  uploadDocument,
  getDocument,
  updateDocument,
  reviewDocument,
  downloadDocument,
  deleteDocument,
  getVerificationStats,
  getExpiringDocuments,
  bulkApprove,
  getVerificationStatus,
  getVerificationRequirements,
  submitVerification,
  getVerificationTimeline,
  analizarTitulacion,
};
